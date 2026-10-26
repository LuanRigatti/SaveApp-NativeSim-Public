import type { LinkSaveSubmissionResult } from './linkSaveSubmission';

const GENERIC_LINK_SAVE_ERROR = 'Não foi possível adicionar o link. Tente novamente.';

type NativePromptSubmitResult = {
  status: LinkSaveSubmissionResult;
  message?: string;
};

export async function submitLinkFromNativePrompt(
  input: string,
  submit: (value: string) => Promise<NativePromptSubmitResult>,
  onFailure: (message: string, retryValue: string) => void,
): Promise<LinkSaveSubmissionResult> {
  let result: NativePromptSubmitResult;

  try {
    result = await submit(input);
  } catch {
    result = { status: 'failed', message: GENERIC_LINK_SAVE_ERROR };
  }

  if (result.status === 'failed') {
    onFailure(result.message ?? GENERIC_LINK_SAVE_ERROR, input);
  }

  return result.status;
}
