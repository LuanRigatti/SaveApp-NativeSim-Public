import { requireOptionalNativeModule } from 'expo';
import * as Linking from 'expo-linking';

import { createActivityReconciler } from './activityReconciler';
import { createOptionalNativeModuleLoader } from './optionalNativeModuleLoader';
import {
  clearActivityLinkAuthorization,
  isMatchingActivityLinkToken,
  readActivityLinkAuthorization,
  writeActivityLinkAuthorization,
} from './activityLinkAuthorization';

type SaveLinkActivityProps = {
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

const reconcileInstances = createActivityReconciler({
  getInstances: () => getActivityFactory().getInstances(),
  start: async () => {
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
        { composeUrl, expandedHomeUrl, quickSaveStatus: 'ready' },
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
