import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  commitSmallDatasetWithPlatform,
  previewDatasetWithPlatform,
} from './referenceSyncService.ts';
import type {
  HttpFetchOptions,
  HttpFetchResponse,
  SyncPlatform,
  WritableSheetHandle,
  WritableSpreadsheetHandle,
} from './types.ts';

const VALID_REF_SHEET_ID = '1REFdefGHIjklMNOpqrSTUvwxYZ0123456789';
const VALID_REPORT_SHEET_ID = '1REPdefGHIjklMNOpqrSTUvwxYZ0123456789';
const VALID_BEARER = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.synthetic_gender_token_12345';

interface MockSheetState {
  name: string;
  rows: unknown[][];
  maxRows: number;
  maxColumns: number;
  frozenRows: number;
  numberFormats: Map<string, string>;
  writeOps: string[];
}

interface MockWorkbookState {
  name: string;
  sheets: Map<string, MockSheetState>;
  sheetOrder: string[];
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function makeGenderRow(
  overrides: Partial<{
    provinceCode: string;
    provinceName: string;
    districtCode: string;
    districtName: string;
    subdistrictCode: string;
    subdistrictName: string;
    villageCode: string;
    villageNo: string;
    villageName: string;
    total: number;
    male: number;
    female: number;
  }> = {},
): Record<string, unknown> {
  const subdistrictCode = overrides.subdistrictCode ?? '540601';
  const villageNo = overrides.villageNo ?? '1';
  const villageCode =
    overrides.villageCode ?? `${subdistrictCode}${String(Number(villageNo)).padStart(3, '0')}`;
  const male = overrides.male ?? 6;
  const female = overrides.female ?? 10;
  const total = overrides.total ?? male + female;
  return {
    provinceCode: overrides.provinceCode ?? '54',
    provinceName: overrides.provinceName ?? 'แพร่',
    districtCode: overrides.districtCode ?? '5406',
    districtName: overrides.districtName ?? 'สอง',
    subdistrictCode,
    subdistrictName: overrides.subdistrictName ?? 'บ้านหนุน',
    villageCode,
    villageNo,
    villageName: overrides.villageName ?? 'หนุนเหนือ',
    total,
    male,
    female,
  };
}

function jsonResponse(body: unknown, status = 200): HttpFetchResponse {
  const text = JSON.stringify(body);
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    contentText: text,
    byteLength: Buffer.byteLength(text, 'utf8'),
  };
}

function createFakeMultiWorkbookEnv(opts: {
  properties?: Record<string, string | undefined>;
  workbooks?: Record<
    string,
    { name: string; initialSheets?: Array<{ name: string; rows: unknown[][] }> }
  >;
  fetchHandler: (url: string, options: HttpFetchOptions) => HttpFetchResponse;
  lockAvailable?: boolean;
  nowIso?: string;
}) {
  const workbookStates = new Map<string, MockWorkbookState>();
  const fetchCalls: Array<{ url: string; options: HttpFetchOptions }> = [];
  const lockEvents: string[] = [];
  let flushCount = 0;
  let runSeq = 0;

  const defaultWorkbooks = opts.workbooks ?? {
    [VALID_REF_SHEET_ID]: {
      name: 'ThaiPHC Reference (Sandbox)',
      initialSheets: [{ name: 'ชีต1', rows: [['keep-ref']] }],
    },
    [VALID_REPORT_SHEET_ID]: {
      name: 'ThaiPHC Reports (Sandbox)',
      initialSheets: [{ name: 'ชีต1', rows: [['keep-report']] }],
    },
  };

  for (const [id, spec] of Object.entries(defaultWorkbooks)) {
    const sheets = new Map<string, MockSheetState>();
    const sheetOrder: string[] = [];
    for (const s of spec.initialSheets ?? [{ name: 'ชีต1', rows: [['keep']] }]) {
      const cloned = s.rows.map((r) => [...r]);
      sheets.set(s.name, {
        name: s.name,
        rows: cloned,
        maxRows: Math.max(100, cloned.length + 10),
        maxColumns: Math.max(26, ...cloned.map((r) => r.length)),
        frozenRows: 0,
        numberFormats: new Map(),
        writeOps: [],
      });
      sheetOrder.push(s.name);
    }
    workbookStates.set(id, { name: spec.name, sheets, sheetOrder });
  }

  function wrapSheet(state: MockSheetState): WritableSheetHandle {
    return {
      getName: () => state.name,
      getLastRow: () => state.rows.length,
      getLastColumn: () => state.rows.reduce((max, r) => Math.max(max, r.length), 0),
      getMaxRows: () => state.maxRows,
      getMaxColumns: () => state.maxColumns,
      insertColumnsAfter: (afterPos: number, howMany: number) => {
        if (afterPos !== state.maxColumns || howMany < 1) throw new Error('INVALID_INSERT_COLS');
        state.maxColumns += howMany;
        state.writeOps.push(`insertCols:${howMany}`);
      },
      insertRowsAfter: (afterPos: number, howMany: number) => {
        if (afterPos !== state.maxRows || howMany < 1) throw new Error('INVALID_INSERT_ROWS');
        state.maxRows += howMany;
        state.writeOps.push(`insertRows:${howMany}`);
      },
      setFrozenRows: (rows: number) => {
        state.frozenRows = rows;
        state.writeOps.push(`freeze:${rows}`);
      },
      getValues: (row: number, col: number, numRows: number, numCols: number) => {
        const out: unknown[][] = [];
        for (let r = row - 1; r < row - 1 + numRows; r++) {
          const src = state.rows[r] ?? [];
          const line: unknown[] = [];
          for (let c = col - 1; c < col - 1 + numCols; c++) {
            line.push(c < src.length ? src[c] : '');
          }
          out.push(line);
        }
        return out;
      },
      setValues: (row: number, col: number, values: unknown[][]) => {
        const numRows = values.length;
        const numCols = values[0]?.length ?? 0;
        if (row - 1 + numRows > state.maxRows || col - 1 + numCols > state.maxColumns) {
          throw new Error(`RANGE_OUT_OF_BOUNDS:${state.name}`);
        }
        for (let r = 0; r < numRows; r++) {
          const targetIdx = row - 1 + r;
          while (state.rows.length <= targetIdx) state.rows.push([]);
          for (let c = 0; c < numCols; c++) {
            state.rows[targetIdx][col - 1 + c] = values[r][c];
          }
        }
        state.writeOps.push(`setValues:R${row}C${col}:${numRows}x${numCols}`);
      },
      setNumberFormat: (
        row: number,
        col: number,
        numRows: number,
        numCols: number,
        format: string,
      ) => {
        for (let c = col; c < col + numCols; c++) {
          state.numberFormats.set(`C${c}`, format);
        }
        state.writeOps.push(`setFormat:R${row}C${col}:${numRows}x${numCols}:${format}`);
      },
    };
  }

  function wrapWorkbook(wb: MockWorkbookState): WritableSpreadsheetHandle {
    return {
      getName: () => wb.name,
      getSheetByName: (name: string) => {
        const s = wb.sheets.get(name);
        return s ? wrapSheet(s) : null;
      },
      getSheetNames: () => [...wb.sheetOrder],
      insertSheet: (name: string) => {
        if (wb.sheets.has(name)) throw new Error(`SHEET_EXISTS:${name}`);
        const created: MockSheetState = {
          name,
          rows: [],
          maxRows: 100,
          maxColumns: 26,
          frozenRows: 0,
          numberFormats: new Map(),
          writeOps: ['insertSheet'],
        };
        wb.sheets.set(name, created);
        wb.sheetOrder.push(name);
        return wrapSheet(created);
      },
    };
  }

  const properties: Record<string, string | undefined> = {
    THAIPHC_ENV: 'SANDBOX',
    THAIPHC_SPREADSHEET_ID: VALID_REF_SHEET_ID,
    THAIPHC_REPORT_SPREADSHEET_ID: VALID_REPORT_SHEET_ID,
    THAIPHC_WRITE_ENABLED: 'true',
    THAIPHC_PERSON_DATA_WRITE_ENABLED: 'true',
    ...opts.properties,
  };

  const platform: SyncPlatform = {
    getProperty: (key: string) => {
      const val = properties[key];
      return typeof val === 'string' ? val : null;
    },
    openSpreadsheetById: (id: string) => {
      const wb = workbookStates.get(id);
      if (!wb) throw new Error(`UNKNOWN_SHEET:${id}`);
      return wrapWorkbook(wb);
    },
    now: () => new Date(opts.nowIso ?? '2026-11-21T15:00:00.000Z'),
    fetchUrl: (url: string, options: HttpFetchOptions) => {
      fetchCalls.push({ url, options });
      return opts.fetchHandler(url, options);
    },
    sha256Hex,
    tryScriptLock: (timeoutMs: number) => {
      lockEvents.push(`tryLock:${timeoutMs}`);
      if (opts.lockAvailable === false) return null;
      return {
        releaseLock: () => {
          lockEvents.push('releaseLock');
        },
      };
    },
    flushSpreadsheet: () => {
      flushCount += 1;
    },
    generateRunId: (endpoint) => {
      runSeq += 1;
      return `run_20261121_${endpoint.replace(/-/g, '')}_${String(runSeq).padStart(2, '0')}`;
    },
  };

  return {
    platform,
    workbookStates,
    fetchCalls,
    lockEvents,
    getFlushCount: () => flushCount,
  };
}

describe('Volunteer Gender Extended Report Sync (Backend GAS RPC Seam)', () => {
  it('fetches volunteer-gender across report pagination pages, applies Complementary Small-Cell Suppression (threshold=5) with zero raw small-cell leakage, and surfaces non-blocking LEGACY_F010_SNAPSHOT_PRESENT', () => {
    // 7 villages spanning all suppression boundaries:
    // 1. male=3, female=16, total=19 -> male=null, female=null, total=19 (SUPPRESSED)
    // 2. male=2, female=2, total=4 -> male=null, female=null, total=null (SUPPRESSED)
    // 3. male=0, female=3, total=3 -> male=null, female=null, total=null (SUPPRESSED)
    // 4. male=4, female=5, total=9 -> male=null, female=null, total=9 (SUPPRESSED, boundary 4)
    // 5. male=5, female=5, total=10 -> male=5, female=5, total=10 (UNSUPPRESSED, boundary 5)
    // 6. male=0, female=16, total=16 -> male=0, female=16, total=16 (UNSUPPRESSED, zero allowed)
    // 7. male=0, female=0, total=0 -> male=0, female=0, total=0 (UNSUPPRESSED, all zero)
    const rows = [
      makeGenderRow({
        subdistrictCode: '540601',
        villageNo: '1',
        villageName: 'หนุนเหนือ',
        male: 3,
        female: 16,
        total: 19,
      }),
      makeGenderRow({
        subdistrictCode: '540601',
        villageNo: '2',
        villageName: 'หนุนใต้',
        male: 2,
        female: 2,
        total: 4,
      }),
      makeGenderRow({
        subdistrictCode: '540601',
        villageNo: '3',
        villageName: 'ป่าแดง',
        male: 0,
        female: 3,
        total: 3,
      }),
      makeGenderRow({
        subdistrictCode: '540602',
        subdistrictName: 'บ้านกลาง',
        villageNo: '1',
        villageName: 'กลางเหนือ',
        male: 4,
        female: 5,
        total: 9,
      }),
      makeGenderRow({
        subdistrictCode: '540602',
        subdistrictName: 'บ้านกลาง',
        villageNo: '2',
        villageName: 'กลางใต้',
        male: 5,
        female: 5,
        total: 10,
      }),
      makeGenderRow({
        subdistrictCode: '540602',
        subdistrictName: 'บ้านกลาง',
        villageNo: '3',
        villageName: 'ทุ่งแล้ง',
        male: 0,
        female: 16,
        total: 16,
      }),
      makeGenderRow({
        subdistrictCode: '540602',
        subdistrictName: 'บ้านกลาง',
        villageNo: '4',
        villageName: 'ห้วยหม้อ',
        male: 0,
        female: 0,
        total: 0,
      }),
    ];

    const env = createFakeMultiWorkbookEnv({
      workbooks: {
        [VALID_REF_SHEET_ID]: {
          name: 'ThaiPHC Reference',
          initialSheets: [{ name: 'ชีต1', rows: [['keep-ref']] }],
        },
        [VALID_REPORT_SHEET_ID]: {
          name: 'ThaiPHC Reports',
          initialSheets: [
            { name: 'ชีต1', rows: [['keep-report']] },
            {
              name: '_ThaiPHCReportCurrent',
              rows: [
                ['endpoint', 'run_id', 'snapshot_sheet', 'row_count', 'manifest_digest'],
                ['volunteer-gender', 'f010_20261119', 'RGender_f010_20261119', 85, 'a'.repeat(64)],
              ],
            },
            {
              name: 'RGender_f010_20261119',
              rows: [['{"status":"PUBLISHED"}'], ['_source_key', 'villageCode']],
            },
          ],
        },
      },
      fetchHandler: (url) => {
        const parsed = new URL(url);
        const page = Number(parsed.searchParams.get('page'));
        const pageSize = Number(parsed.searchParams.get('pageSize'));
        const start = (page - 1) * pageSize;
        return jsonResponse({
          success: true,
          message: 'Success',
          items: rows.slice(start, start + pageSize),
          total: rows.length,
          page,
          pageSize,
        });
      },
    });

    const preview = previewDatasetWithPlatform(
      { endpoint: 'volunteer-gender', token: VALID_BEARER, pageSize: 3 },
      env.platform,
    );

    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.data.status !== 'READY') {
      throw new Error(`Expected READY preview, got: ${JSON.stringify(preview)}`);
    }

    // 3 pages fetched (3 + 3 + 1 = 7) with exact report query contract
    expect(preview.data.pagesFetched).toBe(3);
    expect(env.fetchCalls.map((c) => c.url)).toEqual([
      'https://api-thaiphc.hss.moph.go.th/api/v1/reports/volunteer-gender?page=1&pageSize=3&province=54&district=5406',
      'https://api-thaiphc.hss.moph.go.th/api/v1/reports/volunteer-gender?page=2&pageSize=3&province=54&district=5406',
      'https://api-thaiphc.hss.moph.go.th/api/v1/reports/volunteer-gender?page=3&pageSize=3&province=54&district=5406',
    ]);
    expect(env.fetchCalls[0].options).toMatchObject({
      method: 'get',
      followRedirects: false,
      muteHttpExceptions: true,
    });

    // Zero writes during Preview
    expect(env.workbookStates.get(VALID_REPORT_SHEET_ID)!.sheets.has('VolunteerGender')).toBe(
      false,
    );
    expect(env.getFlushCount()).toBe(0);

    // Non-blocking LEGACY_F010_SNAPSHOT_PRESENT notice
    expect(preview.data.legacySnapshotPresent).toBe(true);
    expect(preview.data.legacySnapshotTab).toBe('RGender_f010_20261119');

    // Mode B Extended Report Preview & SMALL_CELL_SUPPRESSED counts (4 of 7 suppressed)
    expect(preview.data.previewMode).toBe('EXTENDED_MINIMIZED');
    expect(preview.data.counts).toEqual({ insert: 7, update: 0, unchanged: 0, review: 4 });
    expect(preview.data.reviewBreakdown).toEqual({ SMALL_CELL_SUPPRESSED: 4 });

    if (preview.data.previewMode !== 'EXTENDED_MINIMIZED') {
      throw new Error('Expected EXTENDED_MINIMIZED previewMode');
    }

    // Subdistrict aggregate summary (disclosure-safe: counts of villages & review rows only)
    expect(preview.data.aggregateSummary).toEqual([
      { groupCode: '540601', groupLabel: 'บ้านหนุน', rowCount: 3, reviewCount: 3 },
      { groupCode: '540602', groupLabel: 'บ้านกลาง', rowCount: 4, reviewCount: 1 },
    ]);

    const byKey = new Map(preview.data.sampleRows.map((r) => [r.sourceKey, r]));

    // Case 1: male=3, female=16, total=19 -> total=19, male=null, female=null
    expect(byKey.get('540601001')?.reviewReasons).toEqual(['SMALL_CELL_SUPPRESSED']);
    expect(byKey.get('540601001')?.minimizedAttributes).toEqual([
      { field: 'total', value: '19' },
      { field: 'male', value: null },
      { field: 'female', value: null },
    ]);

    // Case 2: male=2, female=2, total=4 -> all null
    expect(byKey.get('540601002')?.reviewReasons).toEqual(['SMALL_CELL_SUPPRESSED']);
    expect(byKey.get('540601002')?.minimizedAttributes).toEqual([
      { field: 'total', value: null },
      { field: 'male', value: null },
      { field: 'female', value: null },
    ]);

    // Case 3: male=0, female=3, total=3 -> all null
    expect(byKey.get('540601003')?.reviewReasons).toEqual(['SMALL_CELL_SUPPRESSED']);
    expect(byKey.get('540601003')?.minimizedAttributes).toEqual([
      { field: 'total', value: null },
      { field: 'male', value: null },
      { field: 'female', value: null },
    ]);

    // Case 4: male=4, female=5, total=9 -> total=9, male=null, female=null
    expect(byKey.get('540602001')?.reviewReasons).toEqual(['SMALL_CELL_SUPPRESSED']);
    expect(byKey.get('540602001')?.minimizedAttributes).toEqual([
      { field: 'total', value: '9' },
      { field: 'male', value: null },
      { field: 'female', value: null },
    ]);

    // Case 5: boundary 5/5/10 -> unsuppressed
    expect(byKey.get('540602002')?.reviewReasons).toEqual([]);
    expect(byKey.get('540602002')?.minimizedAttributes).toEqual([
      { field: 'total', value: '10' },
      { field: 'male', value: '5' },
      { field: 'female', value: '5' },
    ]);

    // Case 6: 0/16/16 -> unsuppressed
    expect(byKey.get('540602003')?.reviewReasons).toEqual([]);
    expect(byKey.get('540602003')?.minimizedAttributes).toEqual([
      { field: 'total', value: '16' },
      { field: 'male', value: '0' },
      { field: 'female', value: '16' },
    ]);

    // Case 7: 0/0/0 -> unsuppressed
    expect(byKey.get('540602004')?.reviewReasons).toEqual([]);
    expect(byKey.get('540602004')?.minimizedAttributes).toEqual([
      { field: 'total', value: '0' },
      { field: 'male', value: '0' },
      { field: 'female', value: '0' },
    ]);

    // Dedicated single-row check: raw small-cell counts (3 and 16, or 2 and 4) never appear in serialized preview row
    expect(JSON.stringify(byKey.get('540601001'))).not.toMatch(/"3"|"16"/);
    expect(JSON.stringify(byKey.get('540601002'))).not.toMatch(/"2"|"4"/);

    // An unpublished hidden RGender_* staging tab WITHOUT a _ThaiPHCReportCurrent entry must NOT trigger LEGACY_F010_SNAPSHOT_PRESENT in Preview
    const unindexedEnv = createFakeMultiWorkbookEnv({
      workbooks: {
        [VALID_REF_SHEET_ID]: {
          name: 'ThaiPHC Reference',
          initialSheets: [{ name: 'ชีต1', rows: [['keep-ref']] }],
        },
        [VALID_REPORT_SHEET_ID]: {
          name: 'ThaiPHC Reports',
          initialSheets: [
            { name: 'ชีต1', rows: [['keep-report']] },
            { name: 'RGender_abandoned_staging', rows: [['{"status":"STAGING"}']] },
          ],
        },
      },
      fetchHandler: () =>
        jsonResponse({
          success: true,
          message: 'Success',
          items: [rows[0]],
          total: 1,
          page: 1,
          pageSize: 100,
        }),
    });
    const unindexedPreview = previewDatasetWithPlatform(
      { endpoint: 'volunteer-gender', token: VALID_BEARER },
      unindexedEnv.platform,
    );
    expect(unindexedPreview.ok && unindexedPreview.data.status === 'READY').toBe(true);
    if (unindexedPreview.ok && unindexedPreview.data.status === 'READY') {
      expect(unindexedPreview.data.legacySnapshotPresent).toBe(false);
      expect(unindexedPreview.data.legacySnapshotTab).toBeNull();
    }
  });

  it('hard-blocks STOP/BLOCKED on mid-fetch SOURCE_TOTAL_CHANGED, INCOMPLETE_SNAPSHOT, GENDER_TOTAL_MISMATCH, strict Geographic Scope violations, formula injection, duplicate villageCode, unexpected fields, and returns HTTP_401 without echoing token', () => {
    // 1. Mid-fetch SOURCE_TOTAL_CHANGED (page 1 total=4, page 2 total=5)
    const driftEnv = createFakeMultiWorkbookEnv({
      fetchHandler: (url) => {
        const page = Number(new URL(url).searchParams.get('page'));
        if (page === 1) {
          return jsonResponse({
            success: true,
            message: 'Success',
            items: [makeGenderRow({ villageNo: '1' }), makeGenderRow({ villageNo: '2' })],
            total: 4,
            page: 1,
            pageSize: 2,
          });
        }
        return jsonResponse({
          success: true,
          message: 'Success',
          items: [makeGenderRow({ villageNo: '3' }), makeGenderRow({ villageNo: '4' })],
          total: 5,
          page: 2,
          pageSize: 2,
        });
      },
    });
    const driftRes = previewDatasetWithPlatform(
      { endpoint: 'volunteer-gender', token: VALID_BEARER, pageSize: 2 },
      driftEnv.platform,
    );
    expect(driftRes.ok && driftRes.data.status === 'STOP_BLOCKED').toBe(true);
    if (driftRes.ok && driftRes.data.status === 'STOP_BLOCKED') {
      expect(driftRes.data.diagnostics[0].code).toBe('SOURCE_TOTAL_CHANGED');
    }

    // 2. INCOMPLETE_SNAPSHOT (page 2 returns fewer items than total implies)
    const shortEnv = createFakeMultiWorkbookEnv({
      fetchHandler: (url) => {
        const page = Number(new URL(url).searchParams.get('page'));
        if (page === 1) {
          return jsonResponse({
            success: true,
            message: 'Success',
            items: [makeGenderRow({ villageNo: '1' }), makeGenderRow({ villageNo: '2' })],
            total: 4,
            page: 1,
            pageSize: 2,
          });
        }
        return jsonResponse({
          success: true,
          message: 'Success',
          items: [makeGenderRow({ villageNo: '3' })], // Missing 4th item!
          total: 4,
          page: 2,
          pageSize: 2,
        });
      },
    });
    const shortRes = previewDatasetWithPlatform(
      { endpoint: 'volunteer-gender', token: VALID_BEARER, pageSize: 2 },
      shortEnv.platform,
    );
    expect(shortRes.ok && shortRes.data.status === 'STOP_BLOCKED').toBe(true);
    if (shortRes.ok && shortRes.data.status === 'STOP_BLOCKED') {
      expect(shortRes.data.diagnostics[0].code).toBe('INCOMPLETE_SNAPSHOT');
    }

    // 3. INCOMPLETE_SNAPSHOT on empty snapshot (total: 0)
    const emptyEnv = createFakeMultiWorkbookEnv({
      fetchHandler: () =>
        jsonResponse({
          success: true,
          message: 'Success',
          items: [],
          total: 0,
          page: 1,
          pageSize: 10,
        }),
    });
    const emptyRes = previewDatasetWithPlatform(
      { endpoint: 'volunteer-gender', token: VALID_BEARER, pageSize: 10 },
      emptyEnv.platform,
    );
    expect(emptyRes.ok && emptyRes.data.status === 'STOP_BLOCKED').toBe(true);
    if (emptyRes.ok && emptyRes.data.status === 'STOP_BLOCKED') {
      expect(emptyRes.data.diagnostics[0].code).toBe('INCOMPLETE_SNAPSHOT');
    }

    // 4. INVALID_ENVELOPE when success !== true
    const badEnvelopeEnv = createFakeMultiWorkbookEnv({
      fetchHandler: () =>
        jsonResponse({
          success: false,
          message: 'Failed',
          items: [],
          total: 0,
          page: 1,
          pageSize: 10,
        }),
    });
    const badEnvRes = previewDatasetWithPlatform(
      { endpoint: 'volunteer-gender', token: VALID_BEARER, pageSize: 10 },
      badEnvelopeEnv.platform,
    );
    expect(badEnvRes.ok && badEnvRes.data.status === 'STOP_BLOCKED').toBe(true);
    if (badEnvRes.ok && badEnvRes.data.status === 'STOP_BLOCKED') {
      expect(badEnvRes.data.diagnostics[0].code).toBe('INVALID_ENVELOPE');
    }

    // 5. Strict Geographic Scope (54 / 5406): subdistrict 540609, villageCode/subdistrict prefix mismatch, 000 villageCode, and villageNo/villageCode mismatch = hard STOP_BLOCKED
    for (const badScopeRow of [
      makeGenderRow({ subdistrictCode: '540609', villageCode: '540609001' }),
      makeGenderRow({ subdistrictCode: '540601', villageCode: '540602001' }),
      makeGenderRow({ subdistrictCode: '540601', villageCode: '540601000', villageNo: '0' }),
      makeGenderRow({ subdistrictCode: '540601', villageCode: '540601001', villageNo: '2' }),
      makeGenderRow({ districtCode: '5407' }),
      makeGenderRow({ provinceCode: '50' }),
    ]) {
      const scopeEnv = createFakeMultiWorkbookEnv({
        fetchHandler: () =>
          jsonResponse({
            success: true,
            message: 'Success',
            items: [badScopeRow],
            total: 1,
            page: 1,
            pageSize: 10,
          }),
      });
      const scopeRes = previewDatasetWithPlatform(
        { endpoint: 'volunteer-gender', token: VALID_BEARER, pageSize: 10 },
        scopeEnv.platform,
      );
      expect(scopeRes.ok && scopeRes.data.status === 'STOP_BLOCKED').toBe(true);
      if (scopeRes.ok && scopeRes.data.status === 'STOP_BLOCKED') {
        expect(scopeRes.data.diagnostics[0].code).toBe('OUT_OF_GEOGRAPHIC_SCOPE');
      }
    }

    // 6. Arithmetic invariant: male + female !== total -> hard STOP_BLOCKED (GENDER_TOTAL_MISMATCH)
    const mathEnv = createFakeMultiWorkbookEnv({
      fetchHandler: () =>
        jsonResponse({
          success: true,
          message: 'Success',
          items: [makeGenderRow({ male: 3, female: 16, total: 20 })],
          total: 1,
          page: 1,
          pageSize: 10,
        }),
    });
    const mathRes = previewDatasetWithPlatform(
      { endpoint: 'volunteer-gender', token: VALID_BEARER, pageSize: 10 },
      mathEnv.platform,
    );
    expect(mathRes.ok && mathRes.data.status === 'STOP_BLOCKED').toBe(true);
    if (mathRes.ok && mathRes.data.status === 'STOP_BLOCKED') {
      expect(mathRes.data.diagnostics[0].code).toBe('GENDER_TOTAL_MISMATCH');
    }

    // 7. Formula injection & unexpected PII field & duplicate villageCode
    const formulaEnv = createFakeMultiWorkbookEnv({
      fetchHandler: () =>
        jsonResponse({
          success: true,
          message: 'Success',
          items: [makeGenderRow({ villageName: '=IMPORTXML("http://evil")' })],
          total: 1,
          page: 1,
          pageSize: 10,
        }),
    });
    const formulaRes = previewDatasetWithPlatform(
      { endpoint: 'volunteer-gender', token: VALID_BEARER, pageSize: 10 },
      formulaEnv.platform,
    );
    expect(formulaRes.ok && formulaRes.data.status === 'STOP_BLOCKED').toBe(true);
    if (formulaRes.ok && formulaRes.data.status === 'STOP_BLOCKED') {
      expect(formulaRes.data.diagnostics[0].code).toBe('FORMULA_INJECTION_DETECTED');
      expect(JSON.stringify(formulaRes)).not.toContain('IMPORTXML');
    }

    const extraPiiEnv = createFakeMultiWorkbookEnv({
      fetchHandler: () =>
        jsonResponse({
          success: true,
          message: 'Success',
          items: [{ ...makeGenderRow(), citizenId: '1100100999999' }],
          total: 1,
          page: 1,
          pageSize: 10,
        }),
    });
    const extraPiiRes = previewDatasetWithPlatform(
      { endpoint: 'volunteer-gender', token: VALID_BEARER, pageSize: 10 },
      extraPiiEnv.platform,
    );
    expect(extraPiiRes.ok && extraPiiRes.data.status === 'STOP_BLOCKED').toBe(true);
    if (extraPiiRes.ok && extraPiiRes.data.status === 'STOP_BLOCKED') {
      expect(extraPiiRes.data.diagnostics[0].code).toBe('UNEXPECTED_FIELD');
      expect(JSON.stringify(extraPiiRes)).not.toContain('1100100999999');
    }

    const dupEnv = createFakeMultiWorkbookEnv({
      fetchHandler: () =>
        jsonResponse({
          success: true,
          message: 'Success',
          items: [makeGenderRow({ villageNo: '1' }), makeGenderRow({ villageNo: '1' })],
          total: 2,
          page: 1,
          pageSize: 10,
        }),
    });
    const dupRes = previewDatasetWithPlatform(
      { endpoint: 'volunteer-gender', token: VALID_BEARER, pageSize: 10 },
      dupEnv.platform,
    );
    expect(dupRes.ok && dupRes.data.status === 'STOP_BLOCKED').toBe(true);
    if (dupRes.ok && dupRes.data.status === 'STOP_BLOCKED') {
      expect(dupRes.data.diagnostics[0].code).toBe('DUPLICATE_SOURCE_KEY');
    }

    // 8. HTTP 401 returns RPC error without echoing token
    const authEnv = createFakeMultiWorkbookEnv({
      fetchHandler: () => jsonResponse({ error: 'unauthorized' }, 401),
    });
    const authRes = previewDatasetWithPlatform(
      { endpoint: 'volunteer-gender', token: VALID_BEARER, pageSize: 10 },
      authEnv.platform,
    );
    expect(authRes.ok).toBe(false);
    if (!authRes.ok) {
      expect(authRes.error.code).toBe('HTTP_401');
    }
    expect(JSON.stringify(authRes)).not.toContain(VALID_BEARER);
  });

  it('enforces THAIPHC_WRITE_ENABLED, THAIPHC_PERSON_DATA_WRITE_ENABLED, and F010 workbook isolation (separate workbook vs OWNER_ONLY_5406_APPROVED)', () => {
    const sampleRows = [makeGenderRow({ villageNo: '1', male: 3, female: 16, total: 19 })];
    const singlePageFetch = () =>
      jsonResponse({
        success: true,
        message: 'Success',
        items: sampleRows,
        total: 1,
        page: 1,
        pageSize: 100,
      });

    // 1. THAIPHC_WRITE_ENABLED = false blocks Commit even when THAIPHC_PERSON_DATA_WRITE_ENABLED = true
    const writeOffEnv = createFakeMultiWorkbookEnv({
      properties: {
        THAIPHC_WRITE_ENABLED: 'false',
        THAIPHC_PERSON_DATA_WRITE_ENABLED: 'true',
      },
      fetchHandler: singlePageFetch,
    });
    const pWriteOff = previewDatasetWithPlatform(
      { endpoint: 'volunteer-gender', token: VALID_BEARER },
      writeOffEnv.platform,
    );
    if (!pWriteOff.ok || pWriteOff.data.status !== 'READY') throw new Error('expected READY');
    expect(pWriteOff.data.writeAllowed).toBe(false);
    expect(pWriteOff.data.blockedGuardReason).toBe('THAIPHC_WRITE_ENABLED');

    const cWriteOff = commitSmallDatasetWithPlatform(
      {
        endpoint: 'volunteer-gender',
        token: VALID_BEARER,
        expectedFingerprint: pWriteOff.data.fingerprint,
      },
      writeOffEnv.platform,
    );
    expect(
      cWriteOff.ok &&
        cWriteOff.data.status === 'FAILED_STOP' &&
        cWriteOff.data.stopCode === 'WRITE_DISABLED',
    ).toBe(true);
    expect(
      writeOffEnv.workbookStates.get(VALID_REPORT_SHEET_ID)!.sheets.has('VolunteerGender'),
    ).toBe(false);

    // 2. THAIPHC_PERSON_DATA_WRITE_ENABLED = false blocks Commit even when THAIPHC_WRITE_ENABLED = true
    const personOffEnv = createFakeMultiWorkbookEnv({
      properties: {
        THAIPHC_WRITE_ENABLED: 'true',
        THAIPHC_PERSON_DATA_WRITE_ENABLED: 'false',
      },
      fetchHandler: singlePageFetch,
    });
    const pPersonOff = previewDatasetWithPlatform(
      { endpoint: 'volunteer-gender', token: VALID_BEARER },
      personOffEnv.platform,
    );
    if (!pPersonOff.ok || pPersonOff.data.status !== 'READY') throw new Error('expected READY');
    expect(pPersonOff.data.writeAllowed).toBe(false);
    expect(pPersonOff.data.blockedGuardReason).toBe('THAIPHC_PERSON_DATA_WRITE_ENABLED');

    const cPersonOff = commitSmallDatasetWithPlatform(
      {
        endpoint: 'volunteer-gender',
        token: VALID_BEARER,
        expectedFingerprint: pPersonOff.data.fingerprint,
      },
      personOffEnv.platform,
    );
    expect(
      cPersonOff.ok &&
        cPersonOff.data.status === 'FAILED_STOP' &&
        cPersonOff.data.stopCode === 'PERSON_DATA_WRITE_DISABLED',
    ).toBe(true);
    expect(
      personOffEnv.workbookStates.get(VALID_REPORT_SHEET_ID)!.sheets.has('VolunteerGender'),
    ).toBe(false);

    // 3. Same workbook WITHOUT THAIPHC_SAME_WORKBOOK_APPROVAL === "OWNER_ONLY_5406_APPROVED" fails closed
    const sameUnapprovedEnv = createFakeMultiWorkbookEnv({
      properties: {
        THAIPHC_REPORT_SPREADSHEET_ID: undefined,
        THAIPHC_SAME_WORKBOOK_APPROVAL: 'WRONG_TOKEN',
        THAIPHC_WRITE_ENABLED: 'true',
        THAIPHC_PERSON_DATA_WRITE_ENABLED: 'true',
      },
      fetchHandler: singlePageFetch,
    });
    const pSameUnapproved = previewDatasetWithPlatform(
      { endpoint: 'volunteer-gender', token: VALID_BEARER },
      sameUnapprovedEnv.platform,
    );
    if (!pSameUnapproved.ok || pSameUnapproved.data.status !== 'READY') {
      throw new Error('expected READY');
    }
    expect(pSameUnapproved.data.writeAllowed).toBe(false);
    expect(pSameUnapproved.data.blockedGuardReason).toBe('THAIPHC_SAME_WORKBOOK_APPROVAL');

    const cSameUnapproved = commitSmallDatasetWithPlatform(
      {
        endpoint: 'volunteer-gender',
        token: VALID_BEARER,
        expectedFingerprint: pSameUnapproved.data.fingerprint,
      },
      sameUnapprovedEnv.platform,
    );
    expect(
      cSameUnapproved.ok &&
        cSameUnapproved.data.status === 'FAILED_STOP' &&
        cSameUnapproved.data.stopCode === 'SAME_WORKBOOK_UNAPPROVED',
    ).toBe(true);
    expect(
      sameUnapprovedEnv.workbookStates.get(VALID_REF_SHEET_ID)!.sheets.has('VolunteerGender'),
    ).toBe(false);

    // 4. Same workbook WITH THAIPHC_SAME_WORKBOOK_APPROVAL === "OWNER_ONLY_5406_APPROVED" succeeds on reference workbook
    const sameApprovedEnv = createFakeMultiWorkbookEnv({
      properties: {
        THAIPHC_REPORT_SPREADSHEET_ID: VALID_REF_SHEET_ID,
        THAIPHC_SAME_WORKBOOK_APPROVAL: 'OWNER_ONLY_5406_APPROVED',
        THAIPHC_WRITE_ENABLED: 'true',
        THAIPHC_PERSON_DATA_WRITE_ENABLED: 'true',
      },
      fetchHandler: singlePageFetch,
    });
    const pSameApproved = previewDatasetWithPlatform(
      { endpoint: 'volunteer-gender', token: VALID_BEARER },
      sameApprovedEnv.platform,
    );
    if (!pSameApproved.ok || pSameApproved.data.status !== 'READY') {
      throw new Error('expected READY');
    }
    expect(pSameApproved.data.writeAllowed).toBe(true);

    const cSameApproved = commitSmallDatasetWithPlatform(
      {
        endpoint: 'volunteer-gender',
        token: VALID_BEARER,
        expectedFingerprint: pSameApproved.data.fingerprint,
      },
      sameApprovedEnv.platform,
    );
    expect(cSameApproved.ok && cSameApproved.data.status === 'COMMITTED_VERIFIED').toBe(true);
    expect(
      sameApprovedEnv.workbookStates.get(VALID_REF_SHEET_ID)!.sheets.has('VolunteerGender'),
    ).toBe(true);
    expect(
      sameApprovedEnv.workbookStates.get(VALID_REPORT_SHEET_ID)!.sheets.has('VolunteerGender'),
    ).toBe(false);

    // 5. Invalid report spreadsheet ID fails closed on both Preview and Commit
    const badReportIdEnv = createFakeMultiWorkbookEnv({
      properties: {
        THAIPHC_REPORT_SPREADSHEET_ID: 'invalid-short-id',
        THAIPHC_WRITE_ENABLED: 'true',
        THAIPHC_PERSON_DATA_WRITE_ENABLED: 'true',
      },
      fetchHandler: singlePageFetch,
    });
    const pBadReport = previewDatasetWithPlatform(
      { endpoint: 'volunteer-gender', token: VALID_BEARER },
      badReportIdEnv.platform,
    );
    expect(pBadReport.ok).toBe(false);
    if (!pBadReport.ok) {
      expect(pBadReport.error.code).toBe('SPREADSHEET_NOT_CONFIGURED');
    }
    const cBadReport = commitSmallDatasetWithPlatform(
      {
        endpoint: 'volunteer-gender',
        token: VALID_BEARER,
        expectedFingerprint: pSameApproved.data.fingerprint,
      },
      badReportIdEnv.platform,
    );
    expect(
      cBadReport.ok &&
        cBadReport.data.status === 'FAILED_STOP' &&
        cBadReport.data.stopCode === 'INVALID_REPORT_WORKBOOK',
    ).toBe(true);
  });

  it('initializes 20-column VolunteerGender in separate report workbook without modifying legacy RGender_* or _ThaiPHCReportCurrent, runs repeatable Keyed Upsert (INSERT/UPDATE/UNCHANGED/MISSING_IN_SOURCE), and enforces PRODUCTION confirmation & PREVIEW_STALE', () => {
    let sourceRows = [
      makeGenderRow({
        subdistrictCode: '540601',
        villageNo: '1',
        villageName: 'หนุนเหนือ',
        male: 3,
        female: 16,
        total: 19,
      }),
      makeGenderRow({
        subdistrictCode: '540601',
        villageNo: '2',
        villageName: 'หนุนใต้',
        male: 2,
        female: 2,
        total: 4,
      }),
      makeGenderRow({
        subdistrictCode: '540601',
        villageNo: '3',
        villageName: 'ป่าแดง',
        male: 6,
        female: 10,
        total: 16,
      }),
    ];

    const legacyPointerRows = [
      ['endpoint', 'run_id', 'snapshot_sheet', 'row_count', 'manifest_digest'],
      ['volunteer-gender', 'f010_20261119', 'RGender_f010_20261119', 85, 'b'.repeat(64)],
    ];
    const legacySnapshotRows = [
      ['{"status":"PUBLISHED"}'],
      ['_source_key', 'provinceCode', 'villageCode'],
      ['540601001', '54', '540601001'],
    ];

    const env = createFakeMultiWorkbookEnv({
      properties: {
        THAIPHC_ENV: 'PRODUCTION',
        THAIPHC_SPREADSHEET_ID: VALID_REF_SHEET_ID,
        THAIPHC_REPORT_SPREADSHEET_ID: VALID_REPORT_SHEET_ID,
        THAIPHC_SAME_WORKBOOK_APPROVAL: undefined, // Not needed for separate report workbook
        THAIPHC_WRITE_ENABLED: 'true',
        THAIPHC_PERSON_DATA_WRITE_ENABLED: 'true',
      },
      workbooks: {
        [VALID_REF_SHEET_ID]: {
          name: 'ThaiPHC Reference Prod',
          initialSheets: [{ name: 'ชีต1', rows: [['keep-ref']] }],
        },
        [VALID_REPORT_SHEET_ID]: {
          name: 'ThaiPHC Reports Prod',
          initialSheets: [
            { name: 'ชีต1', rows: [['keep-report']] },
            { name: '_ThaiPHCReportCurrent', rows: legacyPointerRows },
            { name: 'RGender_f010_20261119', rows: legacySnapshotRows },
          ],
        },
      },
      fetchHandler: () =>
        jsonResponse({
          success: true,
          message: 'Success',
          items: sourceRows,
          total: sourceRows.length,
          page: 1,
          pageSize: 100,
        }),
    });

    // 1. Initial Preview detects LEGACY_F010_SNAPSHOT_PRESENT
    const preview1 = previewDatasetWithPlatform(
      { endpoint: 'volunteer-gender', token: VALID_BEARER },
      env.platform,
    );
    if (!preview1.ok || preview1.data.status !== 'READY') throw new Error('expected READY 1');
    expect(preview1.data.legacySnapshotPresent).toBe(true);
    expect(preview1.data.legacySnapshotTab).toBe('RGender_f010_20261119');
    expect(preview1.data.writeAllowed).toBe(true);

    // PRODUCTION confirmation rejects wrong phrase
    const badProdCommit = commitSmallDatasetWithPlatform(
      {
        endpoint: 'volunteer-gender',
        token: VALID_BEARER,
        expectedFingerprint: preview1.data.fingerprint,
        confirmationPhrase: 'PRODUCTION 5406 subdistricts',
      },
      env.platform,
    );
    expect(
      badProdCommit.ok &&
        badProdCommit.data.status === 'FAILED_STOP' &&
        badProdCommit.data.stopCode === 'PRODUCTION_CONFIRMATION_REQUIRED',
    ).toBe(true);

    // 2. Commit 1 with exact PRODUCTION phrase initializes VolunteerGender in REPORT workbook only
    const commit1 = commitSmallDatasetWithPlatform(
      {
        endpoint: 'volunteer-gender',
        token: VALID_BEARER,
        expectedFingerprint: preview1.data.fingerprint,
        confirmationPhrase: 'PRODUCTION 5406 volunteer-gender',
      },
      env.platform,
    );
    expect(commit1.ok && commit1.data.status === 'COMMITTED_VERIFIED').toBe(true);
    if (!commit1.ok || commit1.data.status !== 'COMMITTED_VERIFIED') {
      throw new Error('expected COMMITTED_VERIFIED 1');
    }

    expect(commit1.data.readback).toMatchObject({
      verified: true,
      destinationTab: 'VolunteerGender',
      expectedRowCount: 3,
      actualRowCount: 3,
      uniqueKeysVerified: true,
      rowDigestsVerified: true,
      unrelatedTabsPreserved: true,
    });
    expect(commit1.data.readback.baselineTabsChecked).toEqual([
      'ชีต1',
      '_ThaiPHCReportCurrent',
      'RGender_f010_20261119',
    ]);

    // Reference workbook was NEVER written to
    const refWb = env.workbookStates.get(VALID_REF_SHEET_ID)!;
    expect(refWb.sheets.has('VolunteerGender')).toBe(false);
    expect(refWb.sheets.has('_ThaiPHCSyncLog')).toBe(false);

    // Report workbook has 20-column VolunteerGender, while RGender_* and _ThaiPHCReportCurrent are untouched
    const reportWb = env.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    expect(reportWb.sheets.get('_ThaiPHCReportCurrent')!.rows).toEqual(legacyPointerRows);
    expect(reportWb.sheets.get('_ThaiPHCReportCurrent')!.writeOps).toEqual([]);
    expect(reportWb.sheets.get('RGender_f010_20261119')!.rows).toEqual(legacySnapshotRows);
    expect(reportWb.sheets.get('RGender_f010_20261119')!.writeOps).toEqual([]);
    expect(reportWb.sheets.get('ชีต1')!.rows).toEqual([['keep-report']]);

    const vgSheet = reportWb.sheets.get('VolunteerGender')!;
    expect(vgSheet.rows[0]).toEqual([
      'provinceCode',
      'provinceName',
      'districtCode',
      'districtName',
      'subdistrictCode',
      'subdistrictName',
      'villageCode',
      'villageNo',
      'villageName',
      'total',
      'male',
      'female',
      '_schema_version',
      '_sync_run_id',
      '_source_key',
      '_fetched_at_utc',
      '_quality_status',
      '_field_presence_json',
      '_last_seen_run_id',
      '_row_digest',
    ]);
    // Text format applied to string/code columns (1..9) and metadata columns (13..20), NOT numeric columns (10..12)
    expect(vgSheet.numberFormats.get('C7')).toBe('@'); // villageCode
    expect(vgSheet.numberFormats.get('C8')).toBe('@'); // villageNo
    expect(vgSheet.numberFormats.get('C10')).toBeUndefined(); // total (numeric)
    expect(vgSheet.numberFormats.get('C15')).toBe('@'); // _source_key

    // Row 1 (male=3, female=16, total=19): stored suppressed -> total=19, male='', female='', _quality_status='WARNING'
    expect(vgSheet.rows[1].slice(6, 12)).toEqual(['540601001', '1', 'หนุนเหนือ', 19, '', '']);
    expect(vgSheet.rows[1][14]).toBe('540601001');
    expect(vgSheet.rows[1][16]).toBe('WARNING');
    expect(JSON.parse(String(vgSheet.rows[1][17]))).toMatchObject({
      total: 'VALUE',
      male: 'NULL',
      female: 'NULL',
    });

    // Row 2 (male=2, female=2, total=4): stored totally suppressed -> '', '', '', _quality_status='WARNING'
    expect(vgSheet.rows[2].slice(9, 12)).toEqual(['', '', '']);
    expect(vgSheet.rows[2][16]).toBe('WARNING');

    // Row 3 (male=6, female=10, total=16): stored unsuppressed -> 16, 6, 10, _quality_status='VALID'
    expect(vgSheet.rows[3].slice(9, 12)).toEqual([16, 6, 10]);
    expect(vgSheet.rows[3][16]).toBe('VALID');

    // 3. Repeatable Sync round 2:
    // - 540601001: raw male 3->2, female 16->17, total=19 -> STILL suppressed identically -> UNCHANGED (zero disclosure!)
    // - 540601002: missing in source -> REVIEW (MISSING_IN_SOURCE), preserved untouched in sheet!
    // - 540601003: male 6->7, female 10->11, total=18 -> UPDATE
    // - 540601004: new village -> INSERT
    sourceRows = [
      makeGenderRow({
        subdistrictCode: '540601',
        villageNo: '1',
        villageName: 'หนุนเหนือ',
        male: 2,
        female: 17,
        total: 19,
      }),
      makeGenderRow({
        subdistrictCode: '540601',
        villageNo: '3',
        villageName: 'ป่าแดง',
        male: 7,
        female: 11,
        total: 18,
      }),
      makeGenderRow({
        subdistrictCode: '540601',
        villageNo: '4',
        villageName: 'ห้วยไร่',
        male: 5,
        female: 8,
        total: 13,
      }),
    ];

    const preview2 = previewDatasetWithPlatform(
      { endpoint: 'volunteer-gender', token: VALID_BEARER },
      env.platform,
    );
    if (!preview2.ok || preview2.data.status !== 'READY') throw new Error('expected READY 2');
    // VolunteerGender now exists -> legacy transition notice clears
    expect(preview2.data.legacySnapshotPresent).toBe(false);
    expect(preview2.data.legacySnapshotTab).toBeNull();
    expect(preview2.data.counts).toEqual({ insert: 1, update: 1, unchanged: 1, review: 2 });
    expect(preview2.data.reviewBreakdown).toEqual({
      SMALL_CELL_SUPPRESSED: 1,
      MISSING_IN_SOURCE: 1,
    });

    // Stale preview detection if source changes before commit
    const originalRows = sourceRows;
    sourceRows = [
      ...originalRows,
      makeGenderRow({ subdistrictCode: '540601', villageNo: '5', male: 6, female: 6, total: 12 }),
    ];
    const staleCommit = commitSmallDatasetWithPlatform(
      {
        endpoint: 'volunteer-gender',
        token: VALID_BEARER,
        expectedFingerprint: preview2.data.fingerprint,
        confirmationPhrase: 'PRODUCTION 5406 volunteer-gender',
      },
      env.platform,
    );
    expect(staleCommit.ok && staleCommit.data.status === 'PREVIEW_STALE_RECONFIRM_REQUIRED').toBe(
      true,
    );
    sourceRows = originalRows;

    // Commit 2 applies INSERT + UPDATE and preserves MISSING_IN_SOURCE row 540601002
    const commit2 = commitSmallDatasetWithPlatform(
      {
        endpoint: 'volunteer-gender',
        token: VALID_BEARER,
        expectedFingerprint: preview2.data.fingerprint,
        confirmationPhrase: 'PRODUCTION 5406 volunteer-gender',
      },
      env.platform,
    );
    expect(commit2.ok && commit2.data.status === 'COMMITTED_VERIFIED').toBe(true);
    if (commit2.ok && commit2.data.status === 'COMMITTED_VERIFIED') {
      expect(commit2.data.readback.expectedRowCount).toBe(4);
      expect(commit2.data.readback.actualRowCount).toBe(4);
    }
    expect(vgSheet.rows.map((r) => r[6])).toEqual([
      'villageCode',
      '540601001',
      '540601002',
      '540601003',
      '540601004',
    ]);
    expect(vgSheet.rows[3].slice(9, 12)).toEqual([18, 7, 11]); // updated
    expect(vgSheet.rows[2].slice(6, 12)).toEqual(['540601002', '2', 'หนุนใต้', '', '', '']); // preserved untouched
  });
});
