import {
  GasRpcClientError,
  type AppEnvironment,
  type BlockedGuardReason,
  type CommitSmallDatasetData,
  type CommitStopCode,
  type DashboardDatasetStatus,
  type DashboardStatusData,
  type DatasetEndpoint,
  type DatasetGroup,
  type DatasetLastStatus,
  type DiffCounts,
  type DiffKind,
  type ExtendedAggregateGroup,
  type ExtendedMinimizedAttribute,
  type ExtendedMinimizedPreviewRow,
  type GasRpcErrorCode,
  type PaginationProtocol,
  type PreviewDatasetData,
  type PreviewDiagnostic,
  type PreviewFingerprint,
  type PreviewStopCode,
  type ReadbackVerification,
  type ReferenceChangedField,
  type ReferencePreviewRow,
  type ReviewReasonCode,
  type SameWorkbookPolicy,
  type StaleDriftReason,
  type SyncMode,
  type UnresolvedRunSummary,
  type WorkbookInfo,
} from './types';

const VALID_ENDPOINTS: ReadonlySet<string> = new Set<DatasetEndpoint>([
  'subdistricts',
  'villages',
  'health-services',
  'volunteer-gender',
  'assignments',
  'volunteer-family',
  'resigned-volunteers',
  'volunteer-tenure',
]);

const VALID_GROUPS: ReadonlySet<string> = new Set<DatasetGroup>(['reference', 'extended_report']);
const VALID_SYNC_MODES: ReadonlySet<string> = new Set<SyncMode>([
  'KEYED_UPSERT',
  'COMPLETE_SNAPSHOT',
]);
const VALID_PAGINATION: ReadonlySet<string> = new Set<PaginationProtocol>([
  'none',
  'offset',
  'assignment',
  'report',
]);
const VALID_STATUSES: ReadonlySet<string> = new Set<DatasetLastStatus>([
  'COMMITTED_VERIFIED',
  'UNRESOLVED_PREVIOUS_RUN',
  'FAILED_STOP',
  'NEVER_SYNCED',
]);
const VALID_SAME_WORKBOOK_POLICIES: ReadonlySet<string> = new Set<SameWorkbookPolicy>([
  'SEPARATE_WORKBOOK',
  'SAME_WORKBOOK_APPROVED',
  'SAME_WORKBOOK_UNAPPROVED',
  'INVALID_REPORT_WORKBOOK',
]);
const VALID_DIFF_KINDS: ReadonlySet<string> = new Set<DiffKind>([
  'INSERT',
  'UPDATE',
  'UNCHANGED',
  'REVIEW',
]);
const VALID_BLOCKED_GUARD_REASONS: ReadonlySet<string> = new Set<BlockedGuardReason>([
  'THAIPHC_WRITE_ENABLED',
  'THAIPHC_PERSON_DATA_WRITE_ENABLED',
  'THAIPHC_SAME_WORKBOOK_APPROVAL',
  'THAIPHC_REPORT_SPREADSHEET_ID',
]);
const VALID_REVIEW_REASONS: ReadonlySet<string> = new Set<ReviewReasonCode>([
  'MISSING_IN_SOURCE',
  'PLACEHOLDER_COORDS',
  'SMALL_CELL_SUPPRESSED',
]);
const PREVIEW_STOP_CODE_LIST: readonly PreviewStopCode[] = [
  'HTTP_403',
  'HTTP_ERROR',
  'REDIRECT_REJECTED',
  'UNEXPECTED_CONTENT_TYPE',
  'RESPONSE_TOO_LARGE',
  'INVALID_JSON',
  'FETCH_EXCEPTION',
  'INVALID_ENVELOPE',
  'OUT_OF_GEOGRAPHIC_SCOPE',
  'DUPLICATE_SOURCE_KEY',
  'MISSING_SOURCE_KEY',
  'UNEXPECTED_FIELD',
  'TYPE_MISMATCH',
  'GENDER_TOTAL_MISMATCH',
  'FORMULA_INJECTION_DETECTED',
  'ASCII_CONTROL_CHAR',
  'SOURCE_TOTAL_DRIFT',
  'SOURCE_TOTAL_CHANGED',
  'INCOMPLETE_PAGINATION',
  'INCOMPLETE_SNAPSHOT',
  'ROW_LIMIT_EXCEEDED',
  'HEADER_MISMATCH',
  'INVALID_EXISTING_KEY',
  'DESTINATION_TOO_LARGE',
];
const VALID_PREVIEW_STOP_CODES: ReadonlySet<string> = new Set<PreviewStopCode>(
  PREVIEW_STOP_CODE_LIST,
);
const VALID_COMMIT_STOP_CODES: ReadonlySet<string> = new Set<CommitStopCode>([
  ...PREVIEW_STOP_CODE_LIST,
  'WRITE_DISABLED',
  'PERSON_DATA_WRITE_DISABLED',
  'SAME_WORKBOOK_UNAPPROVED',
  'INVALID_REPORT_WORKBOOK',
  'PRODUCTION_CONFIRMATION_REQUIRED',
  'LOCK_BUSY',
  'UNRESOLVED_PREVIOUS_RUN',
  'INVALID_FINGERPRINT',
  'READBACK_MISMATCH',
  'WRITE_FAILED_UNKNOWN',
]);
const VALID_STALE_DRIFT_REASONS: ReadonlySet<string> = new Set<StaleDriftReason>([
  'SOURCE_CHANGED',
  'DESTINATION_CHANGED',
  'BOTH_CHANGED',
  'ENV_MISMATCH',
]);
const DASHBOARD_ERROR_LIST: readonly GasRpcErrorCode[] = [
  'INVALID_ENV_CONFIG',
  'SPREADSHEET_NOT_CONFIGURED',
  'WORKBOOK_ACCESS_FAILED',
  'DASHBOARD_LOAD_FAILED',
];
const ALLOWLISTED_DASHBOARD_ERRORS: ReadonlySet<string> = new Set<GasRpcErrorCode>(
  DASHBOARD_ERROR_LIST,
);
const ALLOWLISTED_SYNC_ERRORS: ReadonlySet<string> = new Set<GasRpcErrorCode>([
  ...DASHBOARD_ERROR_LIST,
  'INVALID_REQUEST',
  'INVALID_TOKEN_FORMAT',
  'HTTP_401',
  'DATASET_NOT_SUPPORTED',
  'PREVIEW_FAILED',
  'COMMIT_FAILED',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalidResponse(detail: string): never {
  throw new GasRpcClientError('INVALID_RPC_RESPONSE', detail);
}

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    invalidResponse(`Invalid string field: ${field}`);
  }
  return value;
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    invalidResponse(`Invalid string field: ${field}`);
  }
  return value;
}

function assertAllowedEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  field: string,
): T {
  const str = assertNonEmptyString(value, field);
  if (!allowed.has(str)) {
    invalidResponse(`Invalid enum value for ${field}`);
  }
  return str as T;
}

function assertNullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    invalidResponse(`Invalid nullable string field: ${field}`);
  }
  return value;
}

function assertBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    invalidResponse(`Invalid boolean field: ${field}`);
  }
  return value;
}

function assertNonNegInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    invalidResponse(`Invalid integer field: ${field}`);
  }
  return value;
}

function assertNullableNonNegInt(value: unknown, field: string): number | null {
  if (value === null) return null;
  return assertNonNegInt(value, field);
}

function assertEnv(value: unknown, field: string): AppEnvironment {
  if (value !== 'SANDBOX' && value !== 'PRODUCTION') {
    invalidResponse(`Invalid environment field: ${field}`);
  }
  return value;
}

function unwrapEnvelope(
  raw: unknown,
  allowedErrors: ReadonlySet<string>,
  fallbackCode: GasRpcErrorCode,
  fallbackMessage: string,
): Record<string, unknown> {
  if (!isRecord(raw) || typeof raw.ok !== 'boolean') {
    invalidResponse('GAS RPC response is not a valid envelope.');
  }

  if (raw.ok === false) {
    const errObj = isRecord(raw.error) ? raw.error : null;
    const rawCode = errObj && typeof errObj.code === 'string' ? errObj.code : '';
    const safeCode: GasRpcErrorCode = allowedErrors.has(rawCode)
      ? (rawCode as GasRpcErrorCode)
      : fallbackCode;
    const safeMessage =
      errObj && typeof errObj.message === 'string' && safeCode === rawCode
        ? errObj.message
        : fallbackMessage;
    throw new GasRpcClientError(safeCode, safeMessage);
  }

  if (!isRecord(raw.data)) {
    invalidResponse('Missing RPC data payload.');
  }
  return raw.data;
}

function parseWorkbook(value: unknown, field: string): WorkbookInfo {
  if (!isRecord(value)) {
    invalidResponse(`Invalid workbook object: ${field}`);
  }
  return {
    spreadsheetId: assertNonEmptyString(value.spreadsheetId, `${field}.spreadsheetId`),
    name: assertNonEmptyString(value.name, `${field}.name`),
  };
}

function parseUnresolvedRun(value: unknown, label: string): UnresolvedRunSummary {
  if (!isRecord(value)) {
    invalidResponse(`Invalid ${label}`);
  }
  const endpoint = assertAllowedEnum<DatasetEndpoint>(
    value.endpoint,
    VALID_ENDPOINTS,
    `${label}.endpoint`,
  );
  if (value.status !== 'STARTED') {
    invalidResponse(`Invalid status in ${label}`);
  }
  return {
    endpoint,
    runId: assertNonEmptyString(value.runId, `${label}.runId`),
    startedAtUtc: assertNullableString(value.startedAtUtc, `${label}.startedAtUtc`),
    status: 'STARTED',
  };
}

function parseDataset(value: unknown, index: number): DashboardDatasetStatus {
  if (!isRecord(value)) {
    invalidResponse(`Invalid datasets[${index}]`);
  }

  return {
    endpoint: assertAllowedEnum<DatasetEndpoint>(
      value.endpoint,
      VALID_ENDPOINTS,
      `datasets[${index}].endpoint`,
    ),
    group: assertAllowedEnum<DatasetGroup>(value.group, VALID_GROUPS, `datasets[${index}].group`),
    syncMode: assertAllowedEnum<SyncMode>(
      value.syncMode,
      VALID_SYNC_MODES,
      `datasets[${index}].syncMode`,
    ),
    paginationProtocol: assertAllowedEnum<PaginationProtocol>(
      value.paginationProtocol,
      VALID_PAGINATION,
      `datasets[${index}].paginationProtocol`,
    ),
    destinationTab: assertNonEmptyString(value.destinationTab, `datasets[${index}].destinationTab`),
    rowCount: assertNullableNonNegInt(value.rowCount, `datasets[${index}].rowCount`),
    lastRunId: assertNullableString(value.lastRunId, `datasets[${index}].lastRunId`),
    lastSyncedAtUtc: assertNullableString(
      value.lastSyncedAtUtc,
      `datasets[${index}].lastSyncedAtUtc`,
    ),
    lastStatus: assertAllowedEnum<DatasetLastStatus>(
      value.lastStatus,
      VALID_STATUSES,
      `datasets[${index}].lastStatus`,
    ),
    publicationPointerActive: assertBoolean(
      value.publicationPointerActive,
      `datasets[${index}].publicationPointerActive`,
    ),
    legacySnapshotPresent: assertBoolean(
      value.legacySnapshotPresent,
      `datasets[${index}].legacySnapshotPresent`,
    ),
    legacySnapshotTab: assertNullableString(
      value.legacySnapshotTab,
      `datasets[${index}].legacySnapshotTab`,
    ),
  };
}

function parseDiffCounts(value: unknown, field: string): DiffCounts {
  if (!isRecord(value)) {
    invalidResponse(`Invalid ${field}`);
  }
  return {
    insert: assertNonNegInt(value.insert, `${field}.insert`),
    update: assertNonNegInt(value.update, `${field}.update`),
    unchanged: assertNonNegInt(value.unchanged, `${field}.unchanged`),
    review: assertNonNegInt(value.review, `${field}.review`),
  };
}

function parsePreviewFingerprint(value: unknown, field: string): PreviewFingerprint {
  if (!isRecord(value)) {
    invalidResponse(`Invalid ${field}`);
  }
  return {
    endpoint: assertAllowedEnum<DatasetEndpoint>(
      value.endpoint,
      VALID_ENDPOINTS,
      `${field}.endpoint`,
    ),
    env: assertEnv(value.env, `${field}.env`),
    sourceTotal: assertNonNegInt(value.sourceTotal, `${field}.sourceTotal`),
    datasetDigest: assertNonEmptyString(value.datasetDigest, `${field}.datasetDigest`),
    sheetRevisionFingerprint: assertNonEmptyString(
      value.sheetRevisionFingerprint,
      `${field}.sheetRevisionFingerprint`,
    ),
    counts: parseDiffCounts(value.counts, `${field}.counts`),
    fingerprintDigest: assertNonEmptyString(value.fingerprintDigest, `${field}.fingerprintDigest`),
  };
}

function parseDiagnostic(value: unknown, index: number): PreviewDiagnostic {
  if (!isRecord(value)) {
    invalidResponse(`Invalid diagnostics[${index}]`);
  }
  const diag: PreviewDiagnostic = {
    code: assertAllowedEnum<PreviewStopCode>(
      value.code,
      VALID_PREVIEW_STOP_CODES,
      `diagnostics[${index}].code`,
    ),
    message: assertNonEmptyString(value.message, `diagnostics[${index}].message`),
  };
  if (value.field !== undefined) {
    diag.field = assertString(value.field, `diagnostics[${index}].field`);
  }
  if (value.rowIndex !== undefined) {
    diag.rowIndex = assertNonNegInt(value.rowIndex, `diagnostics[${index}].rowIndex`);
  }
  if (value.pageOffset !== undefined) {
    diag.pageOffset = assertNonNegInt(value.pageOffset, `diagnostics[${index}].pageOffset`);
  }
  return diag;
}

function parseChangedFields(value: unknown, label: string): ReferenceChangedField[] {
  if (!Array.isArray(value)) {
    invalidResponse(`Invalid ${label}`);
  }
  return value.map((entry, idx) => {
    if (!isRecord(entry)) {
      invalidResponse(`Invalid ${label}[${idx}]`);
    }
    return {
      field: assertNonEmptyString(entry.field, `${label}[${idx}].field`),
      before: assertString(entry.before, `${label}[${idx}].before`),
      after: assertString(entry.after, `${label}[${idx}].after`),
    };
  });
}

function parseReviewReasons(value: unknown, label: string): ReviewReasonCode[] {
  if (!Array.isArray(value)) {
    invalidResponse(`Invalid ${label}`);
  }
  return value.map((reason, idx) =>
    assertAllowedEnum<ReviewReasonCode>(reason, VALID_REVIEW_REASONS, `${label}[${idx}]`),
  );
}

function parseReferencePreviewRow(value: unknown, index: number): ReferencePreviewRow {
  if (!isRecord(value)) {
    invalidResponse(`Invalid sampleRows[${index}]`);
  }
  const changedFields = parseChangedFields(
    value.changedFields,
    `sampleRows[${index}].changedFields`,
  );

  if (!Array.isArray(value.summaryFields)) {
    invalidResponse(`Invalid sampleRows[${index}].summaryFields`);
  }
  const summaryFields = value.summaryFields.map((entry, idx) => {
    if (!isRecord(entry)) {
      invalidResponse(`Invalid sampleRows[${index}].summaryFields[${idx}]`);
    }
    return {
      field: assertNonEmptyString(entry.field, `summaryFields[${idx}].field`),
      value: assertString(entry.value, `summaryFields[${idx}].value`),
    };
  });

  const reviewReasons = parseReviewReasons(
    value.reviewReasons,
    `sampleRows[${index}].reviewReasons`,
  );

  return {
    diffKind: assertAllowedEnum<DiffKind>(
      value.diffKind,
      VALID_DIFF_KINDS,
      `sampleRows[${index}].diffKind`,
    ),
    sourceKey: assertNonEmptyString(value.sourceKey, `sampleRows[${index}].sourceKey`),
    displayName: assertString(value.displayName, `sampleRows[${index}].displayName`),
    displayCode: assertString(value.displayCode, `sampleRows[${index}].displayCode`),
    changedFields,
    summaryFields,
    reviewReasons,
  };
}

function parseExtendedAggregateGroup(value: unknown, index: number): ExtendedAggregateGroup {
  if (!isRecord(value)) {
    invalidResponse(`Invalid aggregateSummary[${index}]`);
  }
  return {
    groupCode: assertNonEmptyString(value.groupCode, `aggregateSummary[${index}].groupCode`),
    groupLabel: assertString(value.groupLabel, `aggregateSummary[${index}].groupLabel`),
    rowCount: assertNonNegInt(value.rowCount, `aggregateSummary[${index}].rowCount`),
    reviewCount: assertNonNegInt(value.reviewCount, `aggregateSummary[${index}].reviewCount`),
  };
}

function parseExtendedMinimizedAttribute(
  value: unknown,
  label: string,
): ExtendedMinimizedAttribute {
  if (!isRecord(value)) {
    invalidResponse(`Invalid ${label}`);
  }
  return {
    field: assertNonEmptyString(value.field, `${label}.field`),
    value: assertNullableString(value.value, `${label}.value`),
  };
}

function parseExtendedMinimizedPreviewRow(
  value: unknown,
  index: number,
): ExtendedMinimizedPreviewRow {
  if (!isRecord(value)) {
    invalidResponse(`Invalid sampleRows[${index}]`);
  }
  if (!Array.isArray(value.minimizedAttributes)) {
    invalidResponse(`Invalid sampleRows[${index}].minimizedAttributes`);
  }
  const minimizedAttributes = value.minimizedAttributes.map((attr, idx) =>
    parseExtendedMinimizedAttribute(attr, `sampleRows[${index}].minimizedAttributes[${idx}]`),
  );
  const reviewReasons = parseReviewReasons(
    value.reviewReasons,
    `sampleRows[${index}].reviewReasons`,
  );

  return {
    diffKind: assertAllowedEnum<DiffKind>(
      value.diffKind,
      VALID_DIFF_KINDS,
      `sampleRows[${index}].diffKind`,
    ),
    sourceKey: assertNonEmptyString(value.sourceKey, `sampleRows[${index}].sourceKey`),
    scopeLabel: assertString(value.scopeLabel, `sampleRows[${index}].scopeLabel`),
    minimizedAttributes,
    reviewReasons,
  };
}

function parseReadbackVerification(value: unknown): ReadbackVerification {
  if (!isRecord(value)) {
    invalidResponse('Invalid readback object');
  }
  if (!Array.isArray(value.baselineTabsChecked)) {
    invalidResponse('Invalid readback.baselineTabsChecked');
  }
  const baselineTabsChecked = value.baselineTabsChecked.map((tab, idx) =>
    assertNonEmptyString(tab, `readback.baselineTabsChecked[${idx}]`),
  );
  const stagingTabCleaned =
    value.stagingTabCleaned === null
      ? null
      : assertBoolean(value.stagingTabCleaned, 'readback.stagingTabCleaned');

  return {
    verified: assertBoolean(value.verified, 'readback.verified'),
    destinationTab: assertNonEmptyString(value.destinationTab, 'readback.destinationTab'),
    expectedRowCount: assertNonNegInt(value.expectedRowCount, 'readback.expectedRowCount'),
    actualRowCount: assertNonNegInt(value.actualRowCount, 'readback.actualRowCount'),
    uniqueKeysVerified: assertBoolean(value.uniqueKeysVerified, 'readback.uniqueKeysVerified'),
    rowDigestsVerified: assertBoolean(value.rowDigestsVerified, 'readback.rowDigestsVerified'),
    unrelatedTabsPreserved: assertBoolean(
      value.unrelatedTabsPreserved,
      'readback.unrelatedTabsPreserved',
    ),
    baselineTabsChecked,
    stagingTabCleaned,
  };
}

export function parseDashboardStatusResponse(raw: unknown): DashboardStatusData {
  const data = unwrapEnvelope(
    raw,
    ALLOWLISTED_DASHBOARD_ERRORS,
    'DASHBOARD_LOAD_FAILED',
    'ไม่สามารถโหลดสถานะ Dashboard จาก Google Apps Script ได้',
  );

  const env = assertEnv(data.env, 'env');
  const scope = data.scope;
  if (!isRecord(scope) || scope.provinceCode !== '54' || scope.districtCode !== '5406') {
    invalidResponse('Invalid geographic scope.');
  }

  const generatedAtUtc = assertNonEmptyString(data.generatedAtUtc, 'generatedAtUtc');

  if (!isRecord(data.workbooks)) {
    invalidResponse('Missing workbooks metadata.');
  }
  const reference = parseWorkbook(data.workbooks.reference, 'workbooks.reference');
  const report =
    data.workbooks.report === null
      ? null
      : parseWorkbook(data.workbooks.report, 'workbooks.report');
  const sameWorkbookPolicy = assertAllowedEnum<SameWorkbookPolicy>(
    data.workbooks.sameWorkbookPolicy,
    VALID_SAME_WORKBOOK_POLICIES,
    'workbooks.sameWorkbookPolicy',
  );

  if (!isRecord(data.guards)) {
    invalidResponse('Missing guards metadata.');
  }
  const guards = {
    writeEnabled: assertBoolean(data.guards.writeEnabled, 'guards.writeEnabled'),
    personDataWriteEnabled: assertBoolean(
      data.guards.personDataWriteEnabled,
      'guards.personDataWriteEnabled',
    ),
    hmacKeyConfigured: assertBoolean(data.guards.hmacKeyConfigured, 'guards.hmacKeyConfigured'),
    reportWorkbookApproved: assertBoolean(
      data.guards.reportWorkbookApproved,
      'guards.reportWorkbookApproved',
    ),
  };

  if (!Array.isArray(data.unresolvedRuns)) {
    invalidResponse('unresolvedRuns must be an array.');
  }
  const unresolvedRuns = data.unresolvedRuns.map((item, idx) =>
    parseUnresolvedRun(item, `unresolvedRuns[${idx}]`),
  );

  if (!Array.isArray(data.datasets) || data.datasets.length !== 8) {
    invalidResponse('datasets must contain exactly 8 ThaiPHC datasets.');
  }
  const datasets = data.datasets.map((item, idx) => parseDataset(item, idx));
  const uniqueEndpoints = new Set(datasets.map((d) => d.endpoint));
  if (uniqueEndpoints.size !== 8) {
    invalidResponse('datasets must contain all 8 unique endpoints.');
  }

  return {
    env,
    scope: { provinceCode: '54', districtCode: '5406' },
    generatedAtUtc,
    workbooks: {
      reference,
      report,
      sameWorkbookPolicy,
    },
    guards,
    unresolvedRuns,
    datasets,
  };
}

export function parsePreviewDatasetResponse(raw: unknown): PreviewDatasetData {
  const data = unwrapEnvelope(
    raw,
    ALLOWLISTED_SYNC_ERRORS,
    'PREVIEW_FAILED',
    'ไม่สามารถรัน Preview ข้อมูลจาก Google Apps Script ได้',
  );

  const endpoint = assertAllowedEnum<DatasetEndpoint>(data.endpoint, VALID_ENDPOINTS, 'endpoint');
  const env = assertEnv(data.env, 'env');
  const syncMode = assertAllowedEnum<SyncMode>(data.syncMode, VALID_SYNC_MODES, 'syncMode');
  const paginationProtocol = assertAllowedEnum<PaginationProtocol>(
    data.paginationProtocol,
    VALID_PAGINATION,
    'paginationProtocol',
  );
  const destinationTab = assertNonEmptyString(data.destinationTab, 'destinationTab');
  const previewedAtUtc = assertNonEmptyString(data.previewedAtUtc, 'previewedAtUtc');
  const pagesFetched = assertNonNegInt(data.pagesFetched, 'pagesFetched');
  const unresolvedPreviousRun =
    data.unresolvedPreviousRun === null
      ? null
      : parseUnresolvedRun(data.unresolvedPreviousRun, 'unresolvedPreviousRun');

  if (data.status === 'STOP_BLOCKED') {
    if (!Array.isArray(data.diagnostics) || data.diagnostics.length === 0) {
      invalidResponse('STOP_BLOCKED requires non-empty diagnostics.');
    }
    return {
      status: 'STOP_BLOCKED',
      endpoint,
      env,
      syncMode,
      paginationProtocol,
      destinationTab,
      previewedAtUtc,
      pagesFetched,
      diagnostics: data.diagnostics.map((d, idx) => parseDiagnostic(d, idx)),
      unresolvedPreviousRun,
    };
  }

  if (data.status !== 'READY') {
    invalidResponse('Unknown preview status.');
  }

  if (!isRecord(data.reviewBreakdown)) {
    invalidResponse('Invalid reviewBreakdown.');
  }
  const reviewBreakdown: Partial<Record<ReviewReasonCode, number>> = {};
  for (const [key, val] of Object.entries(data.reviewBreakdown)) {
    const code = assertAllowedEnum<ReviewReasonCode>(
      key,
      VALID_REVIEW_REASONS,
      `reviewBreakdown.${key}`,
    );
    reviewBreakdown[code] = assertNonNegInt(val, `reviewBreakdown.${key}`);
  }

  if (!Array.isArray(data.sampleRows)) {
    invalidResponse('sampleRows must be an array.');
  }

  const baseReady = {
    status: 'READY' as const,
    endpoint,
    env,
    syncMode,
    paginationProtocol,
    destinationTab,
    previewedAtUtc,
    pagesFetched,
    sourceTotal: assertNonNegInt(data.sourceTotal, 'sourceTotal'),
    fingerprint: parsePreviewFingerprint(data.fingerprint, 'fingerprint'),
    counts: parseDiffCounts(data.counts, 'counts'),
    reviewBreakdown,
    unresolvedPreviousRun,
    legacySnapshotPresent: assertBoolean(data.legacySnapshotPresent, 'legacySnapshotPresent'),
    legacySnapshotTab: assertNullableString(data.legacySnapshotTab, 'legacySnapshotTab'),
    writeAllowed: assertBoolean(data.writeAllowed, 'writeAllowed'),
    blockedGuardReason:
      data.blockedGuardReason === null
        ? null
        : assertAllowedEnum<BlockedGuardReason>(
            data.blockedGuardReason,
            VALID_BLOCKED_GUARD_REASONS,
            'blockedGuardReason',
          ),
  };

  if (data.previewMode === 'REFERENCE_READABLE') {
    return {
      ...baseReady,
      previewMode: 'REFERENCE_READABLE',
      sampleRows: data.sampleRows.map((row, idx) => parseReferencePreviewRow(row, idx)),
    };
  }

  if (data.previewMode === 'EXTENDED_MINIMIZED') {
    if (!Array.isArray(data.aggregateSummary)) {
      invalidResponse('aggregateSummary must be an array for EXTENDED_MINIMIZED preview.');
    }
    return {
      ...baseReady,
      previewMode: 'EXTENDED_MINIMIZED',
      aggregateSummary: data.aggregateSummary.map((group, idx) =>
        parseExtendedAggregateGroup(group, idx),
      ),
      sampleRows: data.sampleRows.map((row, idx) => parseExtendedMinimizedPreviewRow(row, idx)),
    };
  }

  invalidResponse('Unsupported previewMode.');
}

export function parseCommitSmallDatasetResponse(raw: unknown): CommitSmallDatasetData {
  const data = unwrapEnvelope(
    raw,
    ALLOWLISTED_SYNC_ERRORS,
    'COMMIT_FAILED',
    'ไม่สามารถดำเนินการบันทึกข้อมูลบน Google Apps Script ได้',
  );

  const endpoint = assertAllowedEnum<DatasetEndpoint>(data.endpoint, VALID_ENDPOINTS, 'endpoint');
  const env = assertEnv(data.env, 'env');
  const destinationTab = assertNonEmptyString(data.destinationTab, 'destinationTab');

  if (data.status === 'COMMITTED_VERIFIED') {
    if (data.syncLogStatus !== 'COMMITTED_VERIFIED') {
      invalidResponse('Invalid syncLogStatus for COMMITTED_VERIFIED.');
    }
    return {
      status: 'COMMITTED_VERIFIED',
      runId: assertNonEmptyString(data.runId, 'runId'),
      endpoint,
      env,
      syncMode: assertAllowedEnum<SyncMode>(data.syncMode, VALID_SYNC_MODES, 'syncMode'),
      destinationTab,
      completedAtUtc: assertNonEmptyString(data.completedAtUtc, 'completedAtUtc'),
      counts: parseDiffCounts(data.counts, 'counts'),
      fingerprint: parsePreviewFingerprint(data.fingerprint, 'fingerprint'),
      readback: parseReadbackVerification(data.readback),
      syncLogStatus: 'COMMITTED_VERIFIED',
    };
  }

  if (data.status === 'PREVIEW_STALE_RECONFIRM_REQUIRED') {
    return {
      status: 'PREVIEW_STALE_RECONFIRM_REQUIRED',
      endpoint,
      env,
      destinationTab,
      driftReason: assertAllowedEnum<StaleDriftReason>(
        data.driftReason,
        VALID_STALE_DRIFT_REASONS,
        'driftReason',
      ),
      expectedFingerprint: parsePreviewFingerprint(data.expectedFingerprint, 'expectedFingerprint'),
      currentSourceTotal: assertNonNegInt(data.currentSourceTotal, 'currentSourceTotal'),
      currentDatasetDigest: assertNonEmptyString(data.currentDatasetDigest, 'currentDatasetDigest'),
      currentSheetRevisionFingerprint: assertNonEmptyString(
        data.currentSheetRevisionFingerprint,
        'currentSheetRevisionFingerprint',
      ),
    };
  }

  if (data.status === 'FAILED_STOP' || data.status === 'UNKNOWN_OUTCOME_STOP') {
    const syncLogStatus = data.syncLogStatus;
    if (
      syncLogStatus !== 'STARTED' &&
      syncLogStatus !== 'FAILED_STOP' &&
      syncLogStatus !== 'NOT_WRITTEN'
    ) {
      invalidResponse('Invalid syncLogStatus for stop outcome.');
    }
    return {
      status: data.status,
      runId: assertNullableString(data.runId, 'runId'),
      endpoint,
      env,
      destinationTab,
      stopCode: assertAllowedEnum<CommitStopCode>(
        data.stopCode,
        VALID_COMMIT_STOP_CODES,
        'stopCode',
      ),
      message: assertNonEmptyString(data.message, 'message'),
      syncLogStatus,
      stagingTabRetained: assertNullableString(data.stagingTabRetained, 'stagingTabRetained'),
    };
  }

  invalidResponse('Unknown commit outcome status.');
}
