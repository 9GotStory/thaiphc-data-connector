import type {
  BlockedGuardReason,
  CommitSmallDatasetRequest,
  DashboardStatusData,
  ExtendedAggregateGroup,
  ExtendedMinimizedPreviewRow,
  PreviewDatasetRequest,
  ReferenceDatasetEndpoint,
  ReferencePreviewRow,
  SmallKeyedDatasetEndpoint,
} from './types';

export type MockScenario =
  | 'sandbox-default'
  | 'sandbox-writable'
  | 'sandbox-report-writable'
  | 'production-unresolved'
  | 'production-writable'
  | 'production-report-writable'
  | 'production-clean'
  | 'same-workbook-unapproved'
  | 'same-workbook-unapproved-writable'
  | 'rpc-error';

export type MockPreviewOutcome = 'ready' | 'stop-blocked' | 'http-401' | 'all-unchanged';
export type MockCommitOutcome =
  'verified' | 'preview-stale' | 'unknown-outcome' | 'readback-mismatch' | 'http-401';

const SANDBOX_REF_ID = '1SANDBOX_MOCK_REF_WORKBOOK_0000000001';
const SANDBOX_REPORT_ID = '1SANDBOX_MOCK_REPORT_WORKBOOK_0000002';
const PROD_REF_ID = '1PROD_MOCK_REF_WORKBOOK_0000000000001';
const PROD_REPORT_ID = '1PROD_MOCK_REPORT_WORKBOOK_0000000002';

export function buildMockDashboardEnvelope(scenario: MockScenario): unknown {
  if (scenario === 'rpc-error') {
    return {
      ok: false,
      error: {
        code: 'WORKBOOK_ACCESS_FAILED',
        message: 'ไม่สามารถเปิดสมุดงานปลายทางจาก Script Properties ได้ (Mock Scenario)',
      },
    };
  }

  if (scenario === 'production-unresolved') {
    const data: DashboardStatusData = {
      env: 'PRODUCTION',
      scope: { provinceCode: '54', districtCode: '5406' },
      generatedAtUtc: '2026-11-21T11:30:00.000Z',
      workbooks: {
        reference: { spreadsheetId: PROD_REF_ID, name: 'ThaiPHC Data — Song 5406 (Prod Mock)' },
        report: {
          spreadsheetId: PROD_REPORT_ID,
          name: 'ThaiPHC Extended Reports — Song 5406 (Prod Mock)',
        },
        sameWorkbookPolicy: 'SEPARATE_WORKBOOK',
      },
      guards: {
        writeEnabled: true,
        personDataWriteEnabled: true,
        hmacKeyConfigured: true,
        reportWorkbookApproved: true,
      },
      unresolvedRuns: [
        {
          endpoint: 'assignments',
          runId: 'run_20261121_0915_assign_7c9a2e',
          startedAtUtc: '2026-11-21T02:15:00.000Z',
          status: 'STARTED',
        },
      ],
      datasets: [
        {
          endpoint: 'subdistricts',
          group: 'reference',
          syncMode: 'KEYED_UPSERT',
          paginationProtocol: 'none',
          destinationTab: 'Subdistricts',
          rowCount: 8,
          lastRunId: 'run_20261121_0800_sub_1a2b',
          lastSyncedAtUtc: '2026-11-21T01:00:00.000Z',
          lastStatus: 'COMMITTED_VERIFIED',
          publicationPointerActive: false,
          legacySnapshotPresent: false,
          legacySnapshotTab: null,
        },
        {
          endpoint: 'villages',
          group: 'reference',
          syncMode: 'KEYED_UPSERT',
          paginationProtocol: 'none',
          destinationTab: 'Villages',
          rowCount: 85,
          lastRunId: 'run_20261121_0805_vil_3c4d',
          lastSyncedAtUtc: '2026-11-21T01:05:00.000Z',
          lastStatus: 'COMMITTED_VERIFIED',
          publicationPointerActive: false,
          legacySnapshotPresent: false,
          legacySnapshotTab: null,
        },
        {
          endpoint: 'health-services',
          group: 'reference',
          syncMode: 'KEYED_UPSERT',
          paginationProtocol: 'offset',
          destinationTab: 'HealthServices',
          rowCount: 18,
          lastRunId: 'run_20261121_0810_hs_5e6f',
          lastSyncedAtUtc: '2026-11-21T01:10:00.000Z',
          lastStatus: 'COMMITTED_VERIFIED',
          publicationPointerActive: false,
          legacySnapshotPresent: false,
          legacySnapshotTab: null,
        },
        {
          endpoint: 'volunteer-gender',
          group: 'extended_report',
          syncMode: 'KEYED_UPSERT',
          paginationProtocol: 'report',
          destinationTab: 'VolunteerGender',
          rowCount: null,
          lastRunId: null,
          lastSyncedAtUtc: null,
          lastStatus: 'NEVER_SYNCED',
          publicationPointerActive: false,
          legacySnapshotPresent: true,
          legacySnapshotTab: 'RGender_f010_20261119',
        },
        {
          endpoint: 'assignments',
          group: 'extended_report',
          syncMode: 'KEYED_UPSERT',
          paginationProtocol: 'assignment',
          destinationTab: 'Assignments',
          rowCount: 1571,
          lastRunId: 'run_20261121_0915_assign_7c9a2e',
          lastSyncedAtUtc: '2026-11-21T02:15:00.000Z',
          lastStatus: 'UNRESOLVED_PREVIOUS_RUN',
          publicationPointerActive: false,
          legacySnapshotPresent: false,
          legacySnapshotTab: null,
        },
        {
          endpoint: 'volunteer-family',
          group: 'extended_report',
          syncMode: 'COMPLETE_SNAPSHOT',
          paginationProtocol: 'report',
          destinationTab: 'RFamily_20261121_1030',
          rowCount: 1823,
          lastRunId: 'run_20261121_1030_fam_8g9h',
          lastSyncedAtUtc: '2026-11-21T03:30:00.000Z',
          lastStatus: 'COMMITTED_VERIFIED',
          publicationPointerActive: true,
          legacySnapshotPresent: false,
          legacySnapshotTab: null,
        },
        {
          endpoint: 'resigned-volunteers',
          group: 'extended_report',
          syncMode: 'KEYED_UPSERT',
          paginationProtocol: 'report',
          destinationTab: 'ResignedVolunteers',
          rowCount: 1152,
          lastRunId: 'run_20261120_1600_res_4k5m',
          lastSyncedAtUtc: '2026-11-20T09:00:00.000Z',
          lastStatus: 'FAILED_STOP',
          publicationPointerActive: false,
          legacySnapshotPresent: false,
          legacySnapshotTab: null,
        },
        {
          endpoint: 'volunteer-tenure',
          group: 'extended_report',
          syncMode: 'KEYED_UPSERT',
          paginationProtocol: 'report',
          destinationTab: 'VolunteerTenure',
          rowCount: 1571,
          lastRunId: 'run_20261121_1045_ten_9n0p',
          lastSyncedAtUtc: '2026-11-21T03:45:00.000Z',
          lastStatus: 'COMMITTED_VERIFIED',
          publicationPointerActive: false,
          legacySnapshotPresent: false,
          legacySnapshotTab: null,
        },
      ],
    };
    return { ok: true, data };
  }

  if (
    scenario === 'production-clean' ||
    scenario === 'production-writable' ||
    scenario === 'production-report-writable'
  ) {
    const base = buildMockDashboardEnvelope('production-unresolved') as {
      ok: true;
      data: DashboardStatusData;
    };
    const writable =
      scenario === 'production-writable' || scenario === 'production-report-writable';
    const personWritable = scenario === 'production-report-writable';
    const datasets = base.data.datasets.map((ds) =>
      ds.endpoint === 'assignments' ? { ...ds, lastStatus: 'COMMITTED_VERIFIED' as const } : ds,
    );
    return {
      ok: true,
      data: {
        ...base.data,
        guards: {
          writeEnabled: writable,
          personDataWriteEnabled: personWritable,
          hmacKeyConfigured: true,
          reportWorkbookApproved: true,
        },
        unresolvedRuns: [],
        datasets,
      },
    };
  }

  const unapproved =
    scenario === 'same-workbook-unapproved' || scenario === 'same-workbook-unapproved-writable';
  const writableSandbox =
    scenario === 'sandbox-writable' ||
    scenario === 'sandbox-report-writable' ||
    scenario === 'same-workbook-unapproved-writable';
  const personWritableSandbox =
    scenario === 'sandbox-report-writable' || scenario === 'same-workbook-unapproved-writable';
  const separateSandboxReport = scenario === 'sandbox-report-writable';
  const sandboxData: DashboardStatusData = {
    env: 'SANDBOX',
    scope: { provinceCode: '54', districtCode: '5406' },
    generatedAtUtc: '2026-11-21T11:30:00.000Z',
    workbooks: {
      reference: { spreadsheetId: SANDBOX_REF_ID, name: 'ThaiPHC Data (Sandbox Mock)' },
      report: separateSandboxReport
        ? {
            spreadsheetId: SANDBOX_REPORT_ID,
            name: 'ThaiPHC Extended Reports (Sandbox Mock)',
          }
        : { spreadsheetId: SANDBOX_REF_ID, name: 'ThaiPHC Data (Sandbox Mock)' },
      sameWorkbookPolicy: separateSandboxReport
        ? 'SEPARATE_WORKBOOK'
        : unapproved
          ? 'SAME_WORKBOOK_UNAPPROVED'
          : 'SAME_WORKBOOK_APPROVED',
    },
    guards: {
      writeEnabled: writableSandbox,
      personDataWriteEnabled: personWritableSandbox,
      hmacKeyConfigured: !unapproved,
      reportWorkbookApproved: !unapproved,
    },
    unresolvedRuns: [],
    datasets: [
      {
        endpoint: 'subdistricts',
        group: 'reference',
        syncMode: 'KEYED_UPSERT',
        paginationProtocol: 'none',
        destinationTab: 'Subdistricts',
        rowCount: 8,
        lastRunId: 'run_20261121_0900_sub_s1',
        lastSyncedAtUtc: '2026-11-21T02:00:00.000Z',
        lastStatus: 'COMMITTED_VERIFIED',
        publicationPointerActive: false,
        legacySnapshotPresent: false,
        legacySnapshotTab: null,
      },
      {
        endpoint: 'villages',
        group: 'reference',
        syncMode: 'KEYED_UPSERT',
        paginationProtocol: 'none',
        destinationTab: 'Villages',
        rowCount: 85,
        lastRunId: 'run_20261121_0905_vil_s2',
        lastSyncedAtUtc: '2026-11-21T02:05:00.000Z',
        lastStatus: 'COMMITTED_VERIFIED',
        publicationPointerActive: false,
        legacySnapshotPresent: false,
        legacySnapshotTab: null,
      },
      {
        endpoint: 'health-services',
        group: 'reference',
        syncMode: 'KEYED_UPSERT',
        paginationProtocol: 'offset',
        destinationTab: 'HealthServices',
        rowCount: 18,
        lastRunId: 'run_20261121_0910_hs_s3',
        lastSyncedAtUtc: '2026-11-21T02:10:00.000Z',
        lastStatus: 'COMMITTED_VERIFIED',
        publicationPointerActive: false,
        legacySnapshotPresent: false,
        legacySnapshotTab: null,
      },
      {
        endpoint: 'volunteer-gender',
        group: 'extended_report',
        syncMode: 'KEYED_UPSERT',
        paginationProtocol: 'report',
        destinationTab: 'VolunteerGender',
        rowCount: null,
        lastRunId: null,
        lastSyncedAtUtc: null,
        lastStatus: 'NEVER_SYNCED',
        publicationPointerActive: false,
        legacySnapshotPresent: true,
        legacySnapshotTab: 'RGender_f010_20261119',
      },
      {
        endpoint: 'assignments',
        group: 'extended_report',
        syncMode: 'KEYED_UPSERT',
        paginationProtocol: 'assignment',
        destinationTab: 'Assignments',
        rowCount: 1571,
        lastRunId: 'run_20261121_0930_assign_s4',
        lastSyncedAtUtc: '2026-11-21T02:30:00.000Z',
        lastStatus: 'COMMITTED_VERIFIED',
        publicationPointerActive: false,
        legacySnapshotPresent: false,
        legacySnapshotTab: null,
      },
      {
        endpoint: 'volunteer-family',
        group: 'extended_report',
        syncMode: 'COMPLETE_SNAPSHOT',
        paginationProtocol: 'report',
        destinationTab: 'RFamily_20261121_1030',
        rowCount: 1823,
        lastRunId: 'run_20261121_1030_fam_s5',
        lastSyncedAtUtc: '2026-11-21T03:30:00.000Z',
        lastStatus: 'COMMITTED_VERIFIED',
        publicationPointerActive: true,
        legacySnapshotPresent: false,
        legacySnapshotTab: null,
      },
      {
        endpoint: 'resigned-volunteers',
        group: 'extended_report',
        syncMode: 'KEYED_UPSERT',
        paginationProtocol: 'report',
        destinationTab: 'ResignedVolunteers',
        rowCount: 1152,
        lastRunId: 'run_20261121_1045_res_s6',
        lastSyncedAtUtc: '2026-11-21T03:45:00.000Z',
        lastStatus: 'COMMITTED_VERIFIED',
        publicationPointerActive: false,
        legacySnapshotPresent: false,
        legacySnapshotTab: null,
      },
      {
        endpoint: 'volunteer-tenure',
        group: 'extended_report',
        syncMode: 'KEYED_UPSERT',
        paginationProtocol: 'report',
        destinationTab: 'VolunteerTenure',
        rowCount: null,
        lastRunId: null,
        lastSyncedAtUtc: null,
        lastStatus: 'NEVER_SYNCED',
        publicationPointerActive: false,
        legacySnapshotPresent: false,
        legacySnapshotTab: null,
      },
    ],
  };

  return { ok: true, data: sandboxData };
}

const REFERENCE_META: Record<
  ReferenceDatasetEndpoint,
  {
    tab: string;
    protocol: 'none' | 'offset';
    pagesFetched: number;
    sourceTotal: number;
    sampleRows: ReferencePreviewRow[];
    counts: { insert: number; update: number; unchanged: number; review: number };
    reviewBreakdown: Record<string, number>;
  }
> = {
  subdistricts: {
    tab: 'Subdistricts',
    protocol: 'none',
    pagesFetched: 1,
    sourceTotal: 8,
    counts: { insert: 1, update: 1, unchanged: 6, review: 1 },
    reviewBreakdown: { MISSING_IN_SOURCE: 1 },
    sampleRows: [
      {
        diffKind: 'INSERT',
        sourceKey: '540608',
        displayName: 'สะเอียบ',
        displayCode: '540608',
        changedFields: [],
        summaryFields: [
          { field: 'name_th', value: 'สะเอียบ' },
          { field: 'name_en', value: 'Sa-iap' },
          { field: 'postal_code', value: '54120' },
        ],
        reviewReasons: [],
      },
      {
        diffKind: 'UPDATE',
        sourceKey: '540601',
        displayName: 'บ้านหนุน',
        displayCode: '540601',
        changedFields: [{ field: 'postal_code', before: '54120', after: '54121' }],
        summaryFields: [
          { field: 'name_th', value: 'บ้านหนุน' },
          { field: 'postal_code', value: '54121' },
        ],
        reviewReasons: [],
      },
      {
        diffKind: 'UNCHANGED',
        sourceKey: '540602',
        displayName: 'บ้านกลาง',
        displayCode: '540602',
        changedFields: [],
        summaryFields: [{ field: 'name_th', value: 'บ้านกลาง' }],
        reviewReasons: [],
      },
      {
        diffKind: 'REVIEW',
        sourceKey: '540609',
        displayName: 'ตำบลเดิมที่ไม่อยู่ในต้นทาง',
        displayCode: '540609',
        changedFields: [],
        summaryFields: [],
        reviewReasons: ['MISSING_IN_SOURCE'],
      },
    ],
  },
  villages: {
    tab: 'Villages',
    protocol: 'none',
    pagesFetched: 1,
    sourceTotal: 85,
    counts: { insert: 0, update: 1, unchanged: 84, review: 0 },
    reviewBreakdown: {},
    sampleRows: [
      {
        diffKind: 'UPDATE',
        sourceKey: '540602005',
        displayName: 'กลาง',
        displayCode: '540602005',
        changedFields: [
          {
            field: 'health_service_code',
            before: 'GA0006418',
            after: 'GA0006419',
          },
        ],
        summaryFields: [
          { field: 'name_th', value: 'กลาง' },
          { field: 'subdistrict_name_th', value: 'บ้านกลาง' },
          { field: 'village_no', value: '5' },
        ],
        reviewReasons: [],
      },
      {
        diffKind: 'UNCHANGED',
        sourceKey: '540601001',
        displayName: 'หนุนเหนือ',
        displayCode: '540601001',
        changedFields: [],
        summaryFields: [{ field: 'name_th', value: 'หนุนเหนือ' }],
        reviewReasons: [],
      },
    ],
  },
  'health-services': {
    tab: 'HealthServices',
    protocol: 'offset',
    pagesFetched: 2,
    sourceTotal: 18,
    counts: { insert: 1, update: 1, unchanged: 16, review: 2 },
    reviewBreakdown: { PLACEHOLDER_COORDS: 1, MISSING_IN_SOURCE: 1 },
    sampleRows: [
      {
        diffKind: 'INSERT',
        sourceKey: 'GA0006426',
        displayName: 'รพ.สต.แดนชุมพล',
        displayCode: 'GA0006426',
        changedFields: [],
        summaryFields: [
          { field: 'legacy_5digit_code', value: '06426' },
          { field: 'latitude', value: '0' },
          { field: 'longitude', value: '0' },
        ],
        reviewReasons: ['PLACEHOLDER_COORDS'],
      },
      {
        diffKind: 'UPDATE',
        sourceKey: 'GA0006419',
        displayName: 'รพ.สต.เตาปูน',
        displayCode: 'GA0006419',
        changedFields: [
          {
            field: 'health_service_name_th',
            before: 'รพ.สต.เตาปูน (เดิม)',
            after: 'รพ.สต.เตาปูน',
          },
        ],
        summaryFields: [{ field: 'legacy_5digit_code', value: '06419' }],
        reviewReasons: [],
      },
      {
        diffKind: 'REVIEW',
        sourceKey: 'GA0006499',
        displayName: 'หน่วยบริการเดิมในชีต',
        displayCode: 'GA0006499',
        changedFields: [],
        summaryFields: [],
        reviewReasons: ['MISSING_IN_SOURCE'],
      },
    ],
  },
};

const VOLUNTEER_GENDER_MOCK_META: {
  tab: string;
  protocol: 'report';
  pagesFetched: number;
  sourceTotal: number;
  counts: { insert: number; update: number; unchanged: number; review: number };
  reviewBreakdown: Record<string, number>;
  aggregateSummary: ExtendedAggregateGroup[];
  sampleRows: ExtendedMinimizedPreviewRow[];
} = {
  tab: 'VolunteerGender',
  protocol: 'report',
  pagesFetched: 1,
  sourceTotal: 85,
  counts: { insert: 85, update: 0, unchanged: 0, review: 2 },
  reviewBreakdown: { SMALL_CELL_SUPPRESSED: 2 },
  aggregateSummary: [
    { groupCode: '540601', groupLabel: 'บ้านหนุน', rowCount: 11, reviewCount: 1 },
    { groupCode: '540602', groupLabel: 'บ้านกลาง', rowCount: 12, reviewCount: 1 },
    { groupCode: '540603', groupLabel: 'ห้วยหม้าย', rowCount: 17, reviewCount: 0 },
  ],
  sampleRows: [
    {
      diffKind: 'INSERT',
      sourceKey: '540601001',
      scopeLabel: '54 / 5406 · 540601 บ้านหนุน · หมู่ 1 หนุนเหนือ',
      minimizedAttributes: [
        { field: 'total', value: '19' },
        { field: 'male', value: null },
        { field: 'female', value: null },
      ],
      reviewReasons: ['SMALL_CELL_SUPPRESSED'],
    },
    {
      diffKind: 'INSERT',
      sourceKey: '540602004',
      scopeLabel: '54 / 5406 · 540602 บ้านกลาง · หมู่ 4 ป่าแดง',
      minimizedAttributes: [
        { field: 'total', value: null },
        { field: 'male', value: null },
        { field: 'female', value: null },
      ],
      reviewReasons: ['SMALL_CELL_SUPPRESSED'],
    },
    {
      diffKind: 'INSERT',
      sourceKey: '540603001',
      scopeLabel: '54 / 5406 · 540603 ห้วยหม้าย · หมู่ 1 ห้วยหม้าย',
      minimizedAttributes: [
        { field: 'total', value: '16' },
        { field: 'male', value: '6' },
        { field: 'female', value: '10' },
      ],
      reviewReasons: [],
    },
  ],
};

function isRef(endpoint: string): endpoint is ReferenceDatasetEndpoint {
  return endpoint === 'subdistricts' || endpoint === 'villages' || endpoint === 'health-services';
}

function isSupportedSmallKeyed(endpoint: string): endpoint is SmallKeyedDatasetEndpoint {
  return isRef(endpoint) || endpoint === 'volunteer-gender';
}

function evaluateMockWriteGuard(
  endpoint: SmallKeyedDatasetEndpoint,
  dash: DashboardStatusData,
): {
  writeAllowed: boolean;
  blockedGuardReason: BlockedGuardReason | null;
  stopCode?: string;
  message?: string;
} {
  if (!dash.guards.writeEnabled) {
    return {
      writeAllowed: false,
      blockedGuardReason: 'THAIPHC_WRITE_ENABLED',
      stopCode: 'WRITE_DISABLED',
      message: 'THAIPHC_WRITE_ENABLED is OFF in Google Apps Script Properties.',
    };
  }
  if (!isRef(endpoint)) {
    if (!dash.guards.personDataWriteEnabled) {
      return {
        writeAllowed: false,
        blockedGuardReason: 'THAIPHC_PERSON_DATA_WRITE_ENABLED',
        stopCode: 'PERSON_DATA_WRITE_DISABLED',
        message: 'THAIPHC_PERSON_DATA_WRITE_ENABLED is OFF in Google Apps Script Properties.',
      };
    }
    if (!dash.guards.reportWorkbookApproved) {
      return {
        writeAllowed: false,
        blockedGuardReason: 'THAIPHC_SAME_WORKBOOK_APPROVAL',
        stopCode: 'SAME_WORKBOOK_UNAPPROVED',
        message:
          'Writing Extended Report datasets into the reference workbook requires THAIPHC_SAME_WORKBOOK_APPROVAL=OWNER_ONLY_5406_APPROVED.',
      };
    }
  }
  return { writeAllowed: true, blockedGuardReason: null };
}

export function buildMockPreviewEnvelope(
  request: PreviewDatasetRequest,
  scenario: MockScenario,
  outcome: MockPreviewOutcome = 'ready',
): unknown {
  if (!isSupportedSmallKeyed(request.endpoint)) {
    return {
      ok: false,
      error: {
        code: 'DATASET_NOT_SUPPORTED',
        message: 'Preview สำหรับชุดข้อมูลรายงานขยายชุดนี้จะเปิดใช้งานในรอบงานถัดไป (Tickets 05–07)',
      },
    };
  }

  if (outcome === 'http-401') {
    return {
      ok: false,
      error: { code: 'HTTP_401', message: 'ThaiPHC authentication failed (HTTP 401).' },
    };
  }

  const endpoint = request.endpoint;
  const dash = buildMockDashboardEnvelope(
    scenario === 'rpc-error' ? 'sandbox-default' : scenario,
  ) as { ok: true; data: DashboardStatusData };
  const env = dash.data.env;
  const guard = evaluateMockWriteGuard(endpoint, dash.data);
  const refMeta = isRef(endpoint) ? REFERENCE_META[endpoint] : null;
  const isExtended = refMeta === null;
  const tab = refMeta ? refMeta.tab : VOLUNTEER_GENDER_MOCK_META.tab;
  const protocol = refMeta ? refMeta.protocol : VOLUNTEER_GENDER_MOCK_META.protocol;
  const pagesFetched = refMeta ? refMeta.pagesFetched : VOLUNTEER_GENDER_MOCK_META.pagesFetched;
  const sourceTotal = refMeta ? refMeta.sourceTotal : VOLUNTEER_GENDER_MOCK_META.sourceTotal;

  if (outcome === 'stop-blocked') {
    return {
      ok: true,
      data: {
        status: 'STOP_BLOCKED',
        endpoint: request.endpoint,
        env,
        syncMode: 'KEYED_UPSERT',
        paginationProtocol: protocol,
        destinationTab: tab,
        previewedAtUtc: '2026-11-21T14:05:00.000Z',
        pagesFetched,
        diagnostics: isExtended
          ? [
              {
                code: 'GENDER_TOTAL_MISMATCH',
                message: 'Row #1 failed gender arithmetic invariant (male + female !== total).',
                field: 'total',
                rowIndex: 0,
              },
              {
                code: 'OUT_OF_GEOGRAPHIC_SCOPE',
                message: 'Row #3 falls outside Geographic Scope (54 / 5406) for volunteer-gender.',
                rowIndex: 2,
              },
            ]
          : [
              {
                code: 'FORMULA_INJECTION_DETECTED',
                message:
                  'Field "name_th" starts with a forbidden spreadsheet formula prefix (=, +, -, @).',
                field: 'name_th',
                rowIndex: 2,
              },
              {
                code: 'OUT_OF_GEOGRAPHIC_SCOPE',
                message: `Row #4 falls outside Geographic Scope (54 / 5406) for ${request.endpoint}.`,
                rowIndex: 3,
              },
            ],
        unresolvedPreviousRun: null,
      },
    };
  }

  const slugHash = request.endpoint
    .replace(/[^a-z]/g, '')
    .padEnd(8, '0')
    .slice(0, 8);
  const datasetDigest = `${slugHash}a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef012345678`;
  const sheetRevisionFingerprint = `${slugHash}9f8e7d6c5b4a39281706f5e4d3c2b1a0987654321fedcba098765432`;
  const fingerprintDigest = `${slugHash}f1e2d3c4b5a69788796a5b4c3d2e1f00112233445566778899aabbcc`;

  if (refMeta === null) {
    const dsMeta = dash.data.datasets.find((d) => d.endpoint === endpoint);
    const counts =
      outcome === 'all-unchanged'
        ? { insert: 0, update: 0, unchanged: sourceTotal, review: 0 }
        : VOLUNTEER_GENDER_MOCK_META.counts;
    const sampleRows =
      outcome === 'all-unchanged'
        ? VOLUNTEER_GENDER_MOCK_META.sampleRows
            .filter((r) => r.reviewReasons.length === 0)
            .map((r) => ({ ...r, diffKind: 'UNCHANGED' as const }))
        : VOLUNTEER_GENDER_MOCK_META.sampleRows;
    const reviewBreakdown =
      outcome === 'all-unchanged' ? {} : VOLUNTEER_GENDER_MOCK_META.reviewBreakdown;

    return {
      ok: true,
      data: {
        status: 'READY',
        endpoint,
        env,
        syncMode: 'KEYED_UPSERT',
        paginationProtocol: protocol,
        destinationTab: tab,
        previewedAtUtc: '2026-11-21T14:05:00.000Z',
        pagesFetched,
        sourceTotal,
        fingerprint: {
          endpoint,
          env,
          sourceTotal,
          datasetDigest,
          sheetRevisionFingerprint,
          counts,
          fingerprintDigest,
        },
        counts,
        reviewBreakdown,
        unresolvedPreviousRun: null,
        legacySnapshotPresent: dsMeta?.legacySnapshotPresent ?? false,
        legacySnapshotTab: dsMeta?.legacySnapshotTab ?? null,
        writeAllowed: guard.writeAllowed,
        blockedGuardReason: guard.blockedGuardReason,
        previewMode: 'EXTENDED_MINIMIZED',
        aggregateSummary: VOLUNTEER_GENDER_MOCK_META.aggregateSummary,
        sampleRows,
      },
    };
  }

  const meta = refMeta;
  const counts =
    outcome === 'all-unchanged'
      ? { insert: 0, update: 0, unchanged: meta.sourceTotal, review: 0 }
      : meta.counts;
  const sampleRows =
    outcome === 'all-unchanged'
      ? meta.sampleRows
          .filter((r) => r.diffKind === 'UNCHANGED')
          .map((r) => ({ ...r, reviewReasons: [] }))
      : meta.sampleRows;
  const reviewBreakdown = outcome === 'all-unchanged' ? {} : meta.reviewBreakdown;

  return {
    ok: true,
    data: {
      status: 'READY',
      endpoint: request.endpoint,
      env,
      syncMode: 'KEYED_UPSERT',
      paginationProtocol: meta.protocol,
      destinationTab: meta.tab,
      previewedAtUtc: '2026-11-21T14:05:00.000Z',
      pagesFetched: meta.pagesFetched,
      sourceTotal: meta.sourceTotal,
      fingerprint: {
        endpoint: request.endpoint,
        env,
        sourceTotal: meta.sourceTotal,
        datasetDigest,
        sheetRevisionFingerprint,
        counts,
        fingerprintDigest,
      },
      counts,
      reviewBreakdown,
      unresolvedPreviousRun: null,
      legacySnapshotPresent: false,
      legacySnapshotTab: null,
      writeAllowed: guard.writeAllowed,
      blockedGuardReason: guard.blockedGuardReason,
      previewMode: 'REFERENCE_READABLE',
      sampleRows,
    },
  };
}

export function buildMockCommitEnvelope(
  request: CommitSmallDatasetRequest,
  scenario: MockScenario,
  outcome: MockCommitOutcome = 'verified',
): unknown {
  if (!isSupportedSmallKeyed(request.endpoint)) {
    return {
      ok: false,
      error: { code: 'DATASET_NOT_SUPPORTED', message: 'Dataset not supported yet.' },
    };
  }
  if (outcome === 'http-401') {
    return {
      ok: false,
      error: { code: 'HTTP_401', message: 'ThaiPHC authentication failed (HTTP 401).' },
    };
  }

  const endpoint = request.endpoint;
  const dash = buildMockDashboardEnvelope(
    scenario === 'rpc-error' ? 'sandbox-default' : scenario,
  ) as { ok: true; data: DashboardStatusData };
  const env = dash.data.env;
  const refMeta = isRef(endpoint) ? REFERENCE_META[endpoint] : null;
  const isExtended = refMeta === null;
  const tab = refMeta ? refMeta.tab : VOLUNTEER_GENDER_MOCK_META.tab;
  const guard = evaluateMockWriteGuard(endpoint, dash.data);

  if (!guard.writeAllowed) {
    return {
      ok: true,
      data: {
        status: 'FAILED_STOP',
        runId: null,
        endpoint: request.endpoint,
        env,
        destinationTab: tab,
        stopCode: guard.stopCode ?? 'WRITE_DISABLED',
        message: guard.message ?? 'Write guard blocked commit.',
        syncLogStatus: 'NOT_WRITTEN',
        stagingTabRetained: null,
      },
    };
  }

  if (
    env === 'PRODUCTION' &&
    request.confirmationPhrase !== `PRODUCTION 5406 ${request.endpoint}`
  ) {
    return {
      ok: true,
      data: {
        status: 'FAILED_STOP',
        runId: null,
        endpoint: request.endpoint,
        env,
        destinationTab: tab,
        stopCode: 'PRODUCTION_CONFIRMATION_REQUIRED',
        message: `Production commit requires exact confirmation phrase "PRODUCTION 5406 ${request.endpoint}".`,
        syncLogStatus: 'NOT_WRITTEN',
        stagingTabRetained: null,
      },
    };
  }

  if (outcome === 'preview-stale') {
    return {
      ok: true,
      data: {
        status: 'PREVIEW_STALE_RECONFIRM_REQUIRED',
        endpoint: request.endpoint,
        env,
        destinationTab: tab,
        driftReason: 'SOURCE_CHANGED',
        expectedFingerprint: request.expectedFingerprint,
        currentSourceTotal: request.expectedFingerprint.sourceTotal + 1,
        currentDatasetDigest: '9'.repeat(64),
        currentSheetRevisionFingerprint: request.expectedFingerprint.sheetRevisionFingerprint,
      },
    };
  }

  if (outcome === 'unknown-outcome') {
    return {
      ok: true,
      data: {
        status: 'UNKNOWN_OUTCOME_STOP',
        runId: `run_20261121_1406_${request.endpoint.slice(0, 6)}_unk1`,
        endpoint: request.endpoint,
        env,
        destinationTab: tab,
        stopCode: 'WRITE_FAILED_UNKNOWN',
        message:
          'Sheet write or flush stopped with an unknown outcome. Do not retry automatically; inspect the destination Sheet.',
        syncLogStatus: 'STARTED',
        stagingTabRetained: null,
      },
    };
  }

  if (outcome === 'readback-mismatch') {
    return {
      ok: true,
      data: {
        status: 'FAILED_STOP',
        runId: `run_20261121_1406_${request.endpoint.slice(0, 6)}_rb01`,
        endpoint: request.endpoint,
        env,
        destinationTab: tab,
        stopCode: 'READBACK_MISMATCH',
        message: 'Destination Readback detected a row count or digest mismatch after write.',
        syncLogStatus: 'FAILED_STOP',
        stagingTabRetained: null,
      },
    };
  }

  const fp = request.expectedFingerprint;
  const missingInSourceCount = refMeta ? (refMeta.reviewBreakdown.MISSING_IN_SOURCE ?? 0) : 0;
  const expectedRowCount = fp.sourceTotal + (fp.counts.review > 0 ? missingInSourceCount : 0);
  return {
    ok: true,
    data: {
      status: 'COMMITTED_VERIFIED',
      runId: `run_20261121_1406_${request.endpoint.replace(/-/g, '').slice(0, 8)}_ok01`,
      endpoint: request.endpoint,
      env,
      syncMode: 'KEYED_UPSERT',
      destinationTab: tab,
      completedAtUtc: '2026-11-21T14:06:15.000Z',
      counts: fp.counts,
      fingerprint: fp,
      readback: {
        verified: true,
        destinationTab: tab,
        expectedRowCount,
        actualRowCount: expectedRowCount,
        uniqueKeysVerified: true,
        rowDigestsVerified: true,
        unrelatedTabsPreserved: true,
        baselineTabsChecked: isExtended
          ? ['ชีต1', '_ThaiPHCReportCurrent', 'RGender_f010_20261119']
          : ['ชีต1', 'Subdistricts', 'Villages', 'HealthServices'],
        stagingTabCleaned: null,
      },
      syncLogStatus: 'COMMITTED_VERIFIED',
    },
  };
}
