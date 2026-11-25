export type AppEnvironment = 'SANDBOX' | 'PRODUCTION';

export type DatasetEndpoint =
  | 'subdistricts'
  | 'villages'
  | 'health-services'
  | 'volunteer-gender'
  | 'assignments'
  | 'volunteer-family'
  | 'resigned-volunteers'
  | 'volunteer-tenure';

export type ReferenceDatasetEndpoint = 'subdistricts' | 'villages' | 'health-services';

export type SmallKeyedDatasetEndpoint = ReferenceDatasetEndpoint | 'volunteer-gender';

export type LargeKeyedDatasetEndpoint = 'assignments' | 'resigned-volunteers' | 'volunteer-tenure';

export type DatasetGroup = 'reference' | 'extended_report';

export type SyncMode = 'KEYED_UPSERT' | 'COMPLETE_SNAPSHOT';

export type PaginationProtocol = 'none' | 'offset' | 'assignment' | 'report';

export type DatasetLastStatus =
  'COMMITTED_VERIFIED' | 'UNRESOLVED_PREVIOUS_RUN' | 'FAILED_STOP' | 'NEVER_SYNCED';

export type SameWorkbookPolicy =
  | 'SEPARATE_WORKBOOK'
  | 'SAME_WORKBOOK_APPROVED'
  | 'SAME_WORKBOOK_UNAPPROVED'
  | 'INVALID_REPORT_WORKBOOK';

export type DashboardErrorCode =
  | 'INVALID_ENV_CONFIG'
  | 'SPREADSHEET_NOT_CONFIGURED'
  | 'WORKBOOK_ACCESS_FAILED'
  | 'DASHBOARD_LOAD_FAILED';

export type SyncRpcErrorCode =
  | DashboardErrorCode
  | 'INVALID_REQUEST'
  | 'INVALID_TOKEN_FORMAT'
  | 'HTTP_401'
  | 'DATASET_NOT_SUPPORTED'
  | 'PREVIEW_FAILED'
  | 'COMMIT_FAILED';

export type DiffKind = 'INSERT' | 'UPDATE' | 'UNCHANGED' | 'REVIEW';

export type ReviewReasonCode =
  'MISSING_IN_SOURCE' | 'LOCALITY_MISMATCH' | 'PLACEHOLDER_COORDS' | 'SMALL_CELL_SUPPRESSED';

export type PreviewStopCode =
  | 'HTTP_403'
  | 'HTTP_ERROR'
  | 'REDIRECT_REJECTED'
  | 'UNEXPECTED_CONTENT_TYPE'
  | 'RESPONSE_TOO_LARGE'
  | 'INVALID_JSON'
  | 'FETCH_EXCEPTION'
  | 'INVALID_ENVELOPE'
  | 'OUT_OF_GEOGRAPHIC_SCOPE'
  | 'DUPLICATE_SOURCE_KEY'
  | 'MISSING_SOURCE_KEY'
  | 'UNEXPECTED_FIELD'
  | 'TYPE_MISMATCH'
  | 'GENDER_TOTAL_MISMATCH'
  | 'FORMULA_INJECTION_DETECTED'
  | 'ASCII_CONTROL_CHAR'
  | 'SOURCE_TOTAL_DRIFT'
  | 'SOURCE_TOTAL_CHANGED'
  | 'INCOMPLETE_PAGINATION'
  | 'INCOMPLETE_SNAPSHOT'
  | 'ROW_LIMIT_EXCEEDED'
  | 'HEADER_MISMATCH'
  | 'INVALID_EXISTING_KEY'
  | 'DESTINATION_TOO_LARGE'
  | 'MISSING_HMAC_KEY';

export type CommitStopCode =
  | PreviewStopCode
  | 'WRITE_DISABLED'
  | 'PERSON_DATA_WRITE_DISABLED'
  | 'FULL_PII_WRITE_DISABLED'
  | 'SAME_WORKBOOK_UNAPPROVED'
  | 'INVALID_REPORT_WORKBOOK'
  | 'PRODUCTION_CONFIRMATION_REQUIRED'
  | 'LOCK_BUSY'
  | 'UNRESOLVED_PREVIOUS_RUN'
  | 'INVALID_FINGERPRINT'
  | 'STAGING_STATE_INVALID'
  | 'STAGING_DIGEST_MISMATCH'
  | 'READBACK_MISMATCH'
  | 'WRITE_FAILED_UNKNOWN';

export interface WorkbookInfo {
  spreadsheetId: string;
  name: string;
}

export interface UnresolvedRunSummary {
  endpoint: DatasetEndpoint;
  runId: string;
  startedAtUtc: string | null;
  status: 'STARTED';
}

export interface DashboardDatasetStatus {
  endpoint: DatasetEndpoint;
  group: DatasetGroup;
  syncMode: SyncMode;
  paginationProtocol: PaginationProtocol;
  destinationTab: string;
  rowCount: number | null;
  lastRunId: string | null;
  lastSyncedAtUtc: string | null;
  lastStatus: DatasetLastStatus;
  publicationPointerActive: boolean;
  legacySnapshotPresent: boolean;
  legacySnapshotTab: string | null;
}

export interface DashboardStatusData {
  env: AppEnvironment;
  scope: {
    provinceCode: '54';
    districtCode: '5406';
  };
  generatedAtUtc: string;
  workbooks: {
    reference: WorkbookInfo;
    report: WorkbookInfo | null;
    sameWorkbookPolicy: SameWorkbookPolicy;
  };
  guards: {
    writeEnabled: boolean;
    personDataWriteEnabled: boolean;
    fullPiiWriteEnabled: boolean;
    hmacKeyConfigured: boolean;
    reportWorkbookApproved: boolean;
  };
  unresolvedRuns: UnresolvedRunSummary[];
  datasets: DashboardDatasetStatus[];
}

export type DashboardStatusResponse =
  | { ok: true; data: DashboardStatusData }
  | { ok: false; error: { code: DashboardErrorCode; message: string } };

export interface DiffCounts {
  insert: number;
  update: number;
  unchanged: number;
  review: number;
}

export interface PreviewFingerprint {
  endpoint: DatasetEndpoint;
  env: AppEnvironment;
  sourceTotal: number;
  datasetDigest: string;
  sheetRevisionFingerprint: string;
  counts: DiffCounts;
  fingerprintDigest: string;
}

export interface PreviewDiagnostic {
  code: PreviewStopCode;
  message: string;
  field?: string;
  rowIndex?: number;
  pageOffset?: number;
}

export interface ReferenceChangedField {
  field: string;
  before: string;
  after: string;
}

export interface ReferencePreviewRow {
  diffKind: DiffKind;
  sourceKey: string;
  displayName: string;
  displayCode: string;
  changedFields: ReferenceChangedField[];
  summaryFields: Array<{ field: string; value: string }>;
  reviewReasons: ReviewReasonCode[];
}

export type BlockedGuardReason =
  | 'THAIPHC_WRITE_ENABLED'
  | 'THAIPHC_PERSON_DATA_WRITE_ENABLED'
  | 'THAIPHC_FULL_PII_WRITE_ENABLED'
  | 'THAIPHC_SAME_WORKBOOK_APPROVAL'
  | 'THAIPHC_REPORT_SPREADSHEET_ID';

export interface ExtendedAggregateGroup {
  groupCode: string;
  groupLabel: string;
  rowCount: number;
  reviewCount: number;
}

export interface ExtendedMinimizedAttribute {
  field: string;
  value: string | null;
}

export interface ExtendedMinimizedPreviewRow {
  diffKind: DiffKind;
  sourceKey: string;
  scopeLabel: string;
  minimizedAttributes: ExtendedMinimizedAttribute[];
  reviewReasons: ReviewReasonCode[];
}

export interface PreviewReadyBase {
  status: 'READY';
  endpoint: DatasetEndpoint;
  env: AppEnvironment;
  syncMode: SyncMode;
  paginationProtocol: PaginationProtocol;
  destinationTab: string;
  previewedAtUtc: string;
  pagesFetched: number;
  sourceTotal: number;
  fingerprint: PreviewFingerprint;
  counts: DiffCounts;
  reviewBreakdown: Partial<Record<ReviewReasonCode, number>>;
  unresolvedPreviousRun: UnresolvedRunSummary | null;
  legacySnapshotPresent: boolean;
  legacySnapshotTab: string | null;
  activeSnapshotTab?: string | null;
  writeAllowed: boolean;
  blockedGuardReason: BlockedGuardReason | null;
}

export interface PreviewReadyReferenceData extends PreviewReadyBase {
  previewMode: 'REFERENCE_READABLE';
  sampleRows: ReferencePreviewRow[];
}

export interface PreviewReadyExtendedData extends PreviewReadyBase {
  previewMode: 'EXTENDED_MINIMIZED';
  aggregateSummary: ExtendedAggregateGroup[];
  sampleRows: ExtendedMinimizedPreviewRow[];
}

export type PreviewReadyData = PreviewReadyReferenceData | PreviewReadyExtendedData;

export interface PreviewBlockedData {
  status: 'STOP_BLOCKED';
  endpoint: DatasetEndpoint;
  env: AppEnvironment;
  syncMode: SyncMode;
  paginationProtocol: PaginationProtocol;
  destinationTab: string;
  previewedAtUtc: string;
  pagesFetched: number;
  diagnostics: PreviewDiagnostic[];
  unresolvedPreviousRun: UnresolvedRunSummary | null;
}

export type PreviewDatasetData = PreviewReadyData | PreviewBlockedData;

export interface PreviewDatasetRequest {
  endpoint: DatasetEndpoint;
  token: string;
  pageSize?: number;
}

export type PreviewDatasetResponse =
  | { ok: true; data: PreviewDatasetData }
  | { ok: false; error: { code: SyncRpcErrorCode; message: string } };

export interface PreviewRowDigestEntry {
  key: string;
  rowDigest: string;
  reviewReasons?: ReviewReasonCode[];
}

export interface ExtendedSampleCandidate {
  sourceKey: string;
  rowDigest: string;
  scopeLabel: string;
  minimizedAttributes: ExtendedMinimizedAttribute[];
  reviewReasons: ReviewReasonCode[];
}

export interface PreviewDatasetBatchRequest {
  endpoint: DatasetEndpoint;
  token: string;
  startPage: number;
  batchPages?: number;
  pageSize?: number;
  expectedSourceTotal?: number;
}

export interface PreviewDatasetBatchOkData {
  status: 'BATCH_OK';
  endpoint: DatasetEndpoint;
  env: AppEnvironment;
  startPage: number;
  lastPageFetched: number;
  pagesFetchedInBatch: number;
  totalPages: number;
  sourceTotal: number;
  rowsInBatch: number;
  hasMore: boolean;
  nextPage: number | null;
  rowDigests: PreviewRowDigestEntry[];
  aggregateSummary: ExtendedAggregateGroup[];
  sampleCandidates: ExtendedSampleCandidate[];
}

export interface PreviewDatasetBatchBlockedData {
  status: 'STOP_BLOCKED';
  endpoint: DatasetEndpoint;
  env: AppEnvironment;
  pagesFetchedInBatch: number;
  diagnostics: PreviewDiagnostic[];
}

export type PreviewDatasetBatchData = PreviewDatasetBatchOkData | PreviewDatasetBatchBlockedData;

export type PreviewDatasetBatchResponse =
  | { ok: true; data: PreviewDatasetBatchData }
  | { ok: false; error: { code: SyncRpcErrorCode; message: string } };

export interface FinalizePreviewRequest {
  endpoint: DatasetEndpoint;
  sourceTotal: number;
  pagesFetched: number;
  rowDigests: PreviewRowDigestEntry[];
  aggregateSummary: ExtendedAggregateGroup[];
  sampleCandidates: ExtendedSampleCandidate[];
}

export interface StageLargeDatasetBatchRequest {
  endpoint: DatasetEndpoint;
  token: string;
  expectedFingerprint: PreviewFingerprint;
  confirmationPhrase?: string;
  acknowledgeUnresolvedRunId?: string;
  runId?: string;
  startPage: number;
  batchPages?: number;
  pageSize?: number;
}

export interface StageLargeDatasetBatchStagedData {
  status: 'BATCH_STAGED';
  runId: string;
  endpoint: DatasetEndpoint;
  env: AppEnvironment;
  destinationTab: string;
  stagingTabName: string;
  lastPageStaged: number;
  totalPages: number;
  stagedRowCount: number;
  sourceTotal: number;
  hasMore: boolean;
  nextPage: number | null;
}

export type StageLargeDatasetBatchData =
  StageLargeDatasetBatchStagedData | CommitStaleData | CommitStopData;

export type StageLargeDatasetBatchResponse =
  | { ok: true; data: StageLargeDatasetBatchData }
  | { ok: false; error: { code: SyncRpcErrorCode; message: string } };

export interface FinalizeLargeDatasetCommitRequest {
  endpoint: DatasetEndpoint;
  expectedFingerprint: PreviewFingerprint;
  runId: string;
  confirmationPhrase?: string;
  acknowledgeUnresolvedRunId?: string;
}

export interface ReadbackVerification {
  verified: boolean;
  destinationTab: string;
  expectedRowCount: number;
  actualRowCount: number;
  uniqueKeysVerified: boolean;
  rowDigestsVerified: boolean;
  unrelatedTabsPreserved: boolean;
  baselineTabsChecked: string[];
  stagingTabCleaned: boolean | null;
  publicationPointerVerified?: boolean;
}

export interface CommitVerifiedData {
  status: 'COMMITTED_VERIFIED';
  runId: string;
  endpoint: DatasetEndpoint;
  env: AppEnvironment;
  syncMode: SyncMode;
  destinationTab: string;
  completedAtUtc: string;
  counts: DiffCounts;
  fingerprint: PreviewFingerprint;
  readback: ReadbackVerification;
  syncLogStatus: 'COMMITTED_VERIFIED';
}

export type StaleDriftReason =
  'SOURCE_CHANGED' | 'DESTINATION_CHANGED' | 'BOTH_CHANGED' | 'ENV_MISMATCH';

export interface CommitStaleData {
  status: 'PREVIEW_STALE_RECONFIRM_REQUIRED';
  endpoint: DatasetEndpoint;
  env: AppEnvironment;
  destinationTab: string;
  driftReason: StaleDriftReason;
  expectedFingerprint: PreviewFingerprint;
  currentSourceTotal: number;
  currentDatasetDigest: string;
  currentSheetRevisionFingerprint: string;
}

export interface CommitStopData {
  status: 'FAILED_STOP' | 'UNKNOWN_OUTCOME_STOP';
  runId: string | null;
  endpoint: DatasetEndpoint;
  env: AppEnvironment;
  destinationTab: string;
  stopCode: CommitStopCode;
  message: string;
  syncLogStatus: 'STARTED' | 'FAILED_STOP' | 'NOT_WRITTEN';
  stagingTabRetained: string | null;
}

export type CommitDatasetData = CommitVerifiedData | CommitStaleData | CommitStopData;

export interface CommitSmallDatasetRequest {
  endpoint: DatasetEndpoint;
  token: string;
  expectedFingerprint: PreviewFingerprint;
  confirmationPhrase?: string;
  acknowledgeUnresolvedRunId?: string;
  pageSize?: number;
}

export type CommitDatasetResponse =
  | { ok: true; data: CommitDatasetData }
  | { ok: false; error: { code: SyncRpcErrorCode; message: string } };

export interface SheetHandle {
  getLastRow(): number;
  getLastColumn(): number;
  getValues(row: number, col: number, numRows: number, numCols: number): unknown[][];
}

export interface WritableSheetHandle extends SheetHandle {
  getName(): string;
  getMaxRows(): number;
  getMaxColumns(): number;
  insertColumnsAfter(afterPosition: number, howMany: number): void;
  insertRowsAfter(afterPosition: number, howMany: number): void;
  setFrozenRows(rows: number): void;
  hideSheet(): void;
  showSheet(): void;
  isSheetHidden(): boolean;
  setValues(row: number, col: number, values: unknown[][]): void;
  setNumberFormat(row: number, col: number, numRows: number, numCols: number, format: string): void;
}

export interface SpreadsheetHandle {
  getName(): string;
  getSheetByName(name: string): SheetHandle | null;
  getSheetNames(): string[];
}

export interface WritableSpreadsheetHandle extends SpreadsheetHandle {
  getSheetByName(name: string): WritableSheetHandle | null;
  insertSheet(name: string): WritableSheetHandle;
  deleteSheetByName(name: string): boolean;
}

export interface HttpFetchOptions {
  method: 'get';
  followRedirects: false;
  muteHttpExceptions: true;
  headers: Record<string, string>;
}

export interface HttpFetchResponse {
  statusCode: number;
  headers: Record<string, string | string[]>;
  contentText: string;
  byteLength: number;
}

export interface ScriptLockHandle {
  releaseLock(): void;
}

export interface DashboardPlatform {
  getProperty(key: string): string | null;
  openSpreadsheetById(id: string): SpreadsheetHandle;
  now(): Date;
}

export interface SyncPlatform extends DashboardPlatform {
  openSpreadsheetById(id: string): WritableSpreadsheetHandle;
  fetchUrl(url: string, options: HttpFetchOptions): HttpFetchResponse;
  sha256Hex(input: string): string;
  base64Decode(b64: string): number[];
  base64Encode(bytes: number[]): string;
  hmacSha256Bytes(input: string, keyBytes: number[]): number[];
  tryScriptLock(timeoutMs: number): ScriptLockHandle | null;
  flushSpreadsheet(): void;
  generateRunId(endpoint: DatasetEndpoint, now: Date): string;
}
