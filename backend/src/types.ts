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

export interface SheetHandle {
  getLastRow(): number;
  getLastColumn(): number;
  getValues(row: number, col: number, numRows: number, numCols: number): unknown[][];
}

export interface SpreadsheetHandle {
  getName(): string;
  getSheetByName(name: string): SheetHandle | null;
  getSheetNames(): string[];
}

export interface DashboardPlatform {
  getProperty(key: string): string | null;
  openSpreadsheetById(id: string): SpreadsheetHandle;
  now(): Date;
}
