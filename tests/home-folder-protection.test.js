const fs = require('node:fs');
const path = require('node:path');

const { ExecutionEnvironment } = require('expo-constants');
const { AuthenticationType } = require('expo-local-authentication');
const { authenticateWithFaceId } = require('../src/features/home-folders/folderFaceIdAuthentication');

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
      expect(source).toMatch(/(?:if \(!authorization\.isAuthorized\)[\s\S]*?HomeFolderAuthorizationPrompt|authorization\.isAuthorized \? \([\s\S]*?HomeFolderAuthorizationPrompt)/);
    }
  });

  test('masks the app while inactive and prompts for a restored protected Home selection', () => {
    const root = readSource('src/app/_layout.tsx');
    const home = readSource('src/app/(tabs)/index.tsx');
    expect(root).toMatch(/!isAppActive[\s\S]*?StyleSheet\.absoluteFill/);
    expect(home).toMatch(/isSelectedProtectedFolderLocked/);
    expect(home).toMatch(/HomeFolderAuthorizationPrompt authorization=\{selectedFolderAuthorization\}/);
    expect(home).toMatch(/hidden=\{view === 'folders' \|\| isSelectedProtectedFolderLocked\}/);
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
