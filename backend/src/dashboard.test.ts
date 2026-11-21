import { describe, expect, it } from 'vitest';
import { getDashboardStatusWithPlatform, type DashboardPlatform } from './dashboardService.ts';

const VALID_REF_SHEET_ID = '1ABCdefGHIjklMNOpqrSTUvwxYZ0123456789';
const VALID_HMAC_KEY_B64 = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

interface FakeSheetSpec {
  name: string;
  rows: unknown[][];
  forbidDataReads?: boolean;
}

function createFakePlatform({
  properties = {},
  spreadsheets = {},
  nowIso = '2026-11-21T13:30:00.000Z',
}: {
  properties?: Record<string, string | undefined>;
  spreadsheets?: Record<string, { name: string; sheets: FakeSheetSpec[] }>;
  nowIso?: string;
}): { platform: DashboardPlatform; dataReadAttempts: string[] } {
  const dataReadAttempts: string[] = [];

  const platform: DashboardPlatform = {
    getProperty(key: string): string | null {
      const val = properties[key];
      return typeof val === 'string' ? val : null;
    },
    openSpreadsheetById(id: string) {
      const spec = spreadsheets[id];
      if (!spec) {
        throw new Error(`Spreadsheet not found: ${id}`);
      }
      const makeSheet = (sheetSpec: FakeSheetSpec) => ({
        getLastRow: () => sheetSpec.rows.length,
        getLastColumn: () => (sheetSpec.rows.length > 0 ? sheetSpec.rows[0].length : 0),
        getValues: (row: number, col: number, numRows: number, numCols: number) => {
          if (sheetSpec.forbidDataReads && row >= 2) {
            dataReadAttempts.push(`${sheetSpec.name}:R${row}`);
            throw new Error(`FORBIDDEN_PERSONAL_DATA_READ:${sheetSpec.name}`);
          }
          const result: unknown[][] = [];
          for (let r = row - 1; r < row - 1 + numRows; r++) {
            const sourceRow = sheetSpec.rows[r] ?? [];
            const slice: unknown[] = [];
            for (let c = col - 1; c < col - 1 + numCols; c++) {
              slice.push(c < sourceRow.length ? sourceRow[c] : '');
            }
            result.push(slice);
          }
          return result;
        },
      });

      const sheetMap = new Map(spec.sheets.map((s) => [s.name, makeSheet(s)]));
      return {
        getName: () => spec.name,
        getSheetByName: (name: string) => sheetMap.get(name) ?? null,
        getSheetNames: () => spec.sheets.map((s) => s.name),
      };
    },
    now: () => new Date(nowIso),
  };

  return { platform, dataReadAttempts };
}

describe('getDashboardStatus (Backend GAS RPC Seam)', () => {
  it('returns SANDBOX environment, read-only write guards, boolean HMAC presence without leaking key, and 8-dataset metadata with zero personal cell reads', () => {
    const { platform, dataReadAttempts } = createFakePlatform({
      properties: {
        THAIPHC_ENV: 'SANDBOX',
        THAIPHC_SPREADSHEET_ID: VALID_REF_SHEET_ID,
        THAIPHC_SAME_WORKBOOK_APPROVAL: 'OWNER_ONLY_5406_APPROVED',
        THAIPHC_WRITE_ENABLED: 'false',
        THAIPHC_PERSON_DATA_WRITE_ENABLED: 'false',
        THAIPHC_HMAC_KEY_B64: VALID_HMAC_KEY_B64,
      },
      spreadsheets: {
        [VALID_REF_SHEET_ID]: {
          name: 'ThaiPHC Data (Sandbox)',
          sheets: [
            { name: 'ชีต1', rows: [['note']] },
            {
              name: 'Subdistricts',
              rows: [
                ['code', '_source_key'],
                ...Array.from({ length: 8 }, (_, i) => [`54060${i + 1}`, `54060${i + 1}`]),
              ],
              forbidDataReads: true,
            },
            {
              name: 'Villages',
              rows: [
                ['code', '_source_key'],
                ...Array.from({ length: 85 }, (_, i) => [
                  `540601${String(i + 1).padStart(3, '0')}`,
                  `v${i}`,
                ]),
              ],
              forbidDataReads: true,
            },
            {
              name: 'HealthServices',
              rows: [['health_service_code'], ...Array.from({ length: 18 }, (_, i) => [`HS${i}`])],
              forbidDataReads: true,
            },
            {
              name: 'Assignments',
              rows: [
                ['_source_key', 'provinceCode', 'SECRET_CITIZEN_ID'],
                ['h1_abc', '54', '1100100999999'],
                ['h1_def', '54', '1100100888888'],
              ],
              forbidDataReads: true,
            },
          ],
        },
      },
    });

    const res = getDashboardStatusWithPlatform(platform);

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok response');

    expect(res.data.env).toBe('SANDBOX');
    expect(res.data.scope).toEqual({ provinceCode: '54', districtCode: '5406' });
    expect(res.data.generatedAtUtc).toBe('2026-11-21T13:30:00.000Z');
    expect(res.data.workbooks.reference).toEqual({
      spreadsheetId: VALID_REF_SHEET_ID,
      name: 'ThaiPHC Data (Sandbox)',
    });
    expect(res.data.workbooks.report).toEqual({
      spreadsheetId: VALID_REF_SHEET_ID,
      name: 'ThaiPHC Data (Sandbox)',
    });
    expect(res.data.workbooks.sameWorkbookPolicy).toBe('SAME_WORKBOOK_APPROVED');
    expect(res.data.guards).toEqual({
      writeEnabled: false,
      personDataWriteEnabled: false,
      hmacKeyConfigured: true,
      reportWorkbookApproved: true,
    });
    expect(res.data.unresolvedRuns).toEqual([]);
    expect(res.data.datasets).toHaveLength(8);
    expect(res.data.datasets.map((d) => d.endpoint)).toEqual([
      'subdistricts',
      'villages',
      'health-services',
      'volunteer-gender',
      'assignments',
      'volunteer-family',
      'resigned-volunteers',
      'volunteer-tenure',
    ]);

    const subdistricts = res.data.datasets.find((d) => d.endpoint === 'subdistricts');
    expect(subdistricts).toMatchObject({
      group: 'reference',
      syncMode: 'KEYED_UPSERT',
      destinationTab: 'Subdistricts',
      rowCount: 8,
      lastRunId: null,
      lastSyncedAtUtc: null,
      lastStatus: 'NEVER_SYNCED',
      legacySnapshotPresent: false,
    });

    const assignments = res.data.datasets.find((d) => d.endpoint === 'assignments');
    expect(assignments).toMatchObject({
      group: 'extended_report',
      syncMode: 'KEYED_UPSERT',
      destinationTab: 'Assignments',
      rowCount: 2,
      lastStatus: 'NEVER_SYNCED',
    });

    const family = res.data.datasets.find((d) => d.endpoint === 'volunteer-family');
    expect(family).toMatchObject({
      group: 'extended_report',
      syncMode: 'COMPLETE_SNAPSHOT',
      destinationTab: 'RFamily_<runId>',
      rowCount: null,
      publicationPointerActive: false,
      lastStatus: 'NEVER_SYNCED',
    });

    expect(dataReadAttempts).toEqual([]);
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain(VALID_HMAC_KEY_B64);
    expect(serialized).not.toContain('1100100999999');
    expect(serialized).not.toContain('SECRET_CITIZEN_ID');
  });

  it('reads _ThaiPHCSyncLog and _ThaiPHCReportCurrent by header name, surfaces UNRESOLVED_PREVIOUS_RUN, active volunteer-family snapshot, and LEGACY_F010_SNAPSHOT_PRESENT', () => {
    const VALID_REPORT_SHEET_ID = '1REPdefGHIjklMNOpqrSTUvwxYZ0123456789';
    const { platform, dataReadAttempts } = createFakePlatform({
      properties: {
        THAIPHC_ENV: 'PRODUCTION',
        THAIPHC_SPREADSHEET_ID: VALID_REF_SHEET_ID,
        THAIPHC_REPORT_SPREADSHEET_ID: VALID_REPORT_SHEET_ID,
        THAIPHC_WRITE_ENABLED: 'true',
        THAIPHC_PERSON_DATA_WRITE_ENABLED: 'true',
        THAIPHC_HMAC_KEY_B64: VALID_HMAC_KEY_B64,
      },
      spreadsheets: {
        [VALID_REF_SHEET_ID]: {
          name: 'ThaiPHC Reference Prod',
          sheets: [
            {
              name: 'Subdistricts',
              rows: [['code'], ...Array.from({ length: 8 }, (_, i) => [`54060${i + 1}`])],
              forbidDataReads: true,
            },
            {
              name: '_ThaiPHCSyncLog',
              // Deliberately shuffled column order to verify header-name mapping ([GAS-4])
              rows: [
                [
                  'endpoint',
                  'status',
                  'run_id',
                  'timestamp_utc',
                  'env',
                  'sync_mode',
                  'preview_digest',
                  'inserted',
                  'updated',
                  'unchanged',
                  'review',
                  'readback_verified',
                ],
                [
                  'subdistricts',
                  'STARTED',
                  'run_20261120_0800',
                  '2026-11-20T01:00:00.000Z',
                  'PRODUCTION',
                  'KEYED_UPSERT',
                  'abc',
                  0,
                  0,
                  0,
                  0,
                  false,
                ],
                [
                  'subdistricts',
                  'COMMITTED_VERIFIED',
                  'run_20261121_0900',
                  '2026-11-21T02:00:00.000Z',
                  'PRODUCTION',
                  'KEYED_UPSERT',
                  'def',
                  0,
                  1,
                  7,
                  0,
                  true,
                ],
                [
                  'villages',
                  'FAILED_STOP',
                  'run_20261121_0910',
                  '2026-11-21T02:10:00.000Z',
                  'PRODUCTION',
                  'KEYED_UPSERT',
                  'ghi',
                  0,
                  0,
                  0,
                  0,
                  false,
                ],
              ],
            },
          ],
        },
        [VALID_REPORT_SHEET_ID]: {
          name: 'ThaiPHC Reports Prod',
          sheets: [
            {
              name: '_ThaiPHCReportCurrent',
              rows: [
                ['endpoint', 'run_id', 'snapshot_sheet', 'row_count', 'manifest_digest'],
                [
                  'volunteer-family',
                  'run_20261121_1030',
                  'RFamily_20261121_1030',
                  3,
                  'a'.repeat(64),
                ],
                [
                  'volunteer-gender',
                  'f010_20261119_legacy',
                  'RGender_f010_20261119',
                  85,
                  'b'.repeat(64),
                ],
                [
                  'assignments',
                  'f010_20261119_legacy',
                  'RAssign_f010_20261119',
                  1571,
                  'c'.repeat(64),
                ],
              ],
            },
            {
              name: 'RFamily_20261121_1030',
              // F010 / Complete Snapshot tabs have row 1 meta JSON, row 2 headers, rows 3+ data
              rows: [
                ['{"status":"PUBLISHED"}'],
                ['_source_key', 'provinceCode', 'SECRET_COL'],
                ['snap_1', '54', 'PRIVATE_FAMILY_1'],
                ['snap_2', '54', 'PRIVATE_FAMILY_2'],
                ['snap_3', '54', 'PRIVATE_FAMILY_3'],
              ],
              forbidDataReads: true,
            },
            {
              // Fixed upsert tab already initialized for assignments -> no legacy notice
              name: 'Assignments',
              rows: [
                ['_source_key', 'provinceCode'],
                ['h1_1', '54'],
              ],
              forbidDataReads: true,
            },
            {
              name: '_ThaiPHCSyncLog',
              rows: [
                [
                  'run_id',
                  'timestamp_utc',
                  'env',
                  'endpoint',
                  'sync_mode',
                  'status',
                  'preview_digest',
                  'inserted',
                  'updated',
                  'unchanged',
                  'review',
                  'readback_verified',
                ],
                [
                  'run_20261121_0915',
                  '2026-11-21T02:15:00.000Z',
                  'PRODUCTION',
                  'assignments',
                  'KEYED_UPSERT',
                  'STARTED',
                  'xyz',
                  0,
                  0,
                  0,
                  0,
                  false,
                ],
                [
                  'run_20261121_1030',
                  '2026-11-21T03:30:00.000Z',
                  'PRODUCTION',
                  'volunteer-family',
                  'COMPLETE_SNAPSHOT',
                  'COMMITTED_VERIFIED',
                  'qrs',
                  3,
                  0,
                  0,
                  0,
                  true,
                ],
              ],
            },
          ],
        },
      },
    });

    const res = getDashboardStatusWithPlatform(platform);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');

    expect(res.data.env).toBe('PRODUCTION');
    expect(res.data.workbooks.sameWorkbookPolicy).toBe('SEPARATE_WORKBOOK');
    expect(res.data.workbooks.report).toEqual({
      spreadsheetId: VALID_REPORT_SHEET_ID,
      name: 'ThaiPHC Reports Prod',
    });
    expect(res.data.guards).toEqual({
      writeEnabled: true,
      personDataWriteEnabled: true,
      hmacKeyConfigured: true,
      reportWorkbookApproved: true,
    });

    expect(res.data.unresolvedRuns).toEqual([
      {
        endpoint: 'assignments',
        runId: 'run_20261121_0915',
        startedAtUtc: '2026-11-21T02:15:00.000Z',
        status: 'STARTED',
      },
    ]);

    const byEndpoint = new Map(res.data.datasets.map((d) => [d.endpoint, d]));
    expect(byEndpoint.get('subdistricts')).toMatchObject({
      rowCount: 8,
      lastRunId: 'run_20261121_0900',
      lastSyncedAtUtc: '2026-11-21T02:00:00.000Z',
      lastStatus: 'COMMITTED_VERIFIED',
    });
    expect(byEndpoint.get('villages')).toMatchObject({
      rowCount: null,
      lastRunId: 'run_20261121_0910',
      lastStatus: 'FAILED_STOP',
    });
    expect(byEndpoint.get('volunteer-gender')).toMatchObject({
      destinationTab: 'VolunteerGender',
      rowCount: null,
      legacySnapshotPresent: true,
      legacySnapshotTab: 'RGender_f010_20261119',
      lastStatus: 'NEVER_SYNCED',
    });
    expect(byEndpoint.get('assignments')).toMatchObject({
      destinationTab: 'Assignments',
      rowCount: 1,
      legacySnapshotPresent: false,
      lastRunId: 'run_20261121_0915',
      lastStatus: 'UNRESOLVED_PREVIOUS_RUN',
    });
    expect(byEndpoint.get('volunteer-family')).toMatchObject({
      syncMode: 'COMPLETE_SNAPSHOT',
      destinationTab: 'RFamily_20261121_1030',
      rowCount: 3,
      publicationPointerActive: true,
      lastRunId: 'run_20261121_1030',
      lastSyncedAtUtc: '2026-11-21T03:30:00.000Z',
      lastStatus: 'COMMITTED_VERIFIED',
    });

    expect(dataReadAttempts).toEqual([]);
    expect(JSON.stringify(res)).not.toContain('PRIVATE_FAMILY_1');
  });

  it('fails closed on missing or invalid Script Properties without leaking secrets or stack details', () => {
    const missingEnv = createFakePlatform({
      properties: {
        THAIPHC_SPREADSHEET_ID: VALID_REF_SHEET_ID,
        THAIPHC_HMAC_KEY_B64: VALID_HMAC_KEY_B64,
      },
    });
    const resEnv = getDashboardStatusWithPlatform(missingEnv.platform);
    expect(resEnv.ok).toBe(false);
    if (!resEnv.ok) {
      expect(resEnv.error.code).toBe('INVALID_ENV_CONFIG');
    }
    expect(JSON.stringify(resEnv)).not.toContain(VALID_HMAC_KEY_B64);

    const unapprovedSame = createFakePlatform({
      properties: {
        THAIPHC_ENV: 'SANDBOX',
        THAIPHC_SPREADSHEET_ID: VALID_REF_SHEET_ID,
        THAIPHC_SAME_WORKBOOK_APPROVAL: 'WRONG_TOKEN',
        THAIPHC_HMAC_KEY_B64: 'not-valid-b64',
      },
      spreadsheets: {
        [VALID_REF_SHEET_ID]: { name: 'Sandbox', sheets: [] },
      },
    });
    const resUnapproved = getDashboardStatusWithPlatform(unapprovedSame.platform);
    expect(resUnapproved.ok).toBe(true);
    if (resUnapproved.ok) {
      expect(resUnapproved.data.workbooks.sameWorkbookPolicy).toBe('SAME_WORKBOOK_UNAPPROVED');
      expect(resUnapproved.data.guards.reportWorkbookApproved).toBe(false);
      expect(resUnapproved.data.guards.hmacKeyConfigured).toBe(false);
    }

    const accessError = createFakePlatform({
      properties: {
        THAIPHC_ENV: 'SANDBOX',
        THAIPHC_SPREADSHEET_ID: VALID_REF_SHEET_ID,
      },
      spreadsheets: {},
    });
    const resAccess = getDashboardStatusWithPlatform(accessError.platform);
    expect(resAccess.ok).toBe(false);
    if (!resAccess.ok) {
      expect(resAccess.error.code).toBe('WORKBOOK_ACCESS_FAILED');
      expect(resAccess.error.message).not.toContain(VALID_REF_SHEET_ID);
    }

    const badRefId = createFakePlatform({
      properties: {
        THAIPHC_ENV: 'SANDBOX',
        THAIPHC_SPREADSHEET_ID: 'too-short',
      },
    });
    const resBadRef = getDashboardStatusWithPlatform(badRefId.platform);
    expect(resBadRef.ok).toBe(false);
    if (!resBadRef.ok) {
      expect(resBadRef.error.code).toBe('SPREADSHEET_NOT_CONFIGURED');
    }
  });

  it('normalizes Date cells from Sheets, fails closed on unexpected sync log status, detects prefix-only legacy snapshots, and handles malformed report spreadsheet ID safely', () => {
    const { platform } = createFakePlatform({
      properties: {
        THAIPHC_ENV: 'SANDBOX',
        THAIPHC_SPREADSHEET_ID: VALID_REF_SHEET_ID,
        THAIPHC_SAME_WORKBOOK_APPROVAL: 'OWNER_ONLY_5406_APPROVED',
      },
      spreadsheets: {
        [VALID_REF_SHEET_ID]: {
          name: 'Sandbox Dates & Legacy',
          sheets: [
            { name: 'RResign_20261119_old', rows: [['meta'], ['header']], forbidDataReads: true },
            {
              name: '_ThaiPHCSyncLog',
              rows: [
                ['run_id', 'timestamp_utc', 'endpoint', 'status'],
                [
                  'run_20261121_1200',
                  new Date('2026-11-21T05:00:00.000Z'),
                  'subdistricts',
                  'PARTIAL_UNKNOWN',
                ],
              ],
            },
          ],
        },
      },
    });

    const res = getDashboardStatusWithPlatform(platform);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');

    const sub = res.data.datasets.find((d) => d.endpoint === 'subdistricts');
    expect(sub).toMatchObject({
      lastStatus: 'UNRESOLVED_PREVIOUS_RUN',
      lastSyncedAtUtc: '2026-11-21T05:00:00.000Z',
    });
    expect(res.data.unresolvedRuns).toEqual([
      {
        endpoint: 'subdistricts',
        runId: 'run_20261121_1200',
        startedAtUtc: '2026-11-21T05:00:00.000Z',
        status: 'STARTED',
      },
    ]);

    const resigned = res.data.datasets.find((d) => d.endpoint === 'resigned-volunteers');
    expect(resigned).toMatchObject({
      legacySnapshotPresent: true,
      legacySnapshotTab: 'RResign_20261119_old',
    });

    const badReport = createFakePlatform({
      properties: {
        THAIPHC_ENV: 'SANDBOX',
        THAIPHC_SPREADSHEET_ID: VALID_REF_SHEET_ID,
        THAIPHC_REPORT_SPREADSHEET_ID: 'bad-id',
      },
      spreadsheets: {
        [VALID_REF_SHEET_ID]: { name: 'Sandbox Ref Only', sheets: [] },
      },
    });
    const resBadReport = getDashboardStatusWithPlatform(badReport.platform);
    expect(resBadReport.ok).toBe(true);
    if (resBadReport.ok) {
      expect(resBadReport.data.workbooks.sameWorkbookPolicy).toBe('INVALID_REPORT_WORKBOOK');
      expect(resBadReport.data.workbooks.report).toBeNull();
      expect(resBadReport.data.guards.reportWorkbookApproved).toBe(false);
    }
  });
});
