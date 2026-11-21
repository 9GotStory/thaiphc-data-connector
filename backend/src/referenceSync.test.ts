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
const VALID_BEARER = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.synthetic_token_payload_12345';

interface MockSheetState {
  name: string;
  rows: unknown[][];
  maxRows: number;
  maxColumns: number;
  frozenRows: number;
  numberFormats: Map<string, string>;
  writeOps: string[];
}

function makeSubdistrictRow(
  code: string,
  nameTh: string,
  nameEn: string,
  postalCode = '54120',
): Record<string, unknown> {
  return {
    code,
    id: code,
    name_th: nameTh,
    name_en: nameEn,
    postal_code: postalCode,
    label: `${nameTh} / ${nameEn}`,
    district_code: '5406',
    district_name_th: 'สอง',
    district_name_en: 'Song',
    province_code: null,
    province_name_th: null,
    province_name_en: null,
  };
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

interface FakeSyncEnvOptions {
  properties?: Record<string, string | undefined>;
  initialSheets?: Array<{ name: string; rows: unknown[][] }>;
  fetchHandler: (url: string, options: HttpFetchOptions) => HttpFetchResponse;
  lockAvailable?: boolean;
  failWriteOnTab?: string;
  nowIso?: string;
}

function createFakeSyncEnv(opts: FakeSyncEnvOptions) {
  const sheets = new Map<string, MockSheetState>();
  const sheetOrder: string[] = [];
  const fetchCalls: Array<{ url: string; options: HttpFetchOptions }> = [];
  const lockEvents: string[] = [];
  let flushCount = 0;
  let runSeq = 0;

  for (const s of opts.initialSheets ?? [{ name: 'ชีต1', rows: [['keep-me']] }]) {
    const cloned = s.rows.map((r) => [...r]);
    const maxCols = Math.max(26, ...cloned.map((r) => r.length));
    const maxRows = Math.max(100, cloned.length + 10);
    sheets.set(s.name, {
      name: s.name,
      rows: cloned,
      maxRows,
      maxColumns: maxCols,
      frozenRows: 0,
      numberFormats: new Map(),
      writeOps: [],
    });
    sheetOrder.push(s.name);
  }

  function wrapMockSheet(state: MockSheetState): WritableSheetHandle {
    return {
      getName: () => state.name,
      getLastRow: () => state.rows.length,
      getLastColumn: () => state.rows.reduce((max, r) => Math.max(max, r.length), 0),
      getMaxRows: () => state.maxRows,
      getMaxColumns: () => state.maxColumns,
      insertColumnsAfter: (afterPos: number, howMany: number) => {
        if (afterPos !== state.maxColumns || howMany < 1) {
          throw new Error('INVALID_INSERT_COLS');
        }
        state.maxColumns += howMany;
        state.writeOps.push(`insertCols:${howMany}`);
      },
      insertRowsAfter: (afterPos: number, howMany: number) => {
        if (afterPos !== state.maxRows || howMany < 1) {
          throw new Error('INVALID_INSERT_ROWS');
        }
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
        if (opts.failWriteOnTab === state.name && row >= 2) {
          throw new Error('SIMULATED_SHEETS_WRITE_FAILURE');
        }
        const numRows = values.length;
        const numCols = values[0]?.length ?? 0;
        if (row - 1 + numRows > state.maxRows || col - 1 + numCols > state.maxColumns) {
          throw new Error(`RANGE_OUT_OF_BOUNDS:${state.name}`);
        }
        for (let r = 0; r < numRows; r++) {
          const targetIdx = row - 1 + r;
          while (state.rows.length <= targetIdx) {
            state.rows.push([]);
          }
          const targetRow = state.rows[targetIdx];
          for (let c = 0; c < numCols; c++) {
            targetRow[col - 1 + c] = values[r][c];
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

  const spreadsheet: WritableSpreadsheetHandle = {
    getName: () => 'ThaiPHC Data (Sandbox Test)',
    getSheetByName: (name: string) => {
      const s = sheets.get(name);
      return s ? wrapMockSheet(s) : null;
    },
    getSheetNames: () => [...sheetOrder],
    insertSheet: (name: string) => {
      if (sheets.has(name)) {
        throw new Error(`SHEET_EXISTS:${name}`);
      }
      const created: MockSheetState = {
        name,
        rows: [],
        maxRows: 100,
        maxColumns: 26, // Matches real Google Sheets default 26 columns (Villages needs 28!)
        frozenRows: 0,
        numberFormats: new Map(),
        writeOps: ['insertSheet'],
      };
      sheets.set(name, created);
      sheetOrder.push(name);
      return wrapMockSheet(created);
    },
  };

  const properties: Record<string, string | undefined> = {
    THAIPHC_ENV: 'SANDBOX',
    THAIPHC_SPREADSHEET_ID: VALID_REF_SHEET_ID,
    THAIPHC_WRITE_ENABLED: 'true',
    ...opts.properties,
  };

  const platform: SyncPlatform = {
    getProperty: (key: string) => {
      const val = properties[key];
      return typeof val === 'string' ? val : null;
    },
    openSpreadsheetById: (id: string) => {
      if (id !== VALID_REF_SHEET_ID) {
        throw new Error(`UNKNOWN_SHEET:${id}`);
      }
      return spreadsheet;
    },
    now: () => new Date(opts.nowIso ?? '2026-11-21T14:00:00.000Z'),
    fetchUrl: (url: string, options: HttpFetchOptions) => {
      fetchCalls.push({ url, options });
      return opts.fetchHandler(url, options);
    },
    sha256Hex,
    tryScriptLock: (timeoutMs: number) => {
      lockEvents.push(`tryLock:${timeoutMs}`);
      if (opts.lockAvailable === false) {
        return null;
      }
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
    sheets,
    fetchCalls,
    lockEvents,
    getFlushCount: () => flushCount,
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

describe('Reference Datasets Repeatable Sync (Backend GAS RPC Seam)', () => {
  it('previews subdistricts with zero sheet writes, commits 20-column Keyed Upsert with Destination Readback, and classifies repeatable UPDATE / UNCHANGED / MISSING_IN_SOURCE', () => {
    let sourceItems = [
      makeSubdistrictRow('540601', 'บ้านหนุน', 'Ban Nun'),
      makeSubdistrictRow('540602', 'บ้านกลาง', 'Ban Klang'),
    ];

    const env = createFakeSyncEnv({
      fetchHandler: () => jsonResponse({ items: sourceItems }),
    });

    // 1. Initial Preview — zero sheet writes
    const preview1 = previewDatasetWithPlatform(
      { endpoint: 'subdistricts', token: VALID_BEARER },
      env.platform,
    );
    expect(preview1.ok).toBe(true);
    if (!preview1.ok || preview1.data.status !== 'READY') {
      throw new Error('expected READY preview');
    }

    expect(env.fetchCalls).toHaveLength(1);
    expect(env.fetchCalls[0].url).toBe(
      'https://api-thaiphc.hss.moph.go.th/api/v1/lookups/subdistricts?district_code=5406',
    );
    expect(env.fetchCalls[0].options).toMatchObject({
      method: 'get',
      followRedirects: false,
      muteHttpExceptions: true,
    });
    expect(env.sheets.has('Subdistricts')).toBe(false);
    expect(env.sheets.has('_ThaiPHCSyncLog')).toBe(false);
    expect(env.getFlushCount()).toBe(0);

    expect(preview1.data.counts).toEqual({ insert: 2, update: 0, unchanged: 0, review: 0 });
    expect(preview1.data.fingerprint.sourceTotal).toBe(2);
    expect(preview1.data.fingerprint.datasetDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(preview1.data.fingerprint.sheetRevisionFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(preview1.data.sampleRows).toHaveLength(2);
    expect(preview1.data.sampleRows[0].diffKind).toBe('INSERT');

    // 2. Commit initial insert
    const commit1 = commitSmallDatasetWithPlatform(
      {
        endpoint: 'subdistricts',
        token: VALID_BEARER,
        expectedFingerprint: preview1.data.fingerprint,
      },
      env.platform,
    );
    expect(commit1.ok).toBe(true);
    if (!commit1.ok || commit1.data.status !== 'COMMITTED_VERIFIED') {
      throw new Error('expected COMMITTED_VERIFIED');
    }

    expect(env.lockEvents).toEqual(['tryLock:10000', 'releaseLock']);
    expect(commit1.data.counts).toEqual({ insert: 2, update: 0, unchanged: 0, review: 0 });
    expect(commit1.data.readback).toMatchObject({
      verified: true,
      destinationTab: 'Subdistricts',
      expectedRowCount: 2,
      actualRowCount: 2,
      uniqueKeysVerified: true,
      rowDigestsVerified: true,
      unrelatedTabsPreserved: true,
    });

    // Verify 20-column Historical Acceptance Baseline schema & @ text format & ชีต1 survival
    const subSheet = env.sheets.get('Subdistricts')!;
    expect(subSheet.rows[0]).toEqual([
      'code',
      'id',
      'name_th',
      'name_en',
      'postal_code',
      'label',
      'district_code',
      'district_name_th',
      'district_name_en',
      'province_code',
      'province_name_th',
      'province_name_en',
      '_schema_version',
      '_sync_run_id',
      '_source_key',
      '_fetched_at_utc',
      '_quality_status',
      '_field_presence_json',
      '_last_seen_run_id',
      '_row_digest',
    ]);
    expect(subSheet.rows).toHaveLength(3);
    expect(subSheet.numberFormats.get('C1')).toBe('@');
    expect(subSheet.numberFormats.get('C15')).toBe('@');
    expect(env.sheets.get('ชีต1')!.rows).toEqual([['keep-me']]);

    // Verify _ThaiPHCSyncLog has one COMMITTED_VERIFIED row
    const logSheet = env.sheets.get('_ThaiPHCSyncLog')!;
    expect(logSheet.rows).toHaveLength(2);
    expect(logSheet.rows[1][0]).toBe(commit1.data.runId);
    expect(logSheet.rows[1][5]).toBe('COMMITTED_VERIFIED');
    expect(logSheet.rows[1][11]).toBe(true);

    // 3. Repeatable Preview with 1 UNCHANGED (540601), 1 MISSING_IN_SOURCE (540602), 1 INSERT (540603), and 1 UPDATE (540601 changed!)
    sourceItems = [
      makeSubdistrictRow('540601', 'บ้านหนุน (ปรับปรุง)', 'Ban Nun'),
      makeSubdistrictRow('540603', 'ห้วยหม้าย', 'Huai Mai'),
    ];
    const preview2 = previewDatasetWithPlatform(
      { endpoint: 'subdistricts', token: VALID_BEARER },
      env.platform,
    );
    expect(preview2.ok).toBe(true);
    if (
      !preview2.ok ||
      preview2.data.status !== 'READY' ||
      preview2.data.previewMode !== 'REFERENCE_READABLE'
    ) {
      throw new Error('expected READY REFERENCE_READABLE preview 2');
    }
    expect(preview2.data.counts).toEqual({ insert: 1, update: 1, unchanged: 0, review: 1 });
    expect(preview2.data.reviewBreakdown).toEqual({ MISSING_IN_SOURCE: 1 });

    const updatedRow = preview2.data.sampleRows.find((r) => r.sourceKey === '540601');
    expect(updatedRow?.diffKind).toBe('UPDATE');
    expect(updatedRow?.changedFields).toContainEqual({
      field: 'name_th',
      before: 'บ้านหนุน',
      after: 'บ้านหนุน (ปรับปรุง)',
    });

    const missingRow = preview2.data.sampleRows.find((r) => r.sourceKey === '540602');
    expect(missingRow?.diffKind).toBe('REVIEW');
    expect(missingRow?.reviewReasons).toEqual(['MISSING_IN_SOURCE']);

    // 4. Commit update + insert; verify MISSING_IN_SOURCE row 540602 is preserved untouched (no auto-delete!)
    const commit2 = commitSmallDatasetWithPlatform(
      {
        endpoint: 'subdistricts',
        token: VALID_BEARER,
        expectedFingerprint: preview2.data.fingerprint,
      },
      env.platform,
    );
    expect(commit2.ok).toBe(true);
    if (!commit2.ok || commit2.data.status !== 'COMMITTED_VERIFIED') {
      throw new Error('expected COMMITTED_VERIFIED 2');
    }
    expect(commit2.data.readback.actualRowCount).toBe(3);
    expect(subSheet.rows.map((r) => r[0])).toEqual(['code', '540601', '540602', '540603']);
    expect(subSheet.rows[2][2]).toBe('บ้านกลาง'); // 540602 untouched

    // 5. Third preview with identical source -> all source rows UNCHANGED, 540602 still REVIEW
    const preview3 = previewDatasetWithPlatform(
      { endpoint: 'subdistricts', token: VALID_BEARER },
      env.platform,
    );
    expect(preview3.ok).toBe(true);
    if (!preview3.ok || preview3.data.status !== 'READY') {
      throw new Error('expected READY preview 3');
    }
    expect(preview3.data.counts).toEqual({ insert: 0, update: 0, unchanged: 2, review: 1 });
  });

  it('grows Villages sheet to 28 columns, preserves leading zeros with @ format, and handles health-services offset pagination, canonical sorted-key JSON, and PLACEHOLDER_COORDS review', () => {
    const villageRow = {
      code: '540602005',
      village_code_8digit: '54060205',
      id: '540602005',
      name_th: 'กลาง',
      name_en: null,
      village_no: 5,
      metro_status: null,
      label: 'กลาง',
      subdistrict_code: '540602',
      subdistrict_name_th: 'บ้านกลาง',
      subdistrict_name_en: 'Ban Klang',
      district_code: '5406',
      district_name_th: 'สอง',
      district_name_en: 'Song',
      province_code: '54',
      province_name_th: 'แพร่',
      province_name_en: 'Phrae',
      health_service_code: 'GA0006419',
      health_service_name_th: 'รพ.สต.บ้านกลาง',
      health_service_name_en: null,
    };

    const villageEnv = createFakeSyncEnv({
      fetchHandler: () => jsonResponse({ items: [villageRow] }),
    });

    const vPreview = previewDatasetWithPlatform(
      { endpoint: 'villages', token: VALID_BEARER },
      villageEnv.platform,
    );
    expect(vPreview.ok).toBe(true);
    if (!vPreview.ok || vPreview.data.status !== 'READY') throw new Error('expected READY');
    expect(villageEnv.fetchCalls[0].url).toBe(
      'https://api-thaiphc.hss.moph.go.th/api/v1/lookups/villages?province_code=54&district_code=5406',
    );

    const vCommit = commitSmallDatasetWithPlatform(
      {
        endpoint: 'villages',
        token: VALID_BEARER,
        expectedFingerprint: vPreview.data.fingerprint,
      },
      villageEnv.platform,
    );
    expect(vCommit.ok).toBe(true);
    if (!vCommit.ok || vCommit.data.status !== 'COMMITTED_VERIFIED') {
      throw new Error('expected COMMITTED_VERIFIED for villages');
    }
    const vSheet = villageEnv.sheets.get('Villages')!;
    expect(vSheet.maxColumns).toBe(28);
    expect(vSheet.rows[0]).toHaveLength(28);
    expect(vSheet.rows[1][0]).toBe('540602005');
    expect(vSheet.rows[1][5]).toBe(5);

    // Health Services: 2 pages of offset pagination (pageSize=1), unsorted nested keys, leading-zero legacy codes, and (0, 0) PLACEHOLDER_COORDS
    const hs1 = {
      health_service_code: 'GA0006426',
      health_service_name_th: 'รพ.สต.แดนชุมพล',
      health_service_name_en: null,
      legacy_5digit_code: '06426',
      legacy_9digit_code: '000642600',
      village_no: '4',
      latitude: 0,
      longitude: 0,
      // Deliberately reverse key order to verify canonical sorted-key JSON serialization
      health_service_type: { name_th: 'รพ.สต.', name_en: 'SHPH', id: 'type-1' },
      province: { province_name_th: 'แพร่', province_code: '54', province_name_en: 'Phrae' },
      district: { district_name_th: 'สอง', district_code: '5406', district_name_en: 'Song' },
      subdistrict: {
        subdistrict_name_th: 'แดนชุมพล',
        subdistrict_code: '540607',
        subdistrict_name_en: 'Daen Chumphon',
      },
      service_areas: [
        {
          village_nos: ['4', '5'],
          subdistrict_name_th: 'แดนชุมพล',
          subdistrict_code: '540607',
          is_primary: true,
          id: 'area-1',
        },
      ],
      created_at: '2025-07-30T04:31:26.342131+00:00',
      updated_at: '2025-07-30T04:31:26.342132+00:00',
      deleted_at: null,
    };
    const hs2 = {
      ...hs1,
      health_service_code: 'GA0006427',
      health_service_name_th: 'รพ.สอง',
      legacy_5digit_code: '06427',
      legacy_9digit_code: '000642700',
      latitude: 18.4712,
      longitude: 100.1844,
    };

    const hsEnv = createFakeSyncEnv({
      fetchHandler: (url) => {
        if (url.includes('offset=0')) {
          return jsonResponse({ items: [hs1], total: 2, limit: 1, offset: 0 });
        }
        if (url.includes('offset=1')) {
          return jsonResponse({ items: [hs2], total: 2, limit: 1, offset: 1 });
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
    });

    const hsPreview = previewDatasetWithPlatform(
      { endpoint: 'health-services', token: VALID_BEARER, pageSize: 1 },
      hsEnv.platform,
    );
    expect(hsPreview.ok).toBe(true);
    if (!hsPreview.ok || hsPreview.data.status !== 'READY') {
      throw new Error('expected READY for health-services');
    }
    expect(hsPreview.data.pagesFetched).toBe(2);
    expect(hsPreview.data.counts).toEqual({ insert: 2, update: 0, unchanged: 0, review: 1 });
    expect(hsPreview.data.reviewBreakdown).toEqual({ PLACEHOLDER_COORDS: 1 });
    const zeroCoordPreview = hsPreview.data.sampleRows.find((r) => r.sourceKey === 'GA0006426');
    expect(zeroCoordPreview?.reviewReasons).toEqual(['PLACEHOLDER_COORDS']);

    const hsCommit = commitSmallDatasetWithPlatform(
      {
        endpoint: 'health-services',
        token: VALID_BEARER,
        expectedFingerprint: hsPreview.data.fingerprint,
        pageSize: 1,
      },
      hsEnv.platform,
    );
    expect(hsCommit.ok).toBe(true);
    if (!hsCommit.ok || hsCommit.data.status !== 'COMMITTED_VERIFIED') {
      throw new Error('expected COMMITTED_VERIFIED for health-services');
    }

    const hsSheet = hsEnv.sheets.get('HealthServices')!;
    expect(hsSheet.rows[0]).toHaveLength(24);
    expect(hsSheet.rows[1][3]).toBe('06426');
    expect(hsSheet.rows[1][4]).toBe('000642600');
    // Verify canonical sorted-key JSON for nested health_service_type object
    expect(hsSheet.rows[1][8]).toBe('{"id":"type-1","name_en":"SHPH","name_th":"รพ.สต."}');
    // Verify exact F010 _row_digest formula matches independent computation
    const expectedPresence = {
      health_service_code: 'VALUE',
      health_service_name_th: 'VALUE',
      health_service_name_en: 'NULL',
      legacy_5digit_code: 'VALUE',
      legacy_9digit_code: 'VALUE',
      village_no: 'VALUE',
      latitude: 'VALUE',
      longitude: 'VALUE',
      health_service_type: 'VALUE',
      province: 'VALUE',
      district: 'VALUE',
      subdistrict: 'VALUE',
      service_areas: 'VALUE',
      created_at: 'VALUE',
      updated_at: 'VALUE',
      deleted_at: 'NULL',
    };
    const storedRow1Values = hsSheet.rows[1]
      .slice(0, 16)
      .map((cell, idx) => (idx === 2 || idx === 15 ? null : cell));
    expect(hsSheet.rows[1][23]).toBe(
      sha256Hex(JSON.stringify([storedRow1Values, expectedPresence])),
    );
  });

  it('blocks STOP/BLOCKED on out-of-scope subdistrict/village, formula injection, ASCII control chars, unexpected fields, duplicate keys, sourceTotal drift, redirect, and returns HTTP_401 without echoing token', () => {
    // Out-of-scope subdistrict (540609 outside 540601..540608)
    const scopeEnv = createFakeSyncEnv({
      fetchHandler: () =>
        jsonResponse({ items: [makeSubdistrictRow('540609', 'นอกเขต', 'Out of Scope')] }),
    });
    const scopeRes = previewDatasetWithPlatform(
      { endpoint: 'subdistricts', token: VALID_BEARER },
      scopeEnv.platform,
    );
    expect(scopeRes.ok).toBe(true);
    if (scopeRes.ok) {
      expect(scopeRes.data.status).toBe('STOP_BLOCKED');
      if (scopeRes.data.status === 'STOP_BLOCKED') {
        expect(scopeRes.data.diagnostics[0].code).toBe('OUT_OF_GEOGRAPHIC_SCOPE');
      }
    }

    // Formula injection prefix (=CMD)
    const formulaEnv = createFakeSyncEnv({
      fetchHandler: () =>
        jsonResponse({
          items: [makeSubdistrictRow('540601', '=HYPERLINK("http://evil")', 'Evil')],
        }),
    });
    const formulaRes = previewDatasetWithPlatform(
      { endpoint: 'subdistricts', token: VALID_BEARER },
      formulaEnv.platform,
    );
    expect(formulaRes.ok).toBe(true);
    if (formulaRes.ok && formulaRes.data.status === 'STOP_BLOCKED') {
      expect(formulaRes.data.diagnostics[0].code).toBe('FORMULA_INJECTION_DETECTED');
      expect(JSON.stringify(formulaRes)).not.toContain('HYPERLINK');
    } else {
      throw new Error('expected STOP_BLOCKED for formula injection');
    }

    // ASCII control character
    const ctrlEnv = createFakeSyncEnv({
      fetchHandler: () =>
        jsonResponse({ items: [makeSubdistrictRow('540601', 'บ้าน\u0007หนุน', 'Ctrl')] }),
    });
    const ctrlRes = previewDatasetWithPlatform(
      { endpoint: 'subdistricts', token: VALID_BEARER },
      ctrlEnv.platform,
    );
    expect(ctrlRes.ok && ctrlRes.data.status === 'STOP_BLOCKED').toBe(true);
    if (ctrlRes.ok && ctrlRes.data.status === 'STOP_BLOCKED') {
      expect(ctrlRes.data.diagnostics[0].code).toBe('ASCII_CONTROL_CHAR');
    }

    // Unexpected field & duplicate key
    const extraFieldEnv = createFakeSyncEnv({
      fetchHandler: () =>
        jsonResponse({
          items: [{ ...makeSubdistrictRow('540601', 'บ้านหนุน', 'Ban Nun'), unknown_col: 'x' }],
        }),
    });
    const extraRes = previewDatasetWithPlatform(
      { endpoint: 'subdistricts', token: VALID_BEARER },
      extraFieldEnv.platform,
    );
    expect(
      extraRes.ok &&
        extraRes.data.status === 'STOP_BLOCKED' &&
        extraRes.data.diagnostics[0].code === 'UNEXPECTED_FIELD',
    ).toBe(true);

    const dupEnv = createFakeSyncEnv({
      fetchHandler: () =>
        jsonResponse({
          items: [
            makeSubdistrictRow('540601', 'บ้านหนุน', 'Ban Nun'),
            makeSubdistrictRow('540601', 'บ้านหนุน 2', 'Ban Nun 2'),
          ],
        }),
    });
    const dupRes = previewDatasetWithPlatform(
      { endpoint: 'subdistricts', token: VALID_BEARER },
      dupEnv.platform,
    );
    expect(
      dupRes.ok &&
        dupRes.data.status === 'STOP_BLOCKED' &&
        dupRes.data.diagnostics[0].code === 'DUPLICATE_SOURCE_KEY',
    ).toBe(true);

    // Mid-fetch sourceTotal drift on health-services offset pagination
    const driftEnv = createFakeSyncEnv({
      fetchHandler: (url) => {
        if (url.includes('offset=0')) {
          return jsonResponse({ items: [{}], total: 2, limit: 1, offset: 0 });
        }
        return jsonResponse({ items: [{}], total: 3, limit: 1, offset: 1 });
      },
    });
    const driftRes = previewDatasetWithPlatform(
      { endpoint: 'health-services', token: VALID_BEARER, pageSize: 1 },
      driftEnv.platform,
    );
    expect(
      driftRes.ok &&
        driftRes.data.status === 'STOP_BLOCKED' &&
        driftRes.data.diagnostics[0].code === 'SOURCE_TOTAL_DRIFT',
    ).toBe(true);

    // HTTP 302 redirect rejected
    const redirEnv = createFakeSyncEnv({
      fetchHandler: () => ({
        statusCode: 302,
        headers: { Location: 'https://evil.example/' },
        contentText: '',
        byteLength: 0,
      }),
    });
    const redirRes = previewDatasetWithPlatform(
      { endpoint: 'subdistricts', token: VALID_BEARER },
      redirEnv.platform,
    );
    expect(
      redirRes.ok &&
        redirRes.data.status === 'STOP_BLOCKED' &&
        redirRes.data.diagnostics[0].code === 'REDIRECT_REJECTED',
    ).toBe(true);

    // HTTP 401 returns RPC error HTTP_401 and never echoes token
    const authEnv = createFakeSyncEnv({
      fetchHandler: () => jsonResponse({ error: 'unauthorized' }, 401),
    });
    const authRes = previewDatasetWithPlatform(
      { endpoint: 'subdistricts', token: VALID_BEARER },
      authEnv.platform,
    );
    expect(authRes.ok).toBe(false);
    if (!authRes.ok) {
      expect(authRes.error.code).toBe('HTTP_401');
    }
    expect(JSON.stringify(authRes)).not.toContain(VALID_BEARER);
  });

  it('enforces Write Guard OFF, PRODUCTION typed confirmation phrase, PREVIEW_STALE_RECONFIRM_REQUIRED, LOCK_BUSY, UNKNOWN_OUTCOME_STOP -> UNRESOLVED_PREVIOUS_RUN recovery, and READBACK_MISMATCH', () => {
    let items = [makeSubdistrictRow('540601', 'บ้านหนุน', 'Ban Nun')];

    // 1. Write Guard OFF fails closed on Commit
    const guardOffEnv = createFakeSyncEnv({
      properties: { THAIPHC_WRITE_ENABLED: 'false' },
      fetchHandler: () => jsonResponse({ items }),
    });
    const pOff = previewDatasetWithPlatform(
      { endpoint: 'subdistricts', token: VALID_BEARER },
      guardOffEnv.platform,
    );
    if (!pOff.ok || pOff.data.status !== 'READY') throw new Error('expected READY');
    expect(pOff.data.writeAllowed).toBe(false);
    expect(pOff.data.blockedGuardReason).toBe('THAIPHC_WRITE_ENABLED');

    const cOff = commitSmallDatasetWithPlatform(
      {
        endpoint: 'subdistricts',
        token: VALID_BEARER,
        expectedFingerprint: pOff.data.fingerprint,
      },
      guardOffEnv.platform,
    );
    expect(
      cOff.ok && cOff.data.status === 'FAILED_STOP' && cOff.data.stopCode === 'WRITE_DISABLED',
    ).toBe(true);
    expect(guardOffEnv.sheets.has('Subdistricts')).toBe(false);

    // 2. PRODUCTION requires exact typed phrase "PRODUCTION 5406 subdistricts"
    const prodEnv = createFakeSyncEnv({
      properties: { THAIPHC_ENV: 'PRODUCTION', THAIPHC_WRITE_ENABLED: 'true' },
      fetchHandler: () => jsonResponse({ items }),
    });
    const pProd = previewDatasetWithPlatform(
      { endpoint: 'subdistricts', token: VALID_BEARER },
      prodEnv.platform,
    );
    if (!pProd.ok || pProd.data.status !== 'READY') throw new Error('expected READY');

    const cProdBadPhrase = commitSmallDatasetWithPlatform(
      {
        endpoint: 'subdistricts',
        token: VALID_BEARER,
        expectedFingerprint: pProd.data.fingerprint,
        confirmationPhrase: 'PRODUCTION 5406 villages',
      },
      prodEnv.platform,
    );
    expect(
      cProdBadPhrase.ok &&
        cProdBadPhrase.data.status === 'FAILED_STOP' &&
        cProdBadPhrase.data.stopCode === 'PRODUCTION_CONFIRMATION_REQUIRED',
    ).toBe(true);

    // 3. Source drift after Preview triggers PREVIEW_STALE_RECONFIRM_REQUIRED with zero sheet writes
    items = [makeSubdistrictRow('540601', 'บ้านหนุน เปลี่ยนระหว่างทาง', 'Changed')];
    const cStale = commitSmallDatasetWithPlatform(
      {
        endpoint: 'subdistricts',
        token: VALID_BEARER,
        expectedFingerprint: pProd.data.fingerprint,
        confirmationPhrase: 'PRODUCTION 5406 subdistricts',
      },
      prodEnv.platform,
    );
    expect(cStale.ok && cStale.data.status === 'PREVIEW_STALE_RECONFIRM_REQUIRED').toBe(true);
    if (cStale.ok && cStale.data.status === 'PREVIEW_STALE_RECONFIRM_REQUIRED') {
      expect(cStale.data.driftReason).toBe('SOURCE_CHANGED');
    }
    expect(prodEnv.sheets.has('Subdistricts')).toBe(false);
    expect(prodEnv.sheets.has('_ThaiPHCSyncLog')).toBe(false);

    // 4. LOCK_BUSY fails closed without mutating Sheets
    const lockEnv = createFakeSyncEnv({
      lockAvailable: false,
      fetchHandler: () => jsonResponse({ items }),
    });
    const pLock = previewDatasetWithPlatform(
      { endpoint: 'subdistricts', token: VALID_BEARER },
      lockEnv.platform,
    );
    if (!pLock.ok || pLock.data.status !== 'READY') throw new Error('expected READY');
    const cLock = commitSmallDatasetWithPlatform(
      {
        endpoint: 'subdistricts',
        token: VALID_BEARER,
        expectedFingerprint: pLock.data.fingerprint,
      },
      lockEnv.platform,
    );
    expect(
      cLock.ok && cLock.data.status === 'FAILED_STOP' && cLock.data.stopCode === 'LOCK_BUSY',
    ).toBe(true);

    // 5. Unknown write failure -> UNKNOWN_OUTCOME_STOP leaving STARTED in _ThaiPHCSyncLog -> surfaces UNRESOLVED_PREVIOUS_RUN until acknowledged
    const unknownEnv = createFakeSyncEnv({
      failWriteOnTab: 'Subdistricts',
      fetchHandler: () => jsonResponse({ items }),
    });
    const pUnk = previewDatasetWithPlatform(
      { endpoint: 'subdistricts', token: VALID_BEARER },
      unknownEnv.platform,
    );
    if (!pUnk.ok || pUnk.data.status !== 'READY') throw new Error('expected READY');

    const cUnk = commitSmallDatasetWithPlatform(
      {
        endpoint: 'subdistricts',
        token: VALID_BEARER,
        expectedFingerprint: pUnk.data.fingerprint,
      },
      unknownEnv.platform,
    );
    expect(cUnk.ok && cUnk.data.status === 'UNKNOWN_OUTCOME_STOP').toBe(true);
    if (!cUnk.ok || cUnk.data.status !== 'UNKNOWN_OUTCOME_STOP')
      throw new Error('expected unknown');
    expect(cUnk.data.syncLogStatus).toBe('STARTED');
    const unresolvedRunId = cUnk.data.runId!;

    // Next preview surfaces UNRESOLVED_PREVIOUS_RUN
    const pAfterUnk = previewDatasetWithPlatform(
      { endpoint: 'subdistricts', token: VALID_BEARER },
      unknownEnv.platform,
    );
    if (!pAfterUnk.ok || pAfterUnk.data.status !== 'READY') throw new Error('expected READY');
    expect(pAfterUnk.data.unresolvedPreviousRun).toMatchObject({
      endpoint: 'subdistricts',
      runId: unresolvedRunId,
      status: 'STARTED',
    });

    // Committing without explicit acknowledgeUnresolvedRunId fails closed with UNRESOLVED_PREVIOUS_RUN
    const cBlockedUnresolved = commitSmallDatasetWithPlatform(
      {
        endpoint: 'subdistricts',
        token: VALID_BEARER,
        expectedFingerprint: pAfterUnk.data.fingerprint,
      },
      unknownEnv.platform,
    );
    expect(
      cBlockedUnresolved.ok &&
        cBlockedUnresolved.data.status === 'FAILED_STOP' &&
        cBlockedUnresolved.data.stopCode === 'UNRESOLVED_PREVIOUS_RUN',
    ).toBe(true);
  });

  it('detects DESTINATION_CHANGED stale preview, allows acknowledged recovery from UNRESOLVED_PREVIOUS_RUN, and flags READBACK_MISMATCH as FAILED_STOP', () => {
    const items = [makeSubdistrictRow('540601', 'บ้านหนุน', 'Ban Nun')];

    // 1. Destination drift between Preview and Commit -> PREVIEW_STALE_RECONFIRM_REQUIRED (DESTINATION_CHANGED)
    const driftEnv = createFakeSyncEnv({
      fetchHandler: () => jsonResponse({ items }),
    });
    const p1 = previewDatasetWithPlatform(
      { endpoint: 'subdistricts', token: VALID_BEARER },
      driftEnv.platform,
    );
    if (!p1.ok || p1.data.status !== 'READY') throw new Error('expected READY');
    // Simulate out-of-band edit inserting a new _ThaiPHCSyncLog entry before Commit
    driftEnv.sheets.set('_ThaiPHCSyncLog', {
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
          'run_other_01',
          '2026-11-21T13:59:00.000Z',
          'SANDBOX',
          'subdistricts',
          'KEYED_UPSERT',
          'COMMITTED_VERIFIED',
          'abc',
          1,
          0,
          0,
          0,
          true,
        ],
      ],
      maxRows: 100,
      maxColumns: 26,
      frozenRows: 1,
      numberFormats: new Map(),
      writeOps: [],
    });
    const cDestDrift = commitSmallDatasetWithPlatform(
      {
        endpoint: 'subdistricts',
        token: VALID_BEARER,
        expectedFingerprint: p1.data.fingerprint,
      },
      driftEnv.platform,
    );
    expect(
      cDestDrift.ok &&
        cDestDrift.data.status === 'PREVIEW_STALE_RECONFIRM_REQUIRED' &&
        cDestDrift.data.driftReason === 'DESTINATION_CHANGED',
    ).toBe(true);

    // 1b. Out-of-band manual cell edit on an existing live row (without changing _row_digest) ALSO triggers DESTINATION_CHANGED
    const cellEditEnv = createFakeSyncEnv({
      fetchHandler: () => jsonResponse({ items }),
    });
    const pInit = previewDatasetWithPlatform(
      { endpoint: 'subdistricts', token: VALID_BEARER },
      cellEditEnv.platform,
    );
    if (!pInit.ok || pInit.data.status !== 'READY') throw new Error('expected READY');
    commitSmallDatasetWithPlatform(
      {
        endpoint: 'subdistricts',
        token: VALID_BEARER,
        expectedFingerprint: pInit.data.fingerprint,
      },
      cellEditEnv.platform,
    );
    const pBeforeManualEdit = previewDatasetWithPlatform(
      { endpoint: 'subdistricts', token: VALID_BEARER },
      cellEditEnv.platform,
    );
    if (!pBeforeManualEdit.ok || pBeforeManualEdit.data.status !== 'READY') {
      throw new Error('expected READY');
    }
    // Someone manually edits cell name_th in Google Sheets without touching _row_digest
    cellEditEnv.sheets.get('Subdistricts')!.rows[1][2] = 'MANUAL_OUT_OF_BAND_EDIT';
    const cAfterManualEdit = commitSmallDatasetWithPlatform(
      {
        endpoint: 'subdistricts',
        token: VALID_BEARER,
        expectedFingerprint: pBeforeManualEdit.data.fingerprint,
      },
      cellEditEnv.platform,
    );
    expect(
      cAfterManualEdit.ok &&
        cAfterManualEdit.data.status === 'PREVIEW_STALE_RECONFIRM_REQUIRED' &&
        cAfterManualEdit.data.driftReason === 'DESTINATION_CHANGED',
    ).toBe(true);

    // 2. Explicit operator acknowledgment of UNRESOLVED_PREVIOUS_RUN allows recovery via fresh Preview -> Confirm
    const recoverEnv = createFakeSyncEnv({
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
              'run_stuck_01',
              '2026-11-21T12:00:00.000Z',
              'SANDBOX',
              'subdistricts',
              'KEYED_UPSERT',
              'STARTED',
              'prev',
              0,
              0,
              0,
              0,
              false,
            ],
          ],
        },
      ],
      fetchHandler: () => jsonResponse({ items }),
    });
    const pRec = previewDatasetWithPlatform(
      { endpoint: 'subdistricts', token: VALID_BEARER },
      recoverEnv.platform,
    );
    if (!pRec.ok || pRec.data.status !== 'READY') throw new Error('expected READY');
    expect(pRec.data.unresolvedPreviousRun?.runId).toBe('run_stuck_01');

    const cRec = commitSmallDatasetWithPlatform(
      {
        endpoint: 'subdistricts',
        token: VALID_BEARER,
        expectedFingerprint: pRec.data.fingerprint,
        acknowledgeUnresolvedRunId: 'run_stuck_01',
      },
      recoverEnv.platform,
    );
    expect(cRec.ok && cRec.data.status === 'COMMITTED_VERIFIED').toBe(true);
    const logRows = recoverEnv.sheets.get('_ThaiPHCSyncLog')!.rows;
    expect(logRows[logRows.length - 1][5]).toBe('COMMITTED_VERIFIED');

    // 3. Corrupted persisted cell during flush triggers READBACK_MISMATCH + FAILED_STOP
    const corruptEnv = createFakeSyncEnv({
      fetchHandler: () => jsonResponse({ items }),
    });
    const origFlush = corruptEnv.platform.flushSpreadsheet;
    let flushCounter = 0;
    corruptEnv.platform.flushSpreadsheet = () => {
      flushCounter += 1;
      origFlush();
      // Corrupt persisted cell right after data tab write flush (2nd flush)
      if (flushCounter === 2) {
        const sub = corruptEnv.sheets.get('Subdistricts');
        if (sub && sub.rows[1]) {
          sub.rows[1][2] = 'CORRUPTED_BY_EXTERNAL_ACTOR';
        }
      }
    };
    const pCorrupt = previewDatasetWithPlatform(
      { endpoint: 'subdistricts', token: VALID_BEARER },
      corruptEnv.platform,
    );
    if (!pCorrupt.ok || pCorrupt.data.status !== 'READY') throw new Error('expected READY');
    const cCorrupt = commitSmallDatasetWithPlatform(
      {
        endpoint: 'subdistricts',
        token: VALID_BEARER,
        expectedFingerprint: pCorrupt.data.fingerprint,
      },
      corruptEnv.platform,
    );
    expect(
      cCorrupt.ok &&
        cCorrupt.data.status === 'FAILED_STOP' &&
        cCorrupt.data.stopCode === 'READBACK_MISMATCH' &&
        cCorrupt.data.syncLogStatus === 'FAILED_STOP',
    ).toBe(true);
    const corruptLog = corruptEnv.sheets.get('_ThaiPHCSyncLog')!.rows;
    expect(corruptLog[1][5]).toBe('FAILED_STOP');
    expect(corruptLog[1][11]).toBe(false);
  });
});
