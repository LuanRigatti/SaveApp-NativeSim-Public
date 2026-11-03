import { File, Paths } from 'expo-file-system';
import { Share } from 'react-native';

import {
  parseQuickSaveDiagnosticReport,
  type QuickSaveDiagnosticReport,
} from '../../../modules/clipboard-url-detection/src';

export const QUICK_SAVE_DIAGNOSTIC_FILE_NAME = 'SaveApp-Diagnostico.txt';

const environmentOrder = [
  'processRole',
  'target',
  'runtimeOS',
  'buildConfiguration',
  'appVersion',
  'appBuild',
  'compiledSDK',
  'xcodeVersion',
  'xcodeBuild',
  'appGroupAvailable',
] as const;

/** Formats only the parser's allowlisted report fields; opaque operation IDs are intentionally omitted. */
export function formatQuickSaveDiagnosticReport(report: QuickSaveDiagnosticReport | null): string | null {
  if (!report || report.schemaVersion !== 1 || report.operations.length === 0) return null;

  let sanitized: QuickSaveDiagnosticReport | null = null;
  try {
    sanitized = parseQuickSaveDiagnosticReport(JSON.stringify(report));
  } catch {
    return null;
  }
  if (!sanitized || sanitized.operations.length === 0) return null;

  const chronologicalOperations = sanitized.operations
    .map((operation, originalIndex) => ({ operation, originalIndex }))
    .sort((left, right) => left.operation.startedAt - right.operation.startedAt || left.originalIndex - right.originalIndex);

  const lines = [
    'SaveApp — Diagnóstico do Quick Save',
    `Tentativas registradas: ${chronologicalOperations.length}`,
  ];

  chronologicalOperations.forEach(({ operation }, index) => {
    const startedAt = new Date(operation.startedAt * 1_000);
    const startedLabel = Number.isNaN(startedAt.getTime()) ? 'horário indisponível' : startedAt.toLocaleString();
    lines.push('', '═'.repeat(64), `Tentativa ${index + 1} — ${startedLabel}`, '', 'Ambiente');

    for (const key of environmentOrder) {
      const value = operation.environment[key];
      if (value) lines.push(`  ${key}: ${value}`);
    }
    for (const key of Object.keys(operation.environment).sort()) {
      if (!(environmentOrder as readonly string[]).includes(key)) {
        lines.push(`  ${key}: ${operation.environment[key]}`);
      }
    }

    lines.push('', 'Eventos');
    operation.events
      .map((event, originalIndex) => ({ event, originalIndex }))
      .sort((left, right) => left.event.elapsedMilliseconds - right.event.elapsedMilliseconds || left.originalIndex - right.originalIndex)
      .forEach(({ event }) => {
        const elapsedSeconds = Math.floor(event.elapsedMilliseconds / 1_000);
        const elapsedRemainder = String(event.elapsedMilliseconds % 1_000).padStart(3, '0');
        const values = Object.entries(event.values)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, value]) => `${key}=${value}`)
          .join(' · ');
        lines.push(`  ${elapsedSeconds}.${elapsedRemainder}s — ${event.name}${values ? ` · ${values}` : ''}`);
      });
  });

  return `${lines.join('\n')}\n`;
}

type DiagnosticReportFile = {
  uri: string;
  exists: boolean;
  create: (options?: { overwrite?: boolean }) => void;
  write: (content: string) => Promise<void>;
  delete: () => void;
};

export type QuickSaveDiagnosticShareResult = {
  status: 'shared' | 'cancelled' | 'empty' | 'failed';
  cleanupFailed: boolean;
};

export type QuickSaveDiagnosticSharePorts = {
  createFile: () => DiagnosticReportFile;
  shareFile: (uri: string) => Promise<{ action: string }>;
  dismissedAction: string;
};

const defaultSharePorts: QuickSaveDiagnosticSharePorts = {
  createFile: () => new File(Paths.cache, QUICK_SAVE_DIAGNOSTIC_FILE_NAME),
  shareFile: (uri) => Share.share({ url: uri }),
  dismissedAction: Share.dismissedAction,
};

/** Shares the temporary report as a file and removes it on completion, cancellation, or failure. */
export async function shareQuickSaveDiagnosticReportFile(
  reportText: string,
  ports: QuickSaveDiagnosticSharePorts = defaultSharePorts,
): Promise<QuickSaveDiagnosticShareResult> {
  if (!reportText.trim()) return { status: 'empty', cleanupFailed: false };

  let file: DiagnosticReportFile | null = null;
  let status: QuickSaveDiagnosticShareResult['status'] = 'failed';
  let cleanupFailed = false;
  try {
    file = ports.createFile();
    if (file.exists) file.delete();
    file.create();
    await file.write(reportText);
    if (!file.exists) throw new Error('diagnostic_report_file_missing');

    const result = await ports.shareFile(file.uri);
    status = result.action === ports.dismissedAction ? 'cancelled' : 'shared';
  } catch {
    status = 'failed';
  } finally {
    if (file?.exists) {
      try {
        file.delete();
      } catch {
        cleanupFailed = true;
      }
    }
  }

  return { status, cleanupFailed };
}
