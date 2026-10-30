import { requireOptionalNativeModule } from 'expo';
import { Directory, File } from 'expo-file-system';
import * as Linking from 'expo-linking';

import { createActivityReconciler } from './activityReconciler';
import { createOptionalNativeModuleLoader } from './optionalNativeModuleLoader';
import {
  areBytesEqual,
  isExpectedSaveLinkActivityPng,
  SAVE_LINK_ACTIVITY_DARK_ICON_NAME,
  SAVE_LINK_ACTIVITY_ICON_SIZE,
  SAVE_LINK_ACTIVITY_LIGHT_ICON_NAME,
} from './saveLinkActivityIconAssets';
import {
  clearActivityLinkAuthorization,
  isMatchingActivityLinkToken,
  readActivityLinkAuthorization,
  writeActivityLinkAuthorization,
} from './activityLinkAuthorization';

type SaveLinkActivityProps = {
  iconUri: { light: string; dark: string };
  composeUrl: string;
  expandedHomeUrl: string;
  quickSaveStatus: 'ready';
};
type NativeActivity = {
  end: (dismissalPolicy: 'immediate') => Promise<void>;
  getId: () => string;
};
type StartedActivity = { getId: () => string; end: NativeActivity['end'] };
type LiveActivityFactory = {
  start: (props: SaveLinkActivityProps, url?: string) => StartedActivity;
  getInstances: () => NativeActivity[];
};

const activityFactoryLoader = createOptionalNativeModuleLoader(
  'ExpoWidgets',
  requireOptionalNativeModule,
  () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: factory } = require('./saveLinkLiveActivityWidget.ios') as {
      default: LiveActivityFactory;
    };
    return factory;
  },
);

function getActivityFactory(): LiveActivityFactory {
  const factory = activityFactoryLoader.get();
  if (!factory) throw new Error('Live Activities não estão disponíveis nesta versão do app.');
  return factory;
}

export function isSaveLinkActivityAvailable(): boolean {
  return activityFactoryLoader.isAvailable();
}

async function getSharedAppIconUri(): Promise<{ light: string; dark: string }> {
  // Keep modules introduced for this feature lazy so an older installed binary
  // can continue to launch the app and report activation as unavailable.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Asset } = require('expo-asset') as typeof import('expo-asset');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { widgetsDirectory } = require('expo-widgets') as typeof import('expo-widgets');
  if (typeof widgetsDirectory !== 'string' || !widgetsDirectory.startsWith('file://')) {
    throw new Error('O compartilhamento nativo do ícone não está disponível.');
  }

  const sharedDirectory = new Directory(widgetsDirectory);
  await sharedDirectory.create({ idempotent: true, intermediates: true });
  const [lightAsset, darkAsset] = await Asset.loadAsync([
    require('../../../assets/live-activity-icon.png'),
    require('../../../assets/live-activity-icon-dark.png'),
  ]);
  const lightIcon = new File(sharedDirectory, SAVE_LINK_ACTIVITY_LIGHT_ICON_NAME);
  const darkIcon = new File(sharedDirectory, SAVE_LINK_ACTIVITY_DARK_ICON_NAME);

  const copyValidatedIcon = async (asset: (typeof lightAsset) | undefined, destination: File) => {
    if (
      !asset?.localUri ||
      asset.width !== SAVE_LINK_ACTIVITY_ICON_SIZE ||
      asset.height !== SAVE_LINK_ACTIVITY_ICON_SIZE
    ) {
      throw new Error('O asset da Live Activity não tem o formato esperado.');
    }
    const source = new File(asset.localUri);
    const sourceBytes = await source.bytes();
    if (!source.exists || !isExpectedSaveLinkActivityPng(sourceBytes)) {
      throw new Error('Não foi possível validar o asset da Live Activity.');
    }
    await source.copy(destination, { overwrite: true });
    const copiedBytes = await destination.bytes();
    if (
      !destination.exists ||
      !areBytesEqual(sourceBytes, copiedBytes) ||
      !isExpectedSaveLinkActivityPng(copiedBytes) ||
      !destination.uri.startsWith('file://')
    ) {
      throw new Error('Não foi possível preparar o ícone compartilhado com a extensão.');
    }
    return destination.uri;
  };

  const [light, dark] = await Promise.all([
    copyValidatedIcon(lightAsset, lightIcon),
    copyValidatedIcon(darkAsset, darkIcon),
  ]);
  return { light, dark };
}

const reconcileInstances = createActivityReconciler({
  getInstances: () => getActivityFactory().getInstances(),
  start: async () => {
    const iconUri = await getSharedAppIconUri();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { randomUUID } = require('expo-crypto') as typeof import('expo-crypto');
    const token = randomUUID();
    await writeActivityLinkAuthorization({ token, activityId: null });
    const composeUrl = Linking.createURL('/links/compose', {
      queryParams: { source: 'dynamic-island', activityToken: token },
    });
    const expandedHomeUrl = Linking.createURL('/', {
      queryParams: { source: 'dynamic-island-expanded' },
    });
    let activity: StartedActivity | null = null;
    try {
      activity = getActivityFactory().start(
        { iconUri, composeUrl, expandedHomeUrl, quickSaveStatus: 'ready' },
        composeUrl,
      );
      await writeActivityLinkAuthorization({ token, activityId: activity.getId() });
    } catch (error) {
      if (activity) await activity.end('immediate').catch(() => undefined);
      await clearActivityLinkAuthorization().catch(() => undefined);
      throw error;
    }
  },
});

export async function reconcileSaveLinkActivity(enabled: boolean): Promise<void> {
  const factory = activityFactoryLoader.get();
  if (!factory) return;
  const instances = factory.getInstances();

  if (!enabled) {
    await reconcileInstances(false);
    await clearActivityLinkAuthorization();
    return;
  }

  const authorization = await readActivityLinkAuthorization();
  const hasMatchingActivity = authorization?.activityId != null &&
    instances.some((activity) => activity.getId() === authorization.activityId);

  // Replace orphaned or duplicated activities so the saved deep-link token
  // always belongs to the single activity that remains active.
  if (instances.length > 0 && (instances.length > 1 || !hasMatchingActivity)) {
    await Promise.all(instances.map((activity) => activity.end('immediate')));
    await clearActivityLinkAuthorization();
  }

  await reconcileInstances(true);
}

export async function isAuthorizedSaveLinkActivityURL(token: string | string[] | undefined): Promise<boolean> {
  if (typeof token !== 'string') return false;
  try {
    const authorization = await readActivityLinkAuthorization();
    if (
      !authorization?.activityId ||
      !isMatchingActivityLinkToken(token, authorization.token)
    ) return false;
    return getActivityFactory()
      .getInstances()
      .some((activity) => activity.getId() === authorization.activityId);
  } catch {
    return false;
  }
}
