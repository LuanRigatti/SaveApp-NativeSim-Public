import { requireOptionalNativeModule } from 'expo';
import { Directory, File } from 'expo-file-system';
import * as Linking from 'expo-linking';

import { createActivityReconciler } from './activityReconciler';
import { createOptionalNativeModuleLoader } from './optionalNativeModuleLoader';
import {
  clearActivityLinkAuthorization,
  isMatchingActivityLinkToken,
  readActivityLinkAuthorization,
  writeActivityLinkAuthorization,
} from './activityLinkAuthorization';

type SaveLinkActivityProps = { iconUri: string; quickSaveStatus: 'ready' };
type NativeActivity = {
  end: (dismissalPolicy: 'immediate') => Promise<void>;
  getId: () => string;
};
type StartedActivity = { getId: () => string; end: NativeActivity['end'] };
type LiveActivityFactory = {
  start: (props: SaveLinkActivityProps, url?: string) => StartedActivity;
  getInstances: () => NativeActivity[];
};

const APP_GROUP_ICON_NAME = 'saveapp-live-activity-icon.png';
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

async function getSharedAppIconUri(): Promise<string> {
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
  const sharedIcon = new File(sharedDirectory, APP_GROUP_ICON_NAME);
  if (!sharedIcon.exists) {
    const [asset] = await Asset.loadAsync(require('../../../assets/live-activity-icon.png'));
    if (!asset?.localUri) throw new Error('Não foi possível preparar o ícone do SaveApp.');
    await new File(asset.localUri).copy(sharedIcon);
  }
  return sharedIcon.uri;
}

const reconcileInstances = createActivityReconciler({
  getInstances: () => getActivityFactory().getInstances(),
  start: async () => {
    const iconUri = await getSharedAppIconUri();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { randomUUID } = require('expo-crypto') as typeof import('expo-crypto');
    const token = randomUUID();
    await writeActivityLinkAuthorization({ token, activityId: null });
    const url = Linking.createURL('/links/compose', {
      queryParams: { source: 'dynamic-island', activityToken: token },
    });
    let activity: StartedActivity | null = null;
    try {
      activity = getActivityFactory().start({ iconUri, quickSaveStatus: 'ready' }, url);
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
