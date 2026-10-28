const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

describe('SaveApp identity and template boundary', () => {
  const packageJson = require(path.join(root, 'package.json'));
  const lockfile = require(path.join(root, 'package-lock.json'));

  test('keeps the coordinated SaveApp package and native identity', () => {
    const appConfig = fs.readFileSync(path.join(root, 'app.config.js'), 'utf8');
    expect(packageJson.name).toBe('saveapp');
    expect(lockfile.name).toBe('saveapp');
    expect(lockfile.packages[''].name).toBe('saveapp');
    expect(appConfig).toContain("name: 'SaveApp'");
    expect(appConfig).toContain("slug: 'saveapp'");
    expect(appConfig).toContain("scheme: 'saveapp'");
    expect(appConfig).toContain("bundleIdentifier: 'com.luanrigatti.saveapp'");
    expect(appConfig).toContain("package: 'com.luanrigatti.saveapp'");
    expect(appConfig).toContain("'./plugins/withStarterToolbarSync'");
  });

  test('pins the authorized Expo SDK 58 patches and preserves React Native versions', () => {
    const rootPackage = lockfile.packages[''];
    expect(rootPackage.dependencies).toEqual(packageJson.dependencies);
    expect(rootPackage.devDependencies).toEqual(packageJson.devDependencies);
    const expoPatches = {
      '@expo/ui': ['~58.0.25', '58.0.25'],
      expo: ['~58.0.21', '58.0.21'],
      'expo-asset': ['~58.0.19', '58.0.19'],
      'expo-constants': ['~58.0.14', '58.0.14'],
      'expo-dev-client': ['~58.0.17', '58.0.17'],
      'expo-file-system': ['~58.0.13', '58.0.13'],
      'expo-font': ['~58.0.11', '58.0.11'],
      'expo-image': ['~58.0.18', '58.0.18'],
      'expo-image-manipulator': ['~58.0.16', '58.0.16'],
      'expo-linking': ['~58.0.15', '58.0.15'],
      'expo-media-library': ['~58.0.13', '58.0.13'],
      'expo-router': ['~58.0.28', '58.0.28'],
      'expo-splash-screen': ['~58.0.12', '58.0.12'],
      'expo-video': ['~58.0.13', '58.0.13'],
      'expo-widgets': ['~58.0.25', '58.0.25'],
      'jest-expo': ['~58.0.13', '58.0.13'],
    };

    for (const [name, [declared, resolved]] of Object.entries(expoPatches)) {
      const dependencies = name === 'jest-expo' ? packageJson.devDependencies : packageJson.dependencies;
      expect(dependencies[name]).toBe(declared);
      expect(lockfile.packages[`node_modules/${name}`]?.version).toBe(resolved);
    }

    expect(packageJson.dependencies.expo).toBe('~58.0.21');
    expect(packageJson.dependencies['react-native']).toBe('0.88.0');
    expect(packageJson.dependencies['react-native-screens']).toBe('4.30.0');
    const bottomSheetPatch = fs.readFileSync(path.join(root, 'scripts/patch-expo-ui-bottom-sheet.js'), 'utf8');
    expect(bottomSheetPatch).toContain("EXPECTED_UI_VERSION = '58.0.25'");
    expect(bottomSheetPatch).toContain("uiVersion !== EXPECTED_UI_VERSION");
  });

  test('has no business service dependencies', () => {
    expect(packageJson.dependencies).not.toHaveProperty('firebase');
    expect(packageJson.dependencies).not.toHaveProperty('@react-native-google-signin/google-signin');
    expect(packageJson.dependencies).not.toHaveProperty('expo-auth-session');
  });

  test('uses the stable SDK 58 native tabs module', () => {
    const tabsLayout = fs.readFileSync(path.join(root, 'src/app/(tabs)/_layout.tsx'), 'utf8');
    expect(tabsLayout).toContain('expo-router/native-tabs');
    expect(tabsLayout).not.toContain('unstable-native-tabs');
    for (const route of ['index.tsx', 'collections.tsx', 'search.tsx', 'settings.tsx']) {
      expect(fs.existsSync(path.join(root, 'src/app/(tabs)', route))).toBe(true);
    }
  });

  test('retains the toolbar morph plist key only as a native compatibility contract', () => {
    const appConfig = fs.readFileSync(path.join(root, 'app.config.js'), 'utf8');
    expect(appConfig).toContain('StarterToolbarMorphExperimentVariant');
    expect(appConfig).toContain('Compatibility-only');
    expect(fs.existsSync(path.join(root, 'plugins/withStarterToolbarSync.js'))).toBe(true);
  });

  test('uses a SaveApp-owned opt-in for EAS project linking', () => {
    const configPath = path.join(root, 'app.config.js');
    const appConfigSource = fs.readFileSync(configPath, 'utf8');
    expect(appConfigSource).toContain('process.env.SAVEAPP_EAS_PROJECT_ID');
    expect(appConfigSource).not.toMatch(/process\.env\.(?:STARTER_)?EAS_PROJECT_ID\b/);
  });
});
