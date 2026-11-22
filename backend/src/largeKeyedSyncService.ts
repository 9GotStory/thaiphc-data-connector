import { computeDatasetDigest } from './cellValidation.ts';
import {
  buildStagingTabName,
  getDatasetDescriptor,
  isLargeKeyedEndpoint,
  LARGE_KEYED_SCHEMAS,
  RUN_ID_PATTERN,
  type KeyedDatasetSchemaSpec,
} from './datasetCatalog.ts';
import {
  formatExtendedScopeLabel,
  validateAndProjectLargeKeyedRows,
} from './extendedReportProjection.ts';
import {
  computePreviewFingerprint,
  computeSheetRevisionFingerprint,
  countKeyedDiffByDigest,
  evaluateWriteGuards,
  executeVerifiedKeyedWrite,
  makeCommitStop,
  readDestinationState,
  readEndpointSyncLogSummary,
  resolveTargetSpreadsheetId,
  validateCommitPreLock,
  withLockedCommitWorkbook,
  type DestinationState,
} from './keyedSyncCore.ts';
import {
  createF010Pseudonymizer,
  PSEUDONYMOUS_KEY_PATTERN,
  SHA256_HEX_PATTERN,
} from './pseudonymizer.ts';
import {
  cellToString,
  detectLegacySnapshot,
  isValidSpreadsheetId,
  parseEnvironment,
  readReportCurrentPointers,
} from './sheetConfig.ts';
import {
  computeChunkDigest,
  MAX_STAGING_TAB_NAME_LENGTH,
  parseStagingMetadata,
  reconstructAndVerifyStagedRows,
  STAGING_PROTOCOL_VERSION,
  writeStagingBatch,
  type StagingMetadata,
} from './stagingSheetStorage.ts';
import { DEFAULT_PAGE_SIZE, fetchLargeKeyedBatch, isValidBearerToken } from './thaiphcClient.ts';
import type {
  AppEnvironment,
  CommitDatasetResponse,
  ExtendedAggregateGroup,
  ExtendedMinimizedPreviewRow,
  ExtendedSampleCandidate,
  FinalizeLargeDatasetCommitRequest,
  FinalizePreviewRequest,
  LargeKeyedDatasetEndpoint,
  PreviewDatasetBatchRequest,
  PreviewDatasetBatchResponse,
  PreviewDatasetResponse,
  PreviewDiagnostic,
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

interface ValidatedLargeContext {
  endpoint: LargeKeyedDatasetEndpoint;
  isExtendedReport: true;
  env: AppEnvironment;
  referenceSpreadsheetId: string;
  schema: KeyedDatasetSchemaSpec<LargeKeyedDatasetEndpoint>;
}

function batchPreviewRpcError(
  code: SyncRpcErrorCode,
  message: string,
): PreviewDatasetBatchResponse {
  return { ok: false, error: { code, message } };
}

function finalizePreviewRpcError(code: SyncRpcErrorCode, message: string): PreviewDatasetResponse {
  return { ok: false, error: { code, message } };
}

function validateLargeContext(
  endpoint: unknown,
  platform: SyncPlatform,
  unsupportedMsg: string,
):
  | { ok: true; ctx: ValidatedLargeContext }
  | { ok: false; code: SyncRpcErrorCode; message: string } {
  if (typeof endpoint !== 'string' || !isLargeKeyedEndpoint(endpoint)) {
    return { ok: false, code: 'DATASET_NOT_SUPPORTED', message: unsupportedMsg };
  }
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
      endpoint,
      isExtendedReport: true,
      env,
      referenceSpreadsheetId,
      schema: LARGE_KEYED_SCHEMAS[endpoint],
    },
  };
}

function makeBlockedFinalizePreview(
  ctx: ValidatedLargeContext,
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

function mergeAggregateSummary(
  groups: readonly ExtendedAggregateGroup[],
): ExtendedAggregateGroup[] {
  const byCode = new Map<string, ExtendedAggregateGroup>();
  for (const g of groups) {
    if (
      !g ||
      typeof g.groupCode !== 'string' ||
      g.groupCode.length === 0 ||
      typeof g.groupLabel !== 'string' ||
      !Number.isSafeInteger(g.rowCount) ||
      g.rowCount < 0 ||
      !Number.isSafeInteger(g.reviewCount) ||
      g.reviewCount < 0
    ) {
      continue;
    }
    const existing = byCode.get(g.groupCode);
    if (existing) {
      existing.rowCount += g.rowCount;
      existing.reviewCount += g.reviewCount;
    } else {
      byCode.set(g.groupCode, {
        groupCode: g.groupCode,
        groupLabel: g.groupLabel,
        rowCount: g.rowCount,
        reviewCount: g.reviewCount,
      });
    }
  }
  return [...byCode.values()].sort((a, b) =>
    a.groupCode < b.groupCode ? -1 : a.groupCode > b.groupCode ? 1 : 0,
  );
}

const VALID_INCOMING_REVIEW_REASONS: ReadonlySet<string> = new Set<ReviewReasonCode>([
  'LOCALITY_MISMATCH',
]);

function buildExtendedMissingSampleRow(
  schema: KeyedDatasetSchemaSpec,
  dest: DestinationState,
  existingKey: string,
): ExtendedMinimizedPreviewRow | null {
  const existing = dest.byKey.get(existingKey);
  if (!existing) return null;
  const subCodeIdx = schema.fields.findIndex((f) => f.name === 'subdistrictCode');
  const subNameIdx = schema.fields.findIndex(
    (f) => f.name === 'subdistrictNameTh' || f.name === 'subdistrictName',
  );
  const villageCodeIdx = schema.fields.findIndex((f) => f.name === 'villageCode');
  const villageNoIdx = schema.fields.findIndex((f) => f.name === 'villageNo');
  const villageNameIdx = schema.fields.findIndex((f) => f.name === 'villageName');
  const rawVillageName = villageNameIdx >= 0 ? cellToString(existing.cells[villageNameIdx]) : '';
  const rawVillageCode = villageCodeIdx >= 0 ? cellToString(existing.cells[villageCodeIdx]) : '';
  return {
    diffKind: 'REVIEW',
    sourceKey: existing.key,
    scopeLabel: formatExtendedScopeLabel({
      subdistrictCode: subCodeIdx >= 0 ? cellToString(existing.cells[subCodeIdx]) : '',
      subdistrictName: subNameIdx >= 0 ? cellToString(existing.cells[subNameIdx]) : '',
      villageNo: villageNoIdx >= 0 ? cellToString(existing.cells[villageNoIdx]) : '',
      villageName: rawVillageName.length > 0 ? rawVillageName : null,
      villageCode: rawVillageCode.length > 0 ? rawVillageCode : undefined,
    }),
    minimizedAttributes: [],
    reviewReasons: ['MISSING_IN_SOURCE'],
  };
}

function selectPrioritizedPreviewSamples(
  schema: KeyedDatasetSchemaSpec,
  dest: DestinationState,
  candidates: readonly ExtendedSampleCandidate[],
  incomingDiffKindByKey: ReadonlyMap<string, 'INSERT' | 'UPDATE' | 'UNCHANGED'>,
  incomingReviewReasonsByKey: ReadonlyMap<string, readonly ReviewReasonCode[]>,
  missingKeys: readonly string[],
): ExtendedMinimizedPreviewRow[] {
  const incomingReviewRows: ExtendedMinimizedPreviewRow[] = [];
  const missingReviewRows: ExtendedMinimizedPreviewRow[] = [];
  const updateRows: ExtendedMinimizedPreviewRow[] = [];
  const insertRows: ExtendedMinimizedPreviewRow[] = [];
  const unchangedRows: ExtendedMinimizedPreviewRow[] = [];
  const seenSampleKeys = new Set<string>();

  for (const missingKey of missingKeys) {
    if (missingReviewRows.length >= MAX_FINAL_PREVIEW_SAMPLES) break;
    const missingRow = buildExtendedMissingSampleRow(schema, dest, missingKey);
    if (missingRow) {
      missingReviewRows.push(missingRow);
    }
  }

  for (const cand of candidates) {
    if (
      !cand ||
      typeof cand.sourceKey !== 'string' ||
      !PSEUDONYMOUS_KEY_PATTERN.test(cand.sourceKey) ||
      seenSampleKeys.has(cand.sourceKey)
    ) {
      continue;
    }
    const diffKind = incomingDiffKindByKey.get(cand.sourceKey);
    if (!diffKind) continue;
    seenSampleKeys.add(cand.sourceKey);
    const verifiedReasons = [...(incomingReviewReasonsByKey.get(cand.sourceKey) ?? [])];
    const row: ExtendedMinimizedPreviewRow = {
      diffKind,
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
    if (verifiedReasons.length > 0) incomingReviewRows.push(row);
    else if (diffKind === 'UPDATE') updateRows.push(row);
    else if (diffKind === 'INSERT') insertRows.push(row);
    else unchangedRows.push(row);
  }

  // Balance incoming REVIEW (LOCALITY_MISMATCH) and destination REVIEW (MISSING_IN_SOURCE)
  // so neither category can starve the other out of the capped 50-row preview sample
  const halfBudget = Math.floor(MAX_FINAL_PREVIEW_SAMPLES / 2);
  const incomingReviewBudget = Math.min(
    incomingReviewRows.length,
    Math.max(halfBudget, MAX_FINAL_PREVIEW_SAMPLES - missingReviewRows.length),
  );
  const missingReviewBudget = Math.min(
    missingReviewRows.length,
    MAX_FINAL_PREVIEW_SAMPLES - incomingReviewBudget,
  );
  const balancedReviewRows = [
    ...incomingReviewRows.slice(0, incomingReviewBudget),
    ...missingReviewRows.slice(0, missingReviewBudget),
  ];

  // Prioritize REVIEW (LOCALITY_MISMATCH & MISSING_IN_SOURCE), UPDATE, and INSERT before UNCHANGED
  return [...balancedReviewRows, ...updateRows, ...insertRows, ...unchangedRows].slice(
    0,
    MAX_FINAL_PREVIEW_SAMPLES,
  );
}

/**
 * Stateless, read-only Batched Preview step for large person-level datasets (`assignments`):
 * - Zero Google Sheets writes and zero CacheService/PropertiesService writes.
 * - Fails closed before outbound fetch if `THAIPHC_HMAC_KEY_B64` is missing/malformed.
 * - Strips all 8 RESTRICTED_DEFAULT_OMIT fields server-side before returning non-PII
 *   `(h1_..., _row_digest)` pairs, subdistrict aggregates, and capped minimized samples.
 */
export function previewDatasetBatchWithPlatform(
  request: PreviewDatasetBatchRequest,
  platform: SyncPlatform,
): PreviewDatasetBatchResponse {
  try {
    if (!request || typeof request !== 'object') {
      return batchPreviewRpcError(
        'INVALID_REQUEST',
        'Batched preview request payload is required.',
      );
    }
    const base = validateLargeContext(
      request.endpoint,
      platform,
      'Batched preview is enabled for assignments, resigned-volunteers, and volunteer-tenure.',
    );
    if (!base.ok) {
      return batchPreviewRpcError(base.code, base.message);
    }
    const { ctx } = base;

    if (!isValidBearerToken(request.token)) {
      return batchPreviewRpcError(
        'INVALID_TOKEN_FORMAT',
        'Bearer Token format is invalid; provide only the raw token without the Bearer prefix.',
      );
    }

    // Fail closed BEFORE any outbound ThaiPHC network request if HMAC key is missing/malformed
    const pseudoInit = createF010Pseudonymizer(
      platform.getProperty('THAIPHC_HMAC_KEY_B64'),
      platform,
    );
    if (!pseudoInit.ok) {
      return {
        ok: true,
        data: {
          status: 'STOP_BLOCKED',
          endpoint: ctx.endpoint,
          env: ctx.env,
          pagesFetchedInBatch: 0,
          diagnostics: [{ code: pseudoInit.code, message: pseudoInit.message }],
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

    const fetchResult = fetchLargeKeyedBatch({
      endpoint: ctx.endpoint,
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
        return batchPreviewRpcError('HTTP_401', fetchResult.message);
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
    const projected = validateAndProjectLargeKeyedRows(
      ctx.endpoint,
      fetchResult.items,
      platform.sha256Hex,
      (rawId) => pseudoInit.pseudonymizer.deriveKey(ctx.endpoint, rawId),
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
    return batchPreviewRpcError('PREVIEW_FAILED', 'Failed to complete batched dataset preview.');
  }
}

/**
 * Stateless, read-only Finalize Preview step for large person-level datasets (`assignments`):
 * - Zero Google Sheets writes.
 * - Verifies completeness, cross-batch `h1_` key uniqueness, and HMAC key validity.
 * - Computes exact INSERT/UPDATE/UNCHANGED/REVIEW (`MISSING_IN_SOURCE`), `datasetDigest`,
 *   `sheetRevisionFingerprint`, deterministic `PreviewFingerprint`, and `LEGACY_F010_SNAPSHOT_PRESENT`.
 */
export function finalizePreviewWithPlatform(
  request: FinalizePreviewRequest,
  platform: SyncPlatform,
): PreviewDatasetResponse {
  try {
    if (!request || typeof request !== 'object') {
      return finalizePreviewRpcError(
        'INVALID_REQUEST',
        'Finalize preview request payload is required.',
      );
    }
    const base = validateLargeContext(
      request.endpoint,
      platform,
      'Finalize preview is enabled for assignments, resigned-volunteers, and volunteer-tenure.',
    );
    if (!base.ok) {
      return finalizePreviewRpcError(base.code, base.message);
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
      return finalizePreviewRpcError('SPREADSHEET_NOT_CONFIGURED', targetIdResult.message);
    }

    let spreadsheet: WritableSpreadsheetHandle;
    try {
      spreadsheet = platform.openSpreadsheetById(targetIdResult.spreadsheetId);
    } catch {
      return finalizePreviewRpcError(
        'WORKBOOK_ACCESS_FAILED',
        'Unable to open the configured report Google Sheets workbook.',
      );
    }

    const logSummary = readEndpointSyncLogSummary(spreadsheet, ctx.endpoint);

    const pseudoInit = createF010Pseudonymizer(
      platform.getProperty('THAIPHC_HMAC_KEY_B64'),
      platform,
    );
    if (!pseudoInit.ok) {
      return makeBlockedFinalizePreview(
        ctx,
        previewedAtUtc,
        pagesFetched,
        [{ code: pseudoInit.code, message: pseudoInit.message }],
        logSummary.unresolvedRun,
      );
    }

    if (
      !Number.isSafeInteger(request.sourceTotal) ||
      request.sourceTotal < 1 ||
      request.sourceTotal > ctx.schema.maxRows ||
      !Array.isArray(request.rowDigests) ||
      request.rowDigests.length !== request.sourceTotal
    ) {
      return makeBlockedFinalizePreview(
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

    // Validate every accumulated (h1_key, sha256) pair and enforce cross-batch key uniqueness
    const seenKeys = new Set<string>();
    const validDigests: Array<{
      key: string;
      rowDigest: string;
      reviewReasons: ReviewReasonCode[];
    }> = [];
    const incomingReviewReasonsByKey = new Map<string, readonly ReviewReasonCode[]>();

    for (let i = 0; i < request.rowDigests.length; i++) {
      const entry = request.rowDigests[i];
      if (
        !entry ||
        typeof entry.key !== 'string' ||
        !PSEUDONYMOUS_KEY_PATTERN.test(entry.key) ||
        typeof entry.rowDigest !== 'string' ||
        !SHA256_HEX_PATTERN.test(entry.rowDigest)
      ) {
        return makeBlockedFinalizePreview(
          ctx,
          previewedAtUtc,
          pagesFetched,
          [
            {
              code: 'TYPE_MISMATCH',
              message: `Malformed pseudonym or row digest entry at row #${i + 1}.`,
              rowIndex: i,
            },
          ],
          logSummary.unresolvedRun,
        );
      }

      const rowReviewReasons: ReviewReasonCode[] = [];
      if (entry.reviewReasons !== undefined) {
        const allowIncomingLocalityReview = ctx.schema.preserveSourceLocality === true;
        if (
          !Array.isArray(entry.reviewReasons) ||
          (!allowIncomingLocalityReview && entry.reviewReasons.length > 0) ||
          entry.reviewReasons.some(
            (r) => typeof r !== 'string' || !VALID_INCOMING_REVIEW_REASONS.has(r),
          )
        ) {
          return makeBlockedFinalizePreview(
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
        const uniqueReasons = [...new Set(entry.reviewReasons as ReviewReasonCode[])];
        rowReviewReasons.push(...uniqueReasons);
      }

      if (seenKeys.has(entry.key)) {
        return makeBlockedFinalizePreview(
          ctx,
          previewedAtUtc,
          pagesFetched,
          [
            {
              code: 'DUPLICATE_SOURCE_KEY',
              message: `Duplicate Pseudonymous Key detected across batches at row #${i + 1}.`,
              field: ctx.schema.keyField,
              rowIndex: i,
            },
          ],
          logSummary.unresolvedRun,
        );
      }
      seenKeys.add(entry.key);
      if (rowReviewReasons.length > 0) {
        incomingReviewReasonsByKey.set(entry.key, rowReviewReasons);
      }
      validDigests.push({
        key: entry.key,
        rowDigest: entry.rowDigest,
        reviewReasons: rowReviewReasons,
      });
    }

    const destResult = readDestinationState(spreadsheet, ctx.schema);
    if (!destResult.ok) {
      return makeBlockedFinalizePreview(
        ctx,
        previewedAtUtc,
        pagesFetched,
        [destResult.diagnostic],
        logSummary.unresolvedRun,
      );
    }

    const dest = destResult.state;
    const { counts, reviewBreakdown, incomingDiffKindByKey, missingKeys } = countKeyedDiffByDigest(
      validDigests,
      dest,
    );

    const sampleRows = selectPrioritizedPreviewSamples(
      ctx.schema,
      dest,
      Array.isArray(request.sampleCandidates) ? request.sampleCandidates : [],
      incomingDiffKindByKey,
      incomingReviewReasonsByKey,
      missingKeys,
    );

    const datasetDigest = computeDatasetDigest(validDigests, platform.sha256Hex);
    const sheetRevisionFingerprint = computeSheetRevisionFingerprint(
      dest,
      logSummary,
      platform.sha256Hex,
    );
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
    const reportPointers = readReportCurrentPointers(spreadsheet);
    const legacy = detectLegacySnapshot(
      ctx.endpoint,
      descriptor.legacyPrefix,
      dest.exists,
      reportPointers,
      spreadsheet.getSheetNames(),
    );

    const aggregateSummary = mergeAggregateSummary(
      Array.isArray(request.aggregateSummary) ? request.aggregateSummary : [],
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
        previewedAtUtc,
        pagesFetched,
        sourceTotal: request.sourceTotal,
        fingerprint,
        counts,
        reviewBreakdown,
        unresolvedPreviousRun: logSummary.unresolvedRun,
        legacySnapshotPresent: legacy.legacySnapshotPresent,
        legacySnapshotTab: legacy.legacySnapshotTab,
        writeAllowed: guardStatus.writeAllowed,
        blockedGuardReason: guardStatus.blockedGuardReason,
        previewMode: 'EXTENDED_MINIMIZED',
        aggregateSummary,
        sampleRows,
      },
    };
  } catch {
    return finalizePreviewRpcError(
      'PREVIEW_FAILED',
      'Failed to finalize read-only dataset preview.',
    );
  }
}

/**
 * Multi-batch Commit staging step (`stageLargeDatasetBatch`):
 * - Re-fetches ThaiPHC pages sequentially in bounded batches, re-runs Minimized Projection
 *   and F010 `h1_` pseudonymization server-side, and appends minimized rows to a temporary
 *   hidden `_Stage_assignments_<runId>` tab under `LockService`.
 * - Never mutates the live `Assignments` tab or `_ThaiPHCSyncLog`.
 * - Never auto-deletes `_Stage_*` on any error or drift.
 */
export function stageLargeDatasetBatchWithPlatform(
  request: StageLargeDatasetBatchRequest,
  platform: SyncPlatform,
): StageLargeDatasetBatchResponse {
  try {
    if (!request || typeof request !== 'object') {
      return {
        ok: false,
        error: { code: 'INVALID_REQUEST', message: 'Staging batch request payload is required.' },
      };
    }
    const base = validateLargeContext(
      request.endpoint,
      platform,
      'Multi-batch staging commit is enabled for assignments, resigned-volunteers, and volunteer-tenure.',
    );
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
        requireHmacKey: true,
      },
      platform,
    );
    if (!preLock.ok) {
      return preLock.response;
    }
    const { expectedFp, pseudonymizer } = preLock;

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
        let existingStageSheet: WritableSheetHandle | null = null;
        let existingMeta: StagingMetadata | null = null;
        let existingStageTabName: string | null = null;

        if (isFirstBatch) {
          // Re-check destination state BEFORE creating any hidden staging tab
          const destResult = readDestinationState(spreadsheet, ctx.schema);
          if (!destResult.ok) {
            return makeCommitStop(ctx, destResult.diagnostic.code, destResult.diagnostic.message);
          }
          const currentSheetRevision = computeSheetRevisionFingerprint(
            destResult.state,
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
          existingStageTabName = buildStagingTabName(ctx.endpoint, request.runId!);
          existingStageSheet = spreadsheet.getSheetByName(existingStageTabName);
          if (!existingStageSheet) {
            return makeCommitStop(
              ctx,
              'STAGING_STATE_INVALID',
              'Hidden staging tab was not found for this runId.',
              { runId: request.runId ?? null },
            );
          }
          const parsedMeta = parseStagingMetadata(existingStageSheet, ctx.schema, {
            endpoint: ctx.endpoint,
            env: ctx.env,
            runId: request.runId!,
            expectedFingerprintDigest: expectedFp.fingerprintDigest,
          });
          if (!parsedMeta.ok) {
            return makeCommitStop(ctx, 'STAGING_STATE_INVALID', parsedMeta.message, {
              runId: request.runId!,
              stagingTabRetained: existingStageTabName,
            });
          }
          existingMeta = parsedMeta.meta;
          if (request.startPage !== existingMeta.lastPageStaged + 1) {
            return makeCommitStop(
              ctx,
              'STAGING_STATE_INVALID',
              'Staging batch startPage did not follow exact sequential forward order.',
              { runId: request.runId!, stagingTabRetained: existingStageTabName },
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

        const fetchResult = fetchLargeKeyedBatch({
          endpoint: ctx.endpoint,
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
                destinationTab: ctx.schema.tab,
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
            stagingTabRetained: existingStageTabName,
          });
        }

        const rowIndexOffset = (fetchResult.startPage - 1) * effectivePageSize;
        const projected = validateAndProjectLargeKeyedRows(
          ctx.endpoint,
          fetchResult.items,
          platform.sha256Hex,
          (rawId) => pseudonymizer!.deriveKey(ctx.endpoint, rawId),
          rowIndexOffset,
        );
        if (!projected.ok) {
          const first = projected.diagnostics[0];
          return makeCommitStop(
            ctx,
            first?.code ?? 'TYPE_MISMATCH',
            first?.message ?? `Re-fetched ${ctx.endpoint} batch failed schema validation.`,
            { runId: request.runId ?? null, stagingTabRetained: existingStageTabName },
          );
        }

        const now = platform.now();
        const runId = isFirstBatch ? platform.generateRunId(ctx.endpoint, now) : request.runId!;
        if (!RUN_ID_PATTERN.test(runId)) {
          return makeCommitStop(
            ctx,
            'STAGING_STATE_INVALID',
            'Generated runId failed identifier validation.',
          );
        }
        const stageTabName = buildStagingTabName(ctx.endpoint, runId);
        if (stageTabName.length > MAX_STAGING_TAB_NAME_LENGTH) {
          return makeCommitStop(
            ctx,
            'STAGING_STATE_INVALID',
            'Staging tab name exceeds safe Google Sheets length limit.',
          );
        }

        const chunkOrdinal = existingMeta ? existingMeta.chunkDigests.length + 1 : 1;
        const batchDigest = computeChunkDigest(projected.rows, platform.sha256Hex);
        const nextMeta: StagingMetadata = {
          version: STAGING_PROTOCOL_VERSION,
          endpoint: ctx.endpoint,
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

        try {
          const writeRes = writeStagingBatch({
            spreadsheet,
            schema: ctx.schema,
            stageTabName,
            isFirstBatch,
            existingStageSheet,
            priorStagedRowCount: existingMeta?.stagedRowCount ?? 0,
            chunkOrdinal,
            rows: projected.rows,
            nextMeta,
          });
          if (!writeRes.ok) {
            return makeCommitStop(ctx, 'STAGING_STATE_INVALID', writeRes.message, {
              runId,
              stagingTabRetained: spreadsheet.getSheetByName(stageTabName) ? stageTabName : null,
            });
          }
          platform.flushSpreadsheet();

          return {
            ok: true,
            data: {
              status: 'BATCH_STAGED',
              runId,
              endpoint: ctx.endpoint,
              env: ctx.env,
              destinationTab: ctx.schema.tab,
              stagingTabName: stageTabName,
              lastPageStaged: fetchResult.lastPageFetched,
              totalPages: fetchResult.totalPages,
              stagedRowCount: nextMeta.stagedRowCount,
              sourceTotal: fetchResult.sourceTotal,
              hasMore: fetchResult.hasMore,
              nextPage: fetchResult.nextPage,
            },
          };
        } catch {
          const retained = spreadsheet.getSheetByName(stageTabName) ? stageTabName : null;
          return makeCommitStop(
            ctx,
            'WRITE_FAILED_UNKNOWN',
            'Staging batch write or flush failed with an unknown outcome. Do not retry automatically; inspect the hidden staging tab.',
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
 * Multi-batch Commit finalization (`finalizeLargeDatasetCommit`):
 * - Under `LockService`, independently reads back & verifies every row, chunk digest, and
 *   datasetDigest from hidden `_Stage_assignments_<runId>`, plus `sheetRevisionFingerprint`.
 * - Enforces `THAIPHC_HMAC_KEY_B64` presence/validity before person-dataset mutation.
 * - Stops with `PREVIEW_STALE_RECONFIRM_REQUIRED` before touching live `Assignments` if
 *   source or destination drifted.
 * - Writes `_ThaiPHCSyncLog` (`STARTED`), applies Keyed Upsert to `Assignments`, runs
 *   mandatory Destination Readback, and deletes `_Stage_*` ONLY after readback passes.
 */
export function finalizeLargeDatasetCommitWithPlatform(
  request: FinalizeLargeDatasetCommitRequest,
  platform: SyncPlatform,
): CommitDatasetResponse {
  try {
    if (!request || typeof request !== 'object') {
      return {
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Finalize commit request payload is required.',
        },
      };
    }
    const base = validateLargeContext(
      request.endpoint,
      platform,
      'Multi-batch commit finalization is enabled for assignments, resigned-volunteers, and volunteer-tenure.',
    );
    if (!base.ok) {
      return { ok: false, error: { code: base.code, message: base.message } };
    }
    const { ctx } = base;

    if (typeof request.runId !== 'string' || !RUN_ID_PATTERN.test(request.runId)) {
      return makeCommitStop(
        ctx,
        'STAGING_STATE_INVALID',
        'A valid runId is required to finalize a staged commit.',
      );
    }
    const runId = request.runId;
    const stageTabName = buildStagingTabName(ctx.endpoint, runId);

    const preLock = validateCommitPreLock(
      ctx,
      {
        expectedFingerprint: request.expectedFingerprint,
        confirmationPhrase: request.confirmationPhrase,
        runId,
        requireHmacKey: true,
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
        stageTabNameForRetention: stageTabName,
      },
      platform,
      ({ spreadsheet, logSummary }) => {
        const stageSheet = spreadsheet.getSheetByName(stageTabName);
        if (!stageSheet) {
          return makeCommitStop(
            ctx,
            'STAGING_STATE_INVALID',
            `Hidden staging tab "${stageTabName}" was not found.`,
            { runId },
          );
        }

        const parsedMeta = parseStagingMetadata(stageSheet, ctx.schema, {
          endpoint: ctx.endpoint,
          env: ctx.env,
          runId,
          expectedFingerprintDigest: expectedFp.fingerprintDigest,
        });
        if (!parsedMeta.ok) {
          return makeCommitStop(ctx, 'STAGING_STATE_INVALID', parsedMeta.message, {
            runId,
            stagingTabRetained: stageTabName,
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
            'Hidden staging tab does not contain all expected pages or rows before finalization.',
            { runId, stagingTabRetained: stageTabName },
          );
        }

        const verifiedStage = reconstructAndVerifyStagedRows(
          stageSheet,
          ctx.schema,
          meta,
          platform.sha256Hex,
        );
        if (!verifiedStage.ok) {
          return makeCommitStop(ctx, verifiedStage.code, verifiedStage.message, {
            runId,
            stagingTabRetained: stageTabName,
          });
        }

        const destResult = readDestinationState(spreadsheet, ctx.schema);
        if (!destResult.ok) {
          return makeCommitStop(ctx, destResult.diagnostic.code, destResult.diagnostic.message, {
            runId,
            stagingTabRetained: stageTabName,
          });
        }

        const currentSheetRevision = computeSheetRevisionFingerprint(
          destResult.state,
          logSummary,
          platform.sha256Hex,
        );
        const { counts: diffCounts } = countKeyedDiffByDigest(verifiedStage.rows, destResult.state);
        const countsChanged =
          diffCounts.insert !== expectedFp.counts.insert ||
          diffCounts.update !== expectedFp.counts.update ||
          diffCounts.unchanged !== expectedFp.counts.unchanged ||
          diffCounts.review !== expectedFp.counts.review;
        const sourceChanged =
          verifiedStage.rows.length !== expectedFp.sourceTotal ||
          verifiedStage.datasetDigest !== expectedFp.datasetDigest;
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
              destinationTab: ctx.schema.tab,
              driftReason,
              expectedFingerprint: expectedFp,
              currentSourceTotal: verifiedStage.rows.length,
              currentDatasetDigest: verifiedStage.datasetDigest,
              currentSheetRevisionFingerprint: currentSheetRevision,
            },
          };
        }

        return executeVerifiedKeyedWrite({
          ctx,
          spreadsheet,
          projectedRows: verifiedStage.rows,
          destState: destResult.state,
          expectedFp,
          diffCounts,
          runId,
          nowUtc: platform.now().toISOString(),
          stageTabName,
          platform,
        });
      },
    );
  } catch {
    return {
      ok: false,
      error: { code: 'COMMIT_FAILED', message: 'Finalize commit failed unexpectedly.' },
    };
  }
}
