export type TextAutoSaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export type TextAutoSaveController = {
  dispose: () => Promise<void>;
  flush: () => Promise<void>;
  getLatestText: () => string;
  hasPendingChanges: () => boolean;
  schedule: (text: string) => void;
};

export function createTextAutoSaveController(input: {
  debounceMs?: number;
  initialText: string;
  onStateChange: (state: TextAutoSaveState) => void;
  save: (text: string) => Promise<void>;
}): TextAutoSaveController {
  const debounceMs = input.debounceMs ?? 450;
  let latestText = input.initialText;
  let currentRevision = 0;
  let savedRevision = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queue: Promise<void> = Promise.resolve();
  let flushPromise: Promise<void> | null = null;
  let disposed = false;
  const writesByRevision = new Map<number, Promise<void>>();

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const emit = (state: TextAutoSaveState) => {
    if (!disposed) input.onStateChange(state);
  };

  const persistRevision = (revision: number, text: string): Promise<void> => {
    if (revision <= savedRevision) return Promise.resolve();
    const existingWrite = writesByRevision.get(revision);
    if (existingWrite) return existingWrite;

    const write = queue.then(async () => {
      if (revision <= savedRevision || revision !== currentRevision) return;
      emit('saving');
      await input.save(text);
      savedRevision = revision;
      emit(revision === currentRevision ? 'saved' : 'pending');
    }).catch((error: unknown) => {
      if (revision === currentRevision) emit('error');
      throw error;
    });

    queue = write.catch(() => undefined);
    writesByRevision.set(revision, write);
    void write.then(
      () => writesByRevision.delete(revision),
      () => writesByRevision.delete(revision),
    );
    return write;
  };

  const flushUntilCurrentRevision = async () => {
    clearTimer();
    while (savedRevision < currentRevision) {
      clearTimer();
      const revision = currentRevision;
      const text = latestText;
      try {
        await persistRevision(revision, text);
      } catch (error) {
        if (revision === currentRevision) throw error;
      }
    }
  };

  return {
    async dispose() {
      clearTimer();
      await this.flush();
      disposed = true;
    },
    flush() {
      if (flushPromise) return flushPromise;
      const operation = flushUntilCurrentRevision();
      const trackedOperation = operation.finally(() => {
        if (flushPromise === trackedOperation) flushPromise = null;
      });
      flushPromise = trackedOperation;
      return trackedOperation;
    },
    getLatestText: () => latestText,
    hasPendingChanges: () => savedRevision < currentRevision,
    schedule(text) {
      if (disposed || text === latestText) return;
      latestText = text;
      currentRevision += 1;
      emit('pending');
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        void persistRevision(currentRevision, latestText).catch(() => undefined);
      }, debounceMs);
    },
  };
}
