/* global describe, expect, test */

const { parseQuickSaveDiagnosticReport } = require('../modules/clipboard-url-detection/src');

describe('Quick Save diagnostic report', () => {
  test('keeps only the comparable environment and clipboard metadata', () => {
    const report = parseQuickSaveDiagnosticReport(JSON.stringify({
      schemaVersion: 1,
      operations: [{
        operationID: 'A1B2C3D4',
        startedAt: 1_798_000_000,
        environment: {
          processRole: 'application',
          runtimeOS: '27.2',
          target: 'device',
          buildConfiguration: 'release',
          compiledSDK: 'iphoneos27.2',
          applicationState: 'background',
          sceneStates: 'background',
          appGroupAvailable: 'true',
          clipboardText: 'https://private.example/article',
          URL: 'https://private.example/article',
        },
        events: [{
          name: 'clipboard.readResult',
          elapsedMilliseconds: 22,
          values: {
            result: 'unavailable',
            reason: 'valueMissing',
            selectedRepresentation: 'string',
            changeCountAfter: '37',
            changeCountChanged: 'false',
            copiedText: 'private clipboard content',
          },
        }, {
          name: 'activity.update',
          elapsedMilliseconds: 40,
          values: {
            state: 'failed',
            phase: 'submitted',
            result: 'https://private.example/article',
          },
        }],
      }],
    }));

    expect(report).not.toBeNull();
    expect(report.operations[0].environment).toEqual(expect.objectContaining({
      runtimeOS: '27.2',
      compiledSDK: 'iphoneos27.2',
      applicationState: 'background',
      appGroupAvailable: 'true',
    }));
    expect(report.operations[0].environment).not.toHaveProperty('clipboardText');
    expect(report.operations[0].environment).not.toHaveProperty('URL');
    expect(report.operations[0].events[0].values).toEqual({
      result: 'unavailable',
      reason: 'valueMissing',
      selectedRepresentation: 'string',
      changeCountAfter: '37',
      changeCountChanged: 'false',
    });
    expect(report.operations[0].events[1].values).toEqual({ state: 'failed', phase: 'submitted' });
    expect(JSON.stringify(report)).not.toContain('private.example');
    expect(JSON.stringify(report)).not.toContain('private clipboard content');
  });

  test('rejects malformed archives and limits retained operations and events', () => {
    expect(parseQuickSaveDiagnosticReport('not-json')).toBeNull();
    expect(parseQuickSaveDiagnosticReport(JSON.stringify({ schemaVersion: 2, operations: [] }))).toBeNull();

    const operations = Array.from({ length: 8 }, (_, index) => ({
      operationID: `0000000${index}`,
      startedAt: index + 1,
      environment: { processRole: 'application' },
      events: Array.from({ length: 50 }, (_, eventIndex) => ({
        name: 'intent.returned',
        elapsedMilliseconds: eventIndex,
        values: { result: 'returned' },
      })),
    }));
    const report = parseQuickSaveDiagnosticReport(JSON.stringify({ schemaVersion: 1, operations }));

    expect(report.operations).toHaveLength(6);
    expect(report.operations[0].operationID).toBe('00000002');
    expect(report.operations.at(-1).events).toHaveLength(48);
  });
});
