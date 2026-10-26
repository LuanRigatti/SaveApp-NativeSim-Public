import type { SavedDocument } from './documentTypes';

export type GeneratedDocumentThumbnail = {
  status: 'generated';
  relativePath: string;
};

export type DocumentThumbnailGenerationResult =
  | GeneratedDocumentThumbnail
  | { status: 'unsupported' | 'missing' | 'invalidPath' | 'invalidInput' | 'failed' };

export type DocumentThumbnailQueueAdapter = {
  thumbnailPathFor: (document: SavedDocument) => string;
  reserve: (document: SavedDocument, thumbnailRelativePath: string) => Promise<boolean>;
  generate: (document: SavedDocument) => Promise<DocumentThumbnailGenerationResult>;
  isCurrent: (document: SavedDocument, thumbnailRelativePath: string) => Promise<boolean>;
  clearReservation: (document: SavedDocument, thumbnailRelativePath: string) => Promise<void>;
  removeGeneratedFile: (relativePath: string) => Promise<void>;
  onReady: (documentId: number, thumbnailRelativePath: string) => void;
  waitBeforeRetry?: () => Promise<void>;
};

type QueueStatus = 'queued' | 'running' | 'complete' | 'unsupported' | 'failed' | 'cancelled';

const MAX_ATTEMPTS_PER_LAUNCH = 2;

function defaultRetryDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 800));
}

/** Serial queue for background document thumbnails with bounded retry and per-ID deletion locks. */
export class DocumentThumbnailQueue {
  private readonly pending: SavedDocument[] = [];
  private readonly active = new Map<number, Promise<void>>();
  private readonly blockedIds = new Set<number>();
  private readonly statusById = new Map<number, QueueStatus>();

  constructor(
    private readonly adapter: DocumentThumbnailQueueAdapter,
    private readonly maxConcurrency = 1,
  ) {}

  enqueue(documents: readonly SavedDocument[]): void {
    for (const document of documents) {
      if (
        !Number.isSafeInteger(document.id) ||
        document.id <= 0 ||
        document.thumbnailUri ||
        this.blockedIds.has(document.id)
      ) {
        continue;
      }

      const status = this.statusById.get(document.id);
      if (status && status !== 'cancelled') continue;
      this.statusById.set(document.id, 'queued');
      this.pending.push(document);
    }
    this.pump();
  }

  async blockAndWait(documentId: number): Promise<void> {
    this.blockedIds.add(documentId);
    for (let index = this.pending.length - 1; index >= 0; index -= 1) {
      if (this.pending[index]?.id === documentId) {
        this.pending.splice(index, 1);
        this.statusById.set(documentId, 'cancelled');
      }
    }
    await this.active.get(documentId);
  }

  unblock(documentId: number): void {
    this.blockedIds.delete(documentId);
    this.statusById.delete(documentId);
    this.pump();
  }

  getStatus(documentId: number): QueueStatus | undefined {
    return this.statusById.get(documentId);
  }

  private pump(): void {
    while (this.active.size < this.maxConcurrency && this.pending.length > 0) {
      const document = this.pending.shift();
      if (!document) return;
      if (this.blockedIds.has(document.id)) {
        this.statusById.set(document.id, 'cancelled');
        continue;
      }

      this.statusById.set(document.id, 'running');
      const task = this.process(document)
        .catch(() => {
          this.statusById.set(document.id, 'failed');
        })
        .finally(() => {
          this.active.delete(document.id);
          this.pump();
        });
      this.active.set(document.id, task);
    }
  }

  private async process(document: SavedDocument): Promise<void> {
    const thumbnailRelativePath = this.adapter.thumbnailPathFor(document);
    let reserved = false;
    try {
      reserved = await this.adapter.reserve(document, thumbnailRelativePath);
    } catch {
      this.statusById.set(document.id, 'failed');
      return;
    }
    if (!reserved) {
      this.statusById.set(document.id, 'cancelled');
      return;
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_LAUNCH; attempt += 1) {
      if (this.blockedIds.has(document.id)) {
        this.statusById.set(document.id, 'cancelled');
        return;
      }

      let result: DocumentThumbnailGenerationResult;
      try {
        result = await this.adapter.generate(document);
      } catch {
        result = { status: 'failed' };
      }

      if (result.status !== 'generated') {
        if (result.status === 'failed' && attempt < MAX_ATTEMPTS_PER_LAUNCH) {
          await (this.adapter.waitBeforeRetry ?? defaultRetryDelay)();
          continue;
        }
        if (!(await this.cleanupReservation(document, thumbnailRelativePath))) {
          this.statusById.set(document.id, 'failed');
          return;
        }
        this.statusById.set(document.id, result.status === 'unsupported' ? 'unsupported' : 'failed');
        return;
      }

      if (result.relativePath !== thumbnailRelativePath) {
        await this.removeGeneratedFile(result.relativePath);
        if (!(await this.cleanupReservation(document, thumbnailRelativePath))) {
          this.statusById.set(document.id, 'failed');
          return;
        }
        this.statusById.set(document.id, 'failed');
        return;
      }

      if (this.blockedIds.has(document.id)) {
        this.statusById.set(document.id, 'cancelled');
        return;
      }

      let isCurrent = false;
      try {
        isCurrent = await this.adapter.isCurrent(document, thumbnailRelativePath);
      } catch {
        // A stale or unreadable catalog row must never receive a generated path.
      }
      if (!isCurrent || this.blockedIds.has(document.id)) {
        if (!this.blockedIds.has(document.id)) {
          await this.cleanupReservation(document, thumbnailRelativePath);
        }
        this.statusById.set(document.id, 'cancelled');
        return;
      }

      this.statusById.set(document.id, 'complete');
      if (!this.blockedIds.has(document.id)) {
        this.adapter.onReady(document.id, thumbnailRelativePath);
      }
      return;
    }
    this.statusById.set(document.id, 'failed');
  }

  private async removeGeneratedFile(relativePath: string): Promise<void> {
    try {
      await this.adapter.removeGeneratedFile(relativePath);
    } catch {
      // Keep the original generation or deletion outcome; cleanup is retried on the next catalog pass.
    }
  }

  private async cleanupReservation(
    document: SavedDocument,
    thumbnailRelativePath: string,
  ): Promise<boolean> {
    if (this.blockedIds.has(document.id)) return false;
    try {
      await this.adapter.removeGeneratedFile(thumbnailRelativePath);
      await this.adapter.clearReservation(document, thumbnailRelativePath);
      return true;
    } catch {
      // Keep the database reservation if cleanup fails so deletion and startup recovery can find the file.
      return false;
    }
  }
}
