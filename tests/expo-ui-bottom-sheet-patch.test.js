const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  applyPatch,
  EXPECTED_UI_VERSION,
} = require('../scripts/patch-expo-ui-bottom-sheet');

describe('@expo/ui BottomSheet safe-area patch', () => {
  let projectRoot;
  let packageRoot;
  let packagePath;
  let sourcePath;

  function writeFixture(version = EXPECTED_UI_VERSION, source = [
    'struct BottomSheetView {',
    '  var body: some View {',
    '    anchor',
    '      .sheet(isPresented: $isPresented, onDismiss: {',
    '        props.onDismiss()',
    '      }) {',
    '        presentedContent',
    '      }',
    '  }',
    '}',
    '',
  ].join('\n')) {
    fs.mkdirSync(path.dirname(packagePath), { recursive: true });
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(packagePath, JSON.stringify({ version }), 'utf8');
    fs.writeFileSync(sourcePath, source, 'utf8');
  }

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'saveapp-expo-ui-patch-'));
    packageRoot = path.join(projectRoot, 'node_modules', '@expo', 'ui');
    packagePath = path.join(packageRoot, 'package.json');
    sourcePath = path.join(packageRoot, 'ios', 'BottomSheetView.swift');
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  test('patches the reviewed 58.0.26 sheet anchor and is idempotent', () => {
    writeFixture();

    expect(applyPatch(projectRoot)).toBe(true);
    const patched = fs.readFileSync(sourcePath, 'utf8');
    expect(patched).toContain(
      'presentedContent\n          .ignoresSafeArea(.container, edges: .bottom)',
    );
    expect(patched.match(/\.ignoresSafeArea\(\.container, edges: \.bottom\)/g)).toHaveLength(1);

    expect(applyPatch(projectRoot)).toBe(false);
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe(patched);
  });

  test('fails closed for a different @expo/ui version', () => {
    writeFixture('58.0.25');

    expect(() => applyPatch(projectRoot)).toThrow(
      `Expected @expo/ui ${EXPECTED_UI_VERSION}, found 58.0.25.`,
    );
    expect(fs.readFileSync(sourcePath, 'utf8')).not.toContain('.ignoresSafeArea');
  });

  test('fails closed if the reviewed SwiftUI sheet anchor changes', () => {
    writeFixture(EXPECTED_UI_VERSION, 'struct BottomSheetView { var body: some View { anchor.sheet {} } }');

    expect(() => applyPatch(projectRoot)).toThrow(
      'Expected SwiftUI sheet closure was not found in BottomSheetView.swift.',
    );
  });

  test('rejects an existing patch marker outside the unique reviewed sheet anchor', () => {
    writeFixture(
      EXPECTED_UI_VERSION,
      'let unrelated = ".ignoresSafeArea(.container, edges: .bottom)"\n' +
        'struct BottomSheetView { var body: some View { anchor.sheet {} } }',
    );

    expect(() => applyPatch(projectRoot)).toThrow(
      'BottomSheetView.swift contains an unexpected or ambiguous safe-area patch.',
    );
  });
});
