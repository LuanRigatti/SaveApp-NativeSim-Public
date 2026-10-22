const fs = require("node:fs");
const path = require("node:path");

const {
  applyPatch,
  EXPECTED_AUTOLINKING_VERSION,
  SCAN_TIMEOUT_MS,
} = require("../scripts/patch-expo-module-scan-timeout");

describe("Expo module scan timeout patch", () => {
  let projectRoot;

  function writeScannerFixtures(version = EXPECTED_AUTOLINKING_VERSION) {
    const packageRoot = path.join(
      projectRoot,
      "node_modules",
      "expo-modules-autolinking",
    );
    const sourcePath = path.join(
      packageRoot,
      "src",
      "platforms",
      "apple",
      "moduleScanner.ts",
    );
    const buildPath = path.join(
      packageRoot,
      "build",
      "platforms",
      "apple",
      "moduleScanner.js",
    );

    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.mkdirSync(path.dirname(buildPath), { recursive: true });
    fs.writeFileSync(
      path.join(packageRoot, "package.json"),
      JSON.stringify({ version }),
      "utf8",
    );
    fs.writeFileSync(
      sourcePath,
      "scanner.scanModules(roots, { timeout: 5000 });\n",
      "utf8",
    );
    fs.writeFileSync(buildPath, "timeout: 5000\n", "utf8");

    return { sourcePath, buildPath };
  }

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(
      path.join(__dirname, "..", ".saveapp-scan-timeout-"),
    );
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  test("raises the guarded source and runtime timeout and is idempotent", () => {
    const { sourcePath, buildPath } = writeScannerFixtures();

    applyPatch(projectRoot);
    const patchedSource = fs.readFileSync(sourcePath, "utf8");
    const patchedBuild = fs.readFileSync(buildPath, "utf8");
    expect(patchedSource).toContain(`timeout: ${SCAN_TIMEOUT_MS}`);
    expect(patchedBuild).toContain(`timeout: ${SCAN_TIMEOUT_MS}`);

    expect(() => applyPatch(projectRoot)).not.toThrow();
    expect(fs.readFileSync(sourcePath, "utf8")).toBe(patchedSource);
    expect(fs.readFileSync(buildPath, "utf8")).toBe(patchedBuild);
  });

  test("fails closed when the installed Expo Autolinking version changes", () => {
    writeScannerFixtures("58.0.15");

    expect(() => applyPatch(projectRoot)).toThrow(
      `Expected expo-modules-autolinking ${EXPECTED_AUTOLINKING_VERSION}`,
    );
  });

  test("fails closed when the scanner source no longer matches the expected patch point", () => {
    const { sourcePath } = writeScannerFixtures();
    fs.writeFileSync(sourcePath, "scanner implementation changed\n", "utf8");

    expect(() => applyPatch(projectRoot)).toThrow(
      "Expected exactly one 5000 ms scan timeout",
    );
  });

  test("runs after install and remains explicitly allowlisted for the public mirror", () => {
    const rootPackage = require("../package.json");
    const mirrorScript = fs.readFileSync(
      path.join(__dirname, "..", "scripts", "mirror-saveapp.ps1"),
      "utf8",
    );
    const allowedDirectories = mirrorScript.match(
      /\$allowedDirectories\s*=\s*@\(([^)]*)\)/,
    )?.[1];

    expect(rootPackage.scripts.postinstall).toContain(
      "scripts/patch-expo-module-scan-timeout.js",
    );
    expect(mirrorScript).toContain(
      "'scripts/patch-expo-module-scan-timeout.js'",
    );
    expect(allowedDirectories).not.toContain("scripts");
  });
});
