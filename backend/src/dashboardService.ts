import {
  DATASET_CATALOG,
  REPORT_CURRENT_TAB,
  SAME_WORKBOOK_APPROVAL_TOKEN,
} from './datasetCatalog.ts';
import {
  buildHeaderMap,
  cellToString,
  isValidSpreadsheetId,
  parseEnvironment,
  readSyncLogLatestMap,
  type SyncLogEntry,
} from './sheetConfig.ts';
import type {
  DashboardDatasetStatus,
  DashboardErrorCode,
  DashboardPlatform,
  DashboardStatusResponse,
  DatasetLastStatus,
  SameWorkbookPolicy,
  SpreadsheetHandle,
  UnresolvedRunSummary,
  WorkbookInfo,
} from './types.ts';

export type { DashboardPlatform } from './types.ts';

const HMAC_KEY_B64_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

interface ReportCurrentPointer {
  endpoint: string;
  runId: string;
  snapshotSheet: string;
}

interface SheetTable {
  headers: Map<string, number>;
  rows: unknown[][];
}

function fail(code: DashboardErrorCode, message: string): DashboardStatusResponse {
  return { ok: false, error: { code, message } };
}

function isValidHmacKey(value: string | null): boolean {
  return typeof value === 'string' && HMAC_KEY_B64_PATTERN.test(value);
}

function readSheetTable(spreadsheet: SpreadsheetHandle | null, tabName: string): SheetTable | null {
  if (!spreadsheet) {
    return null;
  }
  const sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) {
    return null;
  }
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return null;
  }
  const values = sheet.getValues(1, 1, lastRow, lastCol);
  return {
    headers: buildHeaderMap(values[0] ?? []),
    rows: values.slice(1),
  };
}

function readReportCurrentPointers(
  spreadsheet: SpreadsheetHandle | null,
): Map<string, ReportCurrentPointer> {
  const pointers = new Map<string, ReportCurrentPointer>();
  const table = readSheetTable(spreadsheet, REPORT_CURRENT_TAB);
  if (!table) {
    return pointers;
  }

  const endpointCol = table.headers.get('endpoint');
  const runIdCol = table.headers.get('run_id');
  const snapshotSheetCol = table.headers.get('snapshot_sheet');

  if (endpointCol === undefined || runIdCol === undefined || snapshotSheetCol === undefined) {
    return pointers;
  }

  for (const row of table.rows) {
    const endpoint = cellToString(row[endpointCol]);
    const runId = cellToString(row[runIdCol]);
    const snapshotSheet = cellToString(row[snapshotSheetCol]);
    if (endpoint.length === 0 || snapshotSheet.length === 0) {
      continue;
    }
    pointers.set(endpoint, {
      endpoint,
      runId,
      snapshotSheet,
    });
  }

  return pointers;
}

function mapLogStatus(entry: SyncLogEntry | undefined): DatasetLastStatus {
  if (!entry) {
    return 'NEVER_SYNCED';
  }
  if (entry.rawStatus === 'COMMITTED_VERIFIED') {
    return 'COMMITTED_VERIFIED';
  }
  if (entry.rawStatus === 'FAILED_STOP') {
    return 'FAILED_STOP';
  }
  // STARTED or any unexpected non-terminal status fails closed as UNRESOLVED_PREVIOUS_RUN.
  return 'UNRESOLVED_PREVIOUS_RUN';
}

function readRowCountOnly(
  spreadsheet: SpreadsheetHandle | null,
  tabName: string,
  headerRows: number,
): number | null {
  if (!spreadsheet) {
    return null;
  }
  const sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) {
    return null;
  }
  return Math.max(0, sheet.getLastRow() - headerRows);
}

export function getDashboardStatusWithPlatform(
  platform: DashboardPlatform,
): DashboardStatusResponse {
  try {
    const env = parseEnvironment(platform.getProperty('THAIPHC_ENV'));
    if (!env) {
      return fail(
        'INVALID_ENV_CONFIG',
        'THAIPHC_ENV must be configured as SANDBOX or PRODUCTION in Script Properties.',
      );
    }

    const referenceSpreadsheetId = platform.getProperty('THAIPHC_SPREADSHEET_ID');
    if (!isValidSpreadsheetId(referenceSpreadsheetId)) {
      return fail(
        'SPREADSHEET_NOT_CONFIGURED',
        'THAIPHC_SPREADSHEET_ID is missing or invalid in Script Properties.',
      );
    }

    let referenceSpreadsheet: SpreadsheetHandle;
    try {
      referenceSpreadsheet = platform.openSpreadsheetById(referenceSpreadsheetId);
    } catch {
      return fail(
        'WORKBOOK_ACCESS_FAILED',
        'Unable to open the configured reference Google Sheets workbook.',
      );
    }

    const referenceWorkbook: WorkbookInfo = {
      spreadsheetId: referenceSpreadsheetId,
      name: referenceSpreadsheet.getName(),
    };

    const rawReportId = platform.getProperty('THAIPHC_REPORT_SPREADSHEET_ID');
    const sameWorkbookApproval = platform.getProperty('THAIPHC_SAME_WORKBOOK_APPROVAL');
    const trimmedReportId = typeof rawReportId === 'string' ? rawReportId.trim() : '';

    let sameWorkbookPolicy: SameWorkbookPolicy;
    let reportWorkbookApproved: boolean;
    let reportSpreadsheet: SpreadsheetHandle | null = null;
    let reportWorkbook: WorkbookInfo | null = null;
    let usesSameSpreadsheet = false;

    if (trimmedReportId === '' || trimmedReportId === referenceSpreadsheetId) {
      usesSameSpreadsheet = true;
      if (sameWorkbookApproval === SAME_WORKBOOK_APPROVAL_TOKEN) {
        sameWorkbookPolicy = 'SAME_WORKBOOK_APPROVED';
        reportWorkbookApproved = true;
      } else {
        sameWorkbookPolicy = 'SAME_WORKBOOK_UNAPPROVED';
        reportWorkbookApproved = false;
      }
      reportSpreadsheet = referenceSpreadsheet;
      reportWorkbook = referenceWorkbook;
    } else if (!isValidSpreadsheetId(trimmedReportId)) {
      sameWorkbookPolicy = 'INVALID_REPORT_WORKBOOK';
      reportWorkbookApproved = false;
    } else {
      sameWorkbookPolicy = 'SEPARATE_WORKBOOK';
      reportWorkbookApproved = true;
      try {
        reportSpreadsheet = platform.openSpreadsheetById(trimmedReportId);
        reportWorkbook = {
          spreadsheetId: trimmedReportId,
          name: reportSpreadsheet.getName(),
        };
      } catch {
        return fail(
          'WORKBOOK_ACCESS_FAILED',
          'Unable to open the configured report Google Sheets workbook.',
        );
      }
    }

    const writeEnabled = platform.getProperty('THAIPHC_WRITE_ENABLED') === 'true';
    const personDataWriteEnabled =
      platform.getProperty('THAIPHC_PERSON_DATA_WRITE_ENABLED') === 'true';
    const hmacKeyConfigured = isValidHmacKey(platform.getProperty('THAIPHC_HMAC_KEY_B64'));

    const referenceSyncLogs = readSyncLogLatestMap(referenceSpreadsheet);
    const reportSyncLogs = usesSameSpreadsheet
      ? referenceSyncLogs
      : readSyncLogLatestMap(reportSpreadsheet);
    const reportPointers = readReportCurrentPointers(reportSpreadsheet);
    const reportSheetNames = reportSpreadsheet ? reportSpreadsheet.getSheetNames() : [];

    const unresolvedRuns: UnresolvedRunSummary[] = [];

    const datasets: DashboardDatasetStatus[] = DATASET_CATALOG.map((descriptor) => {
      const targetSpreadsheet =
        descriptor.group === 'reference' ? referenceSpreadsheet : reportSpreadsheet;
      const syncLogs = descriptor.group === 'reference' ? referenceSyncLogs : reportSyncLogs;
      const logEntry = syncLogs.get(descriptor.endpoint);
      const lastStatus = mapLogStatus(logEntry);

      if (lastStatus === 'UNRESOLVED_PREVIOUS_RUN' && logEntry) {
        unresolvedRuns.push({
          endpoint: descriptor.endpoint,
          runId: logEntry.runId,
          startedAtUtc: logEntry.timestampUtc,
          status: 'STARTED',
        });
      }

      if (descriptor.syncMode === 'COMPLETE_SNAPSHOT') {
        const pointer = reportPointers.get(descriptor.endpoint);
        const destinationTab = pointer ? pointer.snapshotSheet : descriptor.defaultTab;
        const rowCount = pointer
          ? readRowCountOnly(reportSpreadsheet, pointer.snapshotSheet, 2)
          : null;
        return {
          endpoint: descriptor.endpoint,
          group: descriptor.group,
          syncMode: descriptor.syncMode,
          paginationProtocol: descriptor.paginationProtocol,
          destinationTab,
          rowCount,
          lastRunId: logEntry?.runId ?? (pointer && pointer.runId ? pointer.runId : null),
          lastSyncedAtUtc: logEntry?.timestampUtc ?? null,
          lastStatus,
          publicationPointerActive: Boolean(pointer),
          legacySnapshotPresent: false,
          legacySnapshotTab: null,
        };
      }

      const rowCount = readRowCountOnly(targetSpreadsheet, descriptor.defaultTab, 1);
      const fixedTabExists = rowCount !== null;

      let legacySnapshotPresent = false;
      let legacySnapshotTab: string | null = null;
      if (!fixedTabExists && descriptor.legacyPrefix !== null) {
        const pointer = reportPointers.get(descriptor.endpoint);
        if (pointer && pointer.snapshotSheet.startsWith(descriptor.legacyPrefix)) {
          legacySnapshotPresent = true;
          legacySnapshotTab = pointer.snapshotSheet;
        } else {
          const matchingTab = reportSheetNames.find((name) =>
            name.startsWith(descriptor.legacyPrefix as string),
          );
          if (matchingTab) {
            legacySnapshotPresent = true;
            legacySnapshotTab = matchingTab;
          }
        }
      }

      return {
        endpoint: descriptor.endpoint,
        group: descriptor.group,
        syncMode: descriptor.syncMode,
        paginationProtocol: descriptor.paginationProtocol,
        destinationTab: descriptor.defaultTab,
        rowCount,
        lastRunId: logEntry?.runId ?? null,
        lastSyncedAtUtc: logEntry?.timestampUtc ?? null,
        lastStatus,
        publicationPointerActive: false,
        legacySnapshotPresent,
        legacySnapshotTab,
      };
    });

    return {
      ok: true,
      data: {
        env,
        scope: {
          provinceCode: '54',
          districtCode: '5406',
        },
        generatedAtUtc: platform.now().toISOString(),
        workbooks: {
          reference: referenceWorkbook,
          report: reportWorkbook,
          sameWorkbookPolicy,
        },
        guards: {
          writeEnabled,
          personDataWriteEnabled,
          hmacKeyConfigured,
          reportWorkbookApproved,
        },
        unresolvedRuns,
        datasets,
      },
    };
  } catch {
    return fail('DASHBOARD_LOAD_FAILED', 'Failed to load dashboard status.');
  }
}
