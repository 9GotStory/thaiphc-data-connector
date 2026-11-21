import {
  getDatasetDescriptor,
  isReferenceEndpoint,
  KEYED_UPSERT_METADATA_COLUMNS,
  REFERENCE_SCHEMAS,
  SCHEMA_VERSION,
  SYNC_LOG_HEADERS,
  SYNC_LOG_TAB,
  SYNC_LOG_TEXT_COLUMN_COUNT,
  type ReferenceSchemaSpec,
} from './datasetCatalog.ts';
import {
  validateAndProjectReferenceRows,
  type ProjectedReferenceRow,
} from './referenceValidator.ts';
import {
  cellToString,
  isValidSpreadsheetId,
  parseEnvironment,
  readSyncLogLatestMap,
  toUnresolvedRunSummary,
} from './sheetConfig.ts';
import { fetchReferenceDataset, isValidBearerToken } from './thaiphcClient.ts';
import type {
  AppEnvironment,
  CommitSmallDatasetRequest,
  CommitSmallDatasetResponse,
  CommitStopCode,
  DatasetEndpoint,
  DiffCounts,
  PreviewDatasetRequest,
  PreviewDatasetResponse,
  PreviewDiagnostic,
  PreviewFingerprint,
  ReadbackVerification,
  ReferenceChangedField,
  ReferenceDatasetEndpoint,
  ReferencePreviewRow,
  ReviewReasonCode,
  StaleDriftReason,
  SyncPlatform,
  SyncRpcErrorCode,
  UnresolvedRunSummary,
  WritableSheetHandle,
  WritableSpreadsheetHandle,
} from './types.ts';

const MAX_DESTINATION_ROWS = 5000;
const LOCK_TIMEOUT_MS = 10000;

interface ExistingDestinationRow {
  rowNumber: number; // 1-based sheet row number
  key: string;
  rowDigest: string;
  cells: unknown[];
}

interface DestinationState {
  exists: boolean;
  headers: string[];
  rows: ExistingDestinationRow[];
  byKey: Map<string, ExistingDestinationRow>;
}

interface SyncLogSummary {
  latestRunId: string | null;
  latestStatus: string | null;
  unresolvedRun: UnresolvedRunSummary | null;
}

interface ValidatedBaseContext {
  endpoint: ReferenceDatasetEndpoint;
  env: AppEnvironment;
  spreadsheetId: string;
  schema: ReferenceSchemaSpec;
}

function previewRpcError(code: SyncRpcErrorCode, message: string): PreviewDatasetResponse {
  return { ok: false, error: { code, message } };
}

function commitRpcError(code: SyncRpcErrorCode, message: string): CommitSmallDatasetResponse {
  return { ok: false, error: { code, message } };
}

function validateBaseRequest(
  request: { endpoint?: unknown; token?: unknown } | null | undefined,
  platform: SyncPlatform,
  missingMsg: string,
  unsupportedMsg: string,
):
  { ok: true; ctx: ValidatedBaseContext } | { ok: false; code: SyncRpcErrorCode; message: string } {
  if (!request || typeof request !== 'object') {
    return { ok: false, code: 'INVALID_REQUEST', message: missingMsg };
  }
  if (typeof request.endpoint !== 'string' || !isReferenceEndpoint(request.endpoint)) {
    return { ok: false, code: 'DATASET_NOT_SUPPORTED', message: unsupportedMsg };
  }
  if (!isValidBearerToken(request.token)) {
    return {
      ok: false,
      code: 'INVALID_TOKEN_FORMAT',
      message:
        'Bearer Token format is invalid; provide only the raw token without the Bearer prefix.',
    };
  }
  const env = parseEnvironment(platform.getProperty('THAIPHC_ENV'));
  if (!env) {
    return {
      ok: false,
      code: 'INVALID_ENV_CONFIG',
      message: 'THAIPHC_ENV must be configured as SANDBOX or PRODUCTION in Script Properties.',
    };
  }
  const spreadsheetId = platform.getProperty('THAIPHC_SPREADSHEET_ID');
  if (!isValidSpreadsheetId(spreadsheetId)) {
    return {
      ok: false,
      code: 'SPREADSHEET_NOT_CONFIGURED',
      message: 'THAIPHC_SPREADSHEET_ID is missing or invalid in Script Properties.',
    };
  }
  return {
    ok: true,
    ctx: {
      endpoint: request.endpoint,
      env,
      spreadsheetId,
      schema: REFERENCE_SCHEMAS[request.endpoint],
    },
  };
}

function getExpectedHeaders(schema: ReferenceSchemaSpec): string[] {
  return [...schema.fields.map((f) => f.name), ...KEYED_UPSERT_METADATA_COLUMNS];
}

function getTextColumnIndices(schema: ReferenceSchemaSpec): number[] {
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

function readDestinationState(
  spreadsheet: WritableSpreadsheetHandle,
  schema: ReferenceSchemaSpec,
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
        message: `Destination tab "${schema.tab}" headers do not match the expected 111-row baseline schema.`,
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

function readEndpointSyncLogSummary(
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

function computeSheetRevisionFingerprint(
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

function computePreviewFingerprint(
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

function formatPreviewValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const str = typeof value === 'string' ? value : String(value);
  return str.length > 120 ? `${str.slice(0, 117)}...` : str;
}

function buildSummaryFields(
  schema: ReferenceSchemaSpec,
  row: ProjectedReferenceRow,
): Array<{ field: string; value: string }> {
  const out: Array<{ field: string; value: string }> = [];
  for (const fieldName of schema.summaryFieldNames) {
    const idx = schema.fields.findIndex((f) => f.name === fieldName);
    if (idx !== -1) {
      out.push({ field: fieldName, value: formatPreviewValue(row.values[idx]) });
    }
  }
  return out;
}

function computeChangedFields(
  schema: ReferenceSchemaSpec,
  existing: ExistingDestinationRow,
  incoming: ProjectedReferenceRow,
): ReferenceChangedField[] {
  const changed: ReferenceChangedField[] = [];
  for (let i = 0; i < schema.fields.length; i++) {
    const incomingCell = incoming.values[i] === null ? '' : incoming.values[i];
    const existingCell =
      existing.cells[i] === null || existing.cells[i] === undefined ? '' : existing.cells[i];
    if (String(existingCell) !== String(incomingCell)) {
      changed.push({
        field: schema.fields[i].name,
        before: formatPreviewValue(existingCell),
        after: formatPreviewValue(incomingCell),
      });
    }
  }
  return changed;
}

function computeReferenceDiff(
  schema: ReferenceSchemaSpec,
  projectedRows: readonly ProjectedReferenceRow[],
  dest: DestinationState,
): {
  counts: DiffCounts;
  reviewBreakdown: Partial<Record<ReviewReasonCode, number>>;
  sampleRows: ReferencePreviewRow[];
  missingKeys: string[];
} {
  let insert = 0;
  let update = 0;
  let unchanged = 0;
  let placeholderCoords = 0;
  const incomingKeys = new Set<string>();
  const sampleRows: ReferencePreviewRow[] = [];

  for (const row of projectedRows) {
    incomingKeys.add(row.key);
    const existing = dest.byKey.get(row.key);
    if (row.reviewReasons.includes('PLACEHOLDER_COORDS')) {
      placeholderCoords += 1;
    }

    if (!existing) {
      insert += 1;
      sampleRows.push({
        diffKind: 'INSERT',
        sourceKey: row.key,
        displayName: row.displayName,
        displayCode: row.displayCode,
        changedFields: [],
        summaryFields: buildSummaryFields(schema, row),
        reviewReasons: [...row.reviewReasons],
      });
    } else if (existing.rowDigest === row.rowDigest) {
      unchanged += 1;
      sampleRows.push({
        diffKind: 'UNCHANGED',
        sourceKey: row.key,
        displayName: row.displayName,
        displayCode: row.displayCode,
        changedFields: [],
        summaryFields: buildSummaryFields(schema, row),
        reviewReasons: [...row.reviewReasons],
      });
    } else {
      update += 1;
      sampleRows.push({
        diffKind: 'UPDATE',
        sourceKey: row.key,
        displayName: row.displayName,
        displayCode: row.displayCode,
        changedFields: computeChangedFields(schema, existing, row),
        summaryFields: buildSummaryFields(schema, row),
        reviewReasons: [...row.reviewReasons],
      });
    }
  }

  const nameFieldIdx = schema.fields.findIndex((f) => f.name === schema.displayNameField);
  const missingKeys: string[] = [];
  for (const existing of dest.rows) {
    if (!incomingKeys.has(existing.key)) {
      missingKeys.push(existing.key);
      const existingName = nameFieldIdx >= 0 ? cellToString(existing.cells[nameFieldIdx]) : '';
      sampleRows.push({
        diffKind: 'REVIEW',
        sourceKey: existing.key,
        displayName: existingName || existing.key,
        displayCode: existing.key,
        changedFields: [],
        summaryFields: [],
        reviewReasons: ['MISSING_IN_SOURCE'],
      });
    }
  }

  const reviewBreakdown: Partial<Record<ReviewReasonCode, number>> = {};
  if (missingKeys.length > 0) {
    reviewBreakdown.MISSING_IN_SOURCE = missingKeys.length;
  }
  if (placeholderCoords > 0) {
    reviewBreakdown.PLACEHOLDER_COORDS = placeholderCoords;
  }

  return {
    counts: {
      insert,
      update,
      unchanged,
      review: missingKeys.length + placeholderCoords,
    },
    reviewBreakdown,
    sampleRows,
    missingKeys,
  };
}

function buildSheetRowValues(
  row: ProjectedReferenceRow,
  runId: string,
  fetchedAtUtc: string,
): Array<string | number> {
  const sourceCells = row.values.map((v) => (v === null ? '' : v));
  return [
    ...sourceCells,
    SCHEMA_VERSION,
    runId,
    row.key,
    fetchedAtUtc,
    'VALID',
    JSON.stringify(row.presence),
    runId,
    row.rowDigest,
  ];
}

function applyTextFormatsToRange(
  sheet: WritableSheetHandle,
  startRow: number,
  numRows: number,
  textCols: readonly number[],
): void {
  for (const col of textCols) {
    sheet.setNumberFormat(startRow, col, numRows, 1, '@');
  }
}

function ensureDestinationSheet(
  spreadsheet: WritableSpreadsheetHandle,
  schema: ReferenceSchemaSpec,
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

function appendSyncLogStarted(
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

function updateSyncLogRow(
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

function verifyDestinationReadback(
  spreadsheet: WritableSpreadsheetHandle,
  schema: ReferenceSchemaSpec,
  projectedRows: readonly ProjectedReferenceRow[],
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

function makeBlockedPreview(
  ctx: ValidatedBaseContext,
  previewedAtUtc: string,
  pagesFetched: number,
  diagnostics: PreviewDiagnostic[],
  unresolvedPreviousRun: UnresolvedRunSummary | null,
): PreviewDatasetResponse {
  const descriptor = getDatasetDescriptor(ctx.endpoint);
  return {
    ok: true,
    data: {
      status: 'STOP_BLOCKED',
      endpoint: ctx.endpoint,
      env: ctx.env,
      syncMode: descriptor.syncMode,
      paginationProtocol: descriptor.paginationProtocol,
      destinationTab: ctx.schema.tab,
      previewedAtUtc,
      pagesFetched,
      diagnostics,
      unresolvedPreviousRun,
    },
  };
}

function makeCommitStop(
  endpoint: DatasetEndpoint,
  env: AppEnvironment,
  destinationTab: string,
  stopCode: CommitStopCode,
  message: string,
  opts: {
    status?: 'FAILED_STOP' | 'UNKNOWN_OUTCOME_STOP';
    runId?: string | null;
    syncLogStatus?: 'STARTED' | 'FAILED_STOP' | 'NOT_WRITTEN';
  } = {},
): CommitSmallDatasetResponse {
  return {
    ok: true,
    data: {
      status: opts.status ?? 'FAILED_STOP',
      runId: opts.runId ?? null,
      endpoint,
      env,
      destinationTab,
      stopCode,
      message,
      syncLogStatus: opts.syncLogStatus ?? 'NOT_WRITTEN',
      stagingTabRetained: null,
    },
  };
}

export function previewDatasetWithPlatform(
  request: PreviewDatasetRequest,
  platform: SyncPlatform,
): PreviewDatasetResponse {
  try {
    const base = validateBaseRequest(
      request,
      platform,
      'Preview request payload is required.',
      'Preview is currently enabled for Reference Datasets (subdistricts, villages, health-services).',
    );
    if (!base.ok) {
      return previewRpcError(base.code, base.message);
    }
    const { ctx } = base;

    let spreadsheet: WritableSpreadsheetHandle;
    try {
      spreadsheet = platform.openSpreadsheetById(ctx.spreadsheetId);
    } catch {
      return previewRpcError(
        'WORKBOOK_ACCESS_FAILED',
        'Unable to open the configured reference Google Sheets workbook.',
      );
    }

    const descriptor = getDatasetDescriptor(ctx.endpoint);
    const previewedAtUtc = platform.now().toISOString();
    const logSummary = readEndpointSyncLogSummary(spreadsheet, ctx.endpoint);

    const fetchResult = fetchReferenceDataset(
      ctx.endpoint,
      request.token,
      platform.fetchUrl,
      request.pageSize,
    );
    if (!fetchResult.ok) {
      if (fetchResult.authFailed) {
        return previewRpcError('HTTP_401', fetchResult.message);
      }
      return makeBlockedPreview(
        ctx,
        previewedAtUtc,
        fetchResult.pagesFetched,
        [
          {
            code: fetchResult.code,
            message: fetchResult.message,
            pageOffset: fetchResult.pageOffset,
          },
        ],
        logSummary.unresolvedRun,
      );
    }

    const validation = validateAndProjectReferenceRows(
      ctx.endpoint,
      fetchResult.items,
      platform.sha256Hex,
    );
    if (!validation.ok) {
      return makeBlockedPreview(
        ctx,
        previewedAtUtc,
        fetchResult.pagesFetched,
        validation.diagnostics,
        logSummary.unresolvedRun,
      );
    }

    const destResult = readDestinationState(spreadsheet, ctx.schema);
    if (!destResult.ok) {
      return makeBlockedPreview(
        ctx,
        previewedAtUtc,
        fetchResult.pagesFetched,
        [destResult.diagnostic],
        logSummary.unresolvedRun,
      );
    }

    const diff = computeReferenceDiff(ctx.schema, validation.rows, destResult.state);
    const sheetRevisionFingerprint = computeSheetRevisionFingerprint(
      destResult.state,
      logSummary,
      platform.sha256Hex,
    );
    const fingerprint = computePreviewFingerprint(
      ctx.endpoint,
      ctx.env,
      fetchResult.sourceTotal,
      validation.datasetDigest,
      sheetRevisionFingerprint,
      diff.counts,
      platform.sha256Hex,
    );

    const writeEnabled = platform.getProperty('THAIPHC_WRITE_ENABLED') === 'true';

    return {
      ok: true,
      data: {
        status: 'READY',
        endpoint: ctx.endpoint,
        env: ctx.env,
        syncMode: descriptor.syncMode,
        paginationProtocol: descriptor.paginationProtocol,
        destinationTab: ctx.schema.tab,
        previewedAtUtc,
        pagesFetched: fetchResult.pagesFetched,
        sourceTotal: fetchResult.sourceTotal,
        fingerprint,
        counts: diff.counts,
        reviewBreakdown: diff.reviewBreakdown,
        unresolvedPreviousRun: logSummary.unresolvedRun,
        legacySnapshotPresent: false,
        legacySnapshotTab: null,
        writeAllowed: writeEnabled,
        blockedGuardReason: writeEnabled ? null : 'THAIPHC_WRITE_ENABLED',
        previewMode: 'REFERENCE_READABLE',
        sampleRows: diff.sampleRows,
      },
    };
  } catch {
    return previewRpcError('PREVIEW_FAILED', 'Failed to complete read-only dataset preview.');
  }
}

export function commitSmallDatasetWithPlatform(
  request: CommitSmallDatasetRequest,
  platform: SyncPlatform,
): CommitSmallDatasetResponse {
  try {
    const base = validateBaseRequest(
      request,
      platform,
      'Commit request payload is required.',
      'Commit is currently enabled for Reference Datasets (subdistricts, villages, health-services).',
    );
    if (!base.ok) {
      return commitRpcError(base.code, base.message);
    }
    const { ctx } = base;
    const descriptor = getDatasetDescriptor(ctx.endpoint);

    const expectedFp = request.expectedFingerprint;
    if (
      !expectedFp ||
      typeof expectedFp !== 'object' ||
      expectedFp.endpoint !== ctx.endpoint ||
      (expectedFp.env !== 'SANDBOX' && expectedFp.env !== 'PRODUCTION') ||
      !Number.isSafeInteger(expectedFp.sourceTotal) ||
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
      return makeCommitStop(
        ctx.endpoint,
        ctx.env,
        ctx.schema.tab,
        'INVALID_FINGERPRINT',
        'Preview Fingerprint is missing or malformed. Run a fresh Preview first.',
      );
    }

    const recomputedExpected = computePreviewFingerprint(
      expectedFp.endpoint,
      expectedFp.env,
      expectedFp.sourceTotal,
      expectedFp.datasetDigest,
      expectedFp.sheetRevisionFingerprint,
      expectedFp.counts,
      platform.sha256Hex,
    );
    if (recomputedExpected.fingerprintDigest !== expectedFp.fingerprintDigest) {
      return makeCommitStop(
        ctx.endpoint,
        ctx.env,
        ctx.schema.tab,
        'INVALID_FINGERPRINT',
        'Preview Fingerprint integrity check failed. Run a fresh Preview before committing.',
      );
    }

    if (platform.getProperty('THAIPHC_WRITE_ENABLED') !== 'true') {
      return makeCommitStop(
        ctx.endpoint,
        ctx.env,
        ctx.schema.tab,
        'WRITE_DISABLED',
        'THAIPHC_WRITE_ENABLED is OFF in Google Apps Script Properties. Commit rejected.',
      );
    }

    if (ctx.env === 'PRODUCTION') {
      const expectedPhrase = `PRODUCTION 5406 ${ctx.endpoint}`;
      if (request.confirmationPhrase !== expectedPhrase) {
        return makeCommitStop(
          ctx.endpoint,
          ctx.env,
          ctx.schema.tab,
          'PRODUCTION_CONFIRMATION_REQUIRED',
          `Production commit requires exact confirmation phrase "${expectedPhrase}".`,
        );
      }
    }

    if (expectedFp.env !== ctx.env) {
      return {
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
      };
    }

    const lock = platform.tryScriptLock(LOCK_TIMEOUT_MS);
    if (!lock) {
      return makeCommitStop(
        ctx.endpoint,
        ctx.env,
        ctx.schema.tab,
        'LOCK_BUSY',
        'Another synchronization is currently holding Script Lock. Inspect destination before running a fresh Preview.',
      );
    }

    try {
      if (platform.getProperty('THAIPHC_WRITE_ENABLED') !== 'true') {
        return makeCommitStop(
          ctx.endpoint,
          ctx.env,
          ctx.schema.tab,
          'WRITE_DISABLED',
          'THAIPHC_WRITE_ENABLED is OFF in Google Apps Script Properties. Commit rejected.',
        );
      }

      let spreadsheet: WritableSpreadsheetHandle;
      try {
        spreadsheet = platform.openSpreadsheetById(ctx.spreadsheetId);
      } catch {
        return commitRpcError(
          'WORKBOOK_ACCESS_FAILED',
          'Unable to open the configured reference Google Sheets workbook.',
        );
      }

      const logSummary = readEndpointSyncLogSummary(spreadsheet, ctx.endpoint);
      if (
        logSummary.unresolvedRun &&
        request.acknowledgeUnresolvedRunId !== logSummary.unresolvedRun.runId
      ) {
        return makeCommitStop(
          ctx.endpoint,
          ctx.env,
          ctx.schema.tab,
          'UNRESOLVED_PREVIOUS_RUN',
          `Dataset "${ctx.endpoint}" has an unresolved previous run (${logSummary.unresolvedRun.runId}). Inspect destination Sheet and acknowledge before committing.`,
        );
      }

      const fetchResult = fetchReferenceDataset(
        ctx.endpoint,
        request.token,
        platform.fetchUrl,
        request.pageSize,
      );
      if (!fetchResult.ok) {
        if (fetchResult.authFailed) {
          return commitRpcError('HTTP_401', fetchResult.message);
        }
        return makeCommitStop(
          ctx.endpoint,
          ctx.env,
          ctx.schema.tab,
          fetchResult.code,
          fetchResult.message,
        );
      }

      const validation = validateAndProjectReferenceRows(
        ctx.endpoint,
        fetchResult.items,
        platform.sha256Hex,
      );
      if (!validation.ok) {
        const first = validation.diagnostics[0];
        return makeCommitStop(
          ctx.endpoint,
          ctx.env,
          ctx.schema.tab,
          first?.code ?? 'TYPE_MISMATCH',
          first?.message ?? 'Re-fetched source dataset failed schema validation.',
        );
      }

      const destResult = readDestinationState(spreadsheet, ctx.schema);
      if (!destResult.ok) {
        return makeCommitStop(
          ctx.endpoint,
          ctx.env,
          ctx.schema.tab,
          destResult.diagnostic.code,
          destResult.diagnostic.message,
        );
      }

      const currentSheetRevision = computeSheetRevisionFingerprint(
        destResult.state,
        logSummary,
        platform.sha256Hex,
      );
      const sourceChanged =
        fetchResult.sourceTotal !== expectedFp.sourceTotal ||
        validation.datasetDigest !== expectedFp.datasetDigest;
      const destChanged = currentSheetRevision !== expectedFp.sheetRevisionFingerprint;

      if (sourceChanged || destChanged) {
        const driftReason: StaleDriftReason =
          sourceChanged && destChanged
            ? 'BOTH_CHANGED'
            : sourceChanged
              ? 'SOURCE_CHANGED'
              : 'DESTINATION_CHANGED';
        return {
          ok: true,
          data: {
            status: 'PREVIEW_STALE_RECONFIRM_REQUIRED',
            endpoint: ctx.endpoint,
            env: ctx.env,
            destinationTab: ctx.schema.tab,
            driftReason,
            expectedFingerprint: expectedFp,
            currentSourceTotal: fetchResult.sourceTotal,
            currentDatasetDigest: validation.datasetDigest,
            currentSheetRevisionFingerprint: currentSheetRevision,
          },
        };
      }

      const diff = computeReferenceDiff(ctx.schema, validation.rows, destResult.state);
      const now = platform.now();
      const nowUtc = now.toISOString();
      const runId = platform.generateRunId(ctx.endpoint, now);
      const tabsBefore = spreadsheet.getSheetNames();

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
        const sheet = ensureDestinationSheet(spreadsheet, ctx.schema);
        const textCols = getTextColumnIndices(ctx.schema);

        const updates: Array<{ rowNumber: number; values: Array<string | number> }> = [];
        const additions: Array<Array<string | number>> = [];

        for (const row of validation.rows) {
          const existing = destResult.state.byKey.get(row.key);
          if (!existing) {
            additions.push(buildSheetRowValues(row, runId, nowUtc));
          } else if (existing.rowDigest !== row.rowDigest) {
            updates.push({
              rowNumber: existing.rowNumber,
              values: buildSheetRowValues(row, runId, nowUtc),
            });
          }
        }

        updates.sort((a, b) => a.rowNumber - b.rowNumber);
        let idx = 0;
        while (idx < updates.length) {
          const startRow = updates[idx].rowNumber;
          const block: Array<Array<string | number>> = [updates[idx].values];
          let nextIdx = idx + 1;
          while (
            nextIdx < updates.length &&
            updates[nextIdx].rowNumber === startRow + block.length
          ) {
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

        platform.flushSpreadsheet();

        const readback = verifyDestinationReadback(
          spreadsheet,
          ctx.schema,
          validation.rows,
          destResult.state,
          tabsBefore,
          additions.length,
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
            counts: diff.counts,
            readbackVerified: false,
          });
          platform.flushSpreadsheet();

          return makeCommitStop(
            ctx.endpoint,
            ctx.env,
            ctx.schema.tab,
            'READBACK_MISMATCH',
            'Destination Readback failed verification after write. Inspect destination Sheet immediately.',
            { status: 'FAILED_STOP', runId, syncLogStatus: 'FAILED_STOP' },
          );
        }

        updateSyncLogRow(startedLog.sheet, startedLog.rowNumber, {
          runId,
          timestampUtc: completedAtUtc,
          env: ctx.env,
          endpoint: ctx.endpoint,
          syncMode: descriptor.syncMode,
          status: 'COMMITTED_VERIFIED',
          previewDigest: expectedFp.fingerprintDigest,
          counts: diff.counts,
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
            counts: diff.counts,
            fingerprint: expectedFp,
            readback,
            syncLogStatus: 'COMMITTED_VERIFIED',
          },
        };
      } catch {
        return makeCommitStop(
          ctx.endpoint,
          ctx.env,
          ctx.schema.tab,
          'WRITE_FAILED_UNKNOWN',
          'Sheet write or flush failed with an unknown outcome. Do not retry automatically; inspect the destination Sheet and _ThaiPHCSyncLog.',
          { status: 'UNKNOWN_OUTCOME_STOP', runId, syncLogStatus: 'STARTED' },
        );
      }
    } finally {
      try {
        lock.releaseLock();
      } catch {
        // Ignore lock release failures in finally
      }
    }
  } catch {
    return commitRpcError('COMMIT_FAILED', 'Commit failed unexpectedly before completion.');
  }
}
