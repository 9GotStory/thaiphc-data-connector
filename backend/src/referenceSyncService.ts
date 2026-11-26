import {
  getDatasetDescriptor,
  isReferenceEndpoint,
  isSmallKeyedEndpoint,
  SMALL_KEYED_SCHEMAS,
  type KeyedDatasetSchemaSpec,
  type ReferenceSchemaSpec,
} from './datasetCatalog.ts';
import {
  formatVolunteerGenderScopeLabel,
  validateAndProjectVolunteerGenderRows,
  type ProjectedVolunteerGenderRow,
} from './extendedReportProjection.ts';
import {
  computePreviewFingerprint,
  computeSheetRevisionFingerprint,
  evaluateWriteGuards,
  executeVerifiedKeyedWrite,
  makeCommitStop,
  readDestinationState,
  readEndpointSyncLogSummary,
  resolveTargetSpreadsheetId,
  validateCommitPreLock,
  withLockedCommitWorkbook,
  type DestinationState,
  type ExistingDestinationRow,
  type ProjectedKeyedRowBase,
} from './keyedSyncCore.ts';
import {
  validateAndProjectReferenceRows,
  type ProjectedReferenceRow,
} from './referenceValidator.ts';
import {
  cellToString,
  detectLegacySnapshot,
  isValidSpreadsheetId,
  parseEnvironment,
  readReportCurrentPointers,
} from './sheetConfig.ts';
import { fetchSmallKeyedDataset, isValidBearerToken } from './thaiphcClient.ts';
import type {
  AppEnvironment,
  CommitDatasetResponse,
  CommitSmallDatasetRequest,
  DiffCounts,
  DiffKind,
  ExtendedAggregateGroup,
  ExtendedMinimizedPreviewRow,
  PreviewDatasetRequest,
  PreviewDatasetResponse,
  PreviewDiagnostic,
  PreviewReadyBase,
  ReferenceChangedField,
  ReferencePreviewRow,
  ReviewReasonCode,
  SmallKeyedDatasetEndpoint,
  StaleDriftReason,
  SyncPlatform,
  SyncRpcErrorCode,
  UnresolvedRunSummary,
  WritableSpreadsheetHandle,
} from './types.ts';

interface ValidatedBaseContext {
  endpoint: SmallKeyedDatasetEndpoint;
  isExtendedReport: boolean;
  env: AppEnvironment;
  referenceSpreadsheetId: string;
  schema: KeyedDatasetSchemaSpec<SmallKeyedDatasetEndpoint>;
}

function previewRpcError(code: SyncRpcErrorCode, message: string): PreviewDatasetResponse {
  return { ok: false, error: { code, message } };
}

function commitRpcError(code: SyncRpcErrorCode, message: string): CommitDatasetResponse {
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
  if (typeof request.endpoint !== 'string' || !isSmallKeyedEndpoint(request.endpoint)) {
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
      endpoint: request.endpoint,
      isExtendedReport: !isReferenceEndpoint(request.endpoint),
      env,
      referenceSpreadsheetId,
      schema: SMALL_KEYED_SCHEMAS[request.endpoint],
    },
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
  schema: KeyedDatasetSchemaSpec,
  existing: ExistingDestinationRow,
  incoming: ProjectedKeyedRowBase,
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

function computeKeyedDiff<TRow extends ProjectedKeyedRowBase, TPreviewRow>(
  projectedRows: readonly TRow[],
  dest: DestinationState,
  mapIncoming: (
    row: TRow,
    diffKind: Exclude<DiffKind, 'REVIEW'>,
    existing: ExistingDestinationRow | undefined,
  ) => TPreviewRow,
  mapMissing: (existing: ExistingDestinationRow) => TPreviewRow,
): {
  counts: DiffCounts;
  reviewBreakdown: Partial<Record<ReviewReasonCode, number>>;
  sampleRows: TPreviewRow[];
  missingKeys: string[];
} {
  let insert = 0;
  let update = 0;
  let unchanged = 0;
  let incomingReviewCount = 0;
  const reviewBreakdown: Partial<Record<ReviewReasonCode, number>> = {};
  const incomingKeys = new Set<string>();
  const sampleRows: TPreviewRow[] = [];

  for (const row of projectedRows) {
    incomingKeys.add(row.key);
    const existing = dest.byKey.get(row.key);
    if (row.reviewReasons.length > 0) {
      incomingReviewCount += 1;
      for (const reason of row.reviewReasons) {
        reviewBreakdown[reason] = (reviewBreakdown[reason] ?? 0) + 1;
      }
    }

    if (!existing) {
      insert += 1;
      sampleRows.push(mapIncoming(row, 'INSERT', undefined));
    } else if (existing.rowDigest === row.rowDigest) {
      unchanged += 1;
      sampleRows.push(mapIncoming(row, 'UNCHANGED', existing));
    } else {
      update += 1;
      sampleRows.push(mapIncoming(row, 'UPDATE', existing));
    }
  }

  const missingKeys: string[] = [];
  for (const existing of dest.rows) {
    if (!incomingKeys.has(existing.key)) {
      missingKeys.push(existing.key);
      sampleRows.push(mapMissing(existing));
    }
  }

  if (missingKeys.length > 0) {
    reviewBreakdown.MISSING_IN_SOURCE = missingKeys.length;
  }

  return {
    counts: {
      insert,
      update,
      unchanged,
      review: missingKeys.length + incomingReviewCount,
    },
    reviewBreakdown,
    sampleRows,
    missingKeys,
  };
}

function computeReferenceDiff(
  schema: ReferenceSchemaSpec,
  projectedRows: readonly ProjectedReferenceRow[],
  dest: DestinationState,
) {
  const nameFieldIdx = schema.fields.findIndex((f) => f.name === schema.displayNameField);
  return computeKeyedDiff(
    projectedRows,
    dest,
    (row, diffKind, existing) => ({
      diffKind,
      sourceKey: row.key,
      displayName: row.displayName,
      displayCode: row.displayCode,
      changedFields:
        diffKind === 'UPDATE' && existing ? computeChangedFields(schema, existing, row) : [],
      summaryFields: buildSummaryFields(schema, row),
      reviewReasons: [...row.reviewReasons],
    }),
    (existing): ReferencePreviewRow => {
      const existingName = nameFieldIdx >= 0 ? cellToString(existing.cells[nameFieldIdx]) : '';
      return {
        diffKind: 'REVIEW',
        sourceKey: existing.key,
        displayName: existingName || existing.key,
        displayCode: existing.key,
        changedFields: [],
        summaryFields: [],
        reviewReasons: ['MISSING_IN_SOURCE'],
      };
    },
  );
}

function computeVolunteerGenderDiff(
  schema: KeyedDatasetSchemaSpec,
  projectedRows: readonly ProjectedVolunteerGenderRow[],
  dest: DestinationState,
) {
  const subCodeIdx = schema.fields.findIndex((f) => f.name === 'subdistrictCode');
  const subNameIdx = schema.fields.findIndex((f) => f.name === 'subdistrictName');
  const villageNoIdx = schema.fields.findIndex((f) => f.name === 'villageNo');
  const villageNameIdx = schema.fields.findIndex((f) => f.name === 'villageName');

  return computeKeyedDiff(
    projectedRows,
    dest,
    (row, diffKind): ExtendedMinimizedPreviewRow => ({
      diffKind,
      sourceKey: row.key,
      scopeLabel: row.scopeLabel,
      minimizedAttributes: [...row.minimizedAttributes],
      reviewReasons: [...row.reviewReasons],
    }),
    (existing): ExtendedMinimizedPreviewRow => ({
      diffKind: 'REVIEW',
      sourceKey: existing.key,
      scopeLabel: formatVolunteerGenderScopeLabel({
        subdistrictCode: subCodeIdx >= 0 ? cellToString(existing.cells[subCodeIdx]) : '',
        subdistrictName: subNameIdx >= 0 ? cellToString(existing.cells[subNameIdx]) : '',
        villageNo: villageNoIdx >= 0 ? cellToString(existing.cells[villageNoIdx]) : '',
        villageName: villageNameIdx >= 0 ? cellToString(existing.cells[villageNameIdx]) : '',
      }),
      minimizedAttributes: [],
      reviewReasons: ['MISSING_IN_SOURCE'],
    }),
  );
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

type ProjectedValidationOutcome =
  | {
      ok: true;
      mode: 'REFERENCE_READABLE';
      rows: ProjectedReferenceRow[];
      datasetDigest: string;
    }
  | {
      ok: true;
      mode: 'EXTENDED_MINIMIZED';
      rows: ProjectedVolunteerGenderRow[];
      datasetDigest: string;
      aggregateSummary: ExtendedAggregateGroup[];
    }
  | { ok: false; diagnostics: PreviewDiagnostic[] };

function validateAndProjectSmallDataset(
  endpoint: SmallKeyedDatasetEndpoint,
  rawItems: readonly unknown[],
  sha256Hex: (input: string) => string,
): ProjectedValidationOutcome {
  if (isReferenceEndpoint(endpoint)) {
    const res = validateAndProjectReferenceRows(endpoint, rawItems, sha256Hex);
    if (!res.ok) return res;
    return {
      ok: true,
      mode: 'REFERENCE_READABLE',
      rows: res.rows,
      datasetDigest: res.datasetDigest,
    };
  }
  const res = validateAndProjectVolunteerGenderRows(rawItems, sha256Hex);
  if (!res.ok) return res;
  return {
    ok: true,
    mode: 'EXTENDED_MINIMIZED',
    rows: res.rows,
    datasetDigest: res.datasetDigest,
    aggregateSummary: res.aggregateSummary,
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
      'Single-call Preview is enabled for Reference Datasets (subdistricts, villages, health-services) and volunteer-gender; use previewDatasetBatch + finalizePreview for large datasets.',
    );
    if (!base.ok) {
      return previewRpcError(base.code, base.message);
    }
    const { ctx } = base;

    const targetIdResult = resolveTargetSpreadsheetId(ctx, platform);
    if (!targetIdResult.ok) {
      return previewRpcError('SPREADSHEET_NOT_CONFIGURED', targetIdResult.message);
    }

    let spreadsheet: WritableSpreadsheetHandle;
    try {
      spreadsheet = platform.openSpreadsheetById(targetIdResult.spreadsheetId);
    } catch {
      return previewRpcError(
        'WORKBOOK_ACCESS_FAILED',
        ctx.isExtendedReport
          ? 'Unable to open the configured report Google Sheets workbook.'
          : 'Unable to open the configured reference Google Sheets workbook.',
      );
    }

    const descriptor = getDatasetDescriptor(ctx.endpoint);
    const previewedAtUtc = platform.now().toISOString();
    const logSummary = readEndpointSyncLogSummary(spreadsheet, ctx.endpoint);

    const fetchResult = fetchSmallKeyedDataset(
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

    const validation = validateAndProjectSmallDataset(
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

    const sheetRevisionFingerprint = computeSheetRevisionFingerprint(
      destResult.state,
      logSummary,
      platform.sha256Hex,
    );

    const guardStatus = evaluateWriteGuards(ctx, platform);
    const buildReadyBase = (
      counts: DiffCounts,
      reviewBreakdown: Partial<Record<ReviewReasonCode, number>>,
      legacy: { legacySnapshotPresent: boolean; legacySnapshotTab: string | null },
    ): PreviewReadyBase => ({
      status: 'READY',
      endpoint: ctx.endpoint,
      env: ctx.env,
      syncMode: descriptor.syncMode,
      paginationProtocol: descriptor.paginationProtocol,
      destinationTab: ctx.schema.tab,
      previewedAtUtc,
      pagesFetched: fetchResult.pagesFetched,
      sourceTotal: fetchResult.sourceTotal,
      fingerprint: computePreviewFingerprint(
        ctx.endpoint,
        ctx.env,
        fetchResult.sourceTotal,
        validation.datasetDigest,
        sheetRevisionFingerprint,
        counts,
        platform.sha256Hex,
      ),
      counts,
      reviewBreakdown,
      unresolvedPreviousRun: logSummary.unresolvedRun,
      legacySnapshotPresent: legacy.legacySnapshotPresent,
      legacySnapshotTab: legacy.legacySnapshotTab,
      writeAllowed: guardStatus.writeAllowed,
      blockedGuardReason: guardStatus.blockedGuardReason,
    });

    if (validation.mode === 'REFERENCE_READABLE') {
      const diff = computeReferenceDiff(
        ctx.schema as ReferenceSchemaSpec,
        validation.rows,
        destResult.state,
      );
      return {
        ok: true,
        data: {
          ...buildReadyBase(diff.counts, diff.reviewBreakdown, {
            legacySnapshotPresent: false,
            legacySnapshotTab: null,
          }),
          previewMode: 'REFERENCE_READABLE',
          sampleRows: diff.sampleRows,
        },
      };
    }

    const diff = computeVolunteerGenderDiff(ctx.schema, validation.rows, destResult.state);
    const reportPointers = readReportCurrentPointers(spreadsheet);
    const legacy = detectLegacySnapshot(
      ctx.endpoint,
      descriptor.legacyPrefix,
      destResult.state.exists,
      reportPointers,
      spreadsheet.getSheetNames(),
    );

    return {
      ok: true,
      data: {
        ...buildReadyBase(diff.counts, diff.reviewBreakdown, legacy),
        previewMode: 'EXTENDED_MINIMIZED',
        aggregateSummary: validation.aggregateSummary,
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
): CommitDatasetResponse {
  try {
    const base = validateBaseRequest(
      request,
      platform,
      'Commit request payload is required.',
      'Single-call Commit is enabled for Reference Datasets (subdistricts, villages, health-services) and volunteer-gender; use stageLargeDatasetBatch + finalizeLargeDatasetCommit for large datasets.',
    );
    if (!base.ok) {
      return commitRpcError(base.code, base.message);
    }
    const { ctx } = base;

    const preLock = validateCommitPreLock(
      ctx,
      {
        expectedFingerprint: request.expectedFingerprint,
        confirmationPhrase: request.confirmationPhrase,
      },
      platform,
    );
    if (!preLock.ok) {
      return preLock.response;
    }
    const { expectedFp } = preLock;

    return withLockedCommitWorkbook(
      ctx,
      { acknowledgeUnresolvedRunId: request.acknowledgeUnresolvedRunId },
      platform,
      ({ spreadsheet, logSummary }) => {
        const fetchResult = fetchSmallKeyedDataset(
          ctx.endpoint,
          request.token,
          platform.fetchUrl,
          request.pageSize,
        );
        if (!fetchResult.ok) {
          if (fetchResult.authFailed) {
            return commitRpcError('HTTP_401', fetchResult.message);
          }
          return makeCommitStop(ctx, fetchResult.code, fetchResult.message);
        }

        const validation = validateAndProjectSmallDataset(
          ctx.endpoint,
          fetchResult.items,
          platform.sha256Hex,
        );
        if (!validation.ok) {
          const first = validation.diagnostics[0];
          return makeCommitStop(
            ctx,
            first?.code ?? 'TYPE_MISMATCH',
            first?.message ?? 'Re-fetched source dataset failed schema validation.',
          );
        }

        const destResult = readDestinationState(spreadsheet, ctx.schema);
        if (!destResult.ok) {
          return makeCommitStop(ctx, destResult.diagnostic.code, destResult.diagnostic.message);
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

        const diffCounts: DiffCounts =
          validation.mode === 'REFERENCE_READABLE'
            ? computeReferenceDiff(
                ctx.schema as ReferenceSchemaSpec,
                validation.rows,
                destResult.state,
              ).counts
            : computeVolunteerGenderDiff(ctx.schema, validation.rows, destResult.state).counts;

        const now = platform.now();
        return executeVerifiedKeyedWrite({
          ctx,
          spreadsheet,
          projectedRows: validation.rows,
          destState: destResult.state,
          expectedFp,
          diffCounts,
          runId: platform.generateRunId(ctx.endpoint, now),
          nowUtc: now.toISOString(),
          platform,
        });
      },
    );
  } catch {
    return commitRpcError('COMMIT_FAILED', 'Commit failed unexpectedly before completion.');
  }
}
