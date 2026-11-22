import type { FieldPresence } from './cellValidation.ts';
import {
  getDatasetDescriptor,
  KEYED_UPSERT_METADATA_COLUMNS,
  SAME_WORKBOOK_APPROVAL_TOKEN,
  SCHEMA_VERSION,
  SYNC_LOG_HEADERS,
  SYNC_LOG_TAB,
  SYNC_LOG_TEXT_COLUMN_COUNT,
  type KeyedDatasetSchemaSpec,
} from './datasetCatalog.ts';
import { createF010Pseudonymizer, type F010Pseudonymizer } from './pseudonymizer.ts';
import {
  cellToString,
  readSyncLogLatestMap,
  resolveReportWorkbookPolicy,
  toUnresolvedRunSummary,
} from './sheetConfig.ts';
import type {
  AppEnvironment,
  BlockedGuardReason,
  CommitDatasetResponse,
  CommitStaleData,
  CommitStopCode,
  CommitStopData,
  DatasetEndpoint,
  DiffCounts,
  PreviewDiagnostic,
  PreviewFingerprint,
  ReadbackVerification,
  ReviewReasonCode,
  SyncPlatform,
  SyncRpcErrorCode,
  UnresolvedRunSummary,
  WritableSheetHandle,
  WritableSpreadsheetHandle,
} from './types.ts';

export const MAX_DESTINATION_ROWS = 5000;
export const LOCK_TIMEOUT_MS = 10000;

export type CellScalar = string | number | boolean;

export interface CommitTargetContext {
  endpoint: DatasetEndpoint;
  isExtendedReport: boolean;
  env: AppEnvironment;
  referenceSpreadsheetId: string;
  schema: KeyedDatasetSchemaSpec;
}

export interface ExistingDestinationRow {
  rowNumber: number; // 1-based sheet row number
  key: string;
  rowDigest: string;
  cells: unknown[];
}

export interface DestinationState {
  exists: boolean;
  headers: string[];
  rows: ExistingDestinationRow[];
  byKey: Map<string, ExistingDestinationRow>;
}

export interface SyncLogSummary {
  latestRunId: string | null;
  latestStatus: string | null;
  unresolvedRun: UnresolvedRunSummary | null;
}

export interface ProjectedKeyedRowBase {
  key: string;
  values: Array<CellScalar | null>;
  presence: Record<string, FieldPresence>;
  rowDigest: string;
  reviewReasons: ReviewReasonCode[];
}

export interface TargetWorkbookContext {
  isExtendedReport: boolean;
  referenceSpreadsheetId: string;
}

export type WriteGuardEvaluation =
  | { writeAllowed: true; blockedGuardReason: null }
  | {
      writeAllowed: false;
      blockedGuardReason: BlockedGuardReason;
      stopCode: CommitStopCode;
      message: string;
    };

export function resolveTargetSpreadsheetId(
  ctx: TargetWorkbookContext,
  platform: SyncPlatform,
): { ok: true; spreadsheetId: string } | { ok: false; message: string } {
  if (!ctx.isExtendedReport) {
    return { ok: true, spreadsheetId: ctx.referenceSpreadsheetId };
  }
  const policy = resolveReportWorkbookPolicy(
    ctx.referenceSpreadsheetId,
    platform.getProperty('THAIPHC_REPORT_SPREADSHEET_ID'),
    platform.getProperty('THAIPHC_SAME_WORKBOOK_APPROVAL'),
  );
  if (policy.targetSpreadsheetId === null) {
    return {
      ok: false,
      message: 'THAIPHC_REPORT_SPREADSHEET_ID is invalid in Google Apps Script Properties.',
    };
  }
  return { ok: true, spreadsheetId: policy.targetSpreadsheetId };
}

export function evaluateWriteGuards(
  ctx: TargetWorkbookContext,
  platform: SyncPlatform,
): WriteGuardEvaluation {
  if (platform.getProperty('THAIPHC_WRITE_ENABLED') !== 'true') {
    return {
      writeAllowed: false,
      blockedGuardReason: 'THAIPHC_WRITE_ENABLED',
      stopCode: 'WRITE_DISABLED',
      message: 'THAIPHC_WRITE_ENABLED is OFF in Google Apps Script Properties. Commit rejected.',
    };
  }

  if (ctx.isExtendedReport) {
    if (platform.getProperty('THAIPHC_PERSON_DATA_WRITE_ENABLED') !== 'true') {
      return {
        writeAllowed: false,
        blockedGuardReason: 'THAIPHC_PERSON_DATA_WRITE_ENABLED',
        stopCode: 'PERSON_DATA_WRITE_DISABLED',
        message:
          'THAIPHC_PERSON_DATA_WRITE_ENABLED is OFF in Google Apps Script Properties. Extended Report Commit rejected.',
      };
    }

    const reportPolicy = resolveReportWorkbookPolicy(
      ctx.referenceSpreadsheetId,
      platform.getProperty('THAIPHC_REPORT_SPREADSHEET_ID'),
      platform.getProperty('THAIPHC_SAME_WORKBOOK_APPROVAL'),
    );
    if (reportPolicy.sameWorkbookPolicy === 'INVALID_REPORT_WORKBOOK') {
      return {
        writeAllowed: false,
        blockedGuardReason: 'THAIPHC_REPORT_SPREADSHEET_ID',
        stopCode: 'INVALID_REPORT_WORKBOOK',
        message:
          'THAIPHC_REPORT_SPREADSHEET_ID is invalid in Google Apps Script Properties. Commit rejected.',
      };
    }
    if (reportPolicy.sameWorkbookPolicy === 'SAME_WORKBOOK_UNAPPROVED') {
      return {
        writeAllowed: false,
        blockedGuardReason: 'THAIPHC_SAME_WORKBOOK_APPROVAL',
        stopCode: 'SAME_WORKBOOK_UNAPPROVED',
        message: `Writing Extended Report datasets into the reference workbook requires THAIPHC_SAME_WORKBOOK_APPROVAL=${SAME_WORKBOOK_APPROVAL_TOKEN} or a separate THAIPHC_REPORT_SPREADSHEET_ID.`,
      };
    }
  }

  return { writeAllowed: true, blockedGuardReason: null };
}

export function getExpectedHeaders(schema: KeyedDatasetSchemaSpec): string[] {
  return [...schema.fields.map((f) => f.name), ...KEYED_UPSERT_METADATA_COLUMNS];
}

export function getTextColumnIndices(schema: KeyedDatasetSchemaSpec): number[] {
  const cols: number[] = [];
  for (let i = 0; i < schema.fields.length; i++) {
    const kind = schema.fields[i].kind;
    if (
      kind === 'string' ||
      kind === 'string_or_null' ||
      kind === 'null_only' ||
      kind === 'object' ||
      kind === 'array'
    ) {
      cols.push(i + 1);
    }
  }
  for (let m = 0; m < KEYED_UPSERT_METADATA_COLUMNS.length; m++) {
    cols.push(schema.fields.length + m + 1);
  }
  return cols;
}

export function readDestinationState(
  spreadsheet: WritableSpreadsheetHandle,
  schema: KeyedDatasetSchemaSpec,
): { ok: true; state: DestinationState } | { ok: false; diagnostic: PreviewDiagnostic } {
  const expectedHeaders = getExpectedHeaders(schema);
  const sheet = spreadsheet.getSheetByName(schema.tab);
  if (!sheet) {
    return {
      ok: true,
      state: {
        exists: false,
        headers: expectedHeaders,
        rows: [],
        byKey: new Map(),
      },
    };
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol !== expectedHeaders.length) {
    return {
      ok: false,
      diagnostic: {
        code: 'HEADER_MISMATCH',
        message: `Destination tab "${schema.tab}" column count (${lastCol}) does not match expected schema (${expectedHeaders.length}).`,
      },
    };
  }

  const headerRow = sheet.getValues(1, 1, 1, expectedHeaders.length)[0] ?? [];
  const headerMatches = expectedHeaders.every((expected, idx) => headerRow[idx] === expected);
  if (!headerMatches) {
    return {
      ok: false,
      diagnostic: {
        code: 'HEADER_MISMATCH',
        message: `Destination tab "${schema.tab}" headers do not match the expected schema.`,
      },
    };
  }

  const dataRowCount = lastRow - 1;
  if (dataRowCount > MAX_DESTINATION_ROWS) {
    return {
      ok: false,
      diagnostic: {
        code: 'DESTINATION_TOO_LARGE',
        message: `Destination tab "${schema.tab}" exceeds maximum supported row count (${MAX_DESTINATION_ROWS}).`,
      },
    };
  }

  if (dataRowCount === 0) {
    return {
      ok: true,
      state: {
        exists: true,
        headers: expectedHeaders,
        rows: [],
        byKey: new Map(),
      },
    };
  }

  const rawRows = sheet.getValues(2, 1, dataRowCount, expectedHeaders.length);
  const keyColIdx = expectedHeaders.indexOf('_source_key');
  const digestColIdx = expectedHeaders.indexOf('_row_digest');

  const rows: ExistingDestinationRow[] = [];
  const byKey = new Map<string, ExistingDestinationRow>();

  for (let i = 0; i < rawRows.length; i++) {
    const cells = rawRows[i];
    const key = cellToString(cells[keyColIdx]);
    if (key.length === 0 || byKey.has(key)) {
      return {
        ok: false,
        diagnostic: {
          code: 'INVALID_EXISTING_KEY',
          message: `Destination tab "${schema.tab}" contains an empty or duplicate _source_key at row ${i + 2}.`,
          rowIndex: i,
        },
      };
    }
    const entry: ExistingDestinationRow = {
      rowNumber: i + 2,
      key,
      rowDigest: cellToString(cells[digestColIdx]),
      cells,
    };
    rows.push(entry);
    byKey.set(key, entry);
  }

  return {
    ok: true,
    state: {
      exists: true,
      headers: expectedHeaders,
      rows,
      byKey,
    },
  };
}

export function readEndpointSyncLogSummary(
  spreadsheet: WritableSpreadsheetHandle,
  endpoint: DatasetEndpoint,
): SyncLogSummary {
  const latestMap = readSyncLogLatestMap(spreadsheet);
  const latest = latestMap.get(endpoint);
  if (!latest) {
    return { latestRunId: null, latestStatus: null, unresolvedRun: null };
  }
  return {
    latestRunId: latest.runId,
    latestStatus: latest.rawStatus,
    unresolvedRun: toUnresolvedRunSummary(endpoint, latest),
  };
}

function normalizeCellForRevision(cell: unknown): string | number | boolean {
  if (cell instanceof Date && Number.isFinite(cell.getTime())) {
    return cell.toISOString();
  }
  if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') {
    return cell;
  }
  return '';
}

export function computeSheetRevisionFingerprint(
  dest: DestinationState,
  logSummary: SyncLogSummary,
  sha256Hex: (input: string) => string,
): string {
  // Include full persisted cell values so any out-of-band manual cell edit triggers PREVIEW_STALE
  const payload = {
    exists: dest.exists,
    headers: dest.headers,
    rows: dest.rows.map((r) => [
      r.key,
      r.rowDigest,
      r.cells.map((cell) => normalizeCellForRevision(cell)),
    ]),
    latestRunId: logSummary.latestRunId,
    latestStatus: logSummary.latestStatus,
  };
  return sha256Hex(JSON.stringify(payload));
}

export function computePreviewFingerprint(
  endpoint: DatasetEndpoint,
  env: AppEnvironment,
  sourceTotal: number,
  datasetDigest: string,
  sheetRevisionFingerprint: string,
  counts: DiffCounts,
  sha256Hex: (input: string) => string,
): PreviewFingerprint {
  const core = {
    endpoint,
    env,
    sourceTotal,
    datasetDigest,
    sheetRevisionFingerprint,
    counts,
  };
  const fingerprintDigest = sha256Hex(JSON.stringify(core));
  return {
    ...core,
    fingerprintDigest,
  };
}

export function verifyPreviewFingerprintIntegrity(
  expectedFp: PreviewFingerprint | null | undefined,
  endpoint: DatasetEndpoint,
  sha256Hex: (input: string) => string,
): { ok: true; fingerprint: PreviewFingerprint } | { ok: false; message: string } {
  if (
    !expectedFp ||
    typeof expectedFp !== 'object' ||
    expectedFp.endpoint !== endpoint ||
    (expectedFp.env !== 'SANDBOX' && expectedFp.env !== 'PRODUCTION') ||
    !Number.isSafeInteger(expectedFp.sourceTotal) ||
    expectedFp.sourceTotal < 1 ||
    typeof expectedFp.datasetDigest !== 'string' ||
    typeof expectedFp.sheetRevisionFingerprint !== 'string' ||
    typeof expectedFp.fingerprintDigest !== 'string' ||
    !expectedFp.counts ||
    typeof expectedFp.counts !== 'object' ||
    !Number.isSafeInteger(expectedFp.counts.insert) ||
    !Number.isSafeInteger(expectedFp.counts.update) ||
    !Number.isSafeInteger(expectedFp.counts.unchanged) ||
    !Number.isSafeInteger(expectedFp.counts.review)
  ) {
    return {
      ok: false,
      message: 'Preview Fingerprint is missing or malformed. Run a fresh Preview first.',
    };
  }

  const recomputed = computePreviewFingerprint(
    expectedFp.endpoint,
    expectedFp.env,
    expectedFp.sourceTotal,
    expectedFp.datasetDigest,
    expectedFp.sheetRevisionFingerprint,
    expectedFp.counts,
    sha256Hex,
  );
  if (recomputed.fingerprintDigest !== expectedFp.fingerprintDigest) {
    return {
      ok: false,
      message: 'Preview Fingerprint integrity check failed. Run a fresh Preview before committing.',
    };
  }

  return { ok: true, fingerprint: expectedFp };
}

export function countKeyedDiffByDigest(
  incomingEntries: ReadonlyArray<{ key: string; rowDigest: string }>,
  dest: DestinationState,
): {
  counts: DiffCounts;
  incomingDiffKindByKey: Map<string, 'INSERT' | 'UPDATE' | 'UNCHANGED'>;
  missingKeys: string[];
} {
  let insert = 0;
  let update = 0;
  let unchanged = 0;
  const incomingDiffKindByKey = new Map<string, 'INSERT' | 'UPDATE' | 'UNCHANGED'>();

  for (const entry of incomingEntries) {
    const existing = dest.byKey.get(entry.key);
    if (!existing) {
      insert += 1;
      incomingDiffKindByKey.set(entry.key, 'INSERT');
    } else if (existing.rowDigest === entry.rowDigest) {
      unchanged += 1;
      incomingDiffKindByKey.set(entry.key, 'UNCHANGED');
    } else {
      update += 1;
      incomingDiffKindByKey.set(entry.key, 'UPDATE');
    }
  }

  const missingKeys: string[] = [];
  for (const existing of dest.rows) {
    if (!incomingDiffKindByKey.has(existing.key)) {
      missingKeys.push(existing.key);
    }
  }

  return {
    counts: {
      insert,
      update,
      unchanged,
      review: missingKeys.length,
    },
    incomingDiffKindByKey,
    missingKeys,
  };
}

export function makeCommitStop(
  ctx: Pick<CommitTargetContext, 'endpoint' | 'env' | 'schema'>,
  stopCode: CommitStopCode,
  message: string,
  opts: {
    status?: 'FAILED_STOP' | 'UNKNOWN_OUTCOME_STOP';
    runId?: string | null;
    syncLogStatus?: 'STARTED' | 'FAILED_STOP' | 'NOT_WRITTEN';
    stagingTabRetained?: string | null;
  } = {},
): { ok: true; data: CommitStopData } {
  return {
    ok: true,
    data: {
      status: opts.status ?? 'FAILED_STOP',
      runId: opts.runId ?? null,
      endpoint: ctx.endpoint,
      env: ctx.env,
      destinationTab: ctx.schema.tab,
      stopCode,
      message,
      syncLogStatus: opts.syncLogStatus ?? 'NOT_WRITTEN',
      stagingTabRetained: opts.stagingTabRetained ?? null,
    },
  };
}

export type PreLockCommitCheckResult =
  | {
      ok: true;
      expectedFp: PreviewFingerprint;
      pseudonymizer: F010Pseudonymizer | null;
    }
  | { ok: false; response: { ok: true; data: CommitStopData | CommitStaleData } };

/**
 * Shared pre-lock Commit gate used by single-call and multi-batch commits:
 * verifies Preview Fingerprint integrity, Write Guards, PRODUCTION phrase,
 * environment consistency, and (for person-level endpoints) `THAIPHC_HMAC_KEY_B64`.
 */
export function validateCommitPreLock(
  ctx: CommitTargetContext,
  params: {
    expectedFingerprint: PreviewFingerprint | null | undefined;
    confirmationPhrase?: string;
    runId?: string | null;
    requireHmacKey?: boolean;
  },
  platform: SyncPlatform,
): PreLockCommitCheckResult {
  const stopOpts = params.runId ? { runId: params.runId } : {};

  const fpCheck = verifyPreviewFingerprintIntegrity(
    params.expectedFingerprint,
    ctx.endpoint,
    platform.sha256Hex,
  );
  if (!fpCheck.ok) {
    return {
      ok: false,
      response: makeCommitStop(ctx, 'INVALID_FINGERPRINT', fpCheck.message, stopOpts),
    };
  }
  const expectedFp = fpCheck.fingerprint;

  const preLockGuard = evaluateWriteGuards(ctx, platform);
  if (!preLockGuard.writeAllowed) {
    return {
      ok: false,
      response: makeCommitStop(ctx, preLockGuard.stopCode, preLockGuard.message, stopOpts),
    };
  }

  if (ctx.env === 'PRODUCTION') {
    const expectedPhrase = `PRODUCTION 5406 ${ctx.endpoint}`;
    if (params.confirmationPhrase !== expectedPhrase) {
      return {
        ok: false,
        response: makeCommitStop(
          ctx,
          'PRODUCTION_CONFIRMATION_REQUIRED',
          `Production commit requires exact confirmation phrase "${expectedPhrase}".`,
          stopOpts,
        ),
      };
    }
  }

  if (expectedFp.env !== ctx.env) {
    return {
      ok: false,
      response: {
        ok: true,
        data: {
          status: 'PREVIEW_STALE_RECONFIRM_REQUIRED',
          endpoint: ctx.endpoint,
          env: ctx.env,
          destinationTab: ctx.schema.tab,
          driftReason: 'ENV_MISMATCH',
          expectedFingerprint: expectedFp,
          currentSourceTotal: expectedFp.sourceTotal,
          currentDatasetDigest: expectedFp.datasetDigest,
          currentSheetRevisionFingerprint: expectedFp.sheetRevisionFingerprint,
        },
      },
    };
  }

  let pseudonymizer: F010Pseudonymizer | null = null;
  if (params.requireHmacKey) {
    const pseudoInit = createF010Pseudonymizer(
      platform.getProperty('THAIPHC_HMAC_KEY_B64'),
      platform,
    );
    if (!pseudoInit.ok) {
      return {
        ok: false,
        response: makeCommitStop(ctx, pseudoInit.code, pseudoInit.message, stopOpts),
      };
    }
    pseudonymizer = pseudoInit.pseudonymizer;
  }

  return { ok: true, expectedFp, pseudonymizer };
}

/**
 * Shared `LockService` guard + workbook open + `UNRESOLVED_PREVIOUS_RUN` check wrapper.
 */
export function withLockedCommitWorkbook<TRes>(
  ctx: CommitTargetContext,
  params: {
    acknowledgeUnresolvedRunId?: string;
    runId?: string | null;
    stageTabNameForRetention?: string | null;
  },
  platform: SyncPlatform,
  run: (locked: { spreadsheet: WritableSpreadsheetHandle; logSummary: SyncLogSummary }) => TRes,
):
  | TRes
  | { ok: true; data: CommitStopData }
  | { ok: false; error: { code: SyncRpcErrorCode; message: string } } {
  const baseStopOpts = params.runId ? { runId: params.runId } : {};

  const lock = platform.tryScriptLock(LOCK_TIMEOUT_MS);
  if (!lock) {
    return makeCommitStop(
      ctx,
      'LOCK_BUSY',
      'Another synchronization is currently holding Script Lock. Inspect destination before running a fresh Preview.',
      baseStopOpts,
    );
  }

  try {
    const inLockGuard = evaluateWriteGuards(ctx, platform);
    if (!inLockGuard.writeAllowed) {
      return makeCommitStop(ctx, inLockGuard.stopCode, inLockGuard.message, baseStopOpts);
    }

    const targetIdResult = resolveTargetSpreadsheetId(ctx, platform);
    if (!targetIdResult.ok) {
      return makeCommitStop(ctx, 'INVALID_REPORT_WORKBOOK', targetIdResult.message, baseStopOpts);
    }

    let spreadsheet: WritableSpreadsheetHandle;
    try {
      spreadsheet = platform.openSpreadsheetById(targetIdResult.spreadsheetId);
    } catch {
      return {
        ok: false,
        error: {
          code: 'WORKBOOK_ACCESS_FAILED',
          message: ctx.isExtendedReport
            ? 'Unable to open the configured report Google Sheets workbook.'
            : 'Unable to open the configured reference Google Sheets workbook.',
        },
      };
    }

    const logSummary = readEndpointSyncLogSummary(spreadsheet, ctx.endpoint);
    if (
      logSummary.unresolvedRun &&
      params.acknowledgeUnresolvedRunId !== logSummary.unresolvedRun.runId
    ) {
      const retained =
        params.stageTabNameForRetention &&
        spreadsheet.getSheetByName(params.stageTabNameForRetention)
          ? params.stageTabNameForRetention
          : null;
      return makeCommitStop(
        ctx,
        'UNRESOLVED_PREVIOUS_RUN',
        `Dataset "${ctx.endpoint}" has an unresolved previous run (${logSummary.unresolvedRun.runId}). Inspect destination Sheet and acknowledge before committing.`,
        { ...baseStopOpts, stagingTabRetained: retained },
      );
    }

    return run({ spreadsheet, logSummary });
  } finally {
    try {
      lock.releaseLock();
    } catch {
      // Ignore lock release failures in finally
    }
  }
}

export function buildSheetRowValues(
  row: ProjectedKeyedRowBase,
  runId: string,
  fetchedAtUtc: string,
  isExtendedReport: boolean,
): CellScalar[] {
  const sourceCells: CellScalar[] = row.values.map((v) => (v === null ? '' : v));
  const qualityStatus =
    isExtendedReport && row.reviewReasons.includes('SMALL_CELL_SUPPRESSED') ? 'WARNING' : 'VALID';
  return [
    ...sourceCells,
    SCHEMA_VERSION,
    runId,
    row.key,
    fetchedAtUtc,
    qualityStatus,
    JSON.stringify(row.presence),
    runId,
    row.rowDigest,
  ];
}

export function applyTextFormatsToRange(
  sheet: WritableSheetHandle,
  startRow: number,
  numRows: number,
  textCols: readonly number[],
): void {
  for (const col of textCols) {
    sheet.setNumberFormat(startRow, col, numRows, 1, '@');
  }
}

export function ensureDestinationSheet(
  spreadsheet: WritableSpreadsheetHandle,
  schema: KeyedDatasetSchemaSpec,
): WritableSheetHandle {
  const headers = getExpectedHeaders(schema);
  const existing = spreadsheet.getSheetByName(schema.tab);
  if (existing) {
    return existing;
  }

  const sheet = spreadsheet.insertSheet(schema.tab);
  const maxCols = sheet.getMaxColumns();
  if (maxCols < headers.length) {
    sheet.insertColumnsAfter(maxCols, headers.length - maxCols);
  }
  sheet.setValues(1, 1, [headers]);
  sheet.setFrozenRows(1);

  const textCols = getTextColumnIndices(schema);
  const formatRows = Math.max(1, sheet.getMaxRows() - 1);
  applyTextFormatsToRange(sheet, 2, formatRows, textCols);
  return sheet;
}

export function applyKeyedUpsertWrites(
  spreadsheet: WritableSpreadsheetHandle,
  schema: KeyedDatasetSchemaSpec,
  projectedRows: readonly ProjectedKeyedRowBase[],
  destState: DestinationState,
  runId: string,
  fetchedAtUtc: string,
  isExtendedReport: boolean,
): { insertedCount: number; updatedCount: number } {
  const sheet = ensureDestinationSheet(spreadsheet, schema);
  const textCols = getTextColumnIndices(schema);

  const updates: Array<{ rowNumber: number; values: CellScalar[] }> = [];
  const additions: CellScalar[][] = [];

  for (const row of projectedRows) {
    const existing = destState.byKey.get(row.key);
    if (!existing) {
      additions.push(buildSheetRowValues(row, runId, fetchedAtUtc, isExtendedReport));
    } else if (existing.rowDigest !== row.rowDigest) {
      updates.push({
        rowNumber: existing.rowNumber,
        values: buildSheetRowValues(row, runId, fetchedAtUtc, isExtendedReport),
      });
    }
  }

  updates.sort((a, b) => a.rowNumber - b.rowNumber);
  let idx = 0;
  while (idx < updates.length) {
    const startRow = updates[idx].rowNumber;
    const block: CellScalar[][] = [updates[idx].values];
    let nextIdx = idx + 1;
    while (nextIdx < updates.length && updates[nextIdx].rowNumber === startRow + block.length) {
      block.push(updates[nextIdx].values);
      nextIdx += 1;
    }
    applyTextFormatsToRange(sheet, startRow, block.length, textCols);
    sheet.setValues(startRow, 1, block);
    idx = nextIdx;
  }

  if (additions.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    const endRow = startRow + additions.length - 1;
    if (endRow > sheet.getMaxRows()) {
      sheet.insertRowsAfter(sheet.getMaxRows(), endRow - sheet.getMaxRows());
    }
    applyTextFormatsToRange(sheet, startRow, additions.length, textCols);
    sheet.setValues(startRow, 1, additions);
  }

  return { insertedCount: additions.length, updatedCount: updates.length };
}

function initializeSyncLogHeaders(sheet: WritableSheetHandle): void {
  if (sheet.getMaxColumns() < SYNC_LOG_HEADERS.length) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      SYNC_LOG_HEADERS.length - sheet.getMaxColumns(),
    );
  }
  sheet.setValues(1, 1, [[...SYNC_LOG_HEADERS]]);
  sheet.setFrozenRows(1);
  const formatRows = Math.max(1, sheet.getMaxRows() - 1);
  sheet.setNumberFormat(2, 1, formatRows, SYNC_LOG_TEXT_COLUMN_COUNT, '@');
}

function ensureSyncLogSheet(spreadsheet: WritableSpreadsheetHandle): WritableSheetHandle {
  const existing = spreadsheet.getSheetByName(SYNC_LOG_TAB);
  if (existing) {
    if (existing.getLastRow() === 0) {
      initializeSyncLogHeaders(existing);
    }
    return existing;
  }

  const sheet = spreadsheet.insertSheet(SYNC_LOG_TAB);
  initializeSyncLogHeaders(sheet);
  return sheet;
}

export function appendSyncLogStarted(
  spreadsheet: WritableSpreadsheetHandle,
  row: {
    runId: string;
    timestampUtc: string;
    env: AppEnvironment;
    endpoint: DatasetEndpoint;
    syncMode: string;
    previewDigest: string;
  },
): { sheet: WritableSheetHandle; rowNumber: number } {
  const sheet = ensureSyncLogSheet(spreadsheet);
  const rowNumber = sheet.getLastRow() + 1;
  if (rowNumber > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rowNumber - sheet.getMaxRows());
  }
  sheet.setNumberFormat(rowNumber, 1, 1, SYNC_LOG_TEXT_COLUMN_COUNT, '@');
  sheet.setValues(rowNumber, 1, [
    [
      row.runId,
      row.timestampUtc,
      row.env,
      row.endpoint,
      row.syncMode,
      'STARTED',
      row.previewDigest,
      0,
      0,
      0,
      0,
      false,
    ],
  ]);
  return { sheet, rowNumber };
}

export function updateSyncLogRow(
  sheet: WritableSheetHandle,
  rowNumber: number,
  row: {
    runId: string;
    timestampUtc: string;
    env: AppEnvironment;
    endpoint: DatasetEndpoint;
    syncMode: string;
    status: 'COMMITTED_VERIFIED' | 'FAILED_STOP';
    previewDigest: string;
    counts: DiffCounts;
    readbackVerified: boolean;
  },
): void {
  sheet.setValues(rowNumber, 1, [
    [
      row.runId,
      row.timestampUtc,
      row.env,
      row.endpoint,
      row.syncMode,
      row.status,
      row.previewDigest,
      row.counts.insert,
      row.counts.update,
      row.counts.unchanged,
      row.counts.review,
      row.readbackVerified,
    ],
  ]);
}

export function verifyDestinationReadback(
  spreadsheet: WritableSpreadsheetHandle,
  schema: KeyedDatasetSchemaSpec,
  projectedRows: readonly ProjectedKeyedRowBase[],
  previousDest: DestinationState,
  expectedTabsBefore: readonly string[],
  expectedInsertCount: number,
): ReadbackVerification {
  const tabsAfter = new Set(spreadsheet.getSheetNames());
  const unrelatedTabsPreserved = expectedTabsBefore.every((name) => tabsAfter.has(name));

  const readbackState = readDestinationState(spreadsheet, schema);
  if (!readbackState.ok || !readbackState.state.exists) {
    return {
      verified: false,
      destinationTab: schema.tab,
      expectedRowCount: previousDest.rows.length + expectedInsertCount,
      actualRowCount: 0,
      uniqueKeysVerified: false,
      rowDigestsVerified: false,
      unrelatedTabsPreserved,
      baselineTabsChecked: [...expectedTabsBefore],
      stagingTabCleaned: null,
    };
  }

  const dest = readbackState.state;
  const expectedRowCount = previousDest.rows.length + expectedInsertCount;
  const actualRowCount = dest.rows.length;
  const uniqueKeysVerified = dest.byKey.size === actualRowCount;

  let rowDigestsVerified = true;
  const incomingKeys = new Set<string>();

  for (const expectedRow of projectedRows) {
    incomingKeys.add(expectedRow.key);
    const stored = dest.byKey.get(expectedRow.key);
    if (!stored || stored.rowDigest !== expectedRow.rowDigest) {
      rowDigestsVerified = false;
      break;
    }
    for (let i = 0; i < schema.fields.length; i++) {
      const expectedCell = expectedRow.values[i] === null ? '' : expectedRow.values[i];
      const storedCell =
        stored.cells[i] === null || stored.cells[i] === undefined ? '' : stored.cells[i];
      if (storedCell !== expectedCell) {
        rowDigestsVerified = false;
        break;
      }
    }
    if (!rowDigestsVerified) break;
  }

  if (rowDigestsVerified) {
    for (const prev of previousDest.rows) {
      if (incomingKeys.has(prev.key)) continue;
      const stored = dest.byKey.get(prev.key);
      if (!stored || stored.rowDigest !== prev.rowDigest) {
        rowDigestsVerified = false;
        break;
      }
    }
  }

  return {
    verified:
      actualRowCount === expectedRowCount &&
      uniqueKeysVerified &&
      rowDigestsVerified &&
      unrelatedTabsPreserved,
    destinationTab: schema.tab,
    expectedRowCount,
    actualRowCount,
    uniqueKeysVerified,
    rowDigestsVerified,
    unrelatedTabsPreserved,
    baselineTabsChecked: [...expectedTabsBefore],
    stagingTabCleaned: null,
  };
}

/**
 * Shared post-verification Keyed Upsert write lifecycle:
 * records `_ThaiPHCSyncLog` (`STARTED`), applies Keyed Upsert, flushes, runs mandatory
 * Destination Readback, deletes optional `_Stage_*` ONLY after readback passes, and updates
 * `_ThaiPHCSyncLog` (`COMMITTED_VERIFIED` or `FAILED_STOP`); leaves `STARTED` + hidden
 * `_Stage_*` intact on `UNKNOWN_OUTCOME_STOP`.
 */
export function executeVerifiedKeyedWrite(params: {
  ctx: CommitTargetContext;
  spreadsheet: WritableSpreadsheetHandle;
  projectedRows: readonly ProjectedKeyedRowBase[];
  destState: DestinationState;
  expectedFp: PreviewFingerprint;
  diffCounts: DiffCounts;
  runId: string;
  nowUtc: string;
  stageTabName?: string | null;
  platform: SyncPlatform;
}): CommitDatasetResponse {
  const {
    ctx,
    spreadsheet,
    projectedRows,
    destState,
    expectedFp,
    diffCounts,
    runId,
    nowUtc,
    platform,
  } = params;
  const stageTabName = params.stageTabName ?? null;
  const descriptor = getDatasetDescriptor(ctx.endpoint);

  const tabsBefore = spreadsheet
    .getSheetNames()
    .filter((name) => (stageTabName ? name !== stageTabName : true));

  const startedLog = appendSyncLogStarted(spreadsheet, {
    runId,
    timestampUtc: nowUtc,
    env: ctx.env,
    endpoint: ctx.endpoint,
    syncMode: descriptor.syncMode,
    previewDigest: expectedFp.fingerprintDigest,
  });
  platform.flushSpreadsheet();

  try {
    const { insertedCount } = applyKeyedUpsertWrites(
      spreadsheet,
      ctx.schema,
      projectedRows,
      destState,
      runId,
      nowUtc,
      ctx.isExtendedReport,
    );
    platform.flushSpreadsheet();

    const readback = verifyDestinationReadback(
      spreadsheet,
      ctx.schema,
      projectedRows,
      destState,
      tabsBefore,
      insertedCount,
    );

    const completedAtUtc = platform.now().toISOString();
    if (!readback.verified) {
      updateSyncLogRow(startedLog.sheet, startedLog.rowNumber, {
        runId,
        timestampUtc: completedAtUtc,
        env: ctx.env,
        endpoint: ctx.endpoint,
        syncMode: descriptor.syncMode,
        status: 'FAILED_STOP',
        previewDigest: expectedFp.fingerprintDigest,
        counts: diffCounts,
        readbackVerified: false,
      });
      platform.flushSpreadsheet();

      return makeCommitStop(
        ctx,
        'READBACK_MISMATCH',
        stageTabName
          ? 'Destination Readback failed verification after write. Hidden staging tab has been retained for inspection.'
          : 'Destination Readback failed verification after write. Inspect destination Sheet immediately.',
        {
          status: 'FAILED_STOP',
          runId,
          syncLogStatus: 'FAILED_STOP',
          stagingTabRetained: stageTabName,
        },
      );
    }

    if (stageTabName) {
      const deleted = spreadsheet.deleteSheetByName(stageTabName);
      const stagingTabCleaned = deleted && !spreadsheet.getSheetByName(stageTabName);
      if (!stagingTabCleaned) {
        updateSyncLogRow(startedLog.sheet, startedLog.rowNumber, {
          runId,
          timestampUtc: completedAtUtc,
          env: ctx.env,
          endpoint: ctx.endpoint,
          syncMode: descriptor.syncMode,
          status: 'FAILED_STOP',
          previewDigest: expectedFp.fingerprintDigest,
          counts: diffCounts,
          readbackVerified: true,
        });
        platform.flushSpreadsheet();
        return makeCommitStop(
          ctx,
          'WRITE_FAILED_UNKNOWN',
          'Destination Readback succeeded, but temporary hidden staging tab could not be removed.',
          {
            status: 'UNKNOWN_OUTCOME_STOP',
            runId,
            syncLogStatus: 'FAILED_STOP',
            stagingTabRetained: stageTabName,
          },
        );
      }
      readback.stagingTabCleaned = true;
    }

    updateSyncLogRow(startedLog.sheet, startedLog.rowNumber, {
      runId,
      timestampUtc: completedAtUtc,
      env: ctx.env,
      endpoint: ctx.endpoint,
      syncMode: descriptor.syncMode,
      status: 'COMMITTED_VERIFIED',
      previewDigest: expectedFp.fingerprintDigest,
      counts: diffCounts,
      readbackVerified: true,
    });
    platform.flushSpreadsheet();

    return {
      ok: true,
      data: {
        status: 'COMMITTED_VERIFIED',
        runId,
        endpoint: ctx.endpoint,
        env: ctx.env,
        syncMode: descriptor.syncMode,
        destinationTab: ctx.schema.tab,
        completedAtUtc,
        counts: diffCounts,
        fingerprint: expectedFp,
        readback,
        syncLogStatus: 'COMMITTED_VERIFIED',
      },
    };
  } catch {
    const retained = stageTabName && spreadsheet.getSheetByName(stageTabName) ? stageTabName : null;
    return makeCommitStop(
      ctx,
      'WRITE_FAILED_UNKNOWN',
      stageTabName
        ? 'Sheet write or flush failed with an unknown outcome. Do not retry automatically; inspect the destination Sheet, hidden staging tab, and _ThaiPHCSyncLog.'
        : 'Sheet write or flush failed with an unknown outcome. Do not retry automatically; inspect the destination Sheet and _ThaiPHCSyncLog.',
      {
        status: 'UNKNOWN_OUTCOME_STOP',
        runId,
        syncLogStatus: 'STARTED',
        stagingTabRetained: retained,
      },
    );
  }
}
