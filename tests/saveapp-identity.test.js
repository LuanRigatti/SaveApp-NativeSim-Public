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

  test('changes no dependency declaration or resolved lock entry', () => {
    const rootPackage = lockfile.packages[''];
    expect(rootPackage.dependencies).toEqual(packageJson.dependencies);
    expect(rootPackage.devDependencies).toEqual(packageJson.devDependencies);
    expect(packageJson.dependencies.expo).toBe('~58.0.12');
    expect(packageJson.dependencies['react-native-screens']).toBe('4.30.0');
    expect(packageJson.dependencies['@expo/ui']).toBe('~58.0.19');
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
