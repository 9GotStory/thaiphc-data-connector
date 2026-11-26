import type {
  BlockedGuardReason,
  CommitSmallDatasetRequest,
  DashboardStatusData,
  DatasetEndpoint,
  ExtendedAggregateGroup,
  ExtendedMinimizedPreviewRow,
  ExtendedSampleCandidate,
  FinalizeLargeDatasetCommitRequest,
  FinalizePreviewRequest,
  LargeBatchedDatasetEndpoint,
  PreviewDatasetBatchRequest,
  PreviewDatasetRequest,
  ReferenceDatasetEndpoint,
  ReferencePreviewRow,
  ReviewReasonCode,
  SmallKeyedDatasetEndpoint,
  StageLargeDatasetBatchRequest,
  SyncMode,
} from './types';

export const MOCK_SCENARIOS = [
  'sandbox-default',
  'sandbox-writable',
  'sandbox-report-writable',
  'sandbox-assignments-legacy',
  'sandbox-report-legacy',
  'production-unresolved',
  'production-writable',
  'production-report-writable',
  'production-clean',
  'same-workbook-unapproved',
  'same-workbook-unapproved-writable',
  'rpc-error',
] as const;

export type MockScenario = (typeof MOCK_SCENARIOS)[number];

export const MOCK_PREVIEW_OUTCOMES = [
  'ready',
  'stop-blocked',
  'http-401',
  'all-unchanged',
] as const;

export type MockPreviewOutcome = (typeof MOCK_PREVIEW_OUTCOMES)[number];

export const MOCK_COMMIT_OUTCOMES = [
  'verified',
  'preview-stale',
  'unknown-outcome',
  'readback-mismatch',
  'digest-mismatch',
  'incomplete-stage',
  'http-401',
] as const;

export type MockCommitOutcome = (typeof MOCK_COMMIT_OUTCOMES)[number];

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
    scenario === 'sandbox-assignments-legacy' ||
    scenario === 'sandbox-report-legacy' ||
    scenario === 'same-workbook-unapproved-writable';
  const personWritableSandbox =
    scenario === 'sandbox-report-writable' ||
    scenario === 'sandbox-assignments-legacy' ||
    scenario === 'sandbox-report-legacy' ||
    scenario === 'same-workbook-unapproved-writable';
  const separateSandboxReport =
    scenario === 'sandbox-report-writable' ||
    scenario === 'sandbox-assignments-legacy' ||
    scenario === 'sandbox-report-legacy';
  const assignmentsLegacyMode = scenario === 'sandbox-assignments-legacy';
  const reportLegacyMode = scenario === 'sandbox-report-legacy';
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
        rowCount: assignmentsLegacyMode ? null : 1571,
        lastRunId: assignmentsLegacyMode ? null : 'run_20261121_0930_assign_s4',
        lastSyncedAtUtc: assignmentsLegacyMode ? null : '2026-11-21T02:30:00.000Z',
        lastStatus: assignmentsLegacyMode ? 'NEVER_SYNCED' : 'COMMITTED_VERIFIED',
        publicationPointerActive: false,
        legacySnapshotPresent: assignmentsLegacyMode,
        legacySnapshotTab: assignmentsLegacyMode ? 'RAssign_f010_20261119' : null,
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
        rowCount: reportLegacyMode ? null : 1152,
        lastRunId: reportLegacyMode ? null : 'run_20261121_1045_res_s6',
        lastSyncedAtUtc: reportLegacyMode ? null : '2026-11-21T03:45:00.000Z',
        lastStatus: reportLegacyMode ? 'NEVER_SYNCED' : 'COMMITTED_VERIFIED',
        publicationPointerActive: false,
        legacySnapshotPresent: reportLegacyMode,
        legacySnapshotTab: reportLegacyMode ? 'RResign_f010_20261119' : null,
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
        legacySnapshotPresent: reportLegacyMode,
        legacySnapshotTab: reportLegacyMode ? 'RTenure_f010_20261119' : null,
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
  endpoint: DatasetEndpoint,
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

function isSupportedLargeBatched(endpoint: string): endpoint is LargeBatchedDatasetEndpoint {
  return (
    endpoint === 'assignments' ||
    endpoint === 'resigned-volunteers' ||
    endpoint === 'volunteer-tenure' ||
    endpoint === 'volunteer-family'
  );
}

function makeMockH1Key(index: number, prefix = 'a1b2c3d4e5f60718'): string {
  const hex = index.toString(16).padStart(8, '0');
  return `h1_${hex}${prefix.repeat(3)}90abcdef`;
}

function makeMockRowDigest(index: number): string {
  const hex = index.toString(16).padStart(8, '0');
  return `${hex}${'1122334455667788'.repeat(3)}deadbeef`;
}

interface LargeBatchedMockProfile {
  readonly syncMode: SyncMode;
  readonly usesHmac: boolean;
  readonly destinationTab: string;
  readonly paginationProtocol: 'assignment' | 'report';
  readonly sourceTotal: number;
  readonly runSlug: string;
  readonly digestSlug: string;
  readonly h1Salt: string;
  readonly legacyBaselineTab: string;
  readonly localityMismatchCount: number;
  readonly aggregates: ExtendedAggregateGroup[];
  readonly sampleCandidates: ExtendedSampleCandidate[];
  readonly missingSampleScopeLabel: string;
}

const LARGE_BATCHED_MOCK_PROFILES: Readonly<
  Record<LargeBatchedDatasetEndpoint, LargeBatchedMockProfile>
> = {
  assignments: {
    syncMode: 'KEYED_UPSERT',
    usesHmac: true,
    destinationTab: 'Assignments',
    paginationProtocol: 'assignment',
    sourceTotal: 1571,
    runSlug: 'assign',
    digestSlug: 'assign00',
    h1Salt: 'a1b2c3d4e5f60718',
    legacyBaselineTab: 'RAssign_f010_20261119',
    localityMismatchCount: 0,
    aggregates: [
      { groupCode: '540601', groupLabel: 'บ้านหนุน', rowCount: 221, reviewCount: 0 },
      { groupCode: '540602', groupLabel: 'บ้านกลาง', rowCount: 248, reviewCount: 0 },
      { groupCode: '540603', groupLabel: 'ห้วยหม้าย', rowCount: 312, reviewCount: 0 },
      { groupCode: '540604', groupLabel: 'เตาปูน', rowCount: 194, reviewCount: 0 },
      { groupCode: '540605', groupLabel: 'หัวเมือง', rowCount: 176, reviewCount: 0 },
      { groupCode: '540606', groupLabel: 'ทุ่งน้าว', rowCount: 145, reviewCount: 0 },
      { groupCode: '540607', groupLabel: 'แดนชุมพล', rowCount: 152, reviewCount: 0 },
      { groupCode: '540608', groupLabel: 'สะเอียบ', rowCount: 123, reviewCount: 0 },
    ],
    sampleCandidates: [
      {
        sourceKey: makeMockH1Key(1, 'a1b2c3d4e5f60718'),
        rowDigest: makeMockRowDigest(1),
        scopeLabel: '54 / 5406 · 540603 ห้วยหม้าย · หมู่ 7',
        minimizedAttributes: [
          { field: 'isActive', value: 'true' },
          { field: 'status', value: 'ใช้งาน' },
          { field: 'approvalStatus', value: 'approved' },
          { field: 'volunteerStatus', value: 'already_volunteer' },
          { field: 'villageName', value: null },
        ],
        reviewReasons: [],
      },
      {
        sourceKey: makeMockH1Key(2, 'a1b2c3d4e5f60718'),
        rowDigest: makeMockRowDigest(2),
        scopeLabel: '54 / 5406 · 540601 บ้านหนุน · หมู่ 1 หนุนเหนือ',
        minimizedAttributes: [
          { field: 'isActive', value: 'true' },
          { field: 'status', value: 'ใช้งาน' },
          { field: 'approvalStatus', value: 'approved' },
          { field: 'volunteerStatus', value: 'not_interested' },
          { field: 'villageName', value: 'หนุนเหนือ' },
        ],
        reviewReasons: [],
      },
      {
        sourceKey: makeMockH1Key(3, 'a1b2c3d4e5f60718'),
        rowDigest: makeMockRowDigest(3),
        scopeLabel: '54 / 5406 · 540602 บ้านกลาง · หมู่ 5 กลาง',
        minimizedAttributes: [
          { field: 'isActive', value: 'true' },
          { field: 'status', value: 'ใช้งาน' },
          { field: 'approvalStatus', value: 'approved' },
          { field: 'volunteerStatus', value: 'already_volunteer' },
          { field: 'villageName', value: null },
        ],
        reviewReasons: [],
      },
    ],
    missingSampleScopeLabel: '54 / 5406 · 540608 สะเอียบ · หมู่ 2',
  },
  'volunteer-family': {
    syncMode: 'COMPLETE_SNAPSHOT',
    usesHmac: false,
    destinationTab: 'RFamily_<runId>',
    paginationProtocol: 'report',
    sourceTotal: 1823,
    runSlug: 'family',
    digestSlug: 'family00',
    h1Salt: '',
    legacyBaselineTab: 'RFamily_20261121_1030',
    localityMismatchCount: 3,
    aggregates: [
      { groupCode: '540210', groupLabel: 'ตำบลต้นทางนอกเขตย่อย', rowCount: 2, reviewCount: 2 },
      { groupCode: '540601', groupLabel: 'บ้านหนุน', rowCount: 620, reviewCount: 1 },
      { groupCode: '540603', groupLabel: 'ห้วยหม้าย', rowCount: 1201, reviewCount: 0 },
    ],
    sampleCandidates: [
      {
        sourceKey: 'snapshot_preview_00001',
        rowDigest: makeMockRowDigest(301),
        scopeLabel: '54 / 5406 · 540210 ตำบลต้นทางนอกเขตย่อย · หมู่ 6 บ้านตัวอย่าง (540603006)',
        minimizedAttributes: [
          { field: 'gender', value: 'female' },
          { field: 'status', value: 'volunteer' },
          { field: 'statusLabel', value: 'อสม.' },
        ],
        reviewReasons: ['LOCALITY_MISMATCH'],
      },
      {
        sourceKey: 'snapshot_preview_00002',
        rowDigest: makeMockRowDigest(302),
        scopeLabel: '54 / 5406 · 540601 บ้านหนุน · หมู่ 10 หนุนเหนือ (540303004)',
        minimizedAttributes: [
          { field: 'gender', value: 'male' },
          { field: 'status', value: 'spouse' },
          { field: 'statusLabel', value: 'คู่สมรส' },
        ],
        reviewReasons: ['LOCALITY_MISMATCH'],
      },
      {
        sourceKey: 'snapshot_preview_00003',
        rowDigest: makeMockRowDigest(303),
        scopeLabel: '54 / 5406 · 540603 ห้วยหม้าย · หมู่ 1 ห้วยหม้าย (540603001)',
        minimizedAttributes: [
          { field: 'gender', value: 'female' },
          { field: 'status', value: 'child' },
          { field: 'statusLabel', value: 'บุตร' },
        ],
        reviewReasons: [],
      },
    ],
    missingSampleScopeLabel: '',
  },
  'resigned-volunteers': {
    syncMode: 'KEYED_UPSERT',
    usesHmac: true,
    destinationTab: 'ResignedVolunteers',
    paginationProtocol: 'report',
    sourceTotal: 1152,
    runSlug: 'resign',
    digestSlug: 'resign00',
    h1Salt: 'b2c3d4e5f6071829',
    legacyBaselineTab: 'RResign_f010_20261119',
    localityMismatchCount: 2,
    aggregates: [
      { groupCode: '540210', groupLabel: 'ตำบลต้นทางนอกเขตย่อย', rowCount: 1, reviewCount: 1 },
      { groupCode: '540601', groupLabel: 'บ้านหนุน', rowCount: 412, reviewCount: 1 },
      { groupCode: '540606', groupLabel: 'สะเอียบ', rowCount: 739, reviewCount: 0 },
    ],
    sampleCandidates: [
      {
        sourceKey: makeMockH1Key(1, 'b2c3d4e5f6071829'),
        rowDigest: makeMockRowDigest(101),
        scopeLabel: '54 / 5406 · 540210 ตำบลต้นทางนอกเขตย่อย · หมู่ 6 บ้านตัวอย่าง (540603006)',
        minimizedAttributes: [
          { field: 'retirementDate', value: '2019-06-01' },
          { field: 'retirementReason', value: 'resigned' },
          { field: 'osmStatus', value: '0' },
          { field: 'volunteerStatus', value: 'already_volunteer' },
          { field: 'approvalStatus', value: 'approved' },
        ],
        reviewReasons: ['LOCALITY_MISMATCH'],
      },
      {
        sourceKey: makeMockH1Key(2, 'b2c3d4e5f6071829'),
        rowDigest: makeMockRowDigest(102),
        scopeLabel: '54 / 5406 · 540601 บ้านหนุน · หมู่ 10 หนุนเหนือ (540303004)',
        minimizedAttributes: [
          { field: 'retirementDate', value: '2022-03-15' },
          { field: 'retirementReason', value: null },
          { field: 'osmStatus', value: '0' },
          { field: 'volunteerStatus', value: 'already_volunteer' },
          { field: 'approvalStatus', value: 'approved' },
        ],
        reviewReasons: ['LOCALITY_MISMATCH'],
      },
      {
        sourceKey: makeMockH1Key(3, 'b2c3d4e5f6071829'),
        rowDigest: makeMockRowDigest(103),
        scopeLabel: '54 / 5406 · 540606 สะเอียบ · หมู่ 9 บ้านดอนชัยสักทอง (540606009)',
        minimizedAttributes: [
          { field: 'retirementDate', value: '2024-01-15' },
          { field: 'retirementReason', value: 'died' },
          { field: 'osmStatus', value: '0' },
          { field: 'volunteerStatus', value: 'already_volunteer' },
          { field: 'approvalStatus', value: 'approved' },
        ],
        reviewReasons: [],
      },
    ],
    missingSampleScopeLabel: '54 / 5406 · 540606 สะเอียบ · หมู่ 1 (540606001)',
  },
  'volunteer-tenure': {
    syncMode: 'KEYED_UPSERT',
    usesHmac: true,
    destinationTab: 'VolunteerTenure',
    paginationProtocol: 'report',
    sourceTotal: 1571,
    runSlug: 'tenure',
    digestSlug: 'tenure00',
    h1Salt: 'c3d4e5f60718293a',
    legacyBaselineTab: 'RTenure_f010_20261119',
    localityMismatchCount: 0,
    aggregates: [
      { groupCode: '540601', groupLabel: 'บ้านหนุน', rowCount: 520, reviewCount: 0 },
      { groupCode: '540605', groupLabel: 'หัวเมือง', rowCount: 540, reviewCount: 0 },
      { groupCode: '540607', groupLabel: 'แดนชุมพล', rowCount: 511, reviewCount: 0 },
    ],
    sampleCandidates: [
      {
        sourceKey: makeMockH1Key(1, 'c3d4e5f60718293a'),
        rowDigest: makeMockRowDigest(201),
        scopeLabel: '54 / 5406 · 540605 หัวเมือง · หมู่ 3 ดงเจริญ (540605003)',
        minimizedAttributes: [
          { field: 'startYear', value: '2545' },
          { field: 'tenureYears', value: '24' },
          { field: 'osmYear', value: '2545' },
          { field: 'approvalDate', value: '2025-12-17' },
          { field: 'retirementDate', value: null },
          { field: 'retirementReason', value: null },
          { field: 'osmStatus', value: '' },
        ],
        reviewReasons: [],
      },
      {
        sourceKey: makeMockH1Key(2, 'c3d4e5f60718293a'),
        rowDigest: makeMockRowDigest(202),
        scopeLabel: '54 / 5406 · 540601 บ้านหนุน · หมู่ 1 หนุนเหนือ (540601001)',
        minimizedAttributes: [
          { field: 'startYear', value: null },
          { field: 'tenureYears', value: null },
          { field: 'osmYear', value: null },
          { field: 'approvalDate', value: null },
          { field: 'retirementDate', value: '2026-01-02' },
          { field: 'retirementReason', value: 'resigned' },
          { field: 'osmStatus', value: null },
        ],
        reviewReasons: [],
      },
      {
        sourceKey: makeMockH1Key(3, 'c3d4e5f60718293a'),
        rowDigest: makeMockRowDigest(203),
        scopeLabel: '54 / 5406 · 540607 แดนชุมพล · หมู่ 2 แดนชุมพล (540607002)',
        minimizedAttributes: [
          { field: 'startYear', value: '2569' },
          { field: 'tenureYears', value: '0' },
          { field: 'osmYear', value: '2569' },
          { field: 'approvalDate', value: '2026-01-10' },
          { field: 'retirementDate', value: null },
          { field: 'retirementReason', value: null },
          { field: 'osmStatus', value: '' },
        ],
        reviewReasons: [],
      },
    ],
    missingSampleScopeLabel: '54 / 5406 · 540607 แดนชุมพล · หมู่ 4 (540607004)',
  },
};

export function buildMockPreviewBatchEnvelope(
  request: PreviewDatasetBatchRequest,
  scenario: MockScenario,
  outcome: MockPreviewOutcome = 'ready',
): unknown {
  if (!isSupportedLargeBatched(request.endpoint)) {
    return {
      ok: false,
      error: {
        code: 'DATASET_NOT_SUPPORTED',
        message:
          'Batched preview is enabled for assignments, resigned-volunteers, volunteer-tenure, and volunteer-family.',
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
  const profile = LARGE_BATCHED_MOCK_PROFILES[endpoint];
  const dash = buildMockDashboardEnvelope(
    scenario === 'rpc-error' ? 'sandbox-default' : scenario,
  ) as { ok: true; data: DashboardStatusData };
  const env = dash.data.env;

  if (profile.usesHmac && !dash.data.guards.hmacKeyConfigured) {
    return {
      ok: true,
      data: {
        status: 'STOP_BLOCKED',
        endpoint,
        env,
        pagesFetchedInBatch: 0,
        diagnostics: [
          {
            code: 'MISSING_HMAC_KEY',
            message:
              'THAIPHC_HMAC_KEY_B64 is missing or malformed in Google Apps Script Properties.',
          },
        ],
      },
    };
  }

  if (outcome === 'stop-blocked') {
    return {
      ok: true,
      data: {
        status: 'STOP_BLOCKED',
        endpoint,
        env,
        pagesFetchedInBatch: 1,
        diagnostics: [
          {
            code: 'OUT_OF_GEOGRAPHIC_SCOPE',
            message: `Row #1 falls outside Geographic Scope (54 / 5406) for ${endpoint}.`,
            rowIndex: 0,
          },
        ],
      },
    };
  }

  const pageSize =
    request.pageSize !== undefined && request.pageSize >= 1 && request.pageSize <= 100
      ? request.pageSize
      : 100;
  const batchPages =
    request.batchPages !== undefined && request.batchPages >= 1 && request.batchPages <= 20
      ? request.batchPages
      : 10;
  const totalPages = Math.ceil(profile.sourceTotal / pageSize);
  const startPage = Math.max(1, request.startPage);
  const lastPageFetched = Math.min(totalPages, startPage + batchPages - 1);
  const pagesFetchedInBatch = Math.max(0, lastPageFetched - startPage + 1);
  const startOffset = (startPage - 1) * pageSize;
  const endOffset = Math.min(profile.sourceTotal, lastPageFetched * pageSize);
  const rowsInBatch = Math.max(0, endOffset - startOffset);
  const hasMore = lastPageFetched < totalPages;

  // Keep mock payload fast in unit tests while honoring exact batch progress counts & LOCALITY_MISMATCH
  const rowDigests = Array.from({ length: Math.min(rowsInBatch, 5) }, (_, idx) => {
    const ordinal = startOffset + idx + 1;
    const key =
      profile.syncMode === 'COMPLETE_SNAPSHOT'
        ? `snapshot_preview_${String(ordinal).padStart(5, '0')}`
        : makeMockH1Key(ordinal, profile.h1Salt);
    const base = {
      key,
      rowDigest: makeMockRowDigest(ordinal),
    };
    if (startPage === 1 && idx < profile.localityMismatchCount) {
      return { ...base, reviewReasons: ['LOCALITY_MISMATCH' as const] };
    }
    return base;
  });

  return {
    ok: true,
    data: {
      status: 'BATCH_OK',
      endpoint,
      env,
      startPage,
      lastPageFetched,
      pagesFetchedInBatch,
      totalPages,
      sourceTotal: profile.sourceTotal,
      rowsInBatch,
      hasMore,
      nextPage: hasMore ? lastPageFetched + 1 : null,
      rowDigests,
      aggregateSummary: startPage === 1 ? profile.aggregates : [],
      sampleCandidates: startPage === 1 ? profile.sampleCandidates : [],
    },
  };
}

export function buildMockFinalizePreviewEnvelope(
  request: FinalizePreviewRequest,
  scenario: MockScenario,
  outcome: MockPreviewOutcome = 'ready',
): unknown {
  if (!isSupportedLargeBatched(request.endpoint)) {
    return {
      ok: false,
      error: {
        code: 'DATASET_NOT_SUPPORTED',
        message:
          'Finalize preview is enabled for assignments, resigned-volunteers, volunteer-tenure, and volunteer-family.',
      },
    };
  }
  const endpoint = request.endpoint;
  const profile = LARGE_BATCHED_MOCK_PROFILES[endpoint];
  const dash = buildMockDashboardEnvelope(
    scenario === 'rpc-error' ? 'sandbox-default' : scenario,
  ) as { ok: true; data: DashboardStatusData };
  const env = dash.data.env;
  const dsMeta = dash.data.datasets.find((d) => d.endpoint === endpoint);
  const unresolved = dash.data.unresolvedRuns.find((r) => r.endpoint === endpoint) ?? null;
  const guard = evaluateMockWriteGuard(endpoint, dash.data);

  const isCompleteSnapshot = profile.syncMode === 'COMPLETE_SNAPSHOT';
  const isLegacyInit = !isCompleteSnapshot && (dsMeta?.legacySnapshotPresent ?? false);
  const localityCount = outcome === 'all-unchanged' ? 0 : profile.localityMismatchCount;
  const missingCount = isCompleteSnapshot || outcome === 'all-unchanged' || isLegacyInit ? 0 : 2;
  const counts = isCompleteSnapshot
    ? { insert: request.sourceTotal, update: 0, unchanged: 0, review: localityCount }
    : outcome === 'all-unchanged'
      ? { insert: 0, update: 0, unchanged: request.sourceTotal, review: 0 }
      : isLegacyInit
        ? { insert: request.sourceTotal, update: 0, unchanged: 0, review: localityCount }
        : {
            insert: 12,
            update: 5,
            unchanged: request.sourceTotal - 17,
            review: localityCount + missingCount,
          };

  const reviewBreakdown: Partial<Record<ReviewReasonCode, number>> = {};
  if (localityCount > 0) {
    reviewBreakdown.LOCALITY_MISMATCH = localityCount;
  }
  if (missingCount > 0) {
    reviewBreakdown.MISSING_IN_SOURCE = missingCount;
  }

  const sampleRows: ExtendedMinimizedPreviewRow[] = profile.sampleCandidates.map((cand, idx) => ({
    diffKind: isCompleteSnapshot
      ? 'INSERT'
      : outcome === 'all-unchanged'
        ? 'UNCHANGED'
        : isLegacyInit
          ? 'INSERT'
          : idx === 0
            ? 'INSERT'
            : idx === 1
              ? 'UPDATE'
              : 'UNCHANGED',
    sourceKey: cand.sourceKey,
    scopeLabel: cand.scopeLabel,
    minimizedAttributes: cand.minimizedAttributes,
    reviewReasons: outcome === 'all-unchanged' ? [] : [...cand.reviewReasons],
  }));

  if (missingCount > 0) {
    sampleRows.push({
      diffKind: 'REVIEW',
      sourceKey: makeMockH1Key(9999, profile.h1Salt),
      scopeLabel: profile.missingSampleScopeLabel,
      minimizedAttributes: [],
      reviewReasons: ['MISSING_IN_SOURCE'],
    });
  }

  const datasetDigest = `${profile.digestSlug}a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef012345678`;
  const sheetRevisionFingerprint = `${profile.digestSlug}9f8e7d6c5b4a39281706f5e4d3c2b1a0987654321fedcba098765432`;
  const fingerprintDigest = `${profile.digestSlug}f1e2d3c4b5a69788796a5b4c3d2e1f00112233445566778899aabbcc`;

  return {
    ok: true,
    data: {
      status: 'READY',
      endpoint,
      env,
      syncMode: profile.syncMode,
      paginationProtocol: profile.paginationProtocol,
      destinationTab: profile.destinationTab,
      ...(isCompleteSnapshot
        ? { activeSnapshotTab: dsMeta?.publicationPointerActive ? dsMeta.destinationTab : null }
        : {}),
      previewedAtUtc: '2026-11-21T16:05:00.000Z',
      pagesFetched: request.pagesFetched,
      sourceTotal: request.sourceTotal,
      fingerprint: {
        endpoint,
        env,
        sourceTotal: request.sourceTotal,
        datasetDigest,
        sheetRevisionFingerprint,
        counts,
        fingerprintDigest,
      },
      counts,
      reviewBreakdown,
      unresolvedPreviousRun: unresolved,
      legacySnapshotPresent: isLegacyInit,
      legacySnapshotTab: isLegacyInit ? (dsMeta?.legacySnapshotTab ?? null) : null,
      writeAllowed: guard.writeAllowed,
      blockedGuardReason: guard.blockedGuardReason,
      previewMode: 'EXTENDED_MINIMIZED',
      aggregateSummary: profile.aggregates,
      sampleRows,
    },
  };
}

export function buildMockStageLargeBatchEnvelope(
  request: StageLargeDatasetBatchRequest,
  scenario: MockScenario,
  outcome: MockCommitOutcome = 'verified',
): unknown {
  if (!isSupportedLargeBatched(request.endpoint)) {
    return {
      ok: false,
      error: { code: 'DATASET_NOT_SUPPORTED', message: 'Dataset not supported for staging.' },
    };
  }
  if (outcome === 'http-401') {
    return {
      ok: false,
      error: { code: 'HTTP_401', message: 'ThaiPHC authentication failed (HTTP 401).' },
    };
  }
  const endpoint = request.endpoint;
  const profile = LARGE_BATCHED_MOCK_PROFILES[endpoint];
  const isCompleteSnapshot = profile.syncMode === 'COMPLETE_SNAPSHOT';
  const dash = buildMockDashboardEnvelope(
    scenario === 'rpc-error' ? 'sandbox-default' : scenario,
  ) as { ok: true; data: DashboardStatusData };
  const env = dash.data.env;
  const guard = evaluateMockWriteGuard(endpoint, dash.data);

  if (!guard.writeAllowed) {
    return {
      ok: true,
      data: {
        status: 'FAILED_STOP',
        runId: null,
        endpoint,
        env,
        destinationTab: profile.destinationTab,
        stopCode: guard.stopCode ?? 'WRITE_DISABLED',
        message: guard.message ?? 'Write guard blocked commit.',
        syncLogStatus: 'NOT_WRITTEN',
        stagingTabRetained: null,
      },
    };
  }

  if (env === 'PRODUCTION' && request.confirmationPhrase !== `PRODUCTION 5406 ${endpoint}`) {
    return {
      ok: true,
      data: {
        status: 'FAILED_STOP',
        runId: null,
        endpoint,
        env,
        destinationTab: profile.destinationTab,
        stopCode: 'PRODUCTION_CONFIRMATION_REQUIRED',
        message: `Production commit requires exact confirmation phrase "PRODUCTION 5406 ${endpoint}".`,
        syncLogStatus: 'NOT_WRITTEN',
        stagingTabRetained: null,
      },
    };
  }

  const unresolved = dash.data.unresolvedRuns.find((r) => r.endpoint === endpoint);
  if (unresolved && request.acknowledgeUnresolvedRunId !== unresolved.runId) {
    return {
      ok: true,
      data: {
        status: 'FAILED_STOP',
        runId: null,
        endpoint,
        env,
        destinationTab: profile.destinationTab,
        stopCode: 'UNRESOLVED_PREVIOUS_RUN',
        message: `Dataset "${endpoint}" has an unresolved previous run (${unresolved.runId}).`,
        syncLogStatus: 'NOT_WRITTEN',
        stagingTabRetained: null,
      },
    };
  }

  const pageSize =
    request.pageSize !== undefined && request.pageSize >= 1 && request.pageSize <= 100
      ? request.pageSize
      : 100;
  const batchPages =
    request.batchPages !== undefined && request.batchPages >= 1 && request.batchPages <= 20
      ? request.batchPages
      : 10;
  const totalPages = Math.ceil(request.expectedFingerprint.sourceTotal / pageSize);
  const startPage = Math.max(1, request.startPage);
  const lastPageStaged = Math.min(totalPages, startPage + batchPages - 1);
  const stagedRowCount = Math.min(
    request.expectedFingerprint.sourceTotal,
    lastPageStaged * pageSize,
  );
  const hasMore = lastPageStaged < totalPages;
  const runId = request.runId ?? `run_20261121_1606_${profile.runSlug}_s1`;
  const stagingTabName = isCompleteSnapshot ? `RFamily_${runId}` : `_Stage_${endpoint}_${runId}`;
  const destinationTab = isCompleteSnapshot ? stagingTabName : profile.destinationTab;

  return {
    ok: true,
    data: {
      status: 'BATCH_STAGED',
      runId,
      endpoint,
      env,
      destinationTab,
      stagingTabName,
      lastPageStaged,
      totalPages,
      stagedRowCount,
      sourceTotal: request.expectedFingerprint.sourceTotal,
      hasMore,
      nextPage: hasMore ? lastPageStaged + 1 : null,
    },
  };
}

export function buildMockFinalizeLargeCommitEnvelope(
  request: FinalizeLargeDatasetCommitRequest,
  scenario: MockScenario,
  outcome: MockCommitOutcome = 'verified',
): unknown {
  if (!isSupportedLargeBatched(request.endpoint)) {
    return {
      ok: false,
      error: {
        code: 'DATASET_NOT_SUPPORTED',
        message: 'Dataset not supported for finalize commit.',
      },
    };
  }
  const endpoint = request.endpoint;
  const profile = LARGE_BATCHED_MOCK_PROFILES[endpoint];
  const isCompleteSnapshot = profile.syncMode === 'COMPLETE_SNAPSHOT';
  const dash = buildMockDashboardEnvelope(
    scenario === 'rpc-error' ? 'sandbox-default' : scenario,
  ) as { ok: true; data: DashboardStatusData };
  const env = dash.data.env;
  const dsMeta = dash.data.datasets.find((d) => d.endpoint === endpoint);
  const stageTabName = isCompleteSnapshot
    ? `RFamily_${request.runId}`
    : `_Stage_${endpoint}_${request.runId}`;
  const finalDestTab = isCompleteSnapshot ? stageTabName : profile.destinationTab;

  if (outcome === 'preview-stale') {
    return {
      ok: true,
      data: {
        status: 'PREVIEW_STALE_RECONFIRM_REQUIRED',
        endpoint,
        env,
        destinationTab: finalDestTab,
        driftReason: isCompleteSnapshot ? 'DESTINATION_CHANGED' : 'SOURCE_CHANGED',
        expectedFingerprint: request.expectedFingerprint,
        currentSourceTotal: request.expectedFingerprint.sourceTotal,
        currentDatasetDigest: isCompleteSnapshot
          ? request.expectedFingerprint.datasetDigest
          : '9'.repeat(64),
        currentSheetRevisionFingerprint: isCompleteSnapshot
          ? '8'.repeat(64)
          : request.expectedFingerprint.sheetRevisionFingerprint,
      },
    };
  }

  if (outcome === 'digest-mismatch') {
    return {
      ok: true,
      data: {
        status: 'FAILED_STOP',
        runId: request.runId,
        endpoint,
        env,
        destinationTab: finalDestTab,
        stopCode: 'STAGING_DIGEST_MISMATCH',
        message:
          'Persisted snapshot cells or chunk SHA-256 digests did not match staging manifest. Hidden snapshot tab retained unpublished.',
        syncLogStatus: 'NOT_WRITTEN',
        stagingTabRetained: stageTabName,
      },
    };
  }

  if (outcome === 'incomplete-stage') {
    return {
      ok: true,
      data: {
        status: 'FAILED_STOP',
        runId: request.runId,
        endpoint,
        env,
        destinationTab: finalDestTab,
        stopCode: 'INCOMPLETE_SNAPSHOT',
        message:
          'Hidden snapshot tab does not contain all expected pages or rows; refusing to publish an incomplete snapshot.',
        syncLogStatus: 'NOT_WRITTEN',
        stagingTabRetained: stageTabName,
      },
    };
  }

  if (outcome === 'unknown-outcome') {
    return {
      ok: true,
      data: {
        status: 'UNKNOWN_OUTCOME_STOP',
        runId: request.runId,
        endpoint,
        env,
        destinationTab: finalDestTab,
        stopCode: 'WRITE_FAILED_UNKNOWN',
        message: isCompleteSnapshot
          ? 'Complete Snapshot publication or flush failed with an unknown outcome. Do not retry automatically; inspect RFamily_<runId>, _ThaiPHCReportCurrent, and _ThaiPHCSyncLog.'
          : 'Sheet write or flush stopped with an unknown outcome. Hidden staging tab retained for inspection.',
        syncLogStatus: 'STARTED',
        stagingTabRetained: stageTabName,
      },
    };
  }

  if (outcome === 'readback-mismatch') {
    return {
      ok: true,
      data: {
        status: 'FAILED_STOP',
        runId: request.runId,
        endpoint,
        env,
        destinationTab: finalDestTab,
        stopCode: 'READBACK_MISMATCH',
        message: isCompleteSnapshot
          ? 'Complete Snapshot Destination Readback failed verification after publication. Inspect RFamily_<runId> and _ThaiPHCReportCurrent immediately.'
          : 'Destination Readback detected a mismatch after write. Hidden staging tab retained for inspection.',
        syncLogStatus: 'FAILED_STOP',
        stagingTabRetained: stageTabName,
      },
    };
  }

  const fp = request.expectedFingerprint;
  const isLegacyInit = !isCompleteSnapshot && (dsMeta?.legacySnapshotPresent ?? false);
  const missingInSourceCount =
    isCompleteSnapshot || isLegacyInit
      ? 0
      : Math.max(0, fp.counts.review - profile.localityMismatchCount);
  const expectedRowCount = fp.sourceTotal + missingInSourceCount;
  return {
    ok: true,
    data: {
      status: 'COMMITTED_VERIFIED',
      runId: request.runId,
      endpoint,
      env,
      syncMode: profile.syncMode,
      destinationTab: finalDestTab,
      completedAtUtc: '2026-11-21T16:07:00.000Z',
      counts: fp.counts,
      fingerprint: fp,
      readback: {
        verified: true,
        destinationTab: finalDestTab,
        expectedRowCount,
        actualRowCount: expectedRowCount,
        uniqueKeysVerified: true,
        rowDigestsVerified: true,
        unrelatedTabsPreserved: true,
        baselineTabsChecked: ['ชีต1', '_ThaiPHCReportCurrent', profile.legacyBaselineTab],
        stagingTabCleaned: isCompleteSnapshot ? null : true,
        ...(isCompleteSnapshot ? { publicationPointerVerified: true } : {}),
      },
      syncLogStatus: 'COMMITTED_VERIFIED',
    },
  };
}
