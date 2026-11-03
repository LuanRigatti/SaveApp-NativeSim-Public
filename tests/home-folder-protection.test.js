const fs = require('node:fs');
const path = require('node:path');

const { ExecutionEnvironment } = require('expo-constants');
const { AuthenticationType } = require('expo-local-authentication');
const {
  authenticateWithFaceId,
  authorizeAndRunHomeFolderAction,
  canContinueAfterFaceId,
  lockAuthorizedHomeFolder,
} = require('../src/features/home-folders/folderFaceIdAuthentication');
const {
  authorizeAndPersistFolderAssignment,
  getHomeFolderAssignmentAlert,
  HomeFolderAssignmentError,
  runExclusiveFolderAssignment,
} = require('../src/features/home-folders/folderAssignmentOperations');

const repositoryRoot = path.resolve(__dirname, '..');
const readSource = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

function createFaceIdAdapter(overrides = {}) {
  return {
    platform: 'ios',
    executionEnvironment: ExecutionEnvironment.Bare,
    hasHardwareAsync: jest.fn(async () => true),
    isEnrolledAsync: jest.fn(async () => true),
    supportedAuthenticationTypesAsync: jest.fn(async () => [AuthenticationType.FACIAL_RECOGNITION]),
    authenticateAsync: jest.fn(async () => ({ success: true })),
    ...overrides,
  };
}

describe('Face ID folder authorization', () => {
  test('requires iOS Face ID hardware and enrollment before authentication', async () => {
    const noHardware = createFaceIdAdapter({ hasHardwareAsync: jest.fn(async () => false) });
    const notEnrolled = createFaceIdAdapter({ isEnrolledAsync: jest.fn(async () => false) });
    const touchIdOnly = createFaceIdAdapter({
      supportedAuthenticationTypesAsync: jest.fn(async () => [AuthenticationType.FINGERPRINT]),
    });

    await expect(authenticateWithFaceId('Acessar pasta', noHardware)).resolves.toBe('unavailable');
    await expect(authenticateWithFaceId('Acessar pasta', notEnrolled)).resolves.toBe('unavailable');
    await expect(authenticateWithFaceId('Acessar pasta', touchIdOnly)).resolves.toBe('unavailable');
    expect(noHardware.authenticateAsync).not.toHaveBeenCalled();
  });

  test('fails closed in Expo Go and outside iOS', async () => {
    const expoGo = createFaceIdAdapter({ executionEnvironment: ExecutionEnvironment.StoreClient });
    const android = createFaceIdAdapter({ platform: 'android' });

    await expect(authenticateWithFaceId('Acessar pasta', expoGo)).resolves.toBe('unavailable');
    await expect(authenticateWithFaceId('Acessar pasta', android)).resolves.toBe('unavailable');
    expect(expoGo.hasHardwareAsync).not.toHaveBeenCalled();
    expect(android.authenticateAsync).not.toHaveBeenCalled();
  });

  test('keeps the native device fallback enabled and only authorizes successful results', async () => {
    const success = createFaceIdAdapter();
    const cancelled = createFaceIdAdapter({
      authenticateAsync: jest.fn(async () => ({ success: false, error: 'user_cancel' })),
    });
    const failed = createFaceIdAdapter({
      authenticateAsync: jest.fn(async () => ({ success: false, error: 'lockout' })),
    });

    await expect(authenticateWithFaceId('Acessar pasta', success)).resolves.toBe('authenticated');
    await expect(authenticateWithFaceId('Acessar pasta', cancelled)).resolves.toBe('cancelled');
    await expect(authenticateWithFaceId('Acessar pasta', failed)).resolves.toBe('failed');
    expect(success.authenticateAsync).toHaveBeenCalledWith({
      cancelLabel: 'Cancelar',
      disableDeviceFallback: false,
      promptMessage: 'Acessar pasta',
    });
  });

  test('accepts a successful settings authentication during the system inactive transition only for the unchanged foreground session', () => {
    const base = {
      outcome: 'authenticated',
      requestEpoch: 4,
      currentEpoch: 4,
      appState: 'inactive',
    };

    expect(canContinueAfterFaceId(base)).toBe(false);
    expect(canContinueAfterFaceId({ ...base, allowInactiveAfterAuthentication: true })).toBe(true);
    expect(canContinueAfterFaceId({
      ...base,
      appState: 'background',
      allowInactiveAfterAuthentication: true,
    })).toBe(false);
    expect(canContinueAfterFaceId({
      ...base,
      currentEpoch: 5,
      allowInactiveAfterAuthentication: true,
    })).toBe(false);
    expect(canContinueAfterFaceId({
      ...base,
      appState: 'unknown',
      allowInactiveAfterAuthentication: true,
    })).toBe(false);
    expect(canContinueAfterFaceId({
      ...base,
      outcome: 'cancelled',
      allowInactiveAfterAuthentication: true,
    })).toBe(false);
  });

  test('keeps the prior screen during inactive and selects the protected folder after the app returns active', async () => {
    let appState = 'active';
    let sessionAuthorized = false;
    let selected = 'previous-folder';
    let finishActiveTransition;
    const pendingSelection = authorizeAndRunHomeFolderAction({
      authorize: async () => {
        appState = 'inactive';
        sessionAuthorized = true;
        return 'authenticated';
      },
      isRequestCurrent: () => true,
      getAppState: () => appState,
      waitUntilActive: () => new Promise((resolve) => { finishActiveTransition = resolve; }),
      isProtected: () => true,
      hasSessionAuthorization: () => sessionAuthorized,
      runAction: () => { selected = 'protected-folder'; },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(selected).toBe('previous-folder');

    appState = 'active';
    finishActiveTransition(true);
    await expect(pendingSelection).resolves.toBe('authenticated');
    expect(selected).toBe('protected-folder');
  });

  test('does not select a protected folder unless the authenticated session contains its authorization', async () => {
    const runAction = jest.fn();
    await expect(authorizeAndRunHomeFolderAction({
      authorize: async () => 'authenticated',
      isRequestCurrent: () => true,
      getAppState: () => 'inactive',
      waitUntilActive: async () => true,
      isProtected: () => true,
      hasSessionAuthorization: () => false,
      runAction,
    })).resolves.toBe('cancelled');
    expect(runAction).not.toHaveBeenCalled();
  });

  test.each(['cancelled', 'failed', 'unavailable'])('preserves the previous folder when authentication returns %s', async (outcome) => {
    let selected = 'previous-folder';
    await expect(authorizeAndRunHomeFolderAction({
      authorize: async () => outcome,
      isRequestCurrent: () => true,
      getAppState: () => 'active',
      waitUntilActive: async () => true,
      isProtected: () => true,
      hasSessionAuthorization: () => false,
      runAction: () => { selected = 'protected-folder'; },
    })).resolves.toBe(outcome);
    expect(selected).toBe('previous-folder');
  });

  test('cancels a Face ID result after the app backgrounds and preserves the previous folder', async () => {
    let appState = 'active';
    let currentEpoch = 3;
    let selected = 'previous-folder';
    await expect(authorizeAndRunHomeFolderAction({
      authorize: async () => {
        appState = 'background';
        currentEpoch += 1;
        return 'authenticated';
      },
      isRequestCurrent: () => currentEpoch === 3,
      getAppState: () => appState,
      waitUntilActive: async () => false,
      isProtected: () => true,
      hasSessionAuthorization: () => true,
      runAction: () => { selected = 'protected-folder'; },
    })).resolves.toBe('cancelled');
    expect(selected).toBe('previous-folder');
  });

  test('ignores an older authentication when a newer folder selection is requested', async () => {
    let currentRequest = 1;
    let selected = 'previous-folder';
    let finishOlderAuthentication;
    const olderRequest = authorizeAndRunHomeFolderAction({
      authorize: () => new Promise((resolve) => { finishOlderAuthentication = resolve; }),
      isRequestCurrent: () => currentRequest === 1,
      getAppState: () => 'active',
      waitUntilActive: async () => true,
      isProtected: () => true,
      hasSessionAuthorization: () => true,
      runAction: () => { selected = 'older-folder'; },
    });

    currentRequest = 2;
    await expect(authorizeAndRunHomeFolderAction({
      authorize: async () => 'authenticated',
      isRequestCurrent: () => currentRequest === 2,
      getAppState: () => 'active',
      waitUntilActive: async () => true,
      isProtected: () => true,
      hasSessionAuthorization: () => true,
      runAction: () => { selected = 'newer-folder'; },
    })).resolves.toBe('authenticated');
    finishOlderAuthentication('authenticated');

    await expect(olderRequest).resolves.toBe('cancelled');
    expect(selected).toBe('newer-folder');
  });

  test('manually locks only the requested protected folder and invalidates pending work before returning to Todos', () => {
    const unlockedFolderIds = new Set(['private-a', 'private-b']);
    let nextUnlockedFolderIds = unlockedFolderIds;
    let selection = { kind: 'folder', folderId: 'private-a' };
    const invalidatePending = jest.fn();
    const replaceUnlockedFolderIds = jest.fn((ids) => { nextUnlockedFolderIds = ids; });
    const returnToAllItems = jest.fn(() => { selection = { kind: 'view', view: 'all-items' }; });

    expect(lockAuthorizedHomeFolder({
      folderId: 'private-a',
      isProtected: true,
      appState: 'active',
      unlockedFolderIds,
      invalidatePending,
      replaceUnlockedFolderIds,
      returnToAllItems,
    })).toBe(true);

    expect([...nextUnlockedFolderIds]).toEqual(['private-b']);
    expect(selection).toEqual({ kind: 'view', view: 'all-items' });
    expect(invalidatePending).toHaveBeenCalledTimes(1);
    expect(replaceUnlockedFolderIds).toHaveBeenCalledTimes(1);
    expect(returnToAllItems).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['inactive', true, true],
    ['background', true, true],
    ['active', false, true],
    ['active', true, false],
  ])('does not manually lock or change selection when state is %s and protection/session is %s/%s', (
    appState,
    isProtected,
    hasAuthorization,
  ) => {
    const invalidatePending = jest.fn();
    const replaceUnlockedFolderIds = jest.fn();
    const returnToAllItems = jest.fn();
    expect(lockAuthorizedHomeFolder({
      folderId: 'private-a',
      isProtected,
      appState,
      unlockedFolderIds: hasAuthorization ? new Set(['private-a']) : new Set(),
      invalidatePending,
      replaceUnlockedFolderIds,
      returnToAllItems,
    })).toBe(false);
    expect(invalidatePending).not.toHaveBeenCalled();
    expect(replaceUnlockedFolderIds).not.toHaveBeenCalled();
    expect(returnToAllItems).not.toHaveBeenCalled();
  });

  test('requires a fresh authorization after manual lock and rejects the prior pending authentication', async () => {
    const unlockedFolderIds = new Set(['private-a']);
    let currentRequest = 1;
    let epoch = 4;
    let selected = { kind: 'folder', folderId: 'private-a' };
    let finishOldAuthentication;
    const oldWaitUntilActive = jest.fn(async () => true);
    const oldRequest = authorizeAndRunHomeFolderAction({
      authorize: () => new Promise((resolve) => { finishOldAuthentication = resolve; }),
      isRequestCurrent: () => currentRequest === 1 && epoch === 4,
      getAppState: () => 'active',
      waitUntilActive: oldWaitUntilActive,
      isProtected: () => true,
      hasSessionAuthorization: () => unlockedFolderIds.has('private-a'),
      runAction: () => { selected = { kind: 'folder', folderId: 'private-a' }; },
    });

    lockAuthorizedHomeFolder({
      folderId: 'private-a',
      isProtected: true,
      appState: 'active',
      unlockedFolderIds,
      invalidatePending: () => {
        currentRequest += 1;
        epoch += 1;
      },
      replaceUnlockedFolderIds: (ids) => {
        unlockedFolderIds.clear();
        for (const id of ids) unlockedFolderIds.add(id);
      },
      returnToAllItems: () => { selected = { kind: 'view', view: 'all-items' }; },
    });
    expect(unlockedFolderIds.has('private-a')).toBe(false);
    expect(selected).toEqual({ kind: 'view', view: 'all-items' });

    const authorizeAgain = jest.fn(async () => {
      unlockedFolderIds.add('private-a');
      return 'authenticated';
    });
    await expect(authorizeAndRunHomeFolderAction({
      authorize: authorizeAgain,
      isRequestCurrent: () => true,
      getAppState: () => 'active',
      waitUntilActive: async () => true,
      isProtected: () => true,
      hasSessionAuthorization: () => unlockedFolderIds.has('private-a'),
      runAction: () => { selected = { kind: 'folder', folderId: 'private-a' }; },
    })).resolves.toBe('authenticated');
    expect(authorizeAgain).toHaveBeenCalledTimes(1);
    expect(selected).toEqual({ kind: 'folder', folderId: 'private-a' });

    finishOldAuthentication('authenticated');
    await expect(oldRequest).resolves.toBe('cancelled');
    expect(oldWaitUntilActive).not.toHaveBeenCalled();
    expect(selected).toEqual({ kind: 'folder', folderId: 'private-a' });
  });

  test('cancels an authentication waiting for active when background arrives before selection', async () => {
    let appState = 'inactive';
    let finishActiveTransition;
    let selected = 'previous-folder';
    const pending = authorizeAndRunHomeFolderAction({
      authorize: async () => 'authenticated',
      isRequestCurrent: () => true,
      getAppState: () => appState,
      waitUntilActive: () => new Promise((resolve) => { finishActiveTransition = resolve; }),
      isProtected: () => true,
      hasSessionAuthorization: () => true,
      runAction: () => { selected = 'private-folder'; },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(selected).toBe('previous-folder');
    appState = 'background';
    finishActiveTransition(false);
    await expect(pending).resolves.toBe('cancelled');
    expect(selected).toBe('previous-folder');
  });

  test('keeps selection behind current-epoch authorization and active-only item access', () => {
    const provider = readSource('src/features/home-folders/LocalHomeFolderProvider.tsx');
    const selection = provider.match(/(const authorizeFolderAndContinue = useCallback\([\s\S]*?\n  const addFolder)/)?.[1] ?? '';
    const authorization = provider.match(/(const authorizeFolder = useCallback\([\s\S]*?\n  const changeFolderProtection)/)?.[1] ?? '';
    const waitForActive = provider.match(/const waitUntilAppIsActive = useCallback\(\(\): Promise<boolean> => \{([\s\S]*?)\n  const authorizeFolderAndContinue/)?.[1] ?? '';

    expect(selection).toMatch(/authorizeAndRunHomeFolderAction\([\s\S]*?requestGeneration === folderSelectionGenerationRef\.current[\s\S]*?requestEpoch === lockEpochRef\.current/);
    expect(selection).toContain('allowInactiveAfterAuthentication: true');
    expect(selection).toContain('unlockedFolderIdsRef.current.has(folderId)');
    expect(selection).toContain('waitUntilActive: waitUntilAppIsActive');
    expect(selection).toContain('runAction: onAuthorized');
    expect(authorization).toMatch(/canContinueAfterFaceId\([\s\S]*?allowInactiveAfterAuthentication: requestPolicy\.allowInactiveAfterAuthentication/);
    expect(provider).toMatch(/return appStateRef\.current === 'active' && unlockedFolderIdsRef\.current\.has\(folderId\)/);
    expect(provider).toMatch(/nextState !== 'background'\) return;[\s\S]*?folderSelectionGenerationRef\.current \+= 1[\s\S]*?replaceUnlockedFolderIds\(new Set\(\)\)/);
    expect(waitForActive).toMatch(/nextState === 'active'\) finish\(true\)/);
    expect(waitForActive).toMatch(/nextState === 'background'\) finish\(false\)/);
    expect(waitForActive).toMatch(/subscription\?\.remove\(\)/);
    expect(waitForActive).toMatch(/appStateRef\.current === 'active'/);
    expect(authorization).toMatch(/if \(existingRequest\) \{[\s\S]*?existingRequest\.allowInactiveAfterAuthentication \|\|= options\.allowInactiveAfterAuthentication === true;[\s\S]*?return existingRequest\.promise/);
    expect(authorization).toContain('allowInactiveAfterAuthentication: options.allowInactiveAfterAuthentication === true');
  });

  test('allows inactive-after-prompt only on folder protection changes and persists before updating the controlled toggle', () => {
    const provider = readSource('src/features/home-folders/LocalHomeFolderProvider.tsx');
    const protectionChange = provider.match(/const changeFolderProtection = useCallback\(([\s\S]*?)\n  const replaceAssignments/)?.[1] ?? '';
    const authorization = provider.match(/const authorizeFolder = useCallback\(([\s\S]*?)\n  const changeFolderProtection/)?.[1] ?? '';

    expect(protectionChange).toContain('{ allowInactiveAfterAuthentication: true }');
    expect(protectionChange).toMatch(/canContinueAfterFaceId\([\s\S]*?allowInactiveAfterAuthentication: true/);
    expect(protectionChange).toMatch(/await setHomeFolderProtection\([\s\S]*?foldersRef\.current = nextFolders[\s\S]*?setFolders\(nextFolders\)/);
    expect(authorization).not.toContain('allowInactiveAfterAuthentication: true');
    expect(provider).toMatch(/nextState !== 'background'\) return;[\s\S]*?lockEpochRef\.current \+= 1/);
  });

  test('authorizes removal from a protected source when Face ID finishes in inactive, without creating a session unlock', async () => {
    let appState = 'active';
    let authenticationSucceeded = false;
    let assignment = 'source';
    const unlockedFolderIds = new Set();
    const isCurrent = () => appState === 'active' || (authenticationSucceeded && appState === 'inactive');

    await authorizeAndPersistFolderAssignment({
      candidateFolderIds: ['source', 'destination'],
      authorizationFolderIds: ['source'],
      getProtectedFolderIds: () => ['source'],
      sessionAuthorizedFolderIds: [],
      requestAuthentication: async () => {
        appState = 'inactive';
        authenticationSucceeded = true;
        return 'authenticated';
      },
      isOperationCurrent: isCurrent,
      persist: async (validateBeforeCommit) => {
        expect(validateBeforeCommit()).toBe(true);
        assignment = 'destination';
      },
    });

    expect(assignment).toBe('destination');
    expect(unlockedFolderIds.size).toBe(0);
  });

  test('uses one biometric confirmation for the protected source while the destination remains write-only', async () => {
    const requestAuthentication = jest.fn(async () => 'authenticated');
    const persist = jest.fn(async (validateBeforeCommit) => {
      expect(validateBeforeCommit()).toBe(true);
      return 'source';
    });

    await expect(authorizeAndPersistFolderAssignment({
      candidateFolderIds: ['source', 'destination'],
      authorizationFolderIds: ['source'],
      getProtectedFolderIds: () => ['source', 'destination'],
      sessionAuthorizedFolderIds: [],
      requestAuthentication,
      isOperationCurrent: () => true,
      persist,
    })).resolves.toBe('source');
    expect(requestAuthentication).toHaveBeenCalledTimes(1);
  });

  test('allows adding an item into a protected destination without authenticating or revealing its contents', async () => {
    const requestAuthentication = jest.fn(async () => 'authenticated');
    const persist = jest.fn(async (validateBeforeCommit) => {
      expect(validateBeforeCommit()).toBe(true);
      return 'destination';
    });

    await expect(authorizeAndPersistFolderAssignment({
      candidateFolderIds: ['destination'],
      authorizationFolderIds: [],
      getProtectedFolderIds: () => ['destination'],
      sessionAuthorizedFolderIds: [],
      requestAuthentication,
      isOperationCurrent: () => true,
      persist,
    })).resolves.toBe('destination');

    expect(requestAuthentication).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['cancelled', 'HOME_FOLDER_AUTHENTICATION_CANCELLED'],
    ['unavailable', 'HOME_FOLDER_AUTHENTICATION_UNAVAILABLE'],
    ['failed', 'HOME_FOLDER_AUTHENTICATION_FAILED'],
  ])('does not persist a protected move after Face ID returns %s', async (outcome, code) => {
    const persist = jest.fn();
    await expect(authorizeAndPersistFolderAssignment({
      candidateFolderIds: ['destination'],
      getProtectedFolderIds: () => ['destination'],
      sessionAuthorizedFolderIds: [],
      requestAuthentication: async () => outcome,
      isOperationCurrent: () => true,
      persist,
    })).rejects.toMatchObject({ code });
    expect(persist).not.toHaveBeenCalled();
  });

  test('cancels when the app backgrounds during Face ID and never starts the SQLite write', async () => {
    let appState = 'active';
    let epoch = 8;
    const persist = jest.fn();
    await expect(authorizeAndPersistFolderAssignment({
      candidateFolderIds: ['destination'],
      getProtectedFolderIds: () => ['destination'],
      sessionAuthorizedFolderIds: [],
      requestAuthentication: async () => {
        appState = 'background';
        epoch += 1;
        return 'cancelled';
      },
      isOperationCurrent: () => epoch === 8 && appState === 'active',
      persist,
    })).rejects.toMatchObject({ code: 'HOME_FOLDER_AUTHENTICATION_CANCELLED' });
    expect(persist).not.toHaveBeenCalled();
  });

  test('rejects a newly protected destination before persistence if it was not covered by this authentication', async () => {
    let authenticationPhase = false;
    const persist = jest.fn();
    await expect(authorizeAndPersistFolderAssignment({
      candidateFolderIds: ['source', 'destination'],
      getProtectedFolderIds: () => authenticationPhase ? ['source', 'destination'] : ['source'],
      sessionAuthorizedFolderIds: [],
      requestAuthentication: async () => {
        authenticationPhase = true;
        return 'authenticated';
      },
      isOperationCurrent: () => true,
      persist,
    })).rejects.toMatchObject({ code: 'HOME_FOLDER_AUTHORIZATION_REQUIRED' });
    expect(persist).not.toHaveBeenCalled();
  });

  test('serializes duplicate move operations and releases the guard after success or failure', async () => {
    const lock = { current: false };
    let finishOperation;
    const pendingOperation = runExclusiveFolderAssignment(lock, () => new Promise((resolve) => {
      finishOperation = resolve;
    }));

    await expect(runExclusiveFolderAssignment(lock, async () => undefined))
      .rejects.toMatchObject({ code: 'HOME_FOLDER_OPERATION_PENDING' });
    finishOperation('done');
    await expect(pendingOperation).resolves.toBe('done');
    expect(lock.current).toBe(false);

    await expect(runExclusiveFolderAssignment(lock, async () => {
      throw new Error('storage failure');
    })).rejects.toThrow('storage failure');
    expect(lock.current).toBe(false);
    expect(getHomeFolderAssignmentAlert(new HomeFolderAssignmentError('HOME_FOLDER_OPERATION_CANCELLED'))).toBeNull();
    expect(getHomeFolderAssignmentAlert(new HomeFolderAssignmentError('HOME_FOLDER_ASSIGNMENT_PERSISTENCE_FAILED')))
      .toMatchObject({ title: 'Não foi possível mover o item' });
  });

  test('keeps the original assignment and reports a persistence failure when the protected move write rejects', async () => {
    let assignment = 'source';
    await expect(authorizeAndPersistFolderAssignment({
      candidateFolderIds: ['destination'],
      getProtectedFolderIds: () => ['destination'],
      sessionAuthorizedFolderIds: [],
      requestAuthentication: async () => 'authenticated',
      isOperationCurrent: () => true,
      persist: async (validateBeforeCommit) => {
        expect(validateBeforeCommit()).toBe(true);
        throw new Error('SQLite transaction failed');
      },
    })).rejects.toMatchObject({ code: 'HOME_FOLDER_ASSIGNMENT_PERSISTENCE_FAILED' });
    expect(assignment).toBe('source');
    expect(getHomeFolderAssignmentAlert(new HomeFolderAssignmentError('HOME_FOLDER_ASSIGNMENT_PERSISTENCE_FAILED')))
      .toMatchObject({
        title: 'Não foi possível mover o item',
        message: expect.stringContaining('armazenamento local não confirmou'),
      });
  });

  test('persists protection separately from the in-memory authorization session', () => {
    const provider = readSource('src/features/home-folders/LocalHomeFolderProvider.tsx');
    const migration = readSource('src/features/home-folders/folderSchemaMigration.ts');

    expect(provider).toMatch(/useState<ReadonlySet<string>>\(\(\) => new Set\(\)\)/);
    expect(provider).toMatch(/nextState !== 'background'\) return;/);
    expect(provider).toMatch(/replaceUnlockedFolderIds\(new Set\(\)\)/);
    expect(provider).toMatch(/setHomeFolderProtection\(folderId, nextIsProtected, currentFolder\.isProtected\)/);
    expect(provider).not.toMatch(/persistHomeFolderSelection\([^\n]*unlockedFolderIds/);
    expect(migration).toMatch(/ALTER TABLE saved_folders ADD COLUMN is_protected INTEGER NOT NULL DEFAULT 0/);
    expect(migration).toMatch(/HOME_FOLDER_SCHEMA_VERSION = 5/);
  });

  test('protects folder and saved-item routes before mounting private content', () => {
    const folderRoute = readSource('src/app/folders/[id].tsx');
    const protectedRoutes = [
      ['src/app/photos/[id].tsx', 'photo'],
      ['src/app/videos/[id].tsx', 'video'],
      ['src/app/links/[id].tsx', 'link'],
      ['src/app/texts/[id].tsx', 'text'],
      ['src/app/documents/[id].tsx', 'document'],
    ];

    expect(folderRoute).toMatch(/useHomeFolderAuthorization\(rawFolderId/);
    expect(folderRoute).toMatch(/folder && authorization\.isAuthorized/);
    for (const [file, itemType] of protectedRoutes) {
      const source = readSource(file);
      expect(source).toContain(`useHomeFolderItemAuthorization('${itemType}'`);
      expect(source).toMatch(/(?:if \(!authorization\.isAuthorized\)[\s\S]*?HomeFolderAuthorizationPrompt|authorization\.isAuthorized\s*\?[\s\S]*?HomeFolderAuthorizationPrompt)/);
    }
  });

  test('masks the app while inactive and never resumes a protected selection without a new user action', () => {
    const root = readSource('src/app/_layout.tsx');
    const home = readSource('src/app/(tabs)/index.tsx');
    const authorizationHook = readSource('src/features/home-folders/useHomeFolderAuthorization.ts');
    const provider = readSource('src/features/home-folders/LocalHomeFolderProvider.tsx');
    const folderRoute = readSource('src/app/folders/[id].tsx');
    const selectionStorage = readSource('src/features/home-folders/homeFolderSelectionStorage.ts');
    expect(root).toMatch(/!isAppActive[\s\S]*?StyleSheet\.absoluteFill/);
    expect(home).toMatch(/isSelectedProtectedFolderLocked/);
    expect(home).toMatch(/HomeFolderAuthorizationPrompt authorization=\{selectedFolderAuthorization\}/);
    expect(home).toMatch(/hidden=\{\(view === 'folders' && !favoritesOnly\) \|\| \(!favoritesOnly && isSelectedProtectedFolderLocked\)\}/);
    expect(authorizationHook).not.toMatch(/useEffect|lastAutomaticAttemptRef|void requestAuthorization\(\)/);
    expect(authorizationHook).toMatch(/statusRecord\.key !== statusKey[\s\S]*?'cancelled'/);
    expect(selectionStorage).toMatch(/if \(!selectedFolder\?\.isProtected\) return selection/);
    expect(provider).toMatch(/authorizationFolderIds: previousFolderId \? \[previousFolderId\] : \[\]/);
    expect(folderRoute).toMatch(/useFocusEffect[\s\S]*?nextState !== 'background'[\s\S]*?selectView\('all-items'\)[\s\S]*?router\.dismissTo\('\/'\)/);
    const gallery = readSource('src/components/photos/PhotoMasonryGallery.tsx');
    expect(gallery).toMatch(/filterHomeFavoriteItems\([\s\S]*?protectedFolderIds,[\s\S]*?accessibleUnlockedFolderIds,[\s\S]*?homeFoldersReady/);
  });

  test('keeps biometric prompts behind explicit open/retry actions and lock itself never authenticates', () => {
    const hook = readSource('src/features/home-folders/useHomeFolderAuthorization.ts');
    const prompt = readSource('src/features/home-folders/HomeFolderAuthorizationPrompt.tsx');
    const provider = readSource('src/features/home-folders/LocalHomeFolderProvider.tsx');
    const overview = readSource('src/features/home-folders/HomeFolderOverview.tsx');
    const lockStart = provider.indexOf('const lockFolder = useCallback');
    const lockEnd = provider.indexOf('const addFolder = useCallback', lockStart);
    const lockImplementation = provider.slice(lockStart, lockEnd);

    expect(hook).not.toMatch(/useEffect|void requestAuthorization\(\)/);
    expect(prompt).toMatch(/onPress=\{\(\) => void authorization\.requestAuthorization\(\)\}/);
    expect(overview).toMatch(/authorizeFolderAndContinue\([\s\S]*?router\.push\(getHomeFolderRoute\(item\.id\)\)/);
    expect(lockImplementation).not.toMatch(/authorizeFolder|requestFaceId|authenticateWithFaceId/);
    expect(lockImplementation).toMatch(/lockAuthorizedHomeFolder/);
  });

  test('excludes protected items from Todos and guards destructive/organizing actions', () => {
    const filter = readSource('src/features/home-folders/homeFolderTypes.ts');
    const gallery = readSource('src/components/photos/PhotoMasonryGallery.tsx');
    const overview = readSource('src/features/home-folders/HomeFolderOverview.tsx');
    const settings = readSource('src/components/native/HomeSettingsBottomSheet.ios.tsx');

    expect(filter).toMatch(/filter\.kind === 'all-items'[\s\S]*?protectedFolderIds\.has\(folderId\)/);
    expect(gallery).toMatch(/filterHomeFolderItems\([\s\S]*?protectedFolderIds,[\s\S]*?accessibleUnlockedFolderIds/);
    expect(gallery).toMatch(/withItemAuthorization/);
    expect(overview).toMatch(/name="lock-closed-outline"/);
    expect(overview).toMatch(/item\.isProtected[\s\S]*?item\.itemCount/);
    expect(settings).toMatch(/Proteger com Face ID/);
    expect(settings).toMatch(/authorizeFolder\(folder\.id\)/);
    expect(settings).toMatch(/voltarão a aparecer em Todos/);
  });

  test('rechecks folder authorization after destructive confirmation for every saved item type', () => {
    const gallery = readSource('src/components/photos/PhotoMasonryGallery.tsx');
    const pipelines = [
      'src/features/photos/photoDeletionPipeline.ts',
      'src/features/home-content/contentDeletionPipeline.ts',
      'src/features/documents/documentDeletionPipeline.ts',
    ].map(readSource);

    expect(gallery.match(/authorizeItemForAction/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
    for (const pipeline of pipelines) {
      expect(pipeline).toMatch(/adapter\.confirm\(\)[\s\S]*?adapter\.authorizeBeforeDelete\(\)[\s\S]*?adapter\.(?:deletePhoto|deleteContent|deleteDocument)\(\)/);
    }
  });

  test('adds the localized iOS Face ID usage description through the Expo config plugin', () => {
    const config = readSource('app.config.js');
    expect(config).toContain("'expo-local-authentication'");
    expect(config).toContain('O SaveApp utiliza o Face ID para proteger o acesso às suas pastas privadas.');
  });
});
