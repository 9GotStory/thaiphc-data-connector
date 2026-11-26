import {
  REPORT_CURRENT_HEADERS,
  REPORT_CURRENT_TAB,
  SAME_WORKBOOK_APPROVAL_TOKEN,
  SYNC_LOG_TAB,
} from './datasetCatalog.ts';
import type {
  AppEnvironment,
  DatasetEndpoint,
  PreviewDiagnostic,
  SameWorkbookPolicy,
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

export interface ReportCurrentPointer {
  endpoint: string;
  runId: string;
  snapshotSheet: string;
  rowCount: string;
  manifestDigest: string;
  rowNumber?: number;
}

export interface ReportCurrentSheetState {
  exists: boolean;
  pointers: Map<string, ReportCurrentPointer>;
}

export interface ReportWorkbookPolicyResult {
  sameWorkbookPolicy: SameWorkbookPolicy;
  reportWorkbookApproved: boolean;
  targetSpreadsheetId: string | null;
  usesSameSpreadsheet: boolean;
}

export function parseEnvironment(raw: string | null): AppEnvironment | null {
  return raw === 'SANDBOX' || raw === 'PRODUCTION' ? raw : null;
}

export function isValidSpreadsheetId(value: string | null): value is string {
  return typeof value === 'string' && SPREADSHEET_ID_PATTERN.test(value);
}

export function resolveReportWorkbookPolicy(
  referenceSpreadsheetId: string,
  rawReportSpreadsheetId: string | null,
  sameWorkbookApproval: string | null,
): ReportWorkbookPolicyResult {
  const trimmedReportId =
    typeof rawReportSpreadsheetId === 'string' ? rawReportSpreadsheetId.trim() : '';

  if (trimmedReportId === '' || trimmedReportId === referenceSpreadsheetId) {
    const approved = sameWorkbookApproval === SAME_WORKBOOK_APPROVAL_TOKEN;
    return {
      sameWorkbookPolicy: approved ? 'SAME_WORKBOOK_APPROVED' : 'SAME_WORKBOOK_UNAPPROVED',
      reportWorkbookApproved: approved,
      targetSpreadsheetId: referenceSpreadsheetId,
      usesSameSpreadsheet: true,
    };
  }

  if (!isValidSpreadsheetId(trimmedReportId)) {
    return {
      sameWorkbookPolicy: 'INVALID_REPORT_WORKBOOK',
      reportWorkbookApproved: false,
      targetSpreadsheetId: null,
      usesSameSpreadsheet: false,
    };
  }

  return {
    sameWorkbookPolicy: 'SEPARATE_WORKBOOK',
    reportWorkbookApproved: true,
    targetSpreadsheetId: trimmedReportId,
    usesSameSpreadsheet: false,
  };
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

export function readReportCurrentPointers(
  spreadsheet: SpreadsheetHandle | null,
): Map<string, ReportCurrentPointer> {
  const pointers = new Map<string, ReportCurrentPointer>();
  if (!spreadsheet) {
    return pointers;
  }
  const sheet = spreadsheet.getSheetByName(REPORT_CURRENT_TAB);
  if (!sheet) {
    return pointers;
  }
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return pointers;
  }

  const values = sheet.getValues(1, 1, lastRow, lastCol);
  const headers = buildHeaderMap(values[0] ?? []);
  const endpointCol = headers.get('endpoint');
  const runIdCol = headers.get('run_id');
  const snapshotSheetCol = headers.get('snapshot_sheet');
  const rowCountCol = headers.get('row_count');
  const manifestDigestCol = headers.get('manifest_digest');

  if (endpointCol === undefined || runIdCol === undefined || snapshotSheetCol === undefined) {
    return pointers;
  }

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const endpoint = cellToString(row[endpointCol]);
    const runId = cellToString(row[runIdCol]);
    const snapshotSheet = cellToString(row[snapshotSheetCol]);
    if (endpoint.length === 0 || snapshotSheet.length === 0) {
      continue;
    }
    pointers.set(endpoint, {
      endpoint,
      runId,
      snapshotSheet,
      rowCount: rowCountCol !== undefined ? cellToString(row[rowCountCol]) : '',
      manifestDigest: manifestDigestCol !== undefined ? cellToString(row[manifestDigestCol]) : '',
      rowNumber: r + 1,
    });
  }

  return pointers;
}

/**
 * Strictly reads `_ThaiPHCReportCurrent` for Complete Snapshot Preview/Commit/Readback,
 * failing closed on header drift or duplicate endpoint pointer rows.
 */
export function readReportCurrentState(
  spreadsheet: SpreadsheetHandle,
): { ok: true; state: ReportCurrentSheetState } | { ok: false; diagnostic: PreviewDiagnostic } {
  const sheet = spreadsheet.getSheetByName(REPORT_CURRENT_TAB);
  if (!sheet) {
    return { ok: true, state: { exists: false, pointers: new Map() } };
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol !== REPORT_CURRENT_HEADERS.length) {
    return {
      ok: false,
      diagnostic: {
        code: 'HEADER_MISMATCH',
        message: `Publication Pointer tab "${REPORT_CURRENT_TAB}" column count (${lastCol}) does not match expected schema (${REPORT_CURRENT_HEADERS.length}).`,
      },
    };
  }

  const headerRow = sheet.getValues(1, 1, 1, REPORT_CURRENT_HEADERS.length)[0] ?? [];
  const headersMatch = REPORT_CURRENT_HEADERS.every((expected, idx) => headerRow[idx] === expected);
  if (!headersMatch) {
    return {
      ok: false,
      diagnostic: {
        code: 'HEADER_MISMATCH',
        message: `Publication Pointer tab "${REPORT_CURRENT_TAB}" headers do not match expected schema.`,
      },
    };
  }

  const headers = buildHeaderMap(headerRow);
  const endpointCol = headers.get('endpoint')!;
  const runIdCol = headers.get('run_id')!;
  const snapshotSheetCol = headers.get('snapshot_sheet')!;
  const rowCountCol = headers.get('row_count')!;
  const manifestDigestCol = headers.get('manifest_digest')!;

  const pointers = new Map<string, ReportCurrentPointer>();
  if (lastRow < 2) {
    return { ok: true, state: { exists: true, pointers } };
  }

  const rows = sheet.getValues(2, 1, lastRow - 1, REPORT_CURRENT_HEADERS.length);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const endpoint = cellToString(row[endpointCol]);
    const runId = cellToString(row[runIdCol]);
    const snapshotSheet = cellToString(row[snapshotSheetCol]);
    const rowCount = cellToString(row[rowCountCol]);
    const manifestDigest = cellToString(row[manifestDigestCol]);

    if (endpoint.length === 0 || snapshotSheet.length === 0 || pointers.has(endpoint)) {
      return {
        ok: false,
        diagnostic: {
          code: 'INVALID_EXISTING_KEY',
          message: `Publication Pointer tab "${REPORT_CURRENT_TAB}" contains an empty or duplicate endpoint entry at row ${i + 2}.`,
          rowIndex: i,
        },
      };
    }

    pointers.set(endpoint, {
      endpoint,
      runId,
      snapshotSheet,
      rowCount,
      manifestDigest,
      rowNumber: i + 2,
    });
  }

  return { ok: true, state: { exists: true, pointers } };
}

export function detectLegacySnapshot(
  endpoint: DatasetEndpoint,
  legacyPrefix: string | null,
  fixedTabExists: boolean,
  reportPointers: ReadonlyMap<string, ReportCurrentPointer>,
  sheetNames: readonly string[],
  options: { allowUnindexedPrefixFallback?: boolean } = {},
): { legacySnapshotPresent: boolean; legacySnapshotTab: string | null } {
  if (fixedTabExists || legacyPrefix === null) {
    return { legacySnapshotPresent: false, legacySnapshotTab: null };
  }

  const pointer = reportPointers.get(endpoint);
  if (pointer && pointer.snapshotSheet.startsWith(legacyPrefix)) {
    return { legacySnapshotPresent: true, legacySnapshotTab: pointer.snapshotSheet };
  }

  if (options.allowUnindexedPrefixFallback) {
    const matchingTab = sheetNames.find((name) => name.startsWith(legacyPrefix));
    if (matchingTab) {
      return { legacySnapshotPresent: true, legacySnapshotTab: matchingTab };
    }
  }

  return { legacySnapshotPresent: false, legacySnapshotTab: null };
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
