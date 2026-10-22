const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(
  __dirname,
  '..',
  'node_modules',
  '@expo',
  'ui',
  'ios',
  'BottomSheetView.swift'
);

function applyPatch() {
  if (!fs.existsSync(targetFile)) {
    console.warn('[starter-patch-expo-ui] BottomSheetView.swift not found in node_modules.');
    process.exit(1);
  }

  let content = fs.readFileSync(targetFile, 'utf8');

  if (content.includes('.ignoresSafeArea(.container, edges: .bottom)')) {
    console.log('[starter-patch-expo-ui] BottomSheetView.swift is already patched with .ignoresSafeArea.');
    return;
  }

  const sheetClosurePattern = /(\.sheet\(isPresented:\s*\$isPresented,\s*onDismiss:\s*\{[\s\S]*?\}\)\s*\{\s*\n)(\s*)(presentedContent|sheetContent)(\s*\n\s*\})/;
  const match = content.match(sheetClosurePattern);

  if (!match) {
    console.error('[starter-patch-expo-ui] ERROR: Expected SwiftUI sheet closure was not found in BottomSheetView.swift.');
    process.exit(1);
  }

  const updatedContent = content.replace(
    sheetClosurePattern,
    `$1$2$3\n$2  .ignoresSafeArea(.container, edges: .bottom)$4`
  );

  if (updatedContent === content) {
    console.error('[starter-patch-expo-ui] ERROR: Could not apply patch to BottomSheetView.swift.');
    process.exit(1);
  }

  fs.writeFileSync(targetFile, updatedContent, 'utf8');

  // Verification
  const verifyContent = fs.readFileSync(targetFile, 'utf8');
  if (!verifyContent.includes('.ignoresSafeArea(.container, edges: .bottom)')) {
    console.error('[starter-patch-expo-ui] ERROR: Verification failed. BottomSheetView.swift does not contain the patch.');
    process.exit(1);
  }

  console.log('[starter-patch-expo-ui] Successfully patched BottomSheetView.swift with .ignoresSafeArea(.container, edges: .bottom).');
}

applyPatch();
