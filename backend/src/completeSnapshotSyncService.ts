import {
  assertSafeString,
  computeDatasetDigest,
  hasOwn,
  isPlainObject,
  type FieldPresence,
} from './cellValidation.ts';
import {
  buildFamilyPreviewRowKey,
  buildFamilySnapshotRowKey,
  buildFamilySnapshotTabName,
  FAMILY_PREVIEW_KEY_PATTERN,
  getDatasetDescriptor,
  REPORT_CURRENT_HEADERS,
  REPORT_CURRENT_TAB,
  REPORT_CURRENT_TEXT_COLUMN_INDICES,
  RUN_ID_PATTERN,
  VOLUNTEER_FAMILY_SCHEMA,
} from './datasetCatalog.ts';
import {
  hasLowerLevelLocalityMismatch,
  mergeAggregateSummary,
  validateAndProjectVolunteerFamilyRows,
} from './extendedReportProjection.ts';
import {
  appendSyncLogStarted,
  applyTextFormatsToRange,
  computePreviewFingerprint,
  evaluateWriteGuards,
  makeCommitStop,
  readEndpointSyncLogSummary,
  resolveTargetSpreadsheetId,
  updateSyncLogRow,
  validateCommitPreLock,
  withLockedCommitWorkbook,
  type CellScalar,
  type SyncLogSummary,
} from './keyedSyncCore.ts';
import { SHA256_HEX_PATTERN } from './pseudonymizer.ts';
import {
  isValidSpreadsheetId,
  parseEnvironment,
  readReportCurrentState,
  type ReportCurrentSheetState,
} from './sheetConfig.ts';
import { computeChunkDigest, MAX_STAGING_TAB_NAME_LENGTH } from './stagingSheetStorage.ts';
import {
  DEFAULT_PAGE_SIZE,
  fetchVolunteerFamilyBatch,
  isValidBearerToken,
} from './thaiphcClient.ts';
import type {
  AppEnvironment,
  CommitDatasetResponse,
  ExtendedMinimizedPreviewRow,
  ExtendedSampleCandidate,
  FinalizeLargeDatasetCommitRequest,
  FinalizePreviewRequest,
  PreviewDatasetBatchRequest,
  PreviewDatasetBatchResponse,
  PreviewDatasetResponse,
  PreviewDiagnostic,
  ReadbackVerification,
  ReviewReasonCode,
  StageLargeDatasetBatchRequest,
  StageLargeDatasetBatchResponse,
  StaleDriftReason,
  SyncPlatform,
  SyncRpcErrorCode,
  UnresolvedRunSummary,
  WritableSheetHandle,
  WritableSpreadsheetHandle,
} from './types.ts';

const MAX_SAMPLE_CANDIDATES_PER_BATCH = 25;
const MAX_FINAL_PREVIEW_SAMPLES = 50;
const FAMILY_SNAPSHOT_PROTOCOL_VERSION = 'THAIPHC_FAMILY_SNAPSHOT_V1';
const FAMILY_IDENTITY_STRATEGY = 'RUN_SCOPED_SNAPSHOT_ORDINAL_NO_UPSERT';

interface FamilySnapshotMetadata {
  version: typeof FAMILY_SNAPSHOT_PROTOCOL_VERSION;
  endpoint: 'volunteer-family';
  env: AppEnvironment;
  runId: string;
  expectedFingerprintDigest: string;
  expectedSourceTotal: number;
  expectedDatasetDigest: string;
  expectedSheetRevisionFingerprint: string;
  pageSize: number;
  lastPageStaged: number;
  totalPages: number;
  stagedRowCount: number;
  chunkDigests: string[];
  status: 'STAGING' | 'PUBLISHED';
  manifestDigest?: string;
  publishedAtUtc?: string;
}

export interface ValidatedFamilyContext {
  endpoint: 'volunteer-family';
  isExtendedReport: true;
  env: AppEnvironment;
  referenceSpreadsheetId: string;
  schema: typeof VOLUNTEER_FAMILY_SCHEMA;
}

export function validateFamilyContext(
  platform: SyncPlatform,
):
  | { ok: true; ctx: ValidatedFamilyContext }
  | { ok: false; code: SyncRpcErrorCode; message: string } {
  const env = parseEnvironment(platform.getProperty('THAIPHC_ENV'));
  if (!env) {
    return {
      ok: false,
      code: 'INVALID_ENV_CONFIG',
      message: 'THAIPHC_ENV must be configured as SANDBOX or PRODUCTION in Script Properties.',
    };
  }
  const referenceSpreadsheetId = platform.getProperty('THAIPHC_SPREADSHEET_ID');
  if (!isValidSpreadsheetId(referenceSpreadsheetId)) {
    return {
      ok: false,
      code: 'SPREADSHEET_NOT_CONFIGURED',
      message: 'THAIPHC_SPREADSHEET_ID is missing or invalid in Script Properties.',
    };
  }
  return {
    ok: true,
    ctx: {
      endpoint: 'volunteer-family',
      isExtendedReport: true,
      env,
      referenceSpreadsheetId,
      schema: VOLUNTEER_FAMILY_SCHEMA,
    },
  };
}

export function computeCompleteSnapshotRevisionFingerprint(
  spreadsheet: WritableSpreadsheetHandle,
  pointerState: ReportCurrentSheetState,
  logSummary: SyncLogSummary,
  sha256Hex: (input: string) => string,
): string {
  const pointer = pointerState.pointers.get('volunteer-family');
  const activeSheet = pointer ? spreadsheet.getSheetByName(pointer.snapshotSheet) : null;
  const payload = {
    mode: 'COMPLETE_SNAPSHOT',
    pointerTabExists: pointerState.exists,
    activePointer: pointer
      ? {
          runId: pointer.runId,
          snapshotSheet: pointer.snapshotSheet,
          rowCount: pointer.rowCount,
          manifestDigest: pointer.manifestDigest,
          targetTabExists: activeSheet !== null,
          targetTabLastRow: activeSheet ? activeSheet.getLastRow() : null,
        }
      : null,
    latestRunId: logSummary.latestRunId,
    latestStatus: logSummary.latestStatus,
  };
  return sha256Hex(JSON.stringify(payload));
}

function makeBlockedFamilyFinalizePreview(
  ctx: ValidatedFamilyContext,
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

function selectFamilyPreviewSamples(
  candidates: readonly ExtendedSampleCandidate[],
  reviewReasonsByKey: ReadonlyMap<string, readonly ReviewReasonCode[]>,
): ExtendedMinimizedPreviewRow[] {
  const reviewRows: ExtendedMinimizedPreviewRow[] = [];
  const normalRows: ExtendedMinimizedPreviewRow[] = [];
  const seen = new Set<string>();

  for (const cand of candidates) {
    if (
      !cand ||
      typeof cand.sourceKey !== 'string' ||
      !FAMILY_PREVIEW_KEY_PATTERN.test(cand.sourceKey) ||
      seen.has(cand.sourceKey)
    ) {
      continue;
    }
    seen.add(cand.sourceKey);
    const verifiedReasons = [...(reviewReasonsByKey.get(cand.sourceKey) ?? [])];
    const row: ExtendedMinimizedPreviewRow = {
      diffKind: 'INSERT',
      sourceKey: cand.sourceKey,
      scopeLabel: typeof cand.scopeLabel === 'string' ? cand.scopeLabel : '54 / 5406',
      minimizedAttributes: Array.isArray(cand.minimizedAttributes)
        ? cand.minimizedAttributes.filter(
            (a) =>
              a && typeof a.field === 'string' && (a.value === null || typeof a.value === 'string'),
          )
        : [],
      reviewReasons: verifiedReasons,
    };
    if (verifiedReasons.length > 0) reviewRows.push(row);
    else normalRows.push(row);
  }

  return [...reviewRows, ...normalRows].slice(0, MAX_FINAL_PREVIEW_SAMPLES);
}

/**
 * Stateless, read-only Batched Preview step for `volunteer-family` (Complete Snapshot):
 * - Zero Google Sheets writes and zero CacheService/PropertiesService writes.
 * - Strips all 9 RESTRICTED_DEFAULT_OMIT direct identifiers server-side.
 * - Uses deterministic preview ordinal keys (`snapshot_preview_NNNNN`); never requires HMAC key.
 * - Preserves source locality on lower-level subdistrict/village mismatches (`LOCALITY_MISMATCH`).
 */
export function previewVolunteerFamilyBatchWithPlatform(
  request: PreviewDatasetBatchRequest,
  platform: SyncPlatform,
): PreviewDatasetBatchResponse {
  try {
    const base = validateFamilyContext(platform);
    if (!base.ok) {
      return { ok: false, error: { code: base.code, message: base.message } };
    }
    const { ctx } = base;

    if (!isValidBearerToken(request.token)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_TOKEN_FORMAT',
          message:
            'Bearer Token format is invalid; provide only the raw token without the Bearer prefix.',
        },
      };
    }

    const effectivePageSize =
      request.pageSize !== undefined &&
      Number.isSafeInteger(request.pageSize) &&
      request.pageSize >= 1 &&
      request.pageSize <= 100
        ? request.pageSize
        : DEFAULT_PAGE_SIZE;

    const fetchResult = fetchVolunteerFamilyBatch({
      token: request.token,
      fetchUrl: platform.fetchUrl,
      startPage: request.startPage,
      batchPages: request.batchPages,
      pageSize: effectivePageSize,
      expectedSourceTotal: request.expectedSourceTotal ?? null,
      maxRows: ctx.schema.maxRows,
    });
    if (!fetchResult.ok) {
      if (fetchResult.authFailed) {
        return { ok: false, error: { code: 'HTTP_401', message: fetchResult.message } };
      }
      return {
        ok: true,
        data: {
          status: 'STOP_BLOCKED',
          endpoint: ctx.endpoint,
          env: ctx.env,
          pagesFetchedInBatch: fetchResult.pagesFetchedInBatch,
          diagnostics: [
            {
              code: fetchResult.code,
              message: fetchResult.message,
              pageOffset: fetchResult.pageOffset,
            },
          ],
        },
      };
    }

    const rowIndexOffset = (fetchResult.startPage - 1) * effectivePageSize;
    const projected = validateAndProjectVolunteerFamilyRows(
      fetchResult.items,
      platform.sha256Hex,
      buildFamilyPreviewRowKey,
      rowIndexOffset,
    );
    if (!projected.ok) {
      return {
        ok: true,
        data: {
          status: 'STOP_BLOCKED',
          endpoint: ctx.endpoint,
          env: ctx.env,
          pagesFetchedInBatch: fetchResult.pagesFetchedInBatch,
          diagnostics: projected.diagnostics,
        },
      };
    }

    const rowDigests = projected.rows.map((r) =>
      r.reviewReasons.length > 0
        ? { key: r.key, rowDigest: r.rowDigest, reviewReasons: r.reviewReasons }
        : { key: r.key, rowDigest: r.rowDigest },
    );

    const prioritizedBatchRows = [
      ...projected.rows.filter((r) => r.reviewReasons.length > 0),
      ...projected.rows.filter((r) => r.reviewReasons.length === 0),
    ];
    const sampleCandidates: ExtendedSampleCandidate[] = prioritizedBatchRows
      .slice(0, MAX_SAMPLE_CANDIDATES_PER_BATCH)
      .map((r) => ({
        sourceKey: r.key,
        rowDigest: r.rowDigest,
        scopeLabel: r.scopeLabel,
        minimizedAttributes: r.minimizedAttributes,
        reviewReasons: r.reviewReasons,
      }));

    return {
      ok: true,
      data: {
        status: 'BATCH_OK',
        endpoint: ctx.endpoint,
        env: ctx.env,
        startPage: fetchResult.startPage,
        lastPageFetched: fetchResult.lastPageFetched,
        pagesFetchedInBatch: fetchResult.pagesFetchedInBatch,
        totalPages: fetchResult.totalPages,
        sourceTotal: fetchResult.sourceTotal,
        rowsInBatch: projected.rows.length,
        hasMore: fetchResult.hasMore,
        nextPage: fetchResult.nextPage,
        rowDigests,
        aggregateSummary: projected.aggregateSummary,
        sampleCandidates,
      },
    };
  } catch {
    return {
      ok: false,
      error: { code: 'PREVIEW_FAILED', message: 'Failed to complete batched dataset preview.' },
    };
  }
}

/**
 * Stateless, read-only Finalize Preview step for `volunteer-family` (Complete Snapshot):
 * - Zero Google Sheets writes.
 * - Verifies exact contiguous ordinal sequence (`snapshot_preview_00001..NNNNN`) and row digests.
 * - Computes deterministic `PreviewFingerprint` capturing `sourceTotal`, ordinal-invariant
 *   `datasetDigest`, and active `_ThaiPHCReportCurrent` Publication Pointer revision state.
 */
export function finalizeVolunteerFamilyPreviewWithPlatform(
  request: FinalizePreviewRequest,
  platform: SyncPlatform,
): PreviewDatasetResponse {
  try {
    const base = validateFamilyContext(platform);
    if (!base.ok) {
      return { ok: false, error: { code: base.code, message: base.message } };
    }
    const { ctx } = base;
    const descriptor = getDatasetDescriptor(ctx.endpoint);
    const previewedAtUtc = platform.now().toISOString();
    const pagesFetched =
      Number.isSafeInteger(request.pagesFetched) && request.pagesFetched >= 0
        ? request.pagesFetched
        : 0;

    const targetIdResult = resolveTargetSpreadsheetId(ctx, platform);
    if (!targetIdResult.ok) {
      return {
        ok: false,
        error: { code: 'SPREADSHEET_NOT_CONFIGURED', message: targetIdResult.message },
      };
    }

    let spreadsheet: WritableSpreadsheetHandle;
    try {
      spreadsheet = platform.openSpreadsheetById(targetIdResult.spreadsheetId);
    } catch {
      return {
        ok: false,
        error: {
          code: 'WORKBOOK_ACCESS_FAILED',
          message: 'Unable to open the configured report Google Sheets workbook.',
        },
      };
    }

    const logSummary = readEndpointSyncLogSummary(spreadsheet, ctx.endpoint);

    if (
      !Number.isSafeInteger(request.sourceTotal) ||
      request.sourceTotal < 1 ||
      request.sourceTotal > ctx.schema.maxRows ||
      !Array.isArray(request.rowDigests) ||
      request.rowDigests.length !== request.sourceTotal
    ) {
      return makeBlockedFamilyFinalizePreview(
        ctx,
        previewedAtUtc,
        pagesFetched,
        [
          {
            code: 'INCOMPLETE_SNAPSHOT',
            message:
              'Accumulated preview batch row count does not match reported ThaiPHC source total.',
          },
        ],
        logSummary.unresolvedRun,
      );
    }

    const ordinalDigests: Array<{ key: string; rowDigest: string }> = [];
    const reviewReasonsByKey = new Map<string, readonly ReviewReasonCode[]>();
    let localityMismatchCount = 0;

    for (let i = 0; i < request.rowDigests.length; i++) {
      const entry = request.rowDigests[i];
      const expectedKey = buildFamilyPreviewRowKey(i + 1);
      if (
        !entry ||
        entry.key !== expectedKey ||
        typeof entry.rowDigest !== 'string' ||
        !SHA256_HEX_PATTERN.test(entry.rowDigest)
      ) {
        return makeBlockedFamilyFinalizePreview(
          ctx,
          previewedAtUtc,
          pagesFetched,
          [
            {
              code: 'TYPE_MISMATCH',
              message: `Malformed ordinal key or row digest entry at row #${i + 1}.`,
              rowIndex: i,
            },
          ],
          logSummary.unresolvedRun,
        );
      }

      if (entry.reviewReasons !== undefined) {
        if (
          !Array.isArray(entry.reviewReasons) ||
          entry.reviewReasons.some((r) => r !== 'LOCALITY_MISMATCH')
        ) {
          return makeBlockedFamilyFinalizePreview(
            ctx,
            previewedAtUtc,
            pagesFetched,
            [
              {
                code: 'TYPE_MISMATCH',
                message: `Malformed reviewReasons entry at row #${i + 1}.`,
                rowIndex: i,
              },
            ],
            logSummary.unresolvedRun,
          );
        }
        if (entry.reviewReasons.length > 0) {
          localityMismatchCount += 1;
          reviewReasonsByKey.set(entry.key, ['LOCALITY_MISMATCH']);
        }
      }

      ordinalDigests.push({
        key: String(i + 1).padStart(5, '0'),
        rowDigest: entry.rowDigest,
      });
    }

    const pointerStateRes = readReportCurrentState(spreadsheet);
    if (!pointerStateRes.ok) {
      return makeBlockedFamilyFinalizePreview(
        ctx,
        previewedAtUtc,
        pagesFetched,
        [pointerStateRes.diagnostic],
        logSummary.unresolvedRun,
      );
    }

    const activePointer = pointerStateRes.state.pointers.get('volunteer-family') ?? null;
    const datasetDigest = computeDatasetDigest(ordinalDigests, platform.sha256Hex);
    const sheetRevisionFingerprint = computeCompleteSnapshotRevisionFingerprint(
      spreadsheet,
      pointerStateRes.state,
      logSummary,
      platform.sha256Hex,
    );

    const counts = {
      insert: request.sourceTotal,
      update: 0,
      unchanged: 0,
      review: localityMismatchCount,
    };
    const reviewBreakdown: Partial<Record<ReviewReasonCode, number>> =
      localityMismatchCount > 0 ? { LOCALITY_MISMATCH: localityMismatchCount } : {};

    const fingerprint = computePreviewFingerprint(
      ctx.endpoint,
      ctx.env,
      request.sourceTotal,
      datasetDigest,
      sheetRevisionFingerprint,
      counts,
      platform.sha256Hex,
    );

    const guardStatus = evaluateWriteGuards(ctx, platform);
    const aggregateSummary = mergeAggregateSummary(
      Array.isArray(request.aggregateSummary) ? request.aggregateSummary : [],
    );
    const sampleRows = selectFamilyPreviewSamples(
      Array.isArray(request.sampleCandidates) ? request.sampleCandidates : [],
      reviewReasonsByKey,
    );

    return {
      ok: true,
      data: {
        status: 'READY',
        endpoint: ctx.endpoint,
        env: ctx.env,
        syncMode: descriptor.syncMode,
        paginationProtocol: descriptor.paginationProtocol,
        destinationTab: ctx.schema.tab,
        activeSnapshotTab: activePointer?.snapshotSheet ?? null,
        previewedAtUtc,
        pagesFetched,
        sourceTotal: request.sourceTotal,
        fingerprint,
        counts,
        reviewBreakdown,
        unresolvedPreviousRun: logSummary.unresolvedRun,
        legacySnapshotPresent: false,
        legacySnapshotTab: null,
        writeAllowed: guardStatus.writeAllowed,
        blockedGuardReason: guardStatus.blockedGuardReason,
        previewMode: 'EXTENDED_MINIMIZED',
        aggregateSummary,
        sampleRows,
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        code: 'PREVIEW_FAILED',
        message: 'Failed to finalize read-only dataset preview.',
      },
    };
  }
}

export function getFamilySnapshotHeaders(): string[] {
  return [
    '_source_key',
    ...VOLUNTEER_FAMILY_SCHEMA.fields.map((f) => f.name),
    '_quality_status',
    '_field_presence_json',
    '_row_digest',
    '__chunk_ordinal',
  ];
}

function getFamilySnapshotTextColumnIndices(): number[] {
  const headers = getFamilySnapshotHeaders();
  return headers.reduce<number[]>((acc, header, idx) => {
    if (header !== '__chunk_ordinal') {
      acc.push(idx + 1);
    }
    return acc;
  }, []);
}

function parseFamilySnapshotMetadata(
  sheet: WritableSheetHandle,
  expected: {
    env: AppEnvironment;
    runId: string;
    expectedFingerprintDigest: string;
    expectedStatus: 'STAGING' | 'PUBLISHED';
  },
): { ok: true; meta: FamilySnapshotMetadata } | { ok: false; message: string } {
  if (expected.expectedStatus === 'STAGING' && !sheet.isSheetHidden()) {
    return {
      ok: false,
      message: 'Staging snapshot tab must remain hidden until verified publication.',
    };
  }
  const expectedHeaders = getFamilySnapshotHeaders();
  if (sheet.getLastRow() < 2 || sheet.getLastColumn() !== expectedHeaders.length) {
    return {
      ok: false,
      message: 'Snapshot tab structure is incomplete or header column count does not match.',
    };
  }
  const headerRow = sheet.getValues(2, 1, 1, expectedHeaders.length)[0] ?? [];
  if (!expectedHeaders.every((h, idx) => headerRow[idx] === h)) {
    return {
      ok: false,
      message: 'Snapshot tab headers do not match expected volunteer-family minimized schema.',
    };
  }
  const rawMetaCell = sheet.getValues(1, 1, 1, 1)[0]?.[0];
  if (typeof rawMetaCell !== 'string' || rawMetaCell.length === 0) {
    return { ok: false, message: 'Snapshot tab metadata is missing.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawMetaCell);
  } catch {
    return { ok: false, message: 'Snapshot tab metadata is not valid JSON.' };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, message: 'Snapshot tab metadata is malformed.' };
  }
  if (
    parsed.version !== FAMILY_SNAPSHOT_PROTOCOL_VERSION ||
    parsed.endpoint !== 'volunteer-family' ||
    parsed.env !== expected.env ||
    parsed.runId !== expected.runId ||
    parsed.expectedFingerprintDigest !== expected.expectedFingerprintDigest ||
    parsed.status !== expected.expectedStatus ||
    !Number.isSafeInteger(parsed.expectedSourceTotal) ||
    (parsed.expectedSourceTotal as number) < 1 ||
    typeof parsed.expectedDatasetDigest !== 'string' ||
    typeof parsed.expectedSheetRevisionFingerprint !== 'string' ||
    !Number.isSafeInteger(parsed.pageSize) ||
    (parsed.pageSize as number) < 1 ||
    !Number.isSafeInteger(parsed.lastPageStaged) ||
    (parsed.lastPageStaged as number) < 1 ||
    !Number.isSafeInteger(parsed.totalPages) ||
    (parsed.totalPages as number) < 1 ||
    !Number.isSafeInteger(parsed.stagedRowCount) ||
    (parsed.stagedRowCount as number) < 0 ||
    !Array.isArray(parsed.chunkDigests) ||
    parsed.chunkDigests.some((d) => typeof d !== 'string' || !SHA256_HEX_PATTERN.test(d))
  ) {
    return { ok: false, message: 'Snapshot tab metadata failed integrity checks.' };
  }
  const meta = parsed as unknown as FamilySnapshotMetadata;
  if (sheet.getLastRow() !== meta.stagedRowCount + 2) {
    return {
      ok: false,
      message: 'Snapshot tab row count does not match recorded stagedRowCount.',
    };
  }
  return { ok: true, meta };
}

function verifyPersistedFamilySnapshotRows(
  sheet: WritableSheetHandle,
  meta: FamilySnapshotMetadata,
  sha256Hex: (input: string) => string,
):
  | {
      ok: true;
      rowCount: number;
      localityMismatchCount: number;
      datasetDigest: string;
    }
  | { ok: false; code: 'STAGING_DIGEST_MISMATCH'; message: string } {
  const fields = VOLUNTEER_FAMILY_SCHEMA.fields;
  const fieldCount = fields.length;
  const headers = getFamilySnapshotHeaders();
  const totalCols = headers.length;
  const sourceKeyColIdx = headers.indexOf('_source_key');
  const qualityColIdx = headers.indexOf('_quality_status');
  const presenceColIdx = headers.indexOf('_field_presence_json');
  const digestColIdx = headers.indexOf('_row_digest');
  const chunkColIdx = headers.indexOf('__chunk_ordinal');
  const fieldColIndices = fields.map((f) => headers.indexOf(f.name));

  const provIdx = fields.findIndex((f) => f.name === 'provinceCode');
  const distIdx = fields.findIndex((f) => f.name === 'districtCode');
  const subIdx = fields.findIndex((f) => f.name === 'subdistrictCode');
  const vilCodeIdx = fields.findIndex((f) => f.name === 'villageCode');
  const vilNoIdx = fields.findIndex((f) => f.name === 'villageNo');

  const rawRows = sheet.getValues(3, 1, meta.stagedRowCount, totalCols);
  if (rawRows.length !== meta.stagedRowCount) {
    return {
      ok: false,
      code: 'STAGING_DIGEST_MISMATCH',
      message: 'Persisted snapshot row count does not match expected stagedRowCount.',
    };
  }

  const rowsByChunk = new Map<number, Array<{ key: string; rowDigest: string }>>();
  const ordinalDigests: Array<{ key: string; rowDigest: string }> = [];
  let localityMismatchCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const cells = rawRows[i];
    const expectedKey = buildFamilySnapshotRowKey(meta.runId, i + 1);
    const key = cells[sourceKeyColIdx];
    if (key !== expectedKey) {
      return {
        ok: false,
        code: 'STAGING_DIGEST_MISMATCH',
        message: `Snapshot row #${i + 1} ordinal key did not match expected run-scoped key.`,
      };
    }

    const storedQuality = cells[qualityColIdx];
    const rawPresence = cells[presenceColIdx];
    const storedDigest = cells[digestColIdx];
    const chunkOrdinal = cells[chunkColIdx];

    if (
      (storedQuality !== 'VALID' && storedQuality !== 'WARNING') ||
      typeof rawPresence !== 'string' ||
      typeof storedDigest !== 'string' ||
      !SHA256_HEX_PATTERN.test(storedDigest) ||
      typeof chunkOrdinal !== 'number' ||
      !Number.isSafeInteger(chunkOrdinal) ||
      chunkOrdinal < 1 ||
      chunkOrdinal > meta.chunkDigests.length
    ) {
      return {
        ok: false,
        code: 'STAGING_DIGEST_MISMATCH',
        message: `Snapshot row #${i + 1} has corrupted metadata or chunk ordinal.`,
      };
    }

    let parsedPresence: unknown;
    try {
      parsedPresence = JSON.parse(rawPresence);
    } catch {
      return {
        ok: false,
        code: 'STAGING_DIGEST_MISMATCH',
        message: `Snapshot row #${i + 1} has invalid _field_presence_json.`,
      };
    }
    if (!isPlainObject(parsedPresence)) {
      return {
        ok: false,
        code: 'STAGING_DIGEST_MISMATCH',
        message: `Snapshot row #${i + 1} _field_presence_json must be an object.`,
      };
    }

    const values: Array<string | null> = [];
    const presence: Record<string, FieldPresence> = {};

    for (let fIdx = 0; fIdx < fieldCount; fIdx++) {
      const field = fields[fIdx];
      if (!hasOwn(parsedPresence, field.name)) {
        return {
          ok: false,
          code: 'STAGING_DIGEST_MISMATCH',
          message: `Snapshot row #${i + 1} is missing presence state for "${field.name}".`,
        };
      }
      const pState = parsedPresence[field.name];
      if (pState !== 'ABSENT' && pState !== 'VALUE') {
        return {
          ok: false,
          code: 'STAGING_DIGEST_MISMATCH',
          message: `Snapshot row #${i + 1} has invalid presence state for "${field.name}".`,
        };
      }
      presence[field.name] = pState;
      const cell = cells[fieldColIndices[fIdx]];

      if (pState === 'ABSENT') {
        if (cell !== '' && cell !== null && cell !== undefined) {
          return {
            ok: false,
            code: 'STAGING_DIGEST_MISMATCH',
            message: `Snapshot row #${i + 1} cell "${field.name}" does not match ABSENT presence.`,
          };
        }
        values.push(null);
      } else {
        try {
          values.push(assertSafeString(cell, field.name));
        } catch {
          return {
            ok: false,
            code: 'STAGING_DIGEST_MISMATCH',
            message: `Snapshot row #${i + 1} text cell "${field.name}" failed safety/type verification.`,
          };
        }
      }
    }

    if (values[provIdx] !== '54' || values[distIdx] !== '5406') {
      return {
        ok: false,
        code: 'STAGING_DIGEST_MISMATCH',
        message: `Snapshot row #${i + 1} violated Geographic Scope (54 / 5406).`,
      };
    }

    const hasMismatch = hasLowerLevelLocalityMismatch({
      subdistrictCode: values[subIdx],
      villageCode: values[vilCodeIdx],
      villageNo: values[vilNoIdx],
    });
    const expectedQuality = hasMismatch ? 'WARNING' : 'VALID';
    if (storedQuality !== expectedQuality) {
      return {
        ok: false,
        code: 'STAGING_DIGEST_MISMATCH',
        message: `Snapshot row #${i + 1} _quality_status did not match locality check.`,
      };
    }
    if (hasMismatch) {
      localityMismatchCount += 1;
    }

    const recomputedDigest = sha256Hex(JSON.stringify([values, presence]));
    if (recomputedDigest !== storedDigest) {
      return {
        ok: false,
        code: 'STAGING_DIGEST_MISMATCH',
        message: `Snapshot row #${i + 1} failed independent _row_digest verification.`,
      };
    }

    const chunkList = rowsByChunk.get(chunkOrdinal);
    if (chunkList) {
      chunkList.push({ key, rowDigest: recomputedDigest });
    } else {
      rowsByChunk.set(chunkOrdinal, [{ key, rowDigest: recomputedDigest }]);
    }

    ordinalDigests.push({
      key: String(i + 1).padStart(5, '0'),
      rowDigest: recomputedDigest,
    });
  }

  for (let ord = 1; ord <= meta.chunkDigests.length; ord++) {
    const chunkEntries = rowsByChunk.get(ord);
    if (!chunkEntries || chunkEntries.length === 0) {
      return {
        ok: false,
        code: 'STAGING_DIGEST_MISMATCH',
        message: `Snapshot chunk #${ord} is missing from persisted sheet.`,
      };
    }
    if (computeChunkDigest(chunkEntries, sha256Hex) !== meta.chunkDigests[ord - 1]) {
      return {
        ok: false,
        code: 'STAGING_DIGEST_MISMATCH',
        message: `Snapshot chunk #${ord} SHA-256 digest does not match recorded manifest.`,
      };
    }
  }

  return {
    ok: true,
    rowCount: rawRows.length,
    localityMismatchCount,
    datasetDigest: computeDatasetDigest(ordinalDigests, sha256Hex),
  };
}

function buildReportCurrentRow(entry: {
  endpoint: string;
  runId: string;
  snapshotSheet: string;
  rowCount: number;
  manifestDigest: string;
}): Array<string | number> {
  const byHeader: Record<(typeof REPORT_CURRENT_HEADERS)[number], string | number> = {
    endpoint: entry.endpoint,
    run_id: entry.runId,
    snapshot_sheet: entry.snapshotSheet,
    row_count: entry.rowCount,
    manifest_digest: entry.manifestDigest,
  };
  return REPORT_CURRENT_HEADERS.map((header) => byHeader[header]);
}

function ensureReportCurrentSheet(spreadsheet: WritableSpreadsheetHandle): WritableSheetHandle {
  const existing = spreadsheet.getSheetByName(REPORT_CURRENT_TAB);
  if (existing) {
    return existing;
  }
  const sheet = spreadsheet.insertSheet(REPORT_CURRENT_TAB);
  const maxCols = sheet.getMaxColumns();
  if (maxCols < REPORT_CURRENT_HEADERS.length) {
    sheet.insertColumnsAfter(maxCols, REPORT_CURRENT_HEADERS.length - maxCols);
  }
  sheet.setValues(1, 1, [[...REPORT_CURRENT_HEADERS]]);
  sheet.setFrozenRows(1);
  const formatRows = Math.max(1, sheet.getMaxRows() - 1);
  applyTextFormatsToRange(sheet, 2, formatRows, REPORT_CURRENT_TEXT_COLUMN_INDICES);
  return sheet;
}

/**
 * Multi-batch Complete Snapshot staging step for `volunteer-family`:
 * - Stages minimized rows directly into a NEW hidden versioned tab `RFamily_<runId>`
 *   (refusing immediately if `RFamily_<runId>` already exists).
 * - Assigns run-scoped ordinal keys `snapshot_<runId>_NNNNN` and records per-batch SHA-256 chunk digests.
 * - Never unhides `RFamily_<runId>` and never updates `_ThaiPHCReportCurrent` during staging.
 */
export function stageVolunteerFamilyBatchWithPlatform(
  request: StageLargeDatasetBatchRequest,
  platform: SyncPlatform,
): StageLargeDatasetBatchResponse {
  try {
    const base = validateFamilyContext(platform);
    if (!base.ok) {
      return { ok: false, error: { code: base.code, message: base.message } };
    }
    const { ctx } = base;

    if (!isValidBearerToken(request.token)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_TOKEN_FORMAT',
          message:
            'Bearer Token format is invalid; provide only the raw token without the Bearer prefix.',
        },
      };
    }

    const preLock = validateCommitPreLock(
      ctx,
      {
        expectedFingerprint: request.expectedFingerprint,
        confirmationPhrase: request.confirmationPhrase,
        requireHmacKey: false,
      },
      platform,
    );
    if (!preLock.ok) {
      return preLock.response;
    }
    const { expectedFp } = preLock;

    if (!Number.isSafeInteger(request.startPage) || request.startPage < 1) {
      return makeCommitStop(
        ctx,
        'STAGING_STATE_INVALID',
        'Staging batch startPage must be a positive integer.',
      );
    }
    const isFirstBatch = request.startPage === 1;
    if (
      !isFirstBatch &&
      (typeof request.runId !== 'string' || !RUN_ID_PATTERN.test(request.runId))
    ) {
      return makeCommitStop(
        ctx,
        'STAGING_STATE_INVALID',
        'Subsequent staging batches require a valid runId returned from batch 1.',
      );
    }

    return withLockedCommitWorkbook<StageLargeDatasetBatchResponse>(
      ctx,
      {
        acknowledgeUnresolvedRunId: request.acknowledgeUnresolvedRunId,
        runId: isFirstBatch ? null : request.runId,
      },
      platform,
      ({ spreadsheet, logSummary }) => {
        let existingSnapshotSheet: WritableSheetHandle | null = null;
        let existingMeta: FamilySnapshotMetadata | null = null;
        let existingSnapshotTabName: string | null = null;

        if (isFirstBatch) {
          const pointerStateRes = readReportCurrentState(spreadsheet);
          if (!pointerStateRes.ok) {
            return makeCommitStop(
              ctx,
              pointerStateRes.diagnostic.code,
              pointerStateRes.diagnostic.message,
            );
          }
          const currentSheetRevision = computeCompleteSnapshotRevisionFingerprint(
            spreadsheet,
            pointerStateRes.state,
            logSummary,
            platform.sha256Hex,
          );
          if (currentSheetRevision !== expectedFp.sheetRevisionFingerprint) {
            return {
              ok: true,
              data: {
                status: 'PREVIEW_STALE_RECONFIRM_REQUIRED',
                endpoint: ctx.endpoint,
                env: ctx.env,
                destinationTab: ctx.schema.tab,
                driftReason: 'DESTINATION_CHANGED',
                expectedFingerprint: expectedFp,
                currentSourceTotal: expectedFp.sourceTotal,
                currentDatasetDigest: expectedFp.datasetDigest,
                currentSheetRevisionFingerprint: currentSheetRevision,
              },
            };
          }
        } else {
          existingSnapshotTabName = buildFamilySnapshotTabName(request.runId!);
          existingSnapshotSheet = spreadsheet.getSheetByName(existingSnapshotTabName);
          if (!existingSnapshotSheet) {
            return makeCommitStop(
              ctx,
              'STAGING_STATE_INVALID',
              `Hidden snapshot tab "${existingSnapshotTabName}" was not found for this runId.`,
              { runId: request.runId ?? null },
            );
          }
          const parsedMeta = parseFamilySnapshotMetadata(existingSnapshotSheet, {
            env: ctx.env,
            runId: request.runId!,
            expectedFingerprintDigest: expectedFp.fingerprintDigest,
            expectedStatus: 'STAGING',
          });
          if (!parsedMeta.ok) {
            return makeCommitStop(ctx, 'STAGING_STATE_INVALID', parsedMeta.message, {
              runId: request.runId!,
              stagingTabRetained: existingSnapshotTabName,
            });
          }
          existingMeta = parsedMeta.meta;
          if (request.startPage !== existingMeta.lastPageStaged + 1) {
            return makeCommitStop(
              ctx,
              'STAGING_STATE_INVALID',
              'Snapshot staging batch startPage did not follow exact sequential forward order.',
              { runId: request.runId!, stagingTabRetained: existingSnapshotTabName },
            );
          }
        }

        const effectivePageSize =
          existingMeta?.pageSize ??
          (request.pageSize !== undefined &&
          Number.isSafeInteger(request.pageSize) &&
          request.pageSize >= 1 &&
          request.pageSize <= 100
            ? request.pageSize
            : DEFAULT_PAGE_SIZE);

        const now = platform.now();
        const runId = isFirstBatch ? platform.generateRunId(ctx.endpoint, now) : request.runId!;
        if (!RUN_ID_PATTERN.test(runId)) {
          return makeCommitStop(
            ctx,
            'STAGING_STATE_INVALID',
            'Generated runId failed identifier validation.',
          );
        }
        const snapshotTabName = buildFamilySnapshotTabName(runId);
        if (snapshotTabName.length > MAX_STAGING_TAB_NAME_LENGTH) {
          return makeCommitStop(
            ctx,
            'STAGING_STATE_INVALID',
            'Snapshot tab name exceeds safe Google Sheets length limit.',
          );
        }
        if (isFirstBatch && spreadsheet.getSheetByName(snapshotTabName)) {
          return makeCommitStop(
            ctx,
            'STAGING_STATE_INVALID',
            `Snapshot tab "${snapshotTabName}" already exists; Complete Snapshot never overwrites an existing versioned tab.`,
            { runId },
          );
        }

        const fetchResult = fetchVolunteerFamilyBatch({
          token: request.token,
          fetchUrl: platform.fetchUrl,
          startPage: request.startPage,
          batchPages: request.batchPages,
          pageSize: effectivePageSize,
          expectedSourceTotal: expectedFp.sourceTotal,
          maxRows: ctx.schema.maxRows,
        });
        if (!fetchResult.ok) {
          if (fetchResult.authFailed) {
            return { ok: false, error: { code: 'HTTP_401', message: fetchResult.message } };
          }
          if (fetchResult.code === 'SOURCE_TOTAL_CHANGED') {
            return {
              ok: true,
              data: {
                status: 'PREVIEW_STALE_RECONFIRM_REQUIRED',
                endpoint: ctx.endpoint,
                env: ctx.env,
                destinationTab: existingSnapshotTabName ?? ctx.schema.tab,
                driftReason: 'SOURCE_CHANGED',
                expectedFingerprint: expectedFp,
                currentSourceTotal: fetchResult.observedSourceTotal ?? expectedFp.sourceTotal,
                currentDatasetDigest: expectedFp.datasetDigest,
                currentSheetRevisionFingerprint: expectedFp.sheetRevisionFingerprint,
              },
            };
          }
          return makeCommitStop(ctx, fetchResult.code, fetchResult.message, {
            runId: request.runId ?? null,
            stagingTabRetained: existingSnapshotTabName,
          });
        }

        const rowIndexOffset = (fetchResult.startPage - 1) * effectivePageSize;
        const projected = validateAndProjectVolunteerFamilyRows(
          fetchResult.items,
          platform.sha256Hex,
          (ord) => buildFamilySnapshotRowKey(runId, ord),
          rowIndexOffset,
        );
        if (!projected.ok) {
          const first = projected.diagnostics[0];
          return makeCommitStop(
            ctx,
            first?.code ?? 'TYPE_MISMATCH',
            first?.message ?? 'Re-fetched volunteer-family batch failed schema validation.',
            { runId: request.runId ?? null, stagingTabRetained: existingSnapshotTabName },
          );
        }

        const chunkOrdinal = existingMeta ? existingMeta.chunkDigests.length + 1 : 1;
        const batchDigest = computeChunkDigest(projected.rows, platform.sha256Hex);
        const nextMeta: FamilySnapshotMetadata = {
          version: FAMILY_SNAPSHOT_PROTOCOL_VERSION,
          endpoint: 'volunteer-family',
          env: ctx.env,
          runId,
          expectedFingerprintDigest: expectedFp.fingerprintDigest,
          expectedSourceTotal: expectedFp.sourceTotal,
          expectedDatasetDigest: expectedFp.datasetDigest,
          expectedSheetRevisionFingerprint: expectedFp.sheetRevisionFingerprint,
          pageSize: effectivePageSize,
          lastPageStaged: fetchResult.lastPageFetched,
          totalPages: fetchResult.totalPages,
          stagedRowCount: (existingMeta?.stagedRowCount ?? 0) + projected.rows.length,
          chunkDigests: [...(existingMeta?.chunkDigests ?? []), batchDigest],
          status: 'STAGING',
        };

        const headers = getFamilySnapshotHeaders();
        const textCols = getFamilySnapshotTextColumnIndices();
        const rowsToWrite: CellScalar[][] = projected.rows.map((r) => [
          r.key,
          ...r.values.map((v) => (v === null ? '' : v)),
          r.reviewReasons.includes('LOCALITY_MISMATCH') ? 'WARNING' : 'VALID',
          JSON.stringify(r.presence),
          r.rowDigest,
          chunkOrdinal,
        ]);

        try {
          let snapshotSheet: WritableSheetHandle;
          if (isFirstBatch) {
            snapshotSheet = spreadsheet.insertSheet(snapshotTabName);
            snapshotSheet.hideSheet();
            const maxCols = snapshotSheet.getMaxColumns();
            if (maxCols < headers.length) {
              snapshotSheet.insertColumnsAfter(maxCols, headers.length - maxCols);
            }
            snapshotSheet.setValues(2, 1, [headers]);
            snapshotSheet.setFrozenRows(2);
            const formatRows = Math.max(1, snapshotSheet.getMaxRows() - 2);
            applyTextFormatsToRange(snapshotSheet, 3, formatRows, textCols);
          } else {
            snapshotSheet = existingSnapshotSheet!;
          }

          const startRow = (existingMeta?.stagedRowCount ?? 0) + 3;
          const endRow = startRow + rowsToWrite.length - 1;
          if (endRow > snapshotSheet.getMaxRows()) {
            snapshotSheet.insertRowsAfter(
              snapshotSheet.getMaxRows(),
              endRow - snapshotSheet.getMaxRows(),
            );
          }
          applyTextFormatsToRange(snapshotSheet, startRow, rowsToWrite.length, textCols);
          snapshotSheet.setValues(startRow, 1, rowsToWrite);
          snapshotSheet.setValues(1, 1, [[JSON.stringify(nextMeta)]]);
          platform.flushSpreadsheet();

          return {
            ok: true,
            data: {
              status: 'BATCH_STAGED',
              runId,
              endpoint: ctx.endpoint,
              env: ctx.env,
              destinationTab: snapshotTabName,
              stagingTabName: snapshotTabName,
              lastPageStaged: fetchResult.lastPageFetched,
              totalPages: fetchResult.totalPages,
              stagedRowCount: nextMeta.stagedRowCount,
              sourceTotal: fetchResult.sourceTotal,
              hasMore: fetchResult.hasMore,
              nextPage: fetchResult.nextPage,
            },
          };
        } catch {
          const retained = spreadsheet.getSheetByName(snapshotTabName) ? snapshotTabName : null;
          return makeCommitStop(
            ctx,
            'WRITE_FAILED_UNKNOWN',
            'Snapshot batch write or flush failed with an unknown outcome. Do not retry automatically; inspect the hidden RFamily_<runId> tab.',
            {
              status: 'UNKNOWN_OUTCOME_STOP',
              runId,
              syncLogStatus: 'NOT_WRITTEN',
              stagingTabRetained: retained,
            },
          );
        }
      },
    );
  } catch {
    return {
      ok: false,
      error: { code: 'COMMIT_FAILED', message: 'Staging batch failed unexpectedly.' },
    };
  }
}

/**
 * Complete Snapshot Finalization & Publication for `volunteer-family`:
 * - Under `LockService`, independently reads back & verifies every row, ordinal key,
 *   `_row_digest`, and chunk SHA-256 digest from hidden `RFamily_<runId>`, plus pointer revision.
 * - Refuses incomplete stages (`INCOMPLETE_SNAPSHOT`), cell/chunk tampering (`STAGING_DIGEST_MISMATCH`),
 *   and source/pointer drift (`PREVIEW_STALE_RECONFIRM_REQUIRED`) before unhiding or publishing.
 * - Records `_ThaiPHCSyncLog` (`STARTED`), unhides `RFamily_<runId>`, updates `_ThaiPHCReportCurrent`
 *   as the FINAL write, runs mandatory Destination Readback (confirming `RFamily_<runId>`,
 *   `_ThaiPHCReportCurrent`, and preservation of all prior `RFamily_*` tabs & `ชีต1`), and marks
 *   `_ThaiPHCSyncLog` (`COMMITTED_VERIFIED` or `FAILED_STOP`).
 */
export function finalizeVolunteerFamilyCommitWithPlatform(
  request: FinalizeLargeDatasetCommitRequest,
  platform: SyncPlatform,
): CommitDatasetResponse {
  try {
    const base = validateFamilyContext(platform);
    if (!base.ok) {
      return { ok: false, error: { code: base.code, message: base.message } };
    }
    const { ctx } = base;

    if (typeof request.runId !== 'string' || !RUN_ID_PATTERN.test(request.runId)) {
      return makeCommitStop(
        ctx,
        'STAGING_STATE_INVALID',
        'A valid runId is required to finalize a Complete Snapshot commit.',
      );
    }
    const runId = request.runId;
    const snapshotTabName = buildFamilySnapshotTabName(runId);

    const preLock = validateCommitPreLock(
      ctx,
      {
        expectedFingerprint: request.expectedFingerprint,
        confirmationPhrase: request.confirmationPhrase,
        runId,
        requireHmacKey: false,
      },
      platform,
    );
    if (!preLock.ok) {
      return preLock.response;
    }
    const { expectedFp } = preLock;

    return withLockedCommitWorkbook<CommitDatasetResponse>(
      ctx,
      {
        acknowledgeUnresolvedRunId: request.acknowledgeUnresolvedRunId,
        runId,
        stageTabNameForRetention: snapshotTabName,
      },
      platform,
      ({ spreadsheet, logSummary }) => {
        const snapshotSheet = spreadsheet.getSheetByName(snapshotTabName);
        if (!snapshotSheet) {
          return makeCommitStop(
            ctx,
            'STAGING_STATE_INVALID',
            `Hidden snapshot tab "${snapshotTabName}" was not found.`,
            { runId },
          );
        }

        const parsedMeta = parseFamilySnapshotMetadata(snapshotSheet, {
          env: ctx.env,
          runId,
          expectedFingerprintDigest: expectedFp.fingerprintDigest,
          expectedStatus: 'STAGING',
        });
        if (!parsedMeta.ok) {
          return makeCommitStop(ctx, 'STAGING_STATE_INVALID', parsedMeta.message, {
            runId,
            stagingTabRetained: snapshotTabName,
          });
        }
        const meta = parsedMeta.meta;

        if (
          meta.lastPageStaged !== meta.totalPages ||
          meta.stagedRowCount !== expectedFp.sourceTotal
        ) {
          return makeCommitStop(
            ctx,
            'INCOMPLETE_SNAPSHOT',
            'Hidden snapshot tab does not contain all expected pages or rows; refusing to publish an incomplete snapshot.',
            { runId, stagingTabRetained: snapshotTabName },
          );
        }

        const verified = verifyPersistedFamilySnapshotRows(snapshotSheet, meta, platform.sha256Hex);
        if (!verified.ok) {
          return makeCommitStop(ctx, verified.code, verified.message, {
            runId,
            stagingTabRetained: snapshotTabName,
          });
        }

        const pointerStateRes = readReportCurrentState(spreadsheet);
        if (!pointerStateRes.ok) {
          return makeCommitStop(
            ctx,
            pointerStateRes.diagnostic.code,
            pointerStateRes.diagnostic.message,
            { runId, stagingTabRetained: snapshotTabName },
          );
        }

        const currentSheetRevision = computeCompleteSnapshotRevisionFingerprint(
          spreadsheet,
          pointerStateRes.state,
          logSummary,
          platform.sha256Hex,
        );
        const diffCounts = {
          insert: verified.rowCount,
          update: 0,
          unchanged: 0,
          review: verified.localityMismatchCount,
        };
        const countsChanged =
          diffCounts.insert !== expectedFp.counts.insert ||
          diffCounts.update !== expectedFp.counts.update ||
          diffCounts.unchanged !== expectedFp.counts.unchanged ||
          diffCounts.review !== expectedFp.counts.review;
        const sourceChanged =
          verified.rowCount !== expectedFp.sourceTotal ||
          verified.datasetDigest !== expectedFp.datasetDigest;
        const destChanged = currentSheetRevision !== expectedFp.sheetRevisionFingerprint;

        if (sourceChanged || destChanged || countsChanged) {
          const driftReason: StaleDriftReason =
            (sourceChanged || countsChanged) && destChanged
              ? 'BOTH_CHANGED'
              : sourceChanged || countsChanged
                ? 'SOURCE_CHANGED'
                : 'DESTINATION_CHANGED';
          return {
            ok: true,
            data: {
              status: 'PREVIEW_STALE_RECONFIRM_REQUIRED',
              endpoint: ctx.endpoint,
              env: ctx.env,
              destinationTab: snapshotTabName,
              driftReason,
              expectedFingerprint: expectedFp,
              currentSourceTotal: verified.rowCount,
              currentDatasetDigest: verified.datasetDigest,
              currentSheetRevisionFingerprint: currentSheetRevision,
            },
          };
        }

        const descriptor = getDatasetDescriptor(ctx.endpoint);
        const tabsBefore = spreadsheet.getSheetNames();
        const nowUtc = platform.now().toISOString();

        const startedLog = appendSyncLogStarted(spreadsheet, {
          runId,
          timestampUtc: nowUtc,
          env: ctx.env,
          endpoint: ctx.endpoint,
          syncMode: descriptor.syncMode,
          previewDigest: expectedFp.fingerprintDigest,
        });
        platform.flushSpreadsheet();

        const manifest = {
          version: FAMILY_SNAPSHOT_PROTOCOL_VERSION,
          endpoint: 'volunteer-family',
          runId,
          sourceIdentityStrategy: FAMILY_IDENTITY_STRATEGY,
          sourceRows: verified.rowCount,
          chunkCount: meta.chunkDigests.length,
          destinationFields: VOLUNTEER_FAMILY_SCHEMA.fields.map((f) => f.name),
          chunkDigests: meta.chunkDigests,
          datasetDigest: verified.datasetDigest,
        };
        const manifestDigest = platform.sha256Hex(JSON.stringify(manifest));

        try {
          const publishedMeta: FamilySnapshotMetadata = {
            ...meta,
            status: 'PUBLISHED',
            manifestDigest,
            publishedAtUtc: nowUtc,
          };
          snapshotSheet.setValues(1, 1, [[JSON.stringify(publishedMeta)]]);
          snapshotSheet.showSheet();
          platform.flushSpreadsheet();

          // FINAL PUBLICATION WRITE: update _ThaiPHCReportCurrent only after verified snapshot is visible
          const pointerSheet = ensureReportCurrentSheet(spreadsheet);
          const existingPointer = pointerStateRes.state.pointers.get('volunteer-family');
          const targetPointerRow = existingPointer?.rowNumber ?? pointerSheet.getLastRow() + 1;
          if (targetPointerRow > pointerSheet.getMaxRows()) {
            pointerSheet.insertRowsAfter(
              pointerSheet.getMaxRows(),
              targetPointerRow - pointerSheet.getMaxRows(),
            );
          }
          applyTextFormatsToRange(
            pointerSheet,
            targetPointerRow,
            1,
            REPORT_CURRENT_TEXT_COLUMN_INDICES,
          );
          pointerSheet.setValues(targetPointerRow, 1, [
            buildReportCurrentRow({
              endpoint: 'volunteer-family',
              runId,
              snapshotSheet: snapshotTabName,
              rowCount: verified.rowCount,
              manifestDigest,
            }),
          ]);
          platform.flushSpreadsheet();

          // Mandatory post-publish Destination Readback
          const tabsAfter = new Set(spreadsheet.getSheetNames());
          const unrelatedTabsPreserved = tabsBefore.every((name) => tabsAfter.has(name));

          const readbackSheet = spreadsheet.getSheetByName(snapshotTabName);
          const readbackMetaRes = readbackSheet
            ? parseFamilySnapshotMetadata(readbackSheet, {
                env: ctx.env,
                runId,
                expectedFingerprintDigest: expectedFp.fingerprintDigest,
                expectedStatus: 'PUBLISHED',
              })
            : { ok: false as const, message: 'Snapshot tab missing during readback.' };

          const readbackRowsRes =
            readbackSheet && readbackMetaRes.ok
              ? verifyPersistedFamilySnapshotRows(
                  readbackSheet,
                  readbackMetaRes.meta,
                  platform.sha256Hex,
                )
              : null;

          const readbackPointerRes = readReportCurrentState(spreadsheet);
          const readbackPointer = readbackPointerRes.ok
            ? readbackPointerRes.state.pointers.get('volunteer-family')
            : undefined;
          let otherPointersPreserved = readbackPointerRes.ok;
          if (readbackPointerRes.ok) {
            for (const [ep, priorPtr] of pointerStateRes.state.pointers.entries()) {
              if (ep === 'volunteer-family') continue;
              const afterPtr = readbackPointerRes.state.pointers.get(ep);
              if (
                !afterPtr ||
                afterPtr.runId !== priorPtr.runId ||
                afterPtr.snapshotSheet !== priorPtr.snapshotSheet ||
                afterPtr.rowCount !== priorPtr.rowCount ||
                afterPtr.manifestDigest !== priorPtr.manifestDigest
              ) {
                otherPointersPreserved = false;
                break;
              }
            }
          }
          const publicationPointerVerified =
            readbackPointerRes.ok &&
            otherPointersPreserved &&
            readbackPointer !== undefined &&
            readbackPointer.runId === runId &&
            readbackPointer.snapshotSheet === snapshotTabName &&
            readbackPointer.rowCount === String(verified.rowCount) &&
            readbackPointer.manifestDigest === manifestDigest;

          const snapshotVisible = readbackSheet !== null && !readbackSheet.isSheetHidden();
          const manifestMatches =
            readbackMetaRes.ok && readbackMetaRes.meta.manifestDigest === manifestDigest;
          const rowDigestsVerified =
            snapshotVisible &&
            manifestMatches &&
            readbackRowsRes !== null &&
            readbackRowsRes.ok &&
            readbackRowsRes.datasetDigest === verified.datasetDigest;
          const actualRowCount =
            readbackRowsRes !== null && readbackRowsRes.ok ? readbackRowsRes.rowCount : 0;
          const uniqueKeysVerified =
            readbackRowsRes !== null && readbackRowsRes.ok && actualRowCount === verified.rowCount;

          const readback: ReadbackVerification = {
            verified:
              actualRowCount === verified.rowCount &&
              uniqueKeysVerified &&
              rowDigestsVerified &&
              publicationPointerVerified &&
              unrelatedTabsPreserved,
            destinationTab: snapshotTabName,
            expectedRowCount: verified.rowCount,
            actualRowCount,
            uniqueKeysVerified,
            rowDigestsVerified,
            unrelatedTabsPreserved,
            baselineTabsChecked: [...tabsBefore],
            stagingTabCleaned: null,
            publicationPointerVerified,
          };

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
              'Complete Snapshot Destination Readback failed verification after publication. Inspect RFamily_<runId> and _ThaiPHCReportCurrent immediately.',
              {
                status: 'FAILED_STOP',
                runId,
                syncLogStatus: 'FAILED_STOP',
                stagingTabRetained: snapshotTabName,
              },
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
              destinationTab: snapshotTabName,
              completedAtUtc,
              counts: diffCounts,
              fingerprint: expectedFp,
              readback,
              syncLogStatus: 'COMMITTED_VERIFIED',
            },
          };
        } catch {
          const retained = spreadsheet.getSheetByName(snapshotTabName) ? snapshotTabName : null;
          return makeCommitStop(
            ctx,
            'WRITE_FAILED_UNKNOWN',
            'Complete Snapshot publication or flush failed with an unknown outcome. Do not retry automatically; inspect RFamily_<runId>, _ThaiPHCReportCurrent, and _ThaiPHCSyncLog.',
            {
              status: 'UNKNOWN_OUTCOME_STOP',
              runId,
              syncLogStatus: 'STARTED',
              stagingTabRetained: retained,
            },
          );
        }
      },
    );
  } catch {
    return {
      ok: false,
      error: { code: 'COMMIT_FAILED', message: 'Finalize commit failed unexpectedly.' },
    };
  }
}
