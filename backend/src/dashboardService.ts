import { DATASET_CATALOG } from './datasetCatalog.ts';
import {
  detectLegacySnapshot,
  isValidSpreadsheetId,
  parseEnvironment,
  readReportCurrentPointers,
  readSyncLogLatestMap,
  resolveReportWorkbookPolicy,
  type SyncLogEntry,
} from './sheetConfig.ts';
import type {
  DashboardDatasetStatus,
  DashboardErrorCode,
  DashboardPlatform,
  DashboardStatusResponse,
  DatasetLastStatus,
  SpreadsheetHandle,
  UnresolvedRunSummary,
  WorkbookInfo,
} from './types.ts';

export type { DashboardPlatform } from './types.ts';

const HMAC_KEY_B64_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

function fail(code: DashboardErrorCode, message: string): DashboardStatusResponse {
  return { ok: false, error: { code, message } };
}

function isValidHmacKey(value: string | null): boolean {
  return typeof value === 'string' && HMAC_KEY_B64_PATTERN.test(value);
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

    const reportPolicy = resolveReportWorkbookPolicy(
      referenceSpreadsheetId,
      platform.getProperty('THAIPHC_REPORT_SPREADSHEET_ID'),
      platform.getProperty('THAIPHC_SAME_WORKBOOK_APPROVAL'),
    );
    const { sameWorkbookPolicy, reportWorkbookApproved, usesSameSpreadsheet } = reportPolicy;
    let reportSpreadsheet: SpreadsheetHandle | null = null;
    let reportWorkbook: WorkbookInfo | null = null;

    if (usesSameSpreadsheet) {
      reportSpreadsheet = referenceSpreadsheet;
      reportWorkbook = referenceWorkbook;
    } else if (reportPolicy.targetSpreadsheetId !== null) {
      try {
        reportSpreadsheet = platform.openSpreadsheetById(reportPolicy.targetSpreadsheetId);
        reportWorkbook = {
          spreadsheetId: reportPolicy.targetSpreadsheetId,
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
      const { legacySnapshotPresent, legacySnapshotTab } = detectLegacySnapshot(
        descriptor.endpoint,
        descriptor.legacyPrefix,
        fixedTabExists,
        reportPointers,
        reportSheetNames,
        { allowUnindexedPrefixFallback: true },
      );

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
