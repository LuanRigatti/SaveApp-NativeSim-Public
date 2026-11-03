import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export type FolderAuthenticationOutcome = 'authenticated' | 'cancelled' | 'unavailable' | 'failed';

export async function authorizeAndRunHomeFolderAction(options: {
  authorize: () => Promise<FolderAuthenticationOutcome>;
  isRequestCurrent: () => boolean;
  getAppState: () => string;
  waitUntilActive: () => Promise<boolean>;
  isProtected: () => boolean;
  hasSessionAuthorization: () => boolean;
  runAction: () => void;
}): Promise<FolderAuthenticationOutcome> {
  const outcome = await options.authorize();
  if (outcome !== 'authenticated') return outcome;
  if (!options.isRequestCurrent()) return 'cancelled';

  let appState = options.getAppState();
  if (appState === 'inactive') {
    if (!await options.waitUntilActive()) return 'cancelled';
    appState = options.getAppState();
  }
  if (
    !options.isRequestCurrent() ||
    appState !== 'active' ||
    (options.isProtected() && !options.hasSessionAuthorization())
  ) {
    return 'cancelled';
  }

  options.runAction();
  return 'authenticated';
}

export function lockAuthorizedHomeFolder(options: {
  folderId: string;
  isProtected: boolean;
  appState: string;
  unlockedFolderIds: ReadonlySet<string>;
  invalidatePending: () => void;
  replaceUnlockedFolderIds: (folderIds: ReadonlySet<string>) => void;
  returnToAllItems: () => void;
}): boolean {
  if (
    !options.isProtected ||
    options.appState !== 'active' ||
    !options.unlockedFolderIds.has(options.folderId)
  ) {
    return false;
  }

  const nextUnlockedFolderIds = new Set(options.unlockedFolderIds);
  nextUnlockedFolderIds.delete(options.folderId);
  options.invalidatePending();
  options.replaceUnlockedFolderIds(nextUnlockedFolderIds);
  options.returnToAllItems();
  return true;
}

// The system authentication sheet may finish while UIKit still reports a transient inactive state.
// Only configuration changes may accept that state; protected-content access stays active-only.
export function canContinueAfterFaceId(options: {
  outcome: FolderAuthenticationOutcome;
  requestEpoch: number;
  currentEpoch: number;
  appState: string;
  allowInactiveAfterAuthentication?: boolean;
}): boolean {
  if (
    options.outcome !== 'authenticated' ||
    options.requestEpoch !== options.currentEpoch ||
    options.appState === 'background'
  ) {
    return false;
  }

  return options.appState === 'active' || (
    options.allowInactiveAfterAuthentication === true && options.appState === 'inactive'
  );
}

export type FaceIdAuthenticationAdapter = {
  platform: string;
  executionEnvironment: ExecutionEnvironment;
  hasHardwareAsync: typeof LocalAuthentication.hasHardwareAsync;
  isEnrolledAsync: typeof LocalAuthentication.isEnrolledAsync;
  supportedAuthenticationTypesAsync: typeof LocalAuthentication.supportedAuthenticationTypesAsync;
  authenticateAsync: typeof LocalAuthentication.authenticateAsync;
};

const runtimeAdapter: FaceIdAuthenticationAdapter = {
  platform: Platform.OS,
  executionEnvironment: Constants.executionEnvironment,
  hasHardwareAsync: LocalAuthentication.hasHardwareAsync,
  isEnrolledAsync: LocalAuthentication.isEnrolledAsync,
  supportedAuthenticationTypesAsync: LocalAuthentication.supportedAuthenticationTypesAsync,
  authenticateAsync: LocalAuthentication.authenticateAsync,
};

export async function authenticateWithFaceId(
  promptMessage: string,
  adapter: FaceIdAuthenticationAdapter = runtimeAdapter,
): Promise<FolderAuthenticationOutcome> {
  if (
    adapter.platform !== 'ios' ||
    adapter.executionEnvironment === ExecutionEnvironment.StoreClient
  ) {
    return 'unavailable';
  }

  try {
    const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
      adapter.hasHardwareAsync(),
      adapter.isEnrolledAsync(),
      adapter.supportedAuthenticationTypesAsync(),
    ]);
    if (
      !hasHardware ||
      !isEnrolled ||
      !supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
    ) {
      return 'unavailable';
    }

    const result = await adapter.authenticateAsync({
      cancelLabel: 'Cancelar',
      disableDeviceFallback: false,
      promptMessage,
    });
    if (result.success) return 'authenticated';
    if (result.error === 'user_cancel' || result.error === 'app_cancel' || result.error === 'system_cancel') {
      return 'cancelled';
    }
    if (result.error === 'not_available' || result.error === 'not_enrolled') return 'unavailable';
    return 'failed';
  } catch {
    return 'failed';
  }
}

export function getFolderAuthenticationFailureMessage(
  outcome: Exclude<FolderAuthenticationOutcome, 'authenticated' | 'cancelled'>,
): string {
  if (outcome === 'unavailable') {
    return 'O Face ID não está disponível neste ambiente. Use uma versão de desenvolvimento ou instalada do SaveApp com o Face ID configurado.';
  }
  return 'Não foi possível autenticar. A pasta continua bloqueada.';
}
