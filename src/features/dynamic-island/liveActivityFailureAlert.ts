export type LiveActivityFailureAction = 'activate' | 'deactivate';

type ErrorDetails = {
  code?: unknown;
  message?: unknown;
};

const MAX_DETAIL_LENGTH = 700;

function readErrorDetails(error: unknown): string | null {
  let code: string | null = null;
  let message: string | null = null;

  if (typeof error === 'string') {
    message = error.trim() || null;
  } else if (error instanceof Error) {
    message = error.message.trim() || null;
    const candidate = error as Error & { code?: unknown };
    if (typeof candidate.code === 'string' && candidate.code.trim()) {
      code = candidate.code.trim();
    }
  } else if (error && typeof error === 'object') {
    const details = error as ErrorDetails;
    if (typeof details.message === 'string' && details.message.trim()) {
      message = details.message.trim();
    }
    if (typeof details.code === 'string' && details.code.trim()) {
      code = details.code.trim();
    }
  }

  const detail = [
    code && (!message || !message.includes(code)) ? `Código: ${code}` : null,
    message,
  ].filter((part): part is string => Boolean(part)).join('\n');

  if (!detail) return null;
  return detail.length > MAX_DETAIL_LENGTH
    ? `${detail.slice(0, MAX_DETAIL_LENGTH - 1)}…`
    : detail;
}

export function createLiveActivityFailureAlert(
  error: unknown,
  action: LiveActivityFailureAction,
): { title: string; message: string } {
  const isActivation = action === 'activate';
  const title = isActivation ? 'Não foi possível ativar' : 'Não foi possível desativar';
  const fallback = isActivation
    ? 'Não foi possível iniciar a Live Activity. Verifique a configuração e as restrições do iOS.'
    : 'A atividade existente não pôde ser encerrada. Tente novamente.';
  const details = readErrorDetails(error);

  return {
    title,
    message: details
      ? `${isActivation ? 'Falha ao iniciar' : 'Falha ao encerrar'} a Live Activity.\n\nDetalhe informado pelo sistema:\n${details}`
      : fallback,
  };
}
