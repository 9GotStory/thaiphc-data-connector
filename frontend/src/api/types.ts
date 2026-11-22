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

export type LargeKeyedDatasetEndpoint = 'assignments';

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

export type GasRpcErrorCode =
  | 'INVALID_ENV_CONFIG'
  | 'SPREADSHEET_NOT_CONFIGURED'
  | 'WORKBOOK_ACCESS_FAILED'
  | 'DASHBOARD_LOAD_FAILED'
  | 'INVALID_REQUEST'
  | 'INVALID_TOKEN_FORMAT'
  | 'HTTP_401'
  | 'DATASET_NOT_SUPPORTED'
  | 'PREVIEW_FAILED'
  | 'COMMIT_FAILED'
  | 'INVALID_RPC_RESPONSE'
  | 'RPC_TRANSPORT_ERROR';

export type DiffKind = 'INSERT' | 'UPDATE' | 'UNCHANGED' | 'REVIEW';

export type ReviewReasonCode = 'MISSING_IN_SOURCE' | 'PLACEHOLDER_COORDS' | 'SMALL_CELL_SUPPRESSED';

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
    hmacKeyConfigured: boolean;
    reportWorkbookApproved: boolean;
  };
  unresolvedRuns: UnresolvedRunSummary[];
  datasets: DashboardDatasetStatus[];
}

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

export interface PreviewRowDigestEntry {
  key: string;
  rowDigest: string;
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

export class GasRpcClientError extends Error {
  readonly code: GasRpcErrorCode;

  constructor(code: GasRpcErrorCode, message: string) {
    super(message);
    this.name = 'GasRpcClientError';
    this.code = code;
  }
}
