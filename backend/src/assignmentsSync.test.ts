import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  finalizeLargeDatasetCommitWithPlatform,
  finalizePreviewWithPlatform,
  previewDatasetBatchWithPlatform,
  stageLargeDatasetBatchWithPlatform,
} from './largeKeyedSyncService.ts';
import type {
  HttpFetchOptions,
  HttpFetchResponse,
  SyncPlatform,
  WritableSheetHandle,
  WritableSpreadsheetHandle,
} from './types.ts';

const VALID_REF_SHEET_ID = '1REFdefGHIjklMNOpqrSTUvwxYZ0123456789';
const VALID_REPORT_SHEET_ID = '1REPdefGHIjklMNOpqrSTUvwxYZ0123456789';
const VALID_BEARER = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.synthetic_assign_token_12345';
const VALID_HMAC_KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

// Independent F010 two-step HMAC-SHA256 test vectors for VALID_HMAC_KEY + endpoint="assignments"
const EXPECTED_H1_UUID_0001 = 'h1_4f10838fd01347c17a887f30804cd7ec9096af7fca7e3a42e837654f96a31da0';
const EXPECTED_H1_UUID_0002 = 'h1_9f7cd7fc1209c07ef97ef2ee7b3c8023519373d5022a536beb612284fadc101d';

interface MockSheetState {
  name: string;
  rows: unknown[][];
  maxRows: number;
  maxColumns: number;
  frozenRows: number;
  hidden: boolean;
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

function toSignedJavaBytes(buf: Buffer): number[] {
  return Array.from(buf, (b) => (b > 127 ? b - 256 : b));
}

function hmacSha256SignedBytes(input: string, keyBytes: number[]): number[] {
  const unsignedKey = Buffer.from(keyBytes.map((b) => ((b % 256) + 256) % 256));
  const digest = createHmac('sha256', unsignedKey).update(input, 'utf8').digest();
  return toSignedJavaBytes(digest);
}

function makeAssignmentRow(
  index: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const num = String(index).padStart(4, '0');
  return {
    // 8 RESTRICTED_DEFAULT_OMIT direct personal identifiers (must NEVER leave GAS memory)
    id: `SYNTHETIC-UUID-${num}`,
    osmCode: `9999000000${num}`,
    citizenId: `154060000${num}`,
    prefixNameTh: 'นางสาว',
    prefixNameEn: 'Miss',
    firstName: `PRIVATE_FIRST_${num}`,
    lastName: `PRIVATE_LAST_${num}`,
    fullName: `นางสาว PRIVATE_FIRST_${num} PRIVATE_LAST_${num}`,
    // 17 ALLOW_ONLY_IF_DATASET_APPROVED columns
    provinceCode: '54',
    provinceNameTh: 'แพร่',
    districtCode: '5406',
    districtNameTh: 'สอง',
    subdistrictCode: index % 2 === 1 ? '540601' : '540603',
    subdistrictNameTh: index % 2 === 1 ? 'บ้านหนุน' : 'ห้วยหม้าย',
    villageNo: String(((index - 1) % 12) + 1),
    villageName: index % 2 === 1 ? null : `หมู่บ้านตัวอย่าง_${num}`,
    isActive: true,
    status: 'ใช้งาน',
    osmStatus: '',
    osmShowbbody: '1',
    approvalStatus: 'approved',
    volunteerStatus: index % 2 === 1 ? 'already_volunteer' : 'not_interested',
    createdAt: '2025-11-10T05:36:01.776457Z',
    requestDate: '2025-11-10T05:36:01.776457Z',
    updatedAt: '2026-10-12T13:07:33.846207Z',
    ...overrides,
  };
}

function makeAssignmentPage(
  allRows: Record<string, unknown>[],
  page: number,
  pageSize: number,
  totalOverride?: number,
) {
  const total = totalOverride ?? allRows.length;
  const start = (page - 1) * pageSize;
  return {
    provinces: [
      {
        provinceCode: '54',
        provinceNameTh: 'แพร่',
        provinceNameEn: 'Phrae',
        osmCount: total,
      },
    ],
    items: allRows.slice(start, start + pageSize),
    pagination: {
      page,
      limit: pageSize,
      total,
      pages: total === 0 ? 0 : Math.ceil(total / pageSize),
    },
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

function createFakeAssignmentsEnv(opts: {
  properties?: Record<string, string | undefined>;
  workbooks?: Record<
    string,
    { name: string; initialSheets?: Array<{ name: string; rows: unknown[][] }> }
  >;
  fetchHandler: (url: string, options: HttpFetchOptions) => HttpFetchResponse;
  lockAvailable?: boolean;
  failWriteOnTab?: string;
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
        hidden: false,
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
      hideSheet: () => {
        state.hidden = true;
        state.writeOps.push('hideSheet');
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
        if (opts.failWriteOnTab && state.name === opts.failWriteOnTab && row >= 2) {
          throw new Error(`SIMULATED_WRITE_FAIL:${state.name}`);
        }
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
          hidden: false,
          numberFormats: new Map(),
          writeOps: ['insertSheet'],
        };
        wb.sheets.set(name, created);
        wb.sheetOrder.push(name);
        return wrapSheet(created);
      },
      deleteSheetByName: (name: string) => {
        if (!wb.sheets.has(name)) return false;
        wb.sheets.delete(name);
        const idx = wb.sheetOrder.indexOf(name);
        if (idx >= 0) wb.sheetOrder.splice(idx, 1);
        return true;
      },
    };
  }

  const properties: Record<string, string | undefined> = {
    THAIPHC_ENV: 'SANDBOX',
    THAIPHC_SPREADSHEET_ID: VALID_REF_SHEET_ID,
    THAIPHC_REPORT_SPREADSHEET_ID: VALID_REPORT_SHEET_ID,
    THAIPHC_WRITE_ENABLED: 'true',
    THAIPHC_PERSON_DATA_WRITE_ENABLED: 'true',
    THAIPHC_HMAC_KEY_B64: VALID_HMAC_KEY,
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
    now: () => new Date(opts.nowIso ?? '2026-11-21T16:00:00.000Z'),
    fetchUrl: (url: string, options: HttpFetchOptions) => {
      fetchCalls.push({ url, options });
      return opts.fetchHandler(url, options);
    },
    sha256Hex,
    base64Decode: (b64: string) => toSignedJavaBytes(Buffer.from(b64, 'base64')),
    base64Encode: (bytes: number[]) =>
      Buffer.from(bytes.map((b) => ((b % 256) + 256) % 256)).toString('base64'),
    hmacSha256Bytes: hmacSha256SignedBytes,
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

describe('Assignments Person-Level Sync — Batched Preview & F010 Pseudonymization (Backend GAS RPC Seam)', () => {
  it('fetches assignments sequentially across multiple batches with assignment pagination, derives byte-for-byte F010 h1_ pseudonyms matching legacy projection, strips all 8 restricted PII fields, preserves nullable villageName, writes zero Sheets, and detects LEGACY_F010_SNAPSHOT_PRESENT', async () => {
    const rows = [1, 2, 3, 4, 5].map((i) => makeAssignmentRow(i));

    const env = createFakeAssignmentsEnv({
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
                ['assignments', 'f010_20261119', 'RAssign_f010_20261119', 1571, 'b'.repeat(64)],
              ],
            },
            {
              name: 'RAssign_f010_20261119',
              rows: [['{"status":"PUBLISHED"}'], ['_source_key', 'provinceCode']],
            },
          ],
        },
      },
      fetchHandler: (url) => {
        const parsed = new URL(url);
        const page = Number(parsed.searchParams.get('page'));
        const pageSize = Number(parsed.searchParams.get('pageSize'));
        return jsonResponse(makeAssignmentPage(rows, page, pageSize));
      },
    });

    // Batch 1: pages 1..2 (pageSize=2, batchPages=2 -> 4 rows)
    const batch1 = previewDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        startPage: 1,
        batchPages: 2,
        pageSize: 2,
      },
      env.platform,
    );
    expect(batch1.ok).toBe(true);
    if (!batch1.ok || batch1.data.status !== 'BATCH_OK') {
      throw new Error(`Expected BATCH_OK on batch 1, got: ${JSON.stringify(batch1)}`);
    }
    expect(batch1.data.pagesFetchedInBatch).toBe(2);
    expect(batch1.data.lastPageFetched).toBe(2);
    expect(batch1.data.totalPages).toBe(3);
    expect(batch1.data.sourceTotal).toBe(5);
    expect(batch1.data.rowsInBatch).toBe(4);
    expect(batch1.data.hasMore).toBe(true);
    expect(batch1.data.nextPage).toBe(3);

    // Verify exact allowlisted assignment URL & GET no-redirect options
    expect(env.fetchCalls.map((c) => c.url)).toEqual([
      'https://api-thaiphc.hss.moph.go.th/api/v1/dashboard/assignments?page=1&pageSize=2&provinceCode=54&districtCode=5406&osmStatus=&osm_status=&approval_status=approved&order_by=approved_date&sort_dir=desc',
      'https://api-thaiphc.hss.moph.go.th/api/v1/dashboard/assignments?page=2&pageSize=2&provinceCode=54&districtCode=5406&osmStatus=&osm_status=&approval_status=approved&order_by=approved_date&sort_dir=desc',
    ]);
    expect(env.fetchCalls[0].options).toMatchObject({
      method: 'get',
      followRedirects: false,
      muteHttpExceptions: true,
    });

    // Batch 2: page 3 (1 remaining row)
    const batch2 = previewDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        startPage: 3,
        batchPages: 2,
        pageSize: 2,
        expectedSourceTotal: batch1.data.sourceTotal,
      },
      env.platform,
    );
    expect(batch2.ok).toBe(true);
    if (!batch2.ok || batch2.data.status !== 'BATCH_OK') {
      throw new Error(`Expected BATCH_OK on batch 2, got: ${JSON.stringify(batch2)}`);
    }
    expect(batch2.data.pagesFetchedInBatch).toBe(1);
    expect(batch2.data.lastPageFetched).toBe(3);
    expect(batch2.data.rowsInBatch).toBe(1);
    expect(batch2.data.hasMore).toBe(false);
    expect(batch2.data.nextPage).toBeNull();

    // Byte-for-byte parity with independent known-good F010 vectors AND actual legacy F010 projection module
    expect(batch1.data.rowDigests[0].key).toBe(EXPECTED_H1_UUID_0001);
    expect(batch1.data.rowDigests[1].key).toBe(EXPECTED_H1_UUID_0002);

    const legacyUrl = new URL('../../src/sync/extended-minimized-projection.mjs', import.meta.url)
      .href;
    const legacyMod = (await import(legacyUrl)) as {
      projectMinimizedExtendedSnapshot: (args: {
        endpoint: string;
        pages: unknown[];
        manifest: unknown;
        privacyKeyB64: string;
        runId: string;
      }) => { rows: Array<{ key: string }> };
    };
    const manifest = JSON.parse(
      readFileSync(new URL('../../docs/sheets-schema.json', import.meta.url), 'utf8'),
    );
    const derivedPrivacyKeyB64 = createHmac('sha256', Buffer.from(VALID_HMAC_KEY, 'base64'))
      .update('THAIPHC_F010_PSEUDONYM_DERIVE_5406', 'utf8')
      .digest('base64');
    const legacyProjected = legacyMod.projectMinimizedExtendedSnapshot({
      endpoint: 'assignments',
      pages: [
        {
          provinces: [],
          items: rows,
          pagination: { page: 1, limit: 10, total: rows.length, pages: 1 },
        },
      ],
      manifest,
      privacyKeyB64: derivedPrivacyKeyB64,
      runId: 'parity_test_run_01',
    });
    const allBatchDigests = [...batch1.data.rowDigests, ...batch2.data.rowDigests];
    expect(allBatchDigests.map((r) => r.key)).toEqual(legacyProjected.rows.map((r) => r.key));

    // Finalize read-only preview from accumulated non-PII batch outputs
    const preview = finalizePreviewWithPlatform(
      {
        endpoint: 'assignments',
        sourceTotal: 5,
        pagesFetched: 3,
        rowDigests: allBatchDigests,
        aggregateSummary: [...batch1.data.aggregateSummary, ...batch2.data.aggregateSummary],
        sampleCandidates: [...batch1.data.sampleCandidates, ...batch2.data.sampleCandidates],
      },
      env.platform,
    );
    expect(preview.ok).toBe(true);
    if (
      !preview.ok ||
      preview.data.status !== 'READY' ||
      preview.data.previewMode !== 'EXTENDED_MINIMIZED'
    ) {
      throw new Error(`Expected READY EXTENDED_MINIMIZED preview, got: ${JSON.stringify(preview)}`);
    }

    // Zero Google Sheets writes during entire Preview flow
    expect(env.workbookStates.get(VALID_REPORT_SHEET_ID)!.sheets.has('Assignments')).toBe(false);
    expect(env.getFlushCount()).toBe(0);

    // Diff counts, aggregate summary, nullable villageName, and LEGACY_F010_SNAPSHOT_PRESENT
    expect(preview.data.paginationProtocol).toBe('assignment');
    expect(preview.data.destinationTab).toBe('Assignments');
    expect(preview.data.sourceTotal).toBe(5);
    expect(preview.data.pagesFetched).toBe(3);
    expect(preview.data.counts).toEqual({ insert: 5, update: 0, unchanged: 0, review: 0 });
    expect(preview.data.legacySnapshotPresent).toBe(true);
    expect(preview.data.legacySnapshotTab).toBe('RAssign_f010_20261119');
    expect(preview.data.aggregateSummary).toEqual([
      { groupCode: '540601', groupLabel: 'บ้านหนุน', rowCount: 3, reviewCount: 0 },
      { groupCode: '540603', groupLabel: 'ห้วยหม้าย', rowCount: 2, reviewCount: 0 },
    ]);

    // Nullable villageName preserved: row 1 is null, row 2 is safe Thai string
    const sample1 = preview.data.sampleRows.find((r) => r.sourceKey === EXPECTED_H1_UUID_0001);
    const sample2 = preview.data.sampleRows.find((r) => r.sourceKey === EXPECTED_H1_UUID_0002);
    expect(sample1?.minimizedAttributes.find((a) => a.field === 'villageName')?.value).toBeNull();
    expect(sample2?.minimizedAttributes.find((a) => a.field === 'villageName')?.value).toBe(
      'หมู่บ้านตัวอย่าง_0002',
    );

    // Zero raw PII, zero HMAC key, and zero Bearer Token in any batch or finalized preview payload
    const serializedAll = JSON.stringify({ batch1, batch2, preview });
    for (const secret of [
      'SYNTHETIC-UUID-0001',
      '99990000000001',
      '1540600000001',
      'PRIVATE_FIRST_0001',
      'PRIVATE_LAST_0001',
      'นางสาว',
      'Miss',
      VALID_HMAC_KEY,
      VALID_BEARER,
      'citizenId',
      'firstName',
      'lastName',
      'fullName',
      'osmCode',
      'prefixNameTh',
      'prefixNameEn',
    ]) {
      expect(serializedAll).not.toContain(secret);
    }
  });

  it('fails closed when THAIPHC_HMAC_KEY_B64 is missing or malformed (zero key echo), and hard-blocks strict Geographic Scope, nullable villageName type errors, formula injection, cross-batch duplicates, SOURCE_TOTAL_CHANGED, INCOMPLETE_SNAPSHOT, and HTTP_401', () => {
    const validRows = [makeAssignmentRow(1)];

    // 1. Missing or malformed THAIPHC_HMAC_KEY_B64 -> STOP_BLOCKED: MISSING_HMAC_KEY (never echoes key)
    const malformedKeys = [
      undefined,
      '',
      'TOO_SHORT_KEY',
      // 43 valid base64 chars + "=" but non-canonical trailing bits ('B' has index 1, not % 4 === 0)
      `${'A'.repeat(42)}B=`,
    ];
    for (const badKey of malformedKeys) {
      const badKeyEnv = createFakeAssignmentsEnv({
        properties: { THAIPHC_HMAC_KEY_B64: badKey },
        fetchHandler: () => jsonResponse(makeAssignmentPage(validRows, 1, 10)),
      });
      const res = previewDatasetBatchWithPlatform(
        { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, pageSize: 10 },
        badKeyEnv.platform,
      );
      expect(res.ok && res.data.status === 'STOP_BLOCKED').toBe(true);
      if (res.ok && res.data.status === 'STOP_BLOCKED') {
        expect(res.data.diagnostics[0].code).toBe('MISSING_HMAC_KEY');
      }
      if (badKey && badKey.length > 0) {
        expect(JSON.stringify(res)).not.toContain(badKey);
      }
      // Must fail closed BEFORE making any outbound ThaiPHC network request
      expect(badKeyEnv.fetchCalls).toHaveLength(0);
    }

    // 2. Strict Geographic Scope (54 / 5406): out-of-district and subdistrict mismatches -> STOP_BLOCKED
    for (const badScope of [
      { provinceCode: '50' },
      { districtCode: '5407' },
      { subdistrictCode: '540609' },
      { subdistrictCode: '540201' },
      { subdistrictCode: '' },
    ]) {
      const scopeEnv = createFakeAssignmentsEnv({
        fetchHandler: () =>
          jsonResponse(makeAssignmentPage([makeAssignmentRow(1, badScope)], 1, 10)),
      });
      const res = previewDatasetBatchWithPlatform(
        { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, pageSize: 10 },
        scopeEnv.platform,
      );
      expect(res.ok && res.data.status === 'STOP_BLOCKED').toBe(true);
      if (res.ok && res.data.status === 'STOP_BLOCKED') {
        expect(res.data.diagnostics[0].code).toBe('OUT_OF_GEOGRAPHIC_SCOPE');
      }
    }

    // 2b. Opaque string villageNo (e.g. "0", "1-3") is permitted per F010, while non-string villageNo fails TYPE_MISMATCH, and unknown source field names are NEVER echoed
    const opaqueVillageEnv = createFakeAssignmentsEnv({
      fetchHandler: () =>
        jsonResponse(
          makeAssignmentPage(
            [makeAssignmentRow(1, { villageNo: '0' }), makeAssignmentRow(2, { villageNo: '1-3' })],
            1,
            10,
          ),
        ),
    });
    const opaqueRes = previewDatasetBatchWithPlatform(
      { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, pageSize: 10 },
      opaqueVillageEnv.platform,
    );
    expect(opaqueRes.ok && opaqueRes.data.status === 'BATCH_OK').toBe(true);

    const numVillageEnv = createFakeAssignmentsEnv({
      fetchHandler: () =>
        jsonResponse(makeAssignmentPage([makeAssignmentRow(1, { villageNo: 7 })], 1, 10)),
    });
    const numVillageRes = previewDatasetBatchWithPlatform(
      { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, pageSize: 10 },
      numVillageEnv.platform,
    );
    expect(numVillageRes.ok && numVillageRes.data.status === 'STOP_BLOCKED').toBe(true);
    if (numVillageRes.ok && numVillageRes.data.status === 'STOP_BLOCKED') {
      expect(numVillageRes.data.diagnostics[0].code).toBe('TYPE_MISMATCH');
    }

    const unknownFieldEnv = createFakeAssignmentsEnv({
      fetchHandler: () =>
        jsonResponse(
          makeAssignmentPage(
            [makeAssignmentRow(1, { secretUnknownField: 'TOP_SECRET_VALUE' })],
            1,
            10,
          ),
        ),
    });
    const unknownFieldRes = previewDatasetBatchWithPlatform(
      { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, pageSize: 10 },
      unknownFieldEnv.platform,
    );
    expect(unknownFieldRes.ok && unknownFieldRes.data.status === 'STOP_BLOCKED').toBe(true);
    if (unknownFieldRes.ok && unknownFieldRes.data.status === 'STOP_BLOCKED') {
      expect(unknownFieldRes.data.diagnostics[0].code).toBe('UNEXPECTED_FIELD');
      expect(JSON.stringify(unknownFieldRes)).not.toContain('secretUnknownField');
      expect(JSON.stringify(unknownFieldRes)).not.toContain('TOP_SECRET_VALUE');
    }

    // 3. Invalid villageName types (number / boolean / formula injection) -> STOP_BLOCKED
    const badVillageTypes: Array<[unknown, string]> = [
      [123, 'TYPE_MISMATCH'],
      [true, 'TYPE_MISMATCH'],
      ['=HYPERLINK("http://evil")', 'FORMULA_INJECTION_DETECTED'],
    ];
    for (const [badVillageName, expectedCode] of badVillageTypes) {
      const vtEnv = createFakeAssignmentsEnv({
        fetchHandler: () =>
          jsonResponse(
            makeAssignmentPage([makeAssignmentRow(1, { villageName: badVillageName })], 1, 10),
          ),
      });
      const res = previewDatasetBatchWithPlatform(
        { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, pageSize: 10 },
        vtEnv.platform,
      );
      expect(res.ok && res.data.status === 'STOP_BLOCKED').toBe(true);
      if (res.ok && res.data.status === 'STOP_BLOCKED') {
        expect(res.data.diagnostics[0].code).toBe(expectedCode);
        expect(JSON.stringify(res)).not.toContain('HYPERLINK');
      }
    }

    // 4. Cross-batch SOURCE_TOTAL_CHANGED when expectedSourceTotal differs
    const driftEnv = createFakeAssignmentsEnv({
      fetchHandler: () => jsonResponse(makeAssignmentPage([makeAssignmentRow(1)], 2, 1, 6)),
    });
    const driftRes = previewDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        startPage: 2,
        pageSize: 1,
        expectedSourceTotal: 5,
      },
      driftEnv.platform,
    );
    expect(driftRes.ok && driftRes.data.status === 'STOP_BLOCKED').toBe(true);
    if (driftRes.ok && driftRes.data.status === 'STOP_BLOCKED') {
      expect(driftRes.data.diagnostics[0].code).toBe('SOURCE_TOTAL_CHANGED');
    }

    // 5. Cross-batch duplicate h1_ key detected in finalizePreview -> STOP_BLOCKED: DUPLICATE_SOURCE_KEY
    const dupEnv = createFakeAssignmentsEnv({
      fetchHandler: () => jsonResponse(makeAssignmentPage(validRows, 1, 10)),
    });
    const dupDigest = 'a'.repeat(64);
    const dupFin = finalizePreviewWithPlatform(
      {
        endpoint: 'assignments',
        sourceTotal: 2,
        pagesFetched: 2,
        rowDigests: [
          { key: EXPECTED_H1_UUID_0001, rowDigest: dupDigest },
          { key: EXPECTED_H1_UUID_0001, rowDigest: dupDigest },
        ],
        aggregateSummary: [],
        sampleCandidates: [],
      },
      dupEnv.platform,
    );
    expect(dupFin.ok && dupFin.data.status === 'STOP_BLOCKED').toBe(true);
    if (dupFin.ok && dupFin.data.status === 'STOP_BLOCKED') {
      expect(dupFin.data.diagnostics[0].code).toBe('DUPLICATE_SOURCE_KEY');
    }

    // 6. HTTP_401 returns RPC error without echoing token
    const authEnv = createFakeAssignmentsEnv({
      fetchHandler: () => jsonResponse({ error: 'unauthorized' }, 401),
    });
    const authRes = previewDatasetBatchWithPlatform(
      { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, pageSize: 10 },
      authEnv.platform,
    );
    expect(authRes.ok).toBe(false);
    if (!authRes.ok) {
      expect(authRes.error.code).toBe('HTTP_401');
    }
    expect(JSON.stringify(authRes)).not.toContain(VALID_BEARER);
  });

  it('commits assignments via multi-batch hidden _Stage_assignments_<runId> tab, verifies under LockService, applies 25-column Keyed Upsert preserving legacy RAssign_* and ชีต1, cleans up _Stage_* only after Destination Readback passes, and supports repeatable INSERT/UPDATE/UNCHANGED/MISSING_IN_SOURCE', () => {
    let sourceRows = [1, 2, 3, 4, 5].map((i) => makeAssignmentRow(i));

    const env = createFakeAssignmentsEnv({
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
                ['assignments', 'f010_20261119', 'RAssign_f010_20261119', 1571, 'b'.repeat(64)],
              ],
            },
            {
              name: 'RAssign_f010_20261119',
              rows: [['{"status":"PUBLISHED"}'], ['_source_key', 'provinceCode']],
            },
          ],
        },
      },
      fetchHandler: (url) => {
        const parsed = new URL(url);
        const page = Number(parsed.searchParams.get('page'));
        const pageSize = Number(parsed.searchParams.get('pageSize'));
        return jsonResponse(makeAssignmentPage(sourceRows, page, pageSize));
      },
    });

    const runBatchedPreview = () => {
      const b1 = previewDatasetBatchWithPlatform(
        { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, batchPages: 2, pageSize: 2 },
        env.platform,
      );
      if (!b1.ok || b1.data.status !== 'BATCH_OK') throw new Error('expected batch 1 ok');
      const allDigests = [...b1.data.rowDigests];
      const allAgg = [...b1.data.aggregateSummary];
      const allSamples = [...b1.data.sampleCandidates];
      let pagesFetched = b1.data.pagesFetchedInBatch;
      let nextPage = b1.data.nextPage;
      while (nextPage !== null) {
        const bn = previewDatasetBatchWithPlatform(
          {
            endpoint: 'assignments',
            token: VALID_BEARER,
            startPage: nextPage,
            batchPages: 2,
            pageSize: 2,
            expectedSourceTotal: b1.data.sourceTotal,
          },
          env.platform,
        );
        if (!bn.ok || bn.data.status !== 'BATCH_OK') throw new Error('expected batch n ok');
        allDigests.push(...bn.data.rowDigests);
        allAgg.push(...bn.data.aggregateSummary);
        allSamples.push(...bn.data.sampleCandidates);
        pagesFetched += bn.data.pagesFetchedInBatch;
        nextPage = bn.data.nextPage;
      }
      const fin = finalizePreviewWithPlatform(
        {
          endpoint: 'assignments',
          sourceTotal: b1.data.sourceTotal,
          pagesFetched,
          rowDigests: allDigests,
          aggregateSummary: allAgg,
          sampleCandidates: allSamples,
        },
        env.platform,
      );
      if (!fin.ok || fin.data.status !== 'READY') throw new Error('expected READY');
      return fin.data;
    };

    // --- Run 1: Initial 5 INSERTs through multi-batch hidden _Stage_assignments_<runId> ---
    const preview1 = runBatchedPreview();
    expect(preview1.counts).toEqual({ insert: 5, update: 0, unchanged: 0, review: 0 });
    expect(preview1.legacySnapshotPresent).toBe(true);

    const stage1 = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: preview1.fingerprint,
        startPage: 1,
        batchPages: 2,
        pageSize: 2,
      },
      env.platform,
    );
    expect(stage1.ok).toBe(true);
    if (!stage1.ok || stage1.data.status !== 'BATCH_STAGED') {
      throw new Error(`Expected BATCH_STAGED on stage 1, got: ${JSON.stringify(stage1)}`);
    }
    expect(stage1.data.stagedRowCount).toBe(4);
    expect(stage1.data.hasMore).toBe(true);
    expect(stage1.data.nextPage).toBe(3);

    const reportWb = env.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    const stageTabName = stage1.data.stagingTabName;
    expect(stageTabName).toMatch(/^_Stage_assignments_/);
    const stageSheet = reportWb.sheets.get(stageTabName);
    expect(stageSheet).toBeDefined();
    expect(stageSheet!.hidden).toBe(true);
    // Live Assignments tab NOT touched during staging
    expect(reportWb.sheets.has('Assignments')).toBe(false);
    // Zero raw PII inside staging tab
    expect(JSON.stringify(stageSheet!.rows)).not.toMatch(
      /SYNTHETIC-UUID|PRIVATE_FIRST|PRIVATE_LAST|154060000|9999000000/,
    );

    const stage2 = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: preview1.fingerprint,
        runId: stage1.data.runId,
        startPage: 3,
        batchPages: 2,
        pageSize: 2,
      },
      env.platform,
    );
    expect(stage2.ok).toBe(true);
    if (!stage2.ok || stage2.data.status !== 'BATCH_STAGED') {
      throw new Error(`Expected BATCH_STAGED on stage 2, got: ${JSON.stringify(stage2)}`);
    }
    expect(stage2.data.stagedRowCount).toBe(5);
    expect(stage2.data.hasMore).toBe(false);
    expect(stage2.data.nextPage).toBeNull();

    const commit1 = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'assignments',
        expectedFingerprint: preview1.fingerprint,
        runId: stage1.data.runId,
      },
      env.platform,
    );
    expect(commit1.ok).toBe(true);
    if (!commit1.ok || commit1.data.status !== 'COMMITTED_VERIFIED') {
      throw new Error(`Expected COMMITTED_VERIFIED, got: ${JSON.stringify(commit1)}`);
    }
    expect(commit1.data.destinationTab).toBe('Assignments');
    expect(commit1.data.counts).toEqual({ insert: 5, update: 0, unchanged: 0, review: 0 });
    expect(commit1.data.readback.verified).toBe(true);
    expect(commit1.data.readback.stagingTabCleaned).toBe(true);
    expect(commit1.data.readback.unrelatedTabsPreserved).toBe(true);
    expect(commit1.data.syncLogStatus).toBe('COMMITTED_VERIFIED');

    // Ephemeral _Stage_* tab MUST be deleted after readback passes
    expect(reportWb.sheets.has(stageTabName)).toBe(false);

    // Legacy RAssign_* tab, _ThaiPHCReportCurrent, and ชีต1 preserved untouched
    expect(reportWb.sheets.has('RAssign_f010_20261119')).toBe(true);
    expect(reportWb.sheets.has('_ThaiPHCReportCurrent')).toBe(true);
    expect(reportWb.sheets.has('ชีต1')).toBe(true);

    // Verify Assignments tab has exact 25 columns (17 approved + 8 metadata), plain-text formats, native boolean isActive, null vs "" preserved, and ZERO PII
    const assignSheet = reportWb.sheets.get('Assignments')!;
    expect(assignSheet.rows).toHaveLength(6); // 1 header + 5 rows
    expect(assignSheet.rows[0]).toEqual([
      'provinceCode',
      'provinceNameTh',
      'districtCode',
      'districtNameTh',
      'subdistrictCode',
      'subdistrictNameTh',
      'villageNo',
      'villageName',
      'isActive',
      'status',
      'osmStatus',
      'osmShowbbody',
      'approvalStatus',
      'volunteerStatus',
      'createdAt',
      'requestDate',
      'updatedAt',
      '_schema_version',
      '_sync_run_id',
      '_source_key',
      '_fetched_at_utc',
      '_quality_status',
      '_field_presence_json',
      '_last_seen_run_id',
      '_row_digest',
    ]);
    // Row 1 (index 1): villageName=null -> cell '', presence.villageName='NULL'; osmStatus='' -> presence.osmStatus='VALUE'; isActive=true (boolean)
    expect(assignSheet.rows[1][7]).toBe('');
    expect(assignSheet.rows[1][8]).toBe(true);
    expect(assignSheet.rows[1][19]).toBe(EXPECTED_H1_UUID_0001);
    const presenceRow1 = JSON.parse(String(assignSheet.rows[1][22]));
    expect(presenceRow1.villageName).toBe('NULL');
    expect(presenceRow1.osmStatus).toBe('VALUE');
    expect(presenceRow1).not.toHaveProperty('id');
    expect(presenceRow1).not.toHaveProperty('citizenId');
    // Row 2 (index 2): villageName='หมู่บ้านตัวอย่าง_0002' preserved
    expect(assignSheet.rows[2][7]).toBe('หมู่บ้านตัวอย่าง_0002');
    expect(assignSheet.rows[2][19]).toBe(EXPECTED_H1_UUID_0002);
    // Plain-text '@' format on text & metadata columns, NOT on column 9 (isActive boolean)
    expect(assignSheet.numberFormats.get('C1')).toBe('@');
    expect(assignSheet.numberFormats.get('C9')).toBeUndefined();
    expect(assignSheet.numberFormats.get('C20')).toBe('@');
    expect(JSON.stringify(assignSheet.rows)).not.toMatch(
      /SYNTHETIC-UUID|PRIVATE_FIRST|PRIVATE_LAST|154060000|9999000000/,
    );

    // --- Run 2: Repeatable Keyed Upsert (1 UPDATE, 1 INSERT, 3 UNCHANGED, 1 non-destructive MISSING_IN_SOURCE) ---
    sourceRows = [
      makeAssignmentRow(1, { villageName: 'หนุนเหนือ (อัปเดต)', isActive: false }), // UPDATE
      makeAssignmentRow(2), // UNCHANGED
      makeAssignmentRow(3), // UNCHANGED
      makeAssignmentRow(4), // UNCHANGED
      // Row 5 omitted -> MISSING_IN_SOURCE (REVIEW, never auto-deleted!)
      makeAssignmentRow(6), // INSERT
    ];

    const preview2 = runBatchedPreview();
    expect(preview2.legacySnapshotPresent).toBe(false); // Fixed Assignments tab now exists
    expect(preview2.counts).toEqual({ insert: 1, update: 1, unchanged: 3, review: 1 });
    expect(preview2.reviewBreakdown).toEqual({ MISSING_IN_SOURCE: 1 });

    const s2b1 = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: preview2.fingerprint,
        startPage: 1,
        batchPages: 5,
        pageSize: 5,
      },
      env.platform,
    );
    if (!s2b1.ok || s2b1.data.status !== 'BATCH_STAGED') throw new Error('expected BATCH_STAGED');
    const commit2 = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'assignments',
        expectedFingerprint: preview2.fingerprint,
        runId: s2b1.data.runId,
      },
      env.platform,
    );
    expect(commit2.ok && commit2.data.status === 'COMMITTED_VERIFIED').toBe(true);
    if (commit2.ok && commit2.data.status === 'COMMITTED_VERIFIED') {
      expect(commit2.data.counts).toEqual({ insert: 1, update: 1, unchanged: 3, review: 1 });
      expect(commit2.data.readback.expectedRowCount).toBe(6); // 5 + 1 insert (missing row 5 kept!)
      expect(commit2.data.readback.actualRowCount).toBe(6);
      expect(commit2.data.readback.stagingTabCleaned).toBe(true);
    }
    // Updated row 1 in-place, row 5 preserved, row 6 appended
    expect(assignSheet.rows).toHaveLength(7); // 1 header + 6 rows
    expect(assignSheet.rows[1][7]).toBe('หนุนเหนือ (อัปเดต)');
    expect(assignSheet.rows[1][8]).toBe(false);
    expect(reportWb.sheets.has(s2b1.data.stagingTabName)).toBe(false);
  });

  it('halts with PREVIEW_STALE_RECONFIRM_REQUIRED before live tab mutation on source or destination drift, and retains hidden _Stage_* tab on READBACK_MISMATCH and UNKNOWN_OUTCOME_STOP', () => {
    let sourceRows = [1, 2, 3].map((i) => makeAssignmentRow(i));

    const env = createFakeAssignmentsEnv({
      fetchHandler: (url) => {
        const parsed = new URL(url);
        const page = Number(parsed.searchParams.get('page'));
        const pageSize = Number(parsed.searchParams.get('pageSize'));
        return jsonResponse(makeAssignmentPage(sourceRows, page, pageSize));
      },
    });

    const b1 = previewDatasetBatchWithPlatform(
      { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, batchPages: 5, pageSize: 10 },
      env.platform,
    );
    if (!b1.ok || b1.data.status !== 'BATCH_OK') throw new Error('expected BATCH_OK');
    const prev = finalizePreviewWithPlatform(
      {
        endpoint: 'assignments',
        sourceTotal: 3,
        pagesFetched: 1,
        rowDigests: b1.data.rowDigests,
        aggregateSummary: b1.data.aggregateSummary,
        sampleCandidates: b1.data.sampleCandidates,
      },
      env.platform,
    );
    if (!prev.ok || prev.data.status !== 'READY') throw new Error('expected READY');

    // 1. Source row content changes (same total=3) between Preview and Commit finalize -> PREVIEW_STALE_RECONFIRM_REQUIRED (SOURCE_CHANGED), zero live tab writes, _Stage_* retained hidden
    sourceRows = [
      makeAssignmentRow(1, { volunteerStatus: 'changed_after_preview' }),
      makeAssignmentRow(2),
      makeAssignmentRow(3),
    ];
    const stagedDrifted = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: prev.data.fingerprint,
        startPage: 1,
        batchPages: 5,
        pageSize: 10,
      },
      env.platform,
    );
    expect(stagedDrifted.ok && stagedDrifted.data.status === 'BATCH_STAGED').toBe(true);
    if (!stagedDrifted.ok || stagedDrifted.data.status !== 'BATCH_STAGED')
      throw new Error('staged');

    const staleFinalize = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'assignments',
        expectedFingerprint: prev.data.fingerprint,
        runId: stagedDrifted.data.runId,
      },
      env.platform,
    );
    expect(staleFinalize.ok).toBe(true);
    if (!staleFinalize.ok || staleFinalize.data.status !== 'PREVIEW_STALE_RECONFIRM_REQUIRED') {
      throw new Error(
        `Expected PREVIEW_STALE_RECONFIRM_REQUIRED, got: ${JSON.stringify(staleFinalize)}`,
      );
    }
    expect(staleFinalize.data.driftReason).toBe('SOURCE_CHANGED');
    const reportWb = env.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    // Live Assignments tab was NEVER created or mutated; _ThaiPHCSyncLog was NOT polluted with STARTED; _Stage_* stays hidden
    expect(reportWb.sheets.has('Assignments')).toBe(false);
    expect(reportWb.sheets.has('_ThaiPHCSyncLog')).toBe(false);
    expect(reportWb.sheets.get(stagedDrifted.data.stagingTabName)?.hidden).toBe(true);

    // 2. UNKNOWN_OUTCOME_STOP when live Assignments write throws -> _ThaiPHCSyncLog stays STARTED and hidden _Stage_* is RETAINED
    const failWriteRows = [1, 2].map((i) => makeAssignmentRow(i));
    const failEnv = createFakeAssignmentsEnv({
      failWriteOnTab: 'Assignments',
      fetchHandler: () => jsonResponse(makeAssignmentPage(failWriteRows, 1, 10)),
    });
    const fb = previewDatasetBatchWithPlatform(
      { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, pageSize: 10 },
      failEnv.platform,
    );
    if (!fb.ok || fb.data.status !== 'BATCH_OK') throw new Error('expected BATCH_OK');
    const fp = finalizePreviewWithPlatform(
      {
        endpoint: 'assignments',
        sourceTotal: 2,
        pagesFetched: 1,
        rowDigests: fb.data.rowDigests,
        aggregateSummary: fb.data.aggregateSummary,
        sampleCandidates: fb.data.sampleCandidates,
      },
      failEnv.platform,
    );
    if (!fp.ok || fp.data.status !== 'READY') throw new Error('expected READY');
    const fStage = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: fp.data.fingerprint,
        startPage: 1,
        pageSize: 10,
      },
      failEnv.platform,
    );
    if (!fStage.ok || fStage.data.status !== 'BATCH_STAGED') throw new Error('expected staged');

    const unknownStop = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'assignments',
        expectedFingerprint: fp.data.fingerprint,
        runId: fStage.data.runId,
      },
      failEnv.platform,
    );
    expect(unknownStop.ok).toBe(true);
    if (!unknownStop.ok || unknownStop.data.status !== 'UNKNOWN_OUTCOME_STOP') {
      throw new Error(`Expected UNKNOWN_OUTCOME_STOP, got: ${JSON.stringify(unknownStop)}`);
    }
    expect(unknownStop.data.syncLogStatus).toBe('STARTED');
    expect(unknownStop.data.stagingTabRetained).toBe(fStage.data.stagingTabName);
    const failWb = failEnv.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    // Hidden staging tab MUST remain present for operator inspection
    expect(failWb.sheets.has(fStage.data.stagingTabName)).toBe(true);
    expect(failWb.sheets.get(fStage.data.stagingTabName)?.hidden).toBe(true);

    // 3. UNRESOLVED_PREVIOUS_RUN recovery: subsequent Preview surfaces unresolvedPreviousRun; Commit blocks until acknowledged
    const recoveryPreview = finalizePreviewWithPlatform(
      {
        endpoint: 'assignments',
        sourceTotal: 2,
        pagesFetched: 1,
        rowDigests: fb.data.rowDigests,
        aggregateSummary: fb.data.aggregateSummary,
        sampleCandidates: fb.data.sampleCandidates,
      },
      failEnv.platform,
    );
    expect(recoveryPreview.ok && recoveryPreview.data.status === 'READY').toBe(true);
    if (recoveryPreview.ok && recoveryPreview.data.status === 'READY') {
      expect(recoveryPreview.data.unresolvedPreviousRun?.runId).toBe(fStage.data.runId);
      const unackStage = stageLargeDatasetBatchWithPlatform(
        {
          endpoint: 'assignments',
          token: VALID_BEARER,
          expectedFingerprint: recoveryPreview.data.fingerprint,
          startPage: 1,
          pageSize: 10,
        },
        failEnv.platform,
      );
      expect(unackStage.ok && unackStage.data.status === 'FAILED_STOP').toBe(true);
      if (unackStage.ok && unackStage.data.status === 'FAILED_STOP') {
        expect(unackStage.data.stopCode).toBe('UNRESOLVED_PREVIOUS_RUN');
      }
    }

    // 4. READBACK_MISMATCH retains hidden _Stage_* tab and marks _ThaiPHCSyncLog FAILED_STOP
    const corruptReadbackEnv = createFakeAssignmentsEnv({
      fetchHandler: () => jsonResponse(makeAssignmentPage(failWriteRows, 1, 10)),
    });
    const cb = previewDatasetBatchWithPlatform(
      { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, pageSize: 10 },
      corruptReadbackEnv.platform,
    );
    if (!cb.ok || cb.data.status !== 'BATCH_OK') throw new Error('expected BATCH_OK');
    const cp = finalizePreviewWithPlatform(
      {
        endpoint: 'assignments',
        sourceTotal: 2,
        pagesFetched: 1,
        rowDigests: cb.data.rowDigests,
        aggregateSummary: cb.data.aggregateSummary,
        sampleCandidates: cb.data.sampleCandidates,
      },
      corruptReadbackEnv.platform,
    );
    if (!cp.ok || cp.data.status !== 'READY') throw new Error('expected READY');
    const cStage = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: cp.data.fingerprint,
        startPage: 1,
        pageSize: 10,
      },
      corruptReadbackEnv.platform,
    );
    if (!cStage.ok || cStage.data.status !== 'BATCH_STAGED') throw new Error('expected staged');

    // Simulate silent data corruption right after flushSpreadsheet inside finalize commit
    const origFlush = corruptReadbackEnv.platform.flushSpreadsheet;
    let flushIdx = 0;
    corruptReadbackEnv.platform.flushSpreadsheet = () => {
      flushIdx += 1;
      origFlush();
      // 2nd flush in finalize is right after Assignments write & right before Destination Readback
      if (flushIdx === 2) {
        const sheet = corruptReadbackEnv.workbookStates
          .get(VALID_REPORT_SHEET_ID)!
          .sheets.get('Assignments');
        if (sheet && sheet.rows[1]) {
          sheet.rows[1][24] = 'corrupted_digest';
        }
      }
    };

    const rbStop = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'assignments',
        expectedFingerprint: cp.data.fingerprint,
        runId: cStage.data.runId,
      },
      corruptReadbackEnv.platform,
    );
    expect(rbStop.ok).toBe(true);
    if (!rbStop.ok || rbStop.data.status !== 'FAILED_STOP') {
      throw new Error(`Expected FAILED_STOP READBACK_MISMATCH, got: ${JSON.stringify(rbStop)}`);
    }
    expect(rbStop.data.stopCode).toBe('READBACK_MISMATCH');
    expect(rbStop.data.syncLogStatus).toBe('FAILED_STOP');
    expect(rbStop.data.stagingTabRetained).toBe(cStage.data.stagingTabName);
    const corruptWb = corruptReadbackEnv.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    expect(corruptWb.sheets.has(cStage.data.stagingTabName)).toBe(true);
    expect(corruptWb.sheets.get(cStage.data.stagingTabName)?.hidden).toBe(true);
  });

  it('enforces Write Guards, PRODUCTION typed confirmation phrase, LockService busy rejection, and UNRESOLVED_PREVIOUS_RUN acknowledgment on assignments Commit', () => {
    const rows = [makeAssignmentRow(1)];
    const makeProdEnv = (
      overrides: Record<string, string | undefined> = {},
      lockAvailable = true,
    ) =>
      createFakeAssignmentsEnv({
        properties: {
          THAIPHC_ENV: 'PRODUCTION',
          THAIPHC_WRITE_ENABLED: 'true',
          THAIPHC_PERSON_DATA_WRITE_ENABLED: 'true',
          ...overrides,
        },
        workbooks: {
          [VALID_REF_SHEET_ID]: {
            name: 'ThaiPHC Reference Prod',
            initialSheets: [{ name: 'ชีต1', rows: [['keep']] }],
          },
          [VALID_REPORT_SHEET_ID]: {
            name: 'ThaiPHC Reports Prod',
            initialSheets: [
              { name: 'ชีต1', rows: [['keep']] },
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
                    'run_prev_stuck_01',
                    '2026-11-21T02:00:00.000Z',
                    'PRODUCTION',
                    'assignments',
                    'KEYED_UPSERT',
                    'STARTED',
                    'a'.repeat(64),
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
        },
        lockAvailable,
        fetchHandler: () => jsonResponse(makeAssignmentPage(rows, 1, 10)),
      });

    const prodEnv = makeProdEnv();
    const pb = previewDatasetBatchWithPlatform(
      { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, pageSize: 10 },
      prodEnv.platform,
    );
    if (!pb.ok || pb.data.status !== 'BATCH_OK') throw new Error('expected BATCH_OK');
    const pf = finalizePreviewWithPlatform(
      {
        endpoint: 'assignments',
        sourceTotal: 1,
        pagesFetched: 1,
        rowDigests: pb.data.rowDigests,
        aggregateSummary: pb.data.aggregateSummary,
        sampleCandidates: pb.data.sampleCandidates,
      },
      prodEnv.platform,
    );
    if (!pf.ok || pf.data.status !== 'READY') throw new Error('expected READY');
    expect(pf.data.unresolvedPreviousRun?.runId).toBe('run_prev_stuck_01');

    // 1. Missing PRODUCTION typed confirmation phrase fails closed
    const badPhrase = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: pf.data.fingerprint,
        confirmationPhrase: 'PRODUCTION 5406 volunteer-gender',
        acknowledgeUnresolvedRunId: 'run_prev_stuck_01',
        startPage: 1,
        pageSize: 10,
      },
      prodEnv.platform,
    );
    expect(badPhrase.ok && badPhrase.data.status === 'FAILED_STOP').toBe(true);
    if (badPhrase.ok && badPhrase.data.status === 'FAILED_STOP') {
      expect(badPhrase.data.stopCode).toBe('PRODUCTION_CONFIRMATION_REQUIRED');
    }

    // 2. LockService busy rejects cleanly
    const busyEnv = makeProdEnv({}, false);
    const busyRes = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: pf.data.fingerprint,
        confirmationPhrase: 'PRODUCTION 5406 assignments',
        acknowledgeUnresolvedRunId: 'run_prev_stuck_01',
        startPage: 1,
        pageSize: 10,
      },
      busyEnv.platform,
    );
    expect(busyRes.ok && busyRes.data.status === 'FAILED_STOP').toBe(true);
    if (busyRes.ok && busyRes.data.status === 'FAILED_STOP') {
      expect(busyRes.data.stopCode).toBe('LOCK_BUSY');
    }

    // 3. Exact phrase + acknowledged unresolved run succeeds cleanly end-to-end
    const okStage = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: pf.data.fingerprint,
        confirmationPhrase: 'PRODUCTION 5406 assignments',
        acknowledgeUnresolvedRunId: 'run_prev_stuck_01',
        startPage: 1,
        pageSize: 10,
      },
      prodEnv.platform,
    );
    expect(okStage.ok && okStage.data.status === 'BATCH_STAGED').toBe(true);
    if (!okStage.ok || okStage.data.status !== 'BATCH_STAGED') throw new Error('expected staged');

    const okCommit = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'assignments',
        expectedFingerprint: pf.data.fingerprint,
        runId: okStage.data.runId,
        confirmationPhrase: 'PRODUCTION 5406 assignments',
        acknowledgeUnresolvedRunId: 'run_prev_stuck_01',
      },
      prodEnv.platform,
    );
    expect(okCommit.ok && okCommit.data.status === 'COMMITTED_VERIFIED').toBe(true);
    if (okCommit.ok && okCommit.data.status === 'COMMITTED_VERIFIED') {
      expect(okCommit.data.readback.verified).toBe(true);
      expect(okCommit.data.readback.stagingTabCleaned).toBe(true);
    }

    // 4. Write guard OFF blocks commit fail-closed
    const guardOffEnv = makeProdEnv({ THAIPHC_PERSON_DATA_WRITE_ENABLED: 'false' });
    const guardRes = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: pf.data.fingerprint,
        confirmationPhrase: 'PRODUCTION 5406 assignments',
        acknowledgeUnresolvedRunId: 'run_prev_stuck_01',
        startPage: 1,
        pageSize: 10,
      },
      guardOffEnv.platform,
    );
    expect(guardRes.ok && guardRes.data.status === 'FAILED_STOP').toBe(true);
    if (guardRes.ok && guardRes.data.status === 'FAILED_STOP') {
      expect(guardRes.data.stopCode).toBe('PERSON_DATA_WRITE_DISABLED');
    }
  });

  it('catches DESTINATION_CHANGED before staging and at finalize, rejects STAGING_DIGEST_MISMATCH and missing HMAC key at finalize, and prioritizes REVIEW/UPDATE samples ahead of UNCHANGED rows', () => {
    // 1. Seed 56 committed rows so we can verify both destination-drift and 50-row sample prioritization
    let sourceRows = Array.from({ length: 56 }, (_, idx) => makeAssignmentRow(idx + 1));
    let hmacKeyValue: string | undefined = VALID_HMAC_KEY;

    const env = createFakeAssignmentsEnv({
      fetchHandler: (url) => {
        const parsed = new URL(url);
        const page = Number(parsed.searchParams.get('page'));
        const pageSize = Number(parsed.searchParams.get('pageSize'));
        return jsonResponse(makeAssignmentPage(sourceRows, page, pageSize));
      },
    });
    const origGetProperty = env.platform.getProperty;
    env.platform.getProperty = (key: string) =>
      key === 'THAIPHC_HMAC_KEY_B64' ? (hmacKeyValue ?? null) : origGetProperty(key);

    const previewAll = () => {
      const b1 = previewDatasetBatchWithPlatform(
        { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, batchPages: 5, pageSize: 60 },
        env.platform,
      );
      if (!b1.ok || b1.data.status !== 'BATCH_OK') throw new Error('expected BATCH_OK');
      const fin = finalizePreviewWithPlatform(
        {
          endpoint: 'assignments',
          sourceTotal: b1.data.sourceTotal,
          pagesFetched: b1.data.pagesFetchedInBatch,
          rowDigests: b1.data.rowDigests,
          aggregateSummary: b1.data.aggregateSummary,
          sampleCandidates: [
            ...b1.data.sampleCandidates,
            // Include row 55 candidate explicitly (simulating a multi-batch later-batch update)
            {
              sourceKey: b1.data.rowDigests[54].key,
              rowDigest: b1.data.rowDigests[54].rowDigest,
              scopeLabel: '54 / 5406 · 540601 บ้านหนุน · หมู่ 7',
              minimizedAttributes: [{ field: 'status', value: 'อัปเดต' }],
              reviewReasons: [],
            },
          ],
        },
        env.platform,
      );
      if (!fin.ok || fin.data.status !== 'READY' || fin.data.previewMode !== 'EXTENDED_MINIMIZED') {
        throw new Error('expected READY EXTENDED_MINIMIZED');
      }
      return fin.data;
    };

    // Initial commit of 56 rows
    const pInit = previewAll();
    const sInit = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: pInit.fingerprint,
        startPage: 1,
        batchPages: 5,
        pageSize: 60,
      },
      env.platform,
    );
    if (!sInit.ok || sInit.data.status !== 'BATCH_STAGED') throw new Error('expected staged');
    const cInit = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'assignments',
        expectedFingerprint: pInit.fingerprint,
        runId: sInit.data.runId,
      },
      env.platform,
    );
    expect(cInit.ok && cInit.data.status === 'COMMITTED_VERIFIED').toBe(true);

    // 2. Preview prioritization: 54 leading UNCHANGED + row 55 UPDATE + row 56 MISSING_IN_SOURCE (REVIEW)
    sourceRows = [
      ...Array.from({ length: 54 }, (_, idx) => makeAssignmentRow(idx + 1)),
      makeAssignmentRow(55, { status: 'อัปเดต' }),
    ];
    const pDiff = previewAll();
    expect(pDiff.counts).toEqual({ insert: 0, update: 1, unchanged: 54, review: 1 });
    expect(pDiff.sampleRows.some((r) => r.diffKind === 'REVIEW')).toBe(true);
    expect(pDiff.sampleRows.some((r) => r.diffKind === 'UPDATE')).toBe(true);

    const reportWb = env.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    const assignSheet = reportWb.sheets.get('Assignments')!;

    // 3. Stage clean batch, then test MISSING_HMAC_KEY at finalize -> FAILED_STOP before live write
    const sNext = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: pDiff.fingerprint,
        startPage: 1,
        batchPages: 5,
        pageSize: 60,
      },
      env.platform,
    );
    if (!sNext.ok || sNext.data.status !== 'BATCH_STAGED') throw new Error('expected staged');

    hmacKeyValue = 'INVALID_HMAC_KEY';
    const noHmacFin = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'assignments',
        expectedFingerprint: pDiff.fingerprint,
        runId: sNext.data.runId,
      },
      env.platform,
    );
    expect(noHmacFin.ok && noHmacFin.data.status === 'FAILED_STOP').toBe(true);
    if (noHmacFin.ok && noHmacFin.data.status === 'FAILED_STOP') {
      expect(noHmacFin.data.stopCode).toBe('MISSING_HMAC_KEY');
    }
    expect(reportWb.sheets.has(sNext.data.stagingTabName)).toBe(true);
    hmacKeyValue = VALID_HMAC_KEY;

    // 4. Tamper a cell in hidden _Stage_* tab -> STAGING_DIGEST_MISMATCH before live mutation, _Stage_* retained
    const stageSheet = reportWb.sheets.get(sNext.data.stagingTabName)!;
    const originalStagedVal = stageSheet.rows[2][10];
    stageSheet.rows[2][10] = 'TAMPERED_STATUS';
    const tamperedFin = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'assignments',
        expectedFingerprint: pDiff.fingerprint,
        runId: sNext.data.runId,
      },
      env.platform,
    );
    expect(tamperedFin.ok && tamperedFin.data.status === 'FAILED_STOP').toBe(true);
    if (tamperedFin.ok && tamperedFin.data.status === 'FAILED_STOP') {
      expect(tamperedFin.data.stopCode).toBe('STAGING_DIGEST_MISMATCH');
      expect(tamperedFin.data.stagingTabRetained).toBe(sNext.data.stagingTabName);
    }
    expect(reportWb.sheets.has(sNext.data.stagingTabName)).toBe(true);
    stageSheet.rows[2][10] = originalStagedVal;

    // 5. External out-of-band edit to live Assignments tab between staging and finalize -> PREVIEW_STALE_RECONFIRM_REQUIRED (DESTINATION_CHANGED)
    assignSheet.rows[1][9] = 'EDITED_EXTERNALLY';
    const destDriftFin = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'assignments',
        expectedFingerprint: pDiff.fingerprint,
        runId: sNext.data.runId,
      },
      env.platform,
    );
    expect(destDriftFin.ok && destDriftFin.data.status === 'PREVIEW_STALE_RECONFIRM_REQUIRED').toBe(
      true,
    );
    if (destDriftFin.ok && destDriftFin.data.status === 'PREVIEW_STALE_RECONFIRM_REQUIRED') {
      expect(destDriftFin.data.driftReason).toBe('DESTINATION_CHANGED');
    }
    // Live row 55 was NOT mutated
    expect(assignSheet.rows[55][9]).toBe('ใช้งาน');

    // 6. DESTINATION_CHANGED detected immediately on stage batch 1 -> stops BEFORE creating any new _Stage_* tab
    const sheetCountBefore = reportWb.sheets.size;
    const destDriftStage1 = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: pDiff.fingerprint,
        startPage: 1,
        batchPages: 5,
        pageSize: 60,
      },
      env.platform,
    );
    expect(
      destDriftStage1.ok && destDriftStage1.data.status === 'PREVIEW_STALE_RECONFIRM_REQUIRED',
    ).toBe(true);
    if (destDriftStage1.ok && destDriftStage1.data.status === 'PREVIEW_STALE_RECONFIRM_REQUIRED') {
      expect(destDriftStage1.data.driftReason).toBe('DESTINATION_CHANGED');
    }
    expect(reportWb.sheets.size).toBe(sheetCountBefore);
  });
});
