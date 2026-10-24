const { createLinkSaveSubmissionRunner } = require('../src/features/home-content/linkSaveSubmission');
const { prependSavedHomeContent } = require('../src/features/home-content/homeContentState');

function makeCallbacks(events, isCurrent = () => true) {
  return {
    isCurrent,
    onSettled: jest.fn(),
    setErrorMessage: jest.fn((message) => events.push(['error', message])),
    setSaving: jest.fn((value) => events.push(['saving', value])),
    onSuccess: jest.fn(() => events.push(['close'])),
  };
}

describe('link composer submission', () => {
  test('updates the saved list through saveLink, then closes once after success', async () => {
    const submit = createLinkSaveSubmissionRunner();
    const events = [];
    const callbacks = makeCallbacks(events);
    const savedLink = {
      id: 21,
      contentType: 'link',
      createdAt: 200,
      url: 'https://example.com/saved',
      normalizedUrl: 'https://example.com/saved',
      title: 'Saved',
      description: null,
      domain: 'example.com',
      imageUrl: null,
      faviconUrl: null,
      previewImageRelativePath: null,
      previewImageMimeType: null,
      previewImageUri: null,
    };
    let homeContents = [];
    let resolveSave;
    const save = jest.fn(() => new Promise((resolve) => {
      resolveSave = () => {
        homeContents = prependSavedHomeContent(homeContents, savedLink);
        events.push(['home-updated']);
        resolve(savedLink);
      };
    }));

    const firstAttempt = submit(save, new AbortController().signal, callbacks);
    const repeatedTap = await submit(save, new AbortController().signal, callbacks);
    expect(repeatedTap).toBe('busy');
    expect(save).toHaveBeenCalledTimes(1);

    resolveSave();
    await expect(firstAttempt).resolves.toBe('saved');

    expect(homeContents).toEqual([savedLink]);
    expect(callbacks.onSuccess).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      ['error', null],
      ['saving', true],
      ['home-updated'],
      ['close'],
      ['saving', false],
    ]);
    expect(callbacks.onSettled).toHaveBeenCalledTimes(1);
  });

  test('shows persistence errors even when named AbortError, re-enables saving, and supports retry', async () => {
    const submit = createLinkSaveSubmissionRunner();
    const events = [];
    const callbacks = makeCallbacks(events);
    const controller = new AbortController();
    const persistenceError = new Error('SQLite write failed');
    persistenceError.name = 'AbortError';

    await expect(submit(
      async () => { throw persistenceError; },
      controller.signal,
      callbacks,
    )).resolves.toBe('failed');
    expect(events).toEqual([
      ['error', null],
      ['saving', true],
      ['error', 'Não foi possível salvar o link. Tente novamente.'],
      ['saving', false],
    ]);

    await expect(submit(async () => undefined, controller.signal, callbacks)).resolves.toBe('saved');
    expect(callbacks.onSuccess).toHaveBeenCalledTimes(1);
    expect(callbacks.setSaving).toHaveBeenLastCalledWith(false);
    expect(callbacks.onSettled).toHaveBeenCalledTimes(2);
  });

  test('does not report a closed or unmounted submission as a visible error', async () => {
    const submit = createLinkSaveSubmissionRunner();
    const events = [];
    const controller = new AbortController();
    let finishSave;
    const callbacks = makeCallbacks(events, () => !controller.signal.aborted);
    const pending = submit(
      () => new Promise((resolve) => { finishSave = resolve; }),
      controller.signal,
      callbacks,
    );

    controller.abort();
    finishSave();

    await expect(pending).resolves.toBe('cancelled');
    expect(callbacks.onSuccess).not.toHaveBeenCalled();
    expect(callbacks.setErrorMessage).toHaveBeenCalledTimes(1);
    expect(callbacks.onSettled).toHaveBeenCalledTimes(1);
  });
});
