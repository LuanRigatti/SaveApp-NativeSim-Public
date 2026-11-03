import type { FolderAuthenticationOutcome } from './folderFaceIdAuthentication';

export type HomeFolderAssignmentErrorCode =
  | 'HOME_FOLDER_AUTHENTICATION_CANCELLED'
  | 'HOME_FOLDER_AUTHENTICATION_UNAVAILABLE'
  | 'HOME_FOLDER_AUTHENTICATION_FAILED'
  | 'HOME_FOLDER_AUTHORIZATION_REQUIRED'
  | 'HOME_FOLDER_OPERATION_CANCELLED'
  | 'HOME_FOLDER_OPERATION_PENDING'
  | 'HOME_FOLDER_ASSIGNMENT_CHANGED'
  | 'HOME_FOLDER_ASSIGNMENT_PERSISTENCE_FAILED'
  | 'HOME_FOLDER_NOT_FOUND'
  | 'HOME_FOLDER_ITEM_NOT_FOUND';

export class HomeFolderAssignmentError extends Error {
  constructor(
    readonly code: HomeFolderAssignmentErrorCode,
    readonly causeValue?: unknown,
  ) {
    super(code);
    this.name = 'HomeFolderAssignmentError';
  }
}

const KNOWN_ASSIGNMENT_ERROR_CODES = new Set<HomeFolderAssignmentErrorCode>([
  'HOME_FOLDER_AUTHENTICATION_CANCELLED',
  'HOME_FOLDER_AUTHENTICATION_UNAVAILABLE',
  'HOME_FOLDER_AUTHENTICATION_FAILED',
  'HOME_FOLDER_AUTHORIZATION_REQUIRED',
  'HOME_FOLDER_OPERATION_CANCELLED',
  'HOME_FOLDER_OPERATION_PENDING',
  'HOME_FOLDER_ASSIGNMENT_CHANGED',
  'HOME_FOLDER_ASSIGNMENT_PERSISTENCE_FAILED',
  'HOME_FOLDER_NOT_FOUND',
  'HOME_FOLDER_ITEM_NOT_FOUND',
]);

function getErrorCode(error: unknown): HomeFolderAssignmentErrorCode | null {
  if (error instanceof HomeFolderAssignmentError) return error.code;
  const code = error instanceof Error ? error.message : null;
  return code && KNOWN_ASSIGNMENT_ERROR_CODES.has(code as HomeFolderAssignmentErrorCode)
    ? code as HomeFolderAssignmentErrorCode
    : null;
}

export function toHomeFolderAssignmentPersistenceError(error: unknown): HomeFolderAssignmentError {
  const code = getErrorCode(error);
  if (code) return new HomeFolderAssignmentError(code, error);
  return new HomeFolderAssignmentError('HOME_FOLDER_ASSIGNMENT_PERSISTENCE_FAILED', error);
}

export function runExclusiveFolderAssignment<T>(
  operationLock: { current: boolean },
  operation: () => Promise<T>,
): Promise<T> {
  if (operationLock.current) {
    return Promise.reject(new HomeFolderAssignmentError('HOME_FOLDER_OPERATION_PENDING'));
  }

  operationLock.current = true;
  return (async () => {
    try {
      return await operation();
    } finally {
      operationLock.current = false;
    }
  })();
}

export async function authorizeAndPersistFolderAssignment<T>(options: {
  candidateFolderIds: readonly string[];
  /** Protected source folders whose item association is removed; a destination alone is write-only. */
  authorizationFolderIds?: readonly string[];
  getProtectedFolderIds: (candidateFolderIds: readonly string[]) => readonly string[];
  sessionAuthorizedFolderIds: readonly string[];
  requestAuthentication: (folderId: string) => Promise<FolderAuthenticationOutcome>;
  isOperationCurrent: () => boolean;
  persist: (validateBeforeCommit: () => boolean) => Promise<T>;
}): Promise<T> {
  const candidates = [...new Set(options.candidateFolderIds)];
  const authorizationCandidates = new Set(
    (options.authorizationFolderIds ?? candidates).filter((folderId) => candidates.includes(folderId)),
  );
  const initiallyProtected = [...new Set(options.getProtectedFolderIds(candidates))];
  const protectedAuthorizationCandidates = initiallyProtected.filter((folderId) => (
    authorizationCandidates.has(folderId)
  ));
  const operationGrants = new Set(
    options.sessionAuthorizedFolderIds.filter((folderId) => protectedAuthorizationCandidates.includes(folderId)),
  );
  const needsAuthentication = protectedAuthorizationCandidates.find((folderId) => !operationGrants.has(folderId));

  if (needsAuthentication) {
    let outcome: FolderAuthenticationOutcome;
    try {
      outcome = await options.requestAuthentication(needsAuthentication);
    } catch (error) {
      throw new HomeFolderAssignmentError('HOME_FOLDER_AUTHENTICATION_FAILED', error);
    }

    if (outcome !== 'authenticated') {
      const code = outcome === 'cancelled'
        ? 'HOME_FOLDER_AUTHENTICATION_CANCELLED'
        : outcome === 'unavailable'
          ? 'HOME_FOLDER_AUTHENTICATION_UNAVAILABLE'
          : 'HOME_FOLDER_AUTHENTICATION_FAILED';
      throw new HomeFolderAssignmentError(code);
    }

    if (!options.isOperationCurrent()) {
      throw new HomeFolderAssignmentError('HOME_FOLDER_OPERATION_CANCELLED');
    }

    // Authentication is scoped to the protected source whose contents this operation can remove.
    operationGrants.add(needsAuthentication);
  }

  let invalidationCode: HomeFolderAssignmentErrorCode | null = null;
  const validateBeforeCommit = () => {
    if (!options.isOperationCurrent()) {
      invalidationCode = 'HOME_FOLDER_OPERATION_CANCELLED';
      return false;
    }
    if (options.getProtectedFolderIds(candidates).some((folderId) => (
      authorizationCandidates.has(folderId) && !operationGrants.has(folderId)
    ))) {
      invalidationCode = 'HOME_FOLDER_AUTHORIZATION_REQUIRED';
      return false;
    }
    return true;
  };

  if (!validateBeforeCommit()) {
    throw new HomeFolderAssignmentError(invalidationCode ?? 'HOME_FOLDER_OPERATION_CANCELLED');
  }

  try {
    return await options.persist(validateBeforeCommit);
  } catch (error) {
    if (invalidationCode && getErrorCode(error) === 'HOME_FOLDER_OPERATION_CANCELLED') {
      throw new HomeFolderAssignmentError(invalidationCode, error);
    }
    throw toHomeFolderAssignmentPersistenceError(error);
  }
}

export function getHomeFolderAssignmentAlert(error: unknown): { title: string; message: string } | null {
  switch (getErrorCode(error)) {
    case 'HOME_FOLDER_AUTHENTICATION_CANCELLED':
    case 'HOME_FOLDER_OPERATION_CANCELLED':
      return null;
    case 'HOME_FOLDER_AUTHENTICATION_UNAVAILABLE':
      return {
        title: 'Face ID indisponível',
        message: 'Configure o Face ID e tente novamente. A pasta atual foi mantida.',
      };
    case 'HOME_FOLDER_AUTHENTICATION_FAILED':
    case 'HOME_FOLDER_AUTHORIZATION_REQUIRED':
      return {
        title: 'Não foi possível autorizar a movimentação',
        message: 'A pasta atual foi mantida. Autentique novamente e tente outra vez.',
      };
    case 'HOME_FOLDER_OPERATION_PENDING':
      return {
        title: 'Movimentação em andamento',
        message: 'Aguarde a operação atual terminar antes de tentar novamente.',
      };
    case 'HOME_FOLDER_ASSIGNMENT_CHANGED':
      return {
        title: 'A pasta do item foi alterada',
        message: 'A movimentação não foi aplicada e a associação mais recente foi preservada. Atualize a lista e tente novamente.',
      };
    case 'HOME_FOLDER_NOT_FOUND':
      return {
        title: 'Pasta indisponível',
        message: 'A pasta de destino não está mais disponível. O item permaneceu na pasta atual.',
      };
    case 'HOME_FOLDER_ITEM_NOT_FOUND':
      return {
        title: 'Item indisponível',
        message: 'O item não está mais disponível para movimentação.',
      };
    case 'HOME_FOLDER_ASSIGNMENT_PERSISTENCE_FAILED':
    default:
      return {
        title: 'Não foi possível mover o item',
        message: 'O armazenamento local não confirmou a alteração. A pasta atual foi mantida. Tente novamente.',
      };
  }
}
