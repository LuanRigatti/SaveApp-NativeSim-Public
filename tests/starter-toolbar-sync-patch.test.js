const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const toolbarSyncPlugin = require('../plugins/withStarterToolbarSync');

const sourceRoot = path.resolve(__dirname, '..', 'node_modules', 'react-native-screens');
const patchRNScreens = toolbarSyncPlugin.__patchRNScreensForTests;
const PATCH_FILES = [
  'package.json',
  'src/fabric/ScreenNativeComponent.ts',
  'ios/RNSScreen.h',
  'ios/RNSScreen.mm',
  'ios/tabs/host/RNSTabBarController.h',
  'ios/tabs/host/RNSTabBarController.mm',
  'ios/RNSScreenStackHeaderConfig.mm',
  'ios/RNSScreenStack.mm',
];

describe('SaveApp shared toolbar patch against react-native-screens 4.30.1', () => {
  let scratchRoot;

  beforeEach(() => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'saveapp-toolbar-sync-'));
  });

  afterEach(() => {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  });

  function copyReviewedPatchFiles() {
    for (const relativePath of PATCH_FILES) {
      const source = path.join(sourceRoot, relativePath);
      const destination = path.join(scratchRoot, relativePath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
    }
  }

  test('applies to the exact SDK-recommended package and remains idempotent', () => {
    expect(JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8')).version).toBe('4.30.1');
    copyReviewedPatchFiles();

    expect(() => patchRNScreens(scratchRoot)).not.toThrow();
    const patchedFiles = PATCH_FILES.slice(1).map((relativePath) => {
      const filePath = path.join(scratchRoot, relativePath);
      return [relativePath, fs.readFileSync(filePath, 'utf8')];
    });

    expect(() => patchRNScreens(scratchRoot)).not.toThrow();
    for (const [relativePath, expectedContent] of patchedFiles) {
      expect(fs.readFileSync(path.join(scratchRoot, relativePath), 'utf8')).toBe(expectedContent);
    }
  });

  test('fails closed for the superseded 4.30.0 anchor contract', () => {
    fs.writeFileSync(
      path.join(scratchRoot, 'package.json'),
      JSON.stringify({ version: '4.30.0' }),
      'utf8',
    );

    expect(() => patchRNScreens(scratchRoot)).toThrow(
      'A integração de toolbar foi validada para react-native-screens 4.30.1.',
    );
  });
});
