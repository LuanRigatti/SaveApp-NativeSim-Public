const fs = require('fs');
const path = require('path');

const EXPECTED_UI_VERSION = '58.0.26';

function applyPatch(projectRoot = path.resolve(__dirname, '..')) {
  const uiPackagePath = path.resolve(projectRoot, 'node_modules', '@expo', 'ui', 'package.json');
  const targetFile = path.resolve(
    projectRoot,
    'node_modules',
    '@expo',
    'ui',
    'ios',
    'BottomSheetView.swift'
  );

  if (!fs.existsSync(uiPackagePath)) {
    throw new Error('@expo/ui package metadata not found.');
  }

  const uiVersion = JSON.parse(fs.readFileSync(uiPackagePath, 'utf8')).version;
  if (uiVersion !== EXPECTED_UI_VERSION) {
    throw new Error(`Expected @expo/ui ${EXPECTED_UI_VERSION}, found ${uiVersion}.`);
  }

  if (!fs.existsSync(targetFile)) {
    throw new Error('BottomSheetView.swift not found in node_modules.');
  }

  const content = fs.readFileSync(targetFile, 'utf8');
  const safeAreaMarker = '.ignoresSafeArea(.container, edges: .bottom)';
  const markerCount = content.split(safeAreaMarker).length - 1;

  if (markerCount === 1 && /\.sheet\(isPresented:\s*\$isPresented,[\s\S]*?\)\s*\{\s*\n\s*(?:presentedContent|sheetContent)\s*\n\s*\.ignoresSafeArea\(\.container, edges: \.bottom\)/.test(content)) {
    return false;
  }
  if (markerCount !== 0) {
    throw new Error('BottomSheetView.swift contains an unexpected or ambiguous safe-area patch.');
  }

  const sheetClosurePattern = /(\.sheet\(isPresented:\s*\$isPresented,\s*onDismiss:\s*\{[\s\S]*?\}\)\s*\{\s*\n)(\s*)(presentedContent|sheetContent)(\s*\n\s*\})/;
  const match = content.match(sheetClosurePattern);

  if (!match) {
    throw new Error('Expected SwiftUI sheet closure was not found in BottomSheetView.swift.');
  }

  const updatedContent = content.replace(
    sheetClosurePattern,
    `$1$2$3\n$2  .ignoresSafeArea(.container, edges: .bottom)$4`
  );

  if (updatedContent === content) {
    throw new Error('Could not apply patch to BottomSheetView.swift.');
  }

  fs.writeFileSync(targetFile, updatedContent, 'utf8');

  // Verification
  const verifyContent = fs.readFileSync(targetFile, 'utf8');
  if (verifyContent.split(safeAreaMarker).length - 1 !== 1 ||
      !/\.sheet\(isPresented:\s*\$isPresented,[\s\S]*?\)\s*\{\s*\n\s*(?:presentedContent|sheetContent)\s*\n\s*\.ignoresSafeArea\(\.container, edges: \.bottom\)/.test(verifyContent)) {
    throw new Error('Verification failed. BottomSheetView.swift does not contain the patch at the expected sheet anchor.');
  }

  console.log('[starter-patch-expo-ui] Successfully patched BottomSheetView.swift with .ignoresSafeArea(.container, edges: .bottom).');
  return true;
}

if (require.main === module) {
  try {
    const changed = applyPatch();
    if (!changed) {
      console.log('[starter-patch-expo-ui] BottomSheetView.swift is already patched with .ignoresSafeArea.');
    }
  } catch (error) {
    console.error(`[starter-patch-expo-ui] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { applyPatch, EXPECTED_UI_VERSION };
