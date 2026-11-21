import { SYNC_LOG_TAB } from './datasetCatalog.ts';
import type {
  AppEnvironment,
  DatasetEndpoint,
  SpreadsheetHandle,
  UnresolvedRunSummary,
} from './types.ts';

const SPREADSHEET_ID_PATTERN = /^[A-Za-z0-9_-]{25,120}$/;

export interface SyncLogEntry {
  endpoint: string;
  runId: string;
  timestampUtc: string | null;
  rawStatus: string;
}

export function parseEnvironment(raw: string | null): AppEnvironment | null {
  return raw === 'SANDBOX' || raw === 'PRODUCTION' ? raw : null;
}

export function isValidSpreadsheetId(value: string | null): value is string {
  return typeof value === 'string' && SPREADSHEET_ID_PATTERN.test(value);
}

export function cellToString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

export function buildHeaderMap(headerRow: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < headerRow.length; i++) {
    const key = cellToString(headerRow[i]);
    if (key.length > 0 && !map.has(key)) {
      map.set(key, i);
    }
  }
  return map;
}

export function readSyncLogLatestMap(
  spreadsheet: SpreadsheetHandle | null,
): Map<string, SyncLogEntry> {
  const latestByEndpoint = new Map<string, SyncLogEntry>();
  if (!spreadsheet) {
    return latestByEndpoint;
  }
  const sheet = spreadsheet.getSheetByName(SYNC_LOG_TAB);
  if (!sheet) {
    return latestByEndpoint;
  }
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return latestByEndpoint;
  }
  const values = sheet.getValues(1, 1, lastRow, lastCol);
  const headers = buildHeaderMap(values[0] ?? []);
  const endpointCol = headers.get('endpoint');
  const runIdCol = headers.get('run_id');
  const statusCol = headers.get('status');
  const timestampCol = headers.get('timestamp_utc');

  if (endpointCol === undefined || runIdCol === undefined || statusCol === undefined) {
    return latestByEndpoint;
  }

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const endpoint = cellToString(row[endpointCol]);
    const runId = cellToString(row[runIdCol]);
    const rawStatus = cellToString(row[statusCol]);
    if (endpoint.length === 0 || runId.length === 0) {
      continue;
    }
    const timestampRaw = timestampCol !== undefined ? cellToString(row[timestampCol]) : '';
    latestByEndpoint.set(endpoint, {
      endpoint,
      runId,
      timestampUtc: timestampRaw.length > 0 ? timestampRaw : null,
      rawStatus,
    });
  }

  return latestByEndpoint;
}

export function toUnresolvedRunSummary(
  endpoint: DatasetEndpoint,
  entry: SyncLogEntry | undefined,
): UnresolvedRunSummary | null {
  if (!entry) return null;
  if (entry.rawStatus === 'COMMITTED_VERIFIED' || entry.rawStatus === 'FAILED_STOP') {
    return null;
  }
  return {
    endpoint,
    runId: entry.runId,
    startedAtUtc: entry.timestampUtc,
    status: 'STARTED',
  };
}
