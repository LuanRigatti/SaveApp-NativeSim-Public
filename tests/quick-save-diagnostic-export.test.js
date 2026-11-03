/* global describe, expect, jest, test */

const fs = require('node:fs');
const path = require('node:path');
const {
  formatQuickSaveDiagnosticReport,
  QUICK_SAVE_DIAGNOSTIC_FILE_NAME,
  shareQuickSaveDiagnosticReportFile,
} = require('../src/features/dynamic-island/quickSaveDiagnosticReport');

const operation = (operationID, startedAt, events, environment = {}) => ({
  operationID,
  startedAt,
  startedUptime: startedAt,
  environment: {
    processRole: 'application',
    runtimeOS: '27.2',
    target: 'device',
    buildConfiguration: 'release',
    appVersion: '1.0.0',
    appBuild: '42',
    compiledSDK: 'iphoneos27.1',
    xcodeVersion: '2701',
    xcodeBuild: '270100',
    applicationState: 'background',
    sceneStates: 'background',
    appGroupAvailable: 'true',
    ...environment,
  },
  events,
});

const event = (name, elapsedMilliseconds, values = {}) => ({ name, elapsedMilliseconds, values });

describe('Quick Save diagnostic export', () => {
  test('formats complete environment and event data in chronological order without identifiers or sensitive values', () => {
    const report = {
      schemaVersion: 1,
      operations: [
        operation('A1B2C3D4', 200, [
          event('activity.update', 36, { state: 'queued', phase: 'submitted', historyRevision: '9', result: 'submitted' }),
          event('clipboard.readResult', 12, {
            result: 'unavailable',
            reason: 'valueMissing',
            selectedRepresentation: 'string',
            changeCountAfter: '37',
            changeCountChanged: 'false',
            copiedText: 'https://private.example/path',
          }),
        ], {
          clipboardText: 'private copied content',
          URL: 'https://private.example/path',
        }),
        operation('B2C3D4E5', 100, [event('intent.started', 0, { processRole: 'application', activityIDPresent: 'true' })]),
      ],
    };

    const formatted = formatQuickSaveDiagnosticReport(report);

    expect(formatted).toContain('Tentativas registradas: 2');
    expect(formatted).toContain('processRole: application');
    expect(formatted).toContain('runtimeOS: 27.2');
    expect(formatted).toContain('applicationState: background');
    expect(formatted).toContain('activity.update · historyRevision=9 · phase=submitted · result=submitted · state=queued');
    expect(formatted.indexOf('Tentativa 1')).toBeLessThan(formatted.indexOf('Tentativa 2'));
    expect(formatted.indexOf('clipboard.readResult')).toBeLessThan(formatted.indexOf('activity.update'));
    expect(formatted).not.toContain('A1B2C3D4');
    expect(formatted).not.toContain('B2C3D4E5');
    expect(formatted).not.toContain('private.example');
    expect(formatted).not.toContain('private copied content');
  });

  test('returns no report when the diagnostic history is empty', () => {
    expect(formatQuickSaveDiagnosticReport(null)).toBeNull();
    expect(formatQuickSaveDiagnosticReport({ schemaVersion: 1, operations: [] })).toBeNull();
  });

  test('uses the same deterministic formatter for the copy, share, and full-report UI', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/components/native/HomeSettingsBottomSheet.ios.tsx'),
      'utf8',
    );
    const repeatedReport = { schemaVersion: 1, operations: [operation('C3D4E5F6', 100, [event('intent.returned', 20, { result: 'returned' })])] };
    expect(formatQuickSaveDiagnosticReport(repeatedReport)).toBe(formatQuickSaveDiagnosticReport(repeatedReport));
    expect(source).toContain('Clipboard.setStringAsync(reportText)');
    expect(source).toContain('shareQuickSaveDiagnosticReportFile(reportText)');
    expect(source).toContain('formatQuickSaveDiagnosticReport(getQuickSaveDiagnosticReport())');
    expect(source).toContain('textSelection(true)');
    expect(source).toContain('<ScrollView');
  });

  test('shares the named temporary text file and removes it after success or cancellation', async () => {
    for (const action of ['sharedAction', 'dismissedAction']) {
      let exists = false;
      const order = [];
      const file = {
        uri: 'file:///cache/SaveApp-Diagnostico.txt',
        get exists() { return exists; },
        create: jest.fn(() => { order.push('create'); exists = true; }),
        write: jest.fn(async (content) => { order.push('write'); expect(content).toBe('diagnostico seguro'); }),
        delete: jest.fn(() => { order.push('delete'); exists = false; }),
      };
      const shareFile = jest.fn(async (uri) => {
        order.push('share');
        expect(uri).toBe(file.uri);
        return { action };
      });

      const result = await shareQuickSaveDiagnosticReportFile('diagnostico seguro', {
        createFile: () => file,
        shareFile,
        dismissedAction: 'dismissedAction',
      });

      expect(result).toEqual({ status: action === 'dismissedAction' ? 'cancelled' : 'shared', cleanupFailed: false });
      expect(order).toEqual(['create', 'write', 'share', 'delete']);
      expect(exists).toBe(false);
    }
    expect(QUICK_SAVE_DIAGNOSTIC_FILE_NAME).toBe('SaveApp-Diagnostico.txt');
  });

  test('does not create files for empty reports and cleans up after share failures', async () => {
    const createFile = jest.fn();
    const shareFile = jest.fn();
    await expect(shareQuickSaveDiagnosticReportFile('  ', {
      createFile,
      shareFile,
      dismissedAction: 'dismissedAction',
    })).resolves.toEqual({ status: 'empty', cleanupFailed: false });
    expect(createFile).not.toHaveBeenCalled();
    expect(shareFile).not.toHaveBeenCalled();

    let exists = false;
    const file = {
      uri: 'file:///cache/SaveApp-Diagnostico.txt',
      get exists() { return exists; },
      create: jest.fn(() => { exists = true; }),
      write: jest.fn(async () => {}),
      delete: jest.fn(() => { exists = false; }),
    };
    const result = await shareQuickSaveDiagnosticReportFile('diagnostico seguro', {
      createFile: () => file,
      shareFile: async () => { throw new Error('private system error'); },
      dismissedAction: 'dismissedAction',
    });
    expect(result).toEqual({ status: 'failed', cleanupFailed: false });
    expect(file.delete).toHaveBeenCalledTimes(1);
    expect(exists).toBe(false);
  });
});
