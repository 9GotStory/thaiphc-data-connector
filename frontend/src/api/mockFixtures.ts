import type { DashboardStatusData } from './types';

export type MockScenario =
  | 'sandbox-default'
  | 'production-unresolved'
  | 'production-clean'
  | 'same-workbook-unapproved'
  | 'rpc-error';

const SANDBOX_REF_ID = '1SANDBOX_MOCK_REF_WORKBOOK_0000000001';
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

  if (scenario === 'production-clean') {
    const base = buildMockDashboardEnvelope('production-unresolved') as {
      ok: true;
      data: DashboardStatusData;
    };
    const datasets = base.data.datasets.map((ds) =>
      ds.endpoint === 'assignments' ? { ...ds, lastStatus: 'COMMITTED_VERIFIED' as const } : ds,
    );
    return {
      ok: true,
      data: {
        ...base.data,
        guards: {
          writeEnabled: false,
          personDataWriteEnabled: false,
          hmacKeyConfigured: true,
          reportWorkbookApproved: true,
        },
        unresolvedRuns: [],
        datasets,
      },
    };
  }

  const unapproved = scenario === 'same-workbook-unapproved';
  const sandboxData: DashboardStatusData = {
    env: 'SANDBOX',
    scope: { provinceCode: '54', districtCode: '5406' },
    generatedAtUtc: '2026-11-21T11:30:00.000Z',
    workbooks: {
      reference: { spreadsheetId: SANDBOX_REF_ID, name: 'ThaiPHC Data (Sandbox Mock)' },
      report: { spreadsheetId: SANDBOX_REF_ID, name: 'ThaiPHC Data (Sandbox Mock)' },
      sameWorkbookPolicy: unapproved ? 'SAME_WORKBOOK_UNAPPROVED' : 'SAME_WORKBOOK_APPROVED',
    },
    guards: {
      writeEnabled: false,
      personDataWriteEnabled: false,
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
