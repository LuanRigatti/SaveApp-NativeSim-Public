const {
  importPendingQuickSaveQueueEntries,
  validatePendingQuickSaveRecord,
} = require('../src/features/dynamic-island/quickSaveQueueImportPipeline');

const validRecord = (overrides = {}) => ({
  formatVersion: 1,
  operationID: '94AC6B4A-2A12-4D3E-A098-F60A6064D603',
  url: 'https://example.com/saved-item',
  normalizedURL: 'https://example.com/saved-item',
  createdAt: 1_800_000_000_000,
  title: 'saved-item',
  domain: 'example.com',
  ...overrides,
});

function makeAdapter(overrides = {}) {
  const events = [];
  return {
    events,
    persist: jest.fn(async () => 'inserted'),
    acknowledge: jest.fn(async () => undefined),
    record: jest.fn((event) => events.push(event)),
    ...overrides,
  };
}

describe('persistent Quick Save queue import', () => {
  test('validates versioned HTTP(S) records and canonicalizes metadata with the app rules', () => {
    expect(validatePendingQuickSaveRecord(validRecord())).toEqual({
      createdAt: 1_800_000_000_000,
      domain: 'example.com',
      normalizedUrl: 'https://example.com/saved-item',
      title: 'saved item',
      url: 'https://example.com/saved-item',
    });
  });

  test.each([
    ['unsupported format', { formatVersion: 2 }],
    ['non-UUID operation ID', { operationID: 'private-id' }],
    ['non-HTTP URL', { url: 'file:///private/data', normalizedURL: 'file:///private/data' }],
    ['mismatched normalized URL', { normalizedURL: 'https://other.example/' }],
    ['unsafe URL credentials', { url: 'https://user:secret@example.com/', normalizedURL: 'https://user:secret@example.com/' }],
  ])('rejects %s without changing SQLite or acknowledging the queue item', async (_label, overrides) => {
    const adapter = makeAdapter();
    const result = await importPendingQuickSaveQueueEntries([
      { fileName: 'pending.json', raw: validRecord(overrides) },
    ], adapter);

    expect(result).toEqual({ imported: 0, duplicates: 0, acknowledged: 0, failed: 1 });
    expect(adapter.persist).not.toHaveBeenCalled();
    expect(adapter.acknowledge).not.toHaveBeenCalled();
    expect(adapter.events).toEqual(['failed']);
  });

  test('acknowledges only after SQLite persistence resolves with a committed insert', async () => {
    const order = [];
    const adapter = makeAdapter({
      persist: jest.fn(async () => { order.push('sqlite-commit'); return 'inserted'; }),
      acknowledge: jest.fn(async () => { order.push('queue-ack'); }),
    });
    const result = await importPendingQuickSaveQueueEntries([
      { fileName: 'pending.json', raw: validRecord() },
    ], adapter);

    expect(result).toEqual({ imported: 1, duplicates: 0, acknowledged: 1, failed: 0 });
    expect(order).toEqual(['sqlite-commit', 'queue-ack']);
    expect(adapter.events).toEqual(['commit_confirmed', 'acknowledged']);
  });

  test('acknowledges a confirmed SQLite duplicate idempotently', async () => {
    const adapter = makeAdapter({ persist: jest.fn(async () => 'alreadySaved') });
    const result = await importPendingQuickSaveQueueEntries([
      { fileName: 'pending.json', raw: validRecord() },
    ], adapter);

    expect(result).toEqual({ imported: 0, duplicates: 1, acknowledged: 1, failed: 0 });
    expect(adapter.events).toEqual(['duplicate_confirmed', 'acknowledged']);
  });

  test('retains queue entries when SQLite commit or acknowledgment fails and continues later records', async () => {
    const second = validRecord({
      operationID: '197B2015-5D93-4E9B-BE8A-3D66D18A3DA2',
      url: 'https://second.example/path',
      normalizedURL: 'https://second.example/path',
    });
    const adapter = makeAdapter({
      persist: jest.fn()
        .mockRejectedValueOnce(new Error('private database failure'))
        .mockResolvedValueOnce('inserted'),
      acknowledge: jest.fn()
        .mockRejectedValueOnce(new Error('file removal not confirmed'))
        .mockResolvedValueOnce(undefined),
    });
    const result = await importPendingQuickSaveQueueEntries([
      { fileName: 'first.json', raw: validRecord() },
      { fileName: 'second.json', raw: second },
    ], adapter);

    expect(result).toEqual({ imported: 1, duplicates: 0, acknowledged: 0, failed: 2 });
    expect(adapter.persist).toHaveBeenCalledTimes(2);
    expect(adapter.acknowledge).toHaveBeenCalledTimes(1);
    expect(adapter.events).toEqual(['failed', 'commit_confirmed', 'failed']);
  });

  test('re-import after commit but before acknowledgment resolves as a duplicate', async () => {
    const adapter = makeAdapter({ persist: jest.fn()
      .mockResolvedValueOnce('inserted')
      .mockResolvedValueOnce('alreadySaved') });
    const entry = { fileName: 'pending.json', raw: validRecord() };

    await expect(importPendingQuickSaveQueueEntries([entry], adapter)).resolves.toMatchObject({ imported: 1 });
    await expect(importPendingQuickSaveQueueEntries([entry], adapter)).resolves.toMatchObject({ duplicates: 1, acknowledged: 1 });
    expect(adapter.events).toEqual([
      'commit_confirmed', 'acknowledged',
      'duplicate_confirmed', 'acknowledged',
    ]);
  });
});
