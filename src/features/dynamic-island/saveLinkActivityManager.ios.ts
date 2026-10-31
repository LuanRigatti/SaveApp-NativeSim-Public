import { requireOptionalNativeModule } from 'expo';
import * as Linking from 'expo-linking';

import { createActivityReconciler } from './activityReconciler';
import { createOptionalNativeModuleLoader } from './optionalNativeModuleLoader';
import {
  areBytesEqual,
  isExpectedSaveLinkActivityPng,
  SAVE_LINK_ACTIVITY_ICON_FILE,
  SAVE_LINK_ACTIVITY_ICON_SIZE,
} from './saveLinkActivityIconAssets';
import {
  clearActivityLinkAuthorization,
  isMatchingActivityLinkToken,
  readActivityLinkAuthorization,
  writeActivityLinkAuthorization,
} from './activityLinkAuthorization';
import {
  readQuickSaveLockScreenHistorySnapshot,
  type QuickSaveLockScreenHistorySnapshot,
} from './quickSaveLockScreenHistory';
import {
  getQuickSaveLockScreenSettings,
  setQuickSaveActivityStatus,
  type QuickSaveLockScreenSettings,
} from '../../../modules/clipboard-url-detection/src';

type QuickSaveActivityStatus = QuickSaveLockScreenSettings['quickSaveStatus'];
type RecentQuickSaveActivityLink = { domain: string; createdAt: number; faviconUri?: string };

type SaveLinkActivityProps = {
  iconUri: string;
  composeUrl: string;
  expandedHomeUrl: string;
  quickSaveStatus: QuickSaveActivityStatus;
  showRecentQuickSaveLinks: boolean;
  recentQuickSaveLinksRevision: number;
  recentQuickSaveLinks: RecentQuickSaveActivityLink[];
};
type NativeActivity = {
  end: (dismissalPolicy: 'immediate') => Promise<void>;
  getId: () => string;
  update: (props: SaveLinkActivityProps) => Promise<void>;
};
type StartedActivity = { getId: () => string; end: NativeActivity['end']; update: NativeActivity['update'] };
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

let activityUpdateQueue: Promise<void> = Promise.resolve();

function serializeActivityUpdate(operation: () => Promise<void>): Promise<void> {
  const next = activityUpdateQueue.then(operation, operation);
  activityUpdateQueue = next.catch(() => undefined);
  return next;
}

function getActivityFactory(): LiveActivityFactory {
  const factory = activityFactoryLoader.get();
  if (!factory) throw new Error('Live Activities não estão disponíveis nesta versão do app.');
  return factory;
}

export function isSaveLinkActivityAvailable(): boolean {
  return activityFactoryLoader.isAvailable();
}

function makeRecentQuickSaveActivityProps(
  visible: boolean,
  snapshot: QuickSaveLockScreenHistorySnapshot | null,
): { revision: number; links: RecentQuickSaveActivityLink[] } {
  if (!visible || !snapshot) return { revision: snapshot?.revision ?? 0, links: [] };
  return {
    revision: snapshot.revision,
    links: snapshot.links.slice(0, 3).map(({ domain, createdAt, faviconUri }) => ({
      domain,
      createdAt,
      ...(faviconUri ? { faviconUri } : {}),
    })),
  };
}

async function getSharedAppIconUri(): Promise<string> {
  // Keep native-only modules lazy so older binaries can still load this manager.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Asset } = require('expo-asset') as typeof import('expo-asset');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Directory, File } = require('expo-file-system') as typeof import('expo-file-system');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { widgetsDirectory } = require('expo-widgets') as typeof import('expo-widgets');

  if (typeof widgetsDirectory !== 'string' || !widgetsDirectory.startsWith('file://')) {
    throw new Error('O compartilhamento nativo do ícone não está disponível.');
  }

  const sharedDirectory = new Directory(widgetsDirectory);
  await sharedDirectory.create({ idempotent: true, intermediates: true });

  const [asset] = await Asset.loadAsync([require('../../../assets/live-activity-icon.png')]);
  if (
    !asset?.localUri?.startsWith('file://') ||
    asset.width !== SAVE_LINK_ACTIVITY_ICON_SIZE ||
    asset.height !== SAVE_LINK_ACTIVITY_ICON_SIZE
  ) {
    throw new Error('O ícone da Live Activity não tem o formato esperado.');
  }

  const source = new File(asset.localUri);
  const destination = new File(sharedDirectory, SAVE_LINK_ACTIVITY_ICON_FILE);
  if (!source.exists) throw new Error('Não foi possível localizar o ícone da Live Activity.');

  const sourceBytes = await source.bytes();
  if (!isExpectedSaveLinkActivityPng(sourceBytes)) {
    throw new Error('Não foi possível validar o ícone da Live Activity.');
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
}

const reconcileInstances = createActivityReconciler({
  getInstances: () => getActivityFactory().getInstances(),
  start: async () => {
    const iconUri = await getSharedAppIconUri();
    const lockScreenSettings = getQuickSaveLockScreenSettings();
    const showRecentQuickSaveLinks = lockScreenSettings?.showRecentLinks ?? false;
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
    // A new Activity starts in `ready`; prevent a previous Activity's persisted
    // status from being copied into it when the lock-screen privacy toggle is used.
    setQuickSaveActivityStatus('ready');
    const recentSnapshot = showRecentQuickSaveLinks
      ? await readQuickSaveLockScreenHistorySnapshot()
      : null;
    const recentProps = makeRecentQuickSaveActivityProps(showRecentQuickSaveLinks, recentSnapshot);
    let activity: StartedActivity | null = null;
    try {
      activity = getActivityFactory().start(
        {
          iconUri,
          composeUrl,
          expandedHomeUrl,
          quickSaveStatus: 'ready',
          showRecentQuickSaveLinks,
          recentQuickSaveLinksRevision: recentProps.revision,
          recentQuickSaveLinks: recentProps.links,
        },
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

export async function updateSaveLinkActivityRecentLinksVisibility(visible: boolean): Promise<void> {
  await serializeActivityUpdate(async () => {
    const factory = activityFactoryLoader.get();
    if (!factory) return;
    const authorization = await readActivityLinkAuthorization();
    if (!authorization?.activityId) return;
    const activity = factory.getInstances().find((candidate) => candidate.getId() === authorization.activityId);
    if (!activity) return;

    const iconUri = await getSharedAppIconUri();
    const composeUrl = Linking.createURL('/links/compose', {
      queryParams: { source: 'dynamic-island', activityToken: authorization.token },
    });
    const expandedHomeUrl = Linking.createURL('/', {
      queryParams: { source: 'dynamic-island-expanded' },
    });

    // A history/setting change while ActivityKit accepts an update is reconciled
    // with a bounded follow-up. Invocations from the app are serialized above.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const latestSettings = getQuickSaveLockScreenSettings();
      const shouldShowRecentQuickSaveLinks = visible && latestSettings?.showRecentLinks === true;
      const snapshot = shouldShowRecentQuickSaveLinks
        ? await readQuickSaveLockScreenHistorySnapshot()
        : null;
      if (shouldShowRecentQuickSaveLinks && !snapshot) return;

      const confirmedSettings = getQuickSaveLockScreenSettings();
      const confirmedVisibility = visible && confirmedSettings?.showRecentLinks === true;
      if (confirmedVisibility !== shouldShowRecentQuickSaveLinks) continue;

      const recentProps = makeRecentQuickSaveActivityProps(shouldShowRecentQuickSaveLinks, snapshot);
      await activity.update({
        iconUri,
        composeUrl,
        expandedHomeUrl,
        quickSaveStatus: confirmedSettings?.quickSaveStatus ?? 'ready',
        showRecentQuickSaveLinks: confirmedVisibility,
        recentQuickSaveLinksRevision: recentProps.revision,
        recentQuickSaveLinks: recentProps.links,
      });

      if (!confirmedVisibility) return;
      const [afterSnapshot, afterSettings] = await Promise.all([
        readQuickSaveLockScreenHistorySnapshot(),
        Promise.resolve(getQuickSaveLockScreenSettings()),
      ]);
      if (
        afterSnapshot?.revision === snapshot?.revision &&
        afterSettings?.showRecentLinks === true
      ) return;
    }
  });
}

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
