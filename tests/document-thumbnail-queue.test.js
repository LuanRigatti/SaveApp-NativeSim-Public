/* global describe, expect, jest, test */

const { DocumentThumbnailQueue } = require('../src/features/documents/documentThumbnailQueue');

function document(id, overrides = {}) {
  return {
    id,
    contentType: 'document',
    createdAt: 1_800_000_000_000 + id,
    originalName: `Documento-${id}.pdf`,
    mimeType: 'application/pdf',
    extension: 'pdf',
    sizeBytes: 512,
    relativePath: `documents/document-${id}-abc.pdf`,
    thumbnailRelativePath: null,
    thumbnailUri: null,
    textExcerpt: null,
    uri: `file:///saveapp-private/documents/document-${id}-abc.pdf`,
    ...overrides,
  };
}

function createAdapter(overrides = {}) {
  const defaults = {
    thumbnailPathFor: (item) => `document-thumbnails/document-${item.id}.jpg`,
    reserve: async () => true,
    generate: async (item) => ({
      status: 'generated',
      relativePath: `document-thumbnails/document-${item.id}.jpg`,
    }),
    isCurrent: async () => true,
    clearReservation: async () => undefined,
    removeGeneratedFile: async () => undefined,
    onReady: jest.fn(),
    waitBeforeRetry: async () => undefined,
  };
  return Object.fromEntries(
    Object.entries({ ...defaults, ...overrides }).map(([name, implementation]) => [
      name,
      jest.fn(implementation),
    ]),
  );
}

async function waitUntil(predicate) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('The document thumbnail queue did not reach the expected state');
}

describe('retrospective native document thumbnail queue', () => {
  test('processes existing documents serially and notifies the gallery after each saved image', async () => {
    let active = 0;
    let maxActive = 0;
    const ready = [];
    const adapter = createAdapter({
      async generate(item) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        return {
          status: 'generated',
          relativePath: `document-thumbnails/document-${item.id}.jpg`,
        };
      },
      onReady: (id, path) => ready.push({ id, path }),
    });
    const queue = new DocumentThumbnailQueue(adapter);
    queue.enqueue([document(1), document(2), document(3)]);

    await waitUntil(() => queue.getStatus(1) === 'complete' && queue.getStatus(2) === 'complete' && queue.getStatus(3) === 'complete');

    expect(maxActive).toBe(1);
    expect(adapter.reserve).toHaveBeenCalledTimes(3);
    expect(ready.map(({ id }) => id)).toEqual([1, 2, 3]);
    expect(adapter.generate).toHaveBeenCalledTimes(3);
  });

  test('cleans a generated image if the document was removed before the database check', async () => {
    const adapter = createAdapter({ isCurrent: async () => false });
    const queue = new DocumentThumbnailQueue(adapter);
    queue.enqueue([document(8)]);

    await waitUntil(() => queue.getStatus(8) === 'cancelled');

    expect(adapter.removeGeneratedFile).toHaveBeenCalledWith('document-thumbnails/document-8.jpg');
    expect(adapter.clearReservation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 8 }),
      'document-thumbnails/document-8.jpg',
    );
    expect(adapter.onReady).not.toHaveBeenCalled();
  });

  test('waits for active generation before a confirmed deletion and leaves cleanup to the deletion pipeline', async () => {
    let finishGeneration;
    let didStart = false;
    const adapter = createAdapter({
      generate: () => {
        didStart = true;
        return new Promise((resolve) => {
          finishGeneration = resolve;
        });
      },
    });
    const queue = new DocumentThumbnailQueue(adapter);
    queue.enqueue([document(11)]);
    await waitUntil(() => didStart);

    let deletionCanContinue = false;
    const waitingForThumbnail = queue.blockAndWait(11).then(() => {
      deletionCanContinue = true;
    });
    finishGeneration({ status: 'generated', relativePath: 'document-thumbnails/document-11.jpg' });
    await waitingForThumbnail;

    expect(deletionCanContinue).toBe(true);
    expect(queue.getStatus(11)).toBe('cancelled');
    expect(adapter.removeGeneratedFile).not.toHaveBeenCalled();
    expect(adapter.onReady).not.toHaveBeenCalled();
    queue.unblock(11);
  });

  test('retries transient failures once per app launch and does not loop on unsupported formats', async () => {
    const transient = createAdapter({ generate: async () => ({ status: 'failed' }) });
    const transientQueue = new DocumentThumbnailQueue(transient);
    transientQueue.enqueue([document(20)]);
    await waitUntil(() => transientQueue.getStatus(20) === 'failed');
    transientQueue.enqueue([document(20)]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(transient.generate).toHaveBeenCalledTimes(2);

    const unsupported = createAdapter({ generate: async () => ({ status: 'unsupported' }) });
    const unsupportedQueue = new DocumentThumbnailQueue(unsupported);
    unsupportedQueue.enqueue([document(21)]);
    await waitUntil(() => unsupportedQueue.getStatus(21) === 'unsupported');
    unsupportedQueue.enqueue([document(21)]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(unsupported.generate).toHaveBeenCalledTimes(1);
  });

  test('does not start another job when the gallery resubmits an already cached document', async () => {
    const adapter = createAdapter();
    const queue = new DocumentThumbnailQueue(adapter);
    const cached = document(32, {
      thumbnailRelativePath: 'document-thumbnails/document-32.jpg',
      thumbnailUri: 'file:///saveapp-private/document-thumbnails/document-32.jpg',
    });
    queue.enqueue([cached]);
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(adapter.reserve).not.toHaveBeenCalled();
    expect(adapter.generate).not.toHaveBeenCalled();
  });
});
