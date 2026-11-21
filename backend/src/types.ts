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

export type ReviewReasonCode = 'MISSING_IN_SOURCE' | 'PLACEHOLDER_COORDS';

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
  | 'FORMULA_INJECTION_DETECTED'
  | 'ASCII_CONTROL_CHAR'
  | 'SOURCE_TOTAL_DRIFT'
  | 'INCOMPLETE_PAGINATION'
  | 'ROW_LIMIT_EXCEEDED'
  | 'HEADER_MISMATCH'
  | 'INVALID_EXISTING_KEY'
  | 'DESTINATION_TOO_LARGE';

export type CommitStopCode =
  | PreviewStopCode
  | 'WRITE_DISABLED'
  | 'PRODUCTION_CONFIRMATION_REQUIRED'
  | 'LOCK_BUSY'
  | 'UNRESOLVED_PREVIOUS_RUN'
  | 'INVALID_FINGERPRINT'
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

export interface PreviewReadyData {
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
  blockedGuardReason: string | null;
  previewMode: 'REFERENCE_READABLE';
  sampleRows: ReferencePreviewRow[];
}

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

export type CommitSmallDatasetData = CommitVerifiedData | CommitStaleData | CommitStopData;

export interface CommitSmallDatasetRequest {
  endpoint: DatasetEndpoint;
  token: string;
  expectedFingerprint: PreviewFingerprint;
  confirmationPhrase?: string;
  acknowledgeUnresolvedRunId?: string;
  pageSize?: number;
}

export type CommitSmallDatasetResponse =
  | { ok: true; data: CommitSmallDatasetData }
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
  tryScriptLock(timeoutMs: number): ScriptLockHandle | null;
  flushSpreadsheet(): void;
  generateRunId(endpoint: DatasetEndpoint, now: Date): string;
}
