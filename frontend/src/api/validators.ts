import {
  GasRpcClientError,
  type AppEnvironment,
  type DashboardDatasetStatus,
  type DashboardStatusData,
  type DatasetEndpoint,
  type DatasetGroup,
  type DatasetLastStatus,
  type GasRpcErrorCode,
  type PaginationProtocol,
  type SameWorkbookPolicy,
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
const ALLOWLISTED_SERVER_ERRORS: ReadonlySet<string> = new Set<GasRpcErrorCode>([
  'INVALID_ENV_CONFIG',
  'SPREADSHEET_NOT_CONFIGURED',
  'WORKBOOK_ACCESS_FAILED',
  'DASHBOARD_LOAD_FAILED',
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

function assertNullableNonNegInt(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    invalidResponse(`Invalid integer field: ${field}`);
  }
  return value;
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

function parseUnresolvedRun(value: unknown, index: number): UnresolvedRunSummary {
  if (!isRecord(value)) {
    invalidResponse(`Invalid unresolvedRuns[${index}]`);
  }
  const endpoint = assertAllowedEnum<DatasetEndpoint>(
    value.endpoint,
    VALID_ENDPOINTS,
    `unresolvedRuns[${index}].endpoint`,
  );
  if (value.status !== 'STARTED') {
    invalidResponse(`Invalid status in unresolvedRuns[${index}]`);
  }
  return {
    endpoint,
    runId: assertNonEmptyString(value.runId, `unresolvedRuns[${index}].runId`),
    startedAtUtc: assertNullableString(value.startedAtUtc, `unresolvedRuns[${index}].startedAtUtc`),
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

export function parseDashboardStatusResponse(raw: unknown): DashboardStatusData {
  if (!isRecord(raw) || typeof raw.ok !== 'boolean') {
    invalidResponse('GAS RPC response is not a valid envelope.');
  }

  if (raw.ok === false) {
    const errObj = isRecord(raw.error) ? raw.error : null;
    const rawCode = errObj && typeof errObj.code === 'string' ? errObj.code : '';
    const safeCode: GasRpcErrorCode = ALLOWLISTED_SERVER_ERRORS.has(rawCode)
      ? (rawCode as GasRpcErrorCode)
      : 'DASHBOARD_LOAD_FAILED';
    const safeMessage =
      errObj && typeof errObj.message === 'string' && safeCode === rawCode
        ? errObj.message
        : 'ไม่สามารถโหลดสถานะ Dashboard จาก Google Apps Script ได้';
    throw new GasRpcClientError(safeCode, safeMessage);
  }

  const data = raw.data;
  if (!isRecord(data)) {
    invalidResponse('Missing dashboard data payload.');
  }

  const env = data.env;
  if (env !== 'SANDBOX' && env !== 'PRODUCTION') {
    invalidResponse('Invalid environment value.');
  }

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
  const unresolvedRuns = data.unresolvedRuns.map((item, idx) => parseUnresolvedRun(item, idx));

  if (!Array.isArray(data.datasets) || data.datasets.length !== 8) {
    invalidResponse('datasets must contain exactly 8 ThaiPHC datasets.');
  }
  const datasets = data.datasets.map((item, idx) => parseDataset(item, idx));
  const uniqueEndpoints = new Set(datasets.map((d) => d.endpoint));
  if (uniqueEndpoints.size !== 8) {
    invalidResponse('datasets must contain all 8 unique endpoints.');
  }

  return {
    env: env as AppEnvironment,
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
