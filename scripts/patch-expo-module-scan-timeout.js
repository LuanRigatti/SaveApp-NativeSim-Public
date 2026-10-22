const fs = require("node:fs");
const path = require("node:path");

const EXPECTED_AUTOLINKING_VERSION = "58.0.14";
const SCAN_TIMEOUT_MS = 30_000;
const AUTOLINKING_PACKAGE_PATH = path.join(
  "node_modules",
  "expo-modules-autolinking",
);
const SCANNER_FILES = [
  path.join(
    AUTOLINKING_PACKAGE_PATH,
    "src",
    "platforms",
    "apple",
    "moduleScanner.ts",
  ),
  path.join(
    AUTOLINKING_PACKAGE_PATH,
    "build",
    "platforms",
    "apple",
    "moduleScanner.js",
  ),
];
const ORIGINAL_TIMEOUT_PATTERN = /timeout:\s*5000\b/g;
const PATCHED_TIMEOUT_PATTERN = /timeout:\s*30000\b/g;

function countMatches(content, pattern) {
  return [...content.matchAll(pattern)].length;
}

function patchScannerFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Expected Expo Autolinking scanner file is missing: ${filePath}`,
    );
  }

  const content = fs.readFileSync(filePath, "utf8");
  const originalCount = countMatches(content, ORIGINAL_TIMEOUT_PATTERN);
  const patchedCount = countMatches(content, PATCHED_TIMEOUT_PATTERN);

  if (originalCount === 0 && patchedCount === 1) {
    return false;
  }

  if (originalCount !== 1 || patchedCount !== 0) {
    throw new Error(
      `Expected exactly one 5000 ms scan timeout in ${filePath}; found ${originalCount} original and ${patchedCount} patched occurrences.`,
    );
  }

  fs.writeFileSync(
    filePath,
    content.replace(ORIGINAL_TIMEOUT_PATTERN, `timeout: ${SCAN_TIMEOUT_MS}`),
    "utf8",
  );
  return true;
}

function applyPatch(projectRoot = path.resolve(__dirname, "..")) {
  const packageJsonPath = path.join(
    projectRoot,
    AUTOLINKING_PACKAGE_PATH,
    "package.json",
  );

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Expo Autolinking package is missing: ${packageJsonPath}`);
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (packageJson.version !== EXPECTED_AUTOLINKING_VERSION) {
    throw new Error(
      `Expected expo-modules-autolinking ${EXPECTED_AUTOLINKING_VERSION}, found ${packageJson.version ?? "unknown"}. Review this patch before changing the installed version.`,
    );
  }

  const changedFiles = SCANNER_FILES.filter((relativePath) =>
    patchScannerFile(path.join(projectRoot, relativePath)),
  );

  if (changedFiles.length > 0) {
    console.log(
      `[starter-patch-autolinking-timeout] Set the Expo module scan timeout to ${SCAN_TIMEOUT_MS} ms.`,
    );
  } else {
    console.log(
      `[starter-patch-autolinking-timeout] Expo module scan timeout is already ${SCAN_TIMEOUT_MS} ms.`,
    );
  }
}

if (require.main === module) {
  try {
    applyPatch();
  } catch (error) {
    console.error(`[starter-patch-autolinking-timeout] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { applyPatch, EXPECTED_AUTOLINKING_VERSION, SCAN_TIMEOUT_MS };
