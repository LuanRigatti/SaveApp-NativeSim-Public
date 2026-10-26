const { submitLinkFromNativePrompt } = require('../src/features/home-content/nativeLinkPromptSubmission');

describe('native link prompt submission', () => {
  test('returns success without presenting an error', async () => {
    const onFailure = jest.fn();
    const submit = jest.fn(async () => ({ status: 'saved' }));

    await expect(submitLinkFromNativePrompt('https://example.com/story?a=1', submit, onFailure))
      .resolves.toBe('saved');

    expect(submit).toHaveBeenCalledWith('https://example.com/story?a=1');
    expect(onFailure).not.toHaveBeenCalled();
  });

  test('shows the persistence error and preserves the entered URL for a retry', async () => {
    const originalUrl = 'https://ge.globo.com/esportes/noticia/long-path?source=share';
    const onFailure = jest.fn();
    const submit = jest.fn(async () => ({
      status: 'failed',
      message: 'Não foi possível salvar o link. Tente novamente.',
    }));

    await expect(submitLinkFromNativePrompt(originalUrl, submit, onFailure)).resolves.toBe('failed');

    expect(onFailure).toHaveBeenCalledWith(
      'Não foi possível salvar o link. Tente novamente.',
      originalUrl,
    );
  });

  test('uses a safe native error message after an unexpected rejection and keeps retry input', async () => {
    const originalUrl = 'https://youtube.com/watch?v=abc123';
    const onFailure = jest.fn();
    const submit = jest.fn(async () => {
      throw new Error('private technical details');
    });

    await expect(submitLinkFromNativePrompt(originalUrl, submit, onFailure)).resolves.toBe('failed');

    expect(onFailure).toHaveBeenCalledWith(
      'Não foi possível adicionar o link. Tente novamente.',
      originalUrl,
    );
    expect(onFailure.mock.calls[0][0]).not.toContain('private technical details');
  });

  test.each(['cancelled', 'busy'])('%s does not trigger an error alert', async (status) => {
    const onFailure = jest.fn();

    await expect(
      submitLinkFromNativePrompt('https://example.com', async () => ({ status }), onFailure),
    ).resolves.toBe(status);

    expect(onFailure).not.toHaveBeenCalled();
  });
});
