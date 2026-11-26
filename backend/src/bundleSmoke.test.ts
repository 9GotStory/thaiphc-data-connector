import { createHash, createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';

const backendDir = fileURLToPath(new URL('..', import.meta.url));
const distDir = resolve(backendDir, 'dist');
const manifestPath = resolve(backendDir, 'appsscript.json');
const distCodePath = resolve(distDir, 'Code.js');
const distManifestPath = resolve(distDir, 'appsscript.json');
const distHtmlPath = resolve(distDir, 'index.html');
const buildScriptPath = resolve(backendDir, 'build.mjs');

const VALID_SHEET_ID = '1SMOKEdefGHIjklMNOpqrSTUvwxYZ01234567';
const VALID_HMAC_KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const VALID_VM_TOKEN = 'synthetic_vm_token_1234567890_abcdef';

const SUBDISTRICTS_5406 = [
  { code: '540601', nameTh: 'บ้านหนุน', nameEn: 'Ban Nun' },
  { code: '540602', nameTh: 'บ้านกลาง', nameEn: 'Ban Klang' },
  { code: '540603', nameTh: 'ห้วยหม้าย', nameEn: 'Huai Mai' },
  { code: '540604', nameTh: 'ทุ่งน้าว', nameEn: 'Thung Nao' },
  { code: '540605', nameTh: 'หัวเมือง', nameEn: 'Hua Mueang' },
  { code: '540606', nameTh: 'สะเอียบ', nameEn: 'Sa-iap' },
  { code: '540607', nameTh: 'แดนชุมพล', nameEn: 'Daen Chumphon' },
  { code: '540608', nameTh: 'เตาปูน', nameEn: 'Tao Pun' },
] as const;

function computeIndependentF010Pseudonym(
  hmacKeyB64: string,
  endpoint: string,
  rawId: string,
): string {
  const masterKey = Buffer.from(hmacKeyB64, 'base64');
  const derivedKey = createHmac('sha256', masterKey)
    .update('THAIPHC_F010_PSEUDONYM_DERIVE_5406', 'utf8')
    .digest();
  const hex = createHmac('sha256', derivedKey)
    .update(`THAIPHC_REDACTED_REPORT_V1\0${endpoint}\0${rawId}`, 'utf8')
    .digest('hex');
  return `h1_${hex}`;
}

function build8Subdistricts(): Array<Record<string, unknown>> {
  return SUBDISTRICTS_5406.map((s) => ({
    code: s.code,
    id: s.code,
    name_th: s.nameTh,
    name_en: s.nameEn,
    postal_code: '54120',
    label: `${s.nameTh} / ${s.nameEn}`,
    district_code: '5406',
    district_name_th: 'สอง',
    district_name_en: 'Song',
    province_code: null,
    province_name_th: null,
    province_name_en: null,
  }));
}

function build85Villages() {
  const rows: Array<Record<string, unknown>> = [];
  for (let sIdx = 0; sIdx < SUBDISTRICTS_5406.length; sIdx++) {
    const sub = SUBDISTRICTS_5406[sIdx];
    const villageCount = sIdx < 5 ? 11 : 10; // 5*11 + 3*10 = 85 villages
    for (let vNo = 1; vNo <= villageCount; vNo++) {
      const code9 = `${sub.code}${String(vNo).padStart(3, '0')}`;
      const code8 = `${sub.code}${String(vNo).padStart(2, '0')}`;
      rows.push({
        code: code9,
        village_code_8digit: code8,
        id: code9,
        name_th: `บ้าน${sub.nameTh} หมู่ ${vNo}`,
        name_en: null,
        village_no: vNo,
        metro_status: null,
        label: `บ้าน${sub.nameTh} หมู่ ${vNo}`,
        subdistrict_code: sub.code,
        subdistrict_name_th: sub.nameTh,
        subdistrict_name_en: sub.nameEn,
        district_code: '5406',
        district_name_th: 'สอง',
        district_name_en: 'Song',
        province_code: '54',
        province_name_th: 'แพร่',
        province_name_en: 'Phrae',
        health_service_code: `GA00064${String((sIdx % 8) + 1).padStart(2, '0')}`,
        health_service_name_th: `รพ.สต.${sub.nameTh}`,
        health_service_name_en: null,
      });
    }
  }
  return rows;
}

function build18HealthServices() {
  return Array.from({ length: 18 }, (_, idx) => {
    const num = idx + 1;
    const sub = SUBDISTRICTS_5406[idx % SUBDISTRICTS_5406.length];
    const isPlaceholder = idx === 0;
    return {
      health_service_code: `GA00064${String(num).padStart(2, '0')}`,
      health_service_name_th: `รพ.สต.${sub.nameTh} ${num}`,
      health_service_name_en: null,
      legacy_5digit_code: `064${String(num).padStart(2, '0')}`,
      legacy_9digit_code: `00064${String(num).padStart(2, '0')}00`,
      village_no: String((idx % 9) + 1),
      latitude: isPlaceholder ? 0 : 18.47 + idx * 0.001,
      longitude: isPlaceholder ? 0 : 100.18 + idx * 0.001,
      health_service_type: { id: 'type-1', name_th: 'รพ.สต.', name_en: 'SHPH' },
      province: { province_code: '54', province_name_th: 'แพร่', province_name_en: 'Phrae' },
      district: { district_code: '5406', district_name_th: 'สอง', district_name_en: 'Song' },
      subdistrict: {
        subdistrict_code: sub.code,
        subdistrict_name_th: sub.nameTh,
        subdistrict_name_en: sub.nameEn,
      },
      service_areas: [
        {
          id: `area-${num}`,
          subdistrict_code: sub.code,
          subdistrict_name_th: sub.nameTh,
          village_nos: [String((idx % 9) + 1)],
          is_primary: true,
        },
      ],
      created_at: '2025-07-30T04:31:26.342131+00:00',
      updated_at: '2025-07-30T04:31:26.342132+00:00',
      deleted_at: null,
    };
  });
}

function makeAssignmentItem(id: string, villageNo = '1') {
  return {
    id,
    osmCode: '99990000000001',
    citizenId: '1540600000001',
    prefixNameTh: 'นางสาว',
    prefixNameEn: 'Miss',
    firstName: 'PRIVATE_VM_FIRST',
    lastName: 'PRIVATE_VM_LAST',
    fullName: 'นางสาว PRIVATE_VM_FIRST PRIVATE_VM_LAST',
    provinceCode: '54',
    provinceNameTh: 'แพร่',
    districtCode: '5406',
    districtNameTh: 'สอง',
    subdistrictCode: '540601',
    subdistrictNameTh: 'บ้านหนุน',
    villageNo,
    villageName: null,
    isActive: true,
    status: 'ใช้งาน',
    osmStatus: '',
    osmShowbbody: '1',
    approvalStatus: 'approved',
    volunteerStatus: 'already_volunteer',
    createdAt: '2025-11-10T05:36:01.776457Z',
    requestDate: '2025-11-10T05:36:01.776457Z',
    updatedAt: '2026-10-12T13:07:33.846207Z',
  };
}

interface FakeVmSheet {
  state: {
    rows: unknown[][];
    maxRows: number;
    maxColumns: number;
    hidden: boolean;
    numberFormats: string[];
  };
  getName: () => string;
  isSheetHidden: () => boolean;
  getLastRow: () => number;
  getLastColumn: () => number;
  getMaxRows: () => number;
  getMaxColumns: () => number;
  insertColumnsAfter: (after: number, howMany: number) => void;
  insertRowsAfter: (after: number, howMany: number) => void;
  setFrozenRows: (rows: number) => void;
  hideSheet: () => void;
  showSheet: () => void;
  getRange: (row: number, col: number, numRows: number, numCols: number) => unknown;
}

function createCompiledBundleVmHarness(opts: {
  initialSheets: Array<{ name: string; rows: unknown[][] }>;
  properties?: Record<string, string>;
  fetchHandler: (url: string) => string;
  shouldFailWrite?: (sheetName: string, row: number) => boolean;
}) {
  const code = readFileSync(distCodePath, 'utf8');
  const propertyMutations: string[] = [];
  const properties: Record<string, string> = {
    THAIPHC_ENV: 'SANDBOX',
    THAIPHC_SPREADSHEET_ID: VALID_SHEET_ID,
    THAIPHC_SAME_WORKBOOK_APPROVAL: 'OWNER_ONLY_5406_APPROVED',
    THAIPHC_WRITE_ENABLED: 'true',
    THAIPHC_PERSON_DATA_WRITE_ENABLED: 'true',
    THAIPHC_HMAC_KEY_B64: VALID_HMAC_KEY,
    ...opts.properties,
  };

  let uuidSeq = 0;

  const makeFakeSheet = (name: string, rows: unknown[][]): FakeVmSheet => {
    const state = {
      rows: rows.map((r) => [...r]),
      maxRows: Math.max(120, rows.length + 20),
      maxColumns: Math.max(26, ...rows.map((r) => r.length)),
      hidden: false,
      numberFormats: [] as string[],
    };
    return {
      state,
      getName: () => name,
      isSheetHidden: () => state.hidden,
      getLastRow: () => state.rows.length,
      getLastColumn: () => state.rows.reduce((max, r) => Math.max(max, r.length), 0),
      getMaxRows: () => state.maxRows,
      getMaxColumns: () => state.maxColumns,
      insertColumnsAfter: (_after: number, howMany: number) => {
        state.maxColumns += howMany;
      },
      insertRowsAfter: (_after: number, howMany: number) => {
        state.maxRows += howMany;
      },
      setFrozenRows: () => undefined,
      hideSheet: () => {
        state.hidden = true;
      },
      showSheet: () => {
        state.hidden = false;
      },
      getRange: (row: number, col: number, numRows: number, numCols: number) => ({
        getValues: () =>
          Array.from({ length: numRows }, (_, r) =>
            Array.from({ length: numCols }, (_, c) => state.rows[row - 1 + r]?.[col - 1 + c] ?? ''),
          ),
        setValues: (vals: unknown[][]) => {
          if (opts.shouldFailWrite?.(name, row)) {
            throw new Error(`SIMULATED_VM_WRITE_FAIL:${name}`);
          }
          if (row - 1 + vals.length > state.maxRows) {
            throw new Error(`RANGE_ROWS_EXCEEDED:${name}`);
          }
          if (vals.length > 0 && col - 1 + vals[0].length > state.maxColumns) {
            throw new Error(`RANGE_COLS_EXCEEDED:${name}`);
          }
          for (let r = 0; r < vals.length; r++) {
            const idx = row - 1 + r;
            while (state.rows.length <= idx) state.rows.push([]);
            for (let c = 0; c < vals[r].length; c++) {
              state.rows[idx][col - 1 + c] = vals[r][c];
            }
          }
        },
        setNumberFormat: (fmt: string) => {
          state.numberFormats.push(`R${row}C${col}:${numRows}x${numCols}:${fmt}`);
        },
      }),
    };
  };

  const sheets: FakeVmSheet[] = opts.initialSheets.map((s) => makeFakeSheet(s.name, s.rows));
  const htmlCalls: Array<{
    filename: string;
    title?: string;
    metaTags: Array<[string, string]>;
    xFrameMode?: string;
  }> = [];

  const sandbox = {
    HtmlService: {
      XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' },
      createHtmlOutputFromFile(filename: string) {
        const entry: {
          filename: string;
          title?: string;
          metaTags: Array<[string, string]>;
          xFrameMode?: string;
        } = { filename, metaTags: [] };
        htmlCalls.push(entry);
        const output = {
          setTitle(title: string) {
            entry.title = title;
            return output;
          },
          addMetaTag(name: string, content: string) {
            entry.metaTags.push([name, content]);
            return output;
          },
          setXFrameOptionsMode(mode: string) {
            entry.xFrameMode = mode;
            return output;
          },
        };
        return output;
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) => properties[key] ?? null,
        setProperty: (key: string) => {
          propertyMutations.push(`set:${key}`);
        },
        deleteProperty: (key: string) => {
          propertyMutations.push(`delete:${key}`);
        },
      }),
    },
    SpreadsheetApp: {
      flush: () => undefined,
      openById: (id: string) => {
        if (id !== VALID_SHEET_ID) throw new Error('WRONG_ID');
        return {
          getId: () => id,
          getName: () => 'ThaiPHC VM Sandbox',
          getSheetByName: (name: string) => sheets.find((s) => s.getName() === name) ?? null,
          getSheets: () => sheets,
          insertSheet: (name: string) => {
            if (sheets.some((s) => s.getName() === name)) {
              throw new Error(`SHEET_EXISTS:${name}`);
            }
            const s = makeFakeSheet(name, []);
            sheets.push(s);
            return s;
          },
          deleteSheet: (sheetToDelete: { getName: () => string }) => {
            const idx = sheets.findIndex((s) => s.getName() === sheetToDelete.getName());
            if (idx >= 0) sheets.splice(idx, 1);
          },
        };
      },
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => undefined,
      }),
    },
    UrlFetchApp: {
      fetch: (url: string) => {
        const payload = opts.fetchHandler(url);
        return {
          getResponseCode: () => 200,
          getAllHeaders: () => ({ 'Content-Type': 'application/json; charset=utf-8' }),
          getContent: () => Array.from(Buffer.from(payload, 'utf8')),
          getContentText: () => payload,
        };
      },
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      newBlob: (str: string) => ({
        getBytes: () => toSignedBytes(Buffer.from(str, 'utf8')),
      }),
      computeDigest: (_alg: string, bytes: number[]) =>
        toSignedBytes(createHash('sha256').update(toUnsignedBuffer(bytes)).digest()),
      base64Decode: (b64: string) => toSignedBytes(Buffer.from(b64, 'base64')),
      base64Encode: (bytes: number[]) => toUnsignedBuffer(bytes).toString('base64'),
      computeHmacSha256Signature: (valueBytes: number[], keyBytes: number[]) =>
        toSignedBytes(
          createHmac('sha256', toUnsignedBuffer(keyBytes))
            .update(toUnsignedBuffer(valueBytes))
            .digest(),
        ),
      getUuid: () => {
        uuidSeq += 1;
        return `${String(uuidSeq).padStart(8, '0')}-0000-4000-8000-000000000000`;
      },
    },
  };

  const context = vm.createContext(sandbox);
  vm.runInContext(code, context, { filename: 'Code.js', timeout: 5000 });

  return { context, sheets, properties, propertyMutations, htmlCalls };
}

function toSignedBytes(buf: Uint8Array): number[] {
  return Array.from(buf, (b) => (b > 127 ? b - 256 : b));
}

function toUnsignedBuffer(bytes: number[]): Buffer {
  return Buffer.from(bytes.map((b) => ((b % 256) + 256) % 256));
}

function roundTripJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('GAS Backend Bundle & Single-File HTML Verification (node:vm)', () => {
  beforeAll(() => {
    execFileSync(process.execPath, [buildScriptPath], { cwd: backendDir, stdio: 'pipe' });
  });

  it('compiles strictly Code.js, appsscript.json, and single-file index.html with minimal manifest and doGet parity', () => {
    expect(existsSync(distCodePath)).toBe(true);
    expect(existsSync(distManifestPath)).toBe(true);
    expect(existsSync(distHtmlPath)).toBe(true);
    expect(readdirSync(distDir).sort()).toEqual(['Code.js', 'appsscript.json', 'index.html']);

    const sourceManifestRaw = readFileSync(manifestPath, 'utf8');
    const distManifestRaw = readFileSync(distManifestPath, 'utf8');
    expect(distManifestRaw).toBe(sourceManifestRaw);

    const manifest = JSON.parse(distManifestRaw);
    expect(manifest.timeZone).toBe('Asia/Bangkok');
    expect(manifest.runtimeVersion).toBe('V8');
    expect(manifest.exceptionLogging).toBe('NONE');
    expect(manifest.oauthScopes).toEqual([
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/script.storage',
      'https://www.googleapis.com/auth/script.external_request',
    ]);
    expect(manifest.webapp).toEqual({
      executeAs: 'USER_DEPLOYING',
      access: 'MYSELF',
    });

    const bundledHtml = readFileSync(distHtmlPath, 'utf8');
    expect(bundledHtml).toContain('<div id="root"></div>');
    expect(bundledHtml).toContain('<script type="module"');
    expect(bundledHtml).toMatch(/<style[\s>]/);
    // Single-file GAS HtmlService verification: zero external script src or local asset stylesheets
    expect(bundledHtml).not.toMatch(/<script[^>]+src=/i);
    expect(bundledHtml).not.toMatch(/href=["'](?:\.?\/)?assets\//i);

    const compiledCode = readFileSync(distCodePath, 'utf8');
    expect(compiledCode).not.toContain(VALID_SHEET_ID);
    expect(compiledCode).not.toContain(VALID_HMAC_KEY);

    const { context, htmlCalls } = createCompiledBundleVmHarness({
      initialSheets: [{ name: 'ชีต1', rows: [['keep']] }],
      fetchHandler: () => JSON.stringify({ items: [] }),
    });

    expect(typeof context.doGet).toBe('function');
    expect(typeof context.getDashboardStatus).toBe('function');
    expect(typeof context.previewDataset).toBe('function');
    expect(typeof context.previewDatasetBatch).toBe('function');
    expect(typeof context.finalizePreview).toBe('function');
    expect(typeof context.commitSmallDataset).toBe('function');
    expect(typeof context.stageLargeDatasetBatch).toBe('function');
    expect(typeof context.finalizeLargeDatasetCommit).toBe('function');

    context.doGet();
    expect(htmlCalls).toEqual([
      {
        filename: 'index',
        title: 'ThaiPHC Data Connector',
        metaTags: [['viewport', 'width=device-width, initial-scale=1']],
        xFrameMode: 'DEFAULT',
      },
    ]);
  });

  it('executes compiled Code.js end-to-end across all eight datasets in node:vm, verifying F010 h1_ parity, 111-row baseline, ชีต1, Legacy Snapshots, and _Stage_* cleanup', () => {
    const subdistricts8 = build8Subdistricts();
    const villages85 = build85Villages();
    const healthServices18 = build18HealthServices();

    const genderItems = [
      {
        provinceCode: '54',
        provinceName: 'แพร่',
        districtCode: '5406',
        districtName: 'สอง',
        subdistrictCode: '540601',
        subdistrictName: 'บ้านหนุน',
        villageCode: '540601001',
        villageNo: '1',
        villageName: 'หนุนเหนือ',
        total: 19,
        male: 3,
        female: 16,
      },
    ];

    const assignmentItems = [makeAssignmentItem('SYNTHETIC-UUID-0001', '1')];

    const resignedItems = [
      {
        id: 'SYNTHETIC-UUID-0001',
        citizenId: '1540600000001',
        firstName: 'PRIVATE_VM_RESIGN_FIRST',
        lastName: 'PRIVATE_VM_RESIGN_LAST',
        retirementDate: '2024-01-15',
        retirementReason: null,
        osmStatus: '0',
        volunteerStatus: 'already_volunteer',
        approvalStatus: 'approved',
        provinceCode: '54',
        provinceName: 'แพร่',
        districtCode: '5406',
        districtName: 'สอง',
        subdistrictCode: '540210',
        subdistrictName: 'ตำบลต้นทาง',
        villageCode: '540603006',
        villageNo: '6',
        villageName: 'บ้านตัวอย่าง',
      },
    ];

    const tenureItems = [
      {
        id: 'SYNTHETIC-UUID-0001',
        citizenId: '1540600000001',
        osmCode: '99990000000001',
        firstName: 'PRIVATE_VM_TENURE_FIRST',
        lastName: 'PRIVATE_VM_TENURE_LAST',
        startYear: 2569,
        tenureYears: 0,
        osmYear: null,
        approvalDate: null,
        retirementDate: null,
        retirementReason: null,
        osmStatus: '',
        provinceCode: '54',
        provinceName: 'แพร่',
        districtCode: '5406',
        districtName: 'สอง',
        subdistrictCode: '540601',
        subdistrictName: 'บ้านหนุน',
        villageCode: '540601001',
        villageNo: '1',
        villageName: 'หนุนเหนือ',
      },
    ];

    const familyItems = [
      {
        provinceCode: '54',
        provinceName: 'แพร่',
        districtCode: '5406',
        districtName: 'สอง',
        subdistrictCode: '540210',
        subdistrictName: 'ตำบลต้นทางนอกเขตย่อย',
        villageCode: '540603006',
        villageNo: '6',
        villageName: 'บ้านตัวอย่าง',
        osmCode: '99990000000099',
        citizenId: '1540600000099',
        prefixName: 'นางสาว',
        firstName: 'PRIVATE_VM_FAMILY_FIRST',
        lastName: 'PRIVATE_VM_FAMILY_LAST',
        fullName: 'นางสาว PRIVATE_VM_FAMILY_FIRST PRIVATE_VM_FAMILY_LAST',
        gender: 'female',
        address: 'PRIVATE_VM_ADDR_99/1',
        status: 'volunteer',
        statusLabel: 'อสม.',
        volunteerId: 'SYNTHETIC-VM-VOL-UUID',
        volunteerName: 'PRIVATE_VM_VOL_NAME',
      },
    ];

    const legacySnapshotTabs = [
      { name: 'RGender_f010_20261119', rows: [['legacy_gender_keep']] },
      { name: 'RAssign_f010_20261119', rows: [['legacy_assign_keep']] },
      { name: 'RResign_f010_20261119', rows: [['legacy_resign_keep']] },
      { name: 'RTenure_f010_20261119', rows: [['legacy_tenure_keep']] },
      {
        name: 'RFamily_f010_20261119',
        rows: [
          ['{"status":"PUBLISHED"}'],
          ['_source_key', 'provinceCode'],
          ['snapshot_f010_20261119_00001', '54'],
        ],
      },
    ];

    const { context, sheets, properties, propertyMutations } = createCompiledBundleVmHarness({
      properties: {
        THAIPHC_WRITE_ENABLED: 'true',
        THAIPHC_PERSON_DATA_WRITE_ENABLED: 'false',
      },
      initialSheets: [
        { name: 'ชีต1', rows: [['baseline-keep', 'do-not-touch']] },
        {
          name: '_ThaiPHCReportCurrent',
          rows: [
            ['endpoint', 'run_id', 'snapshot_sheet', 'row_count', 'manifest_digest'],
            ['volunteer-gender', 'f010_20261119', 'RGender_f010_20261119', 85, '1'.repeat(64)],
            ['assignments', 'f010_20261119', 'RAssign_f010_20261119', 1571, '2'.repeat(64)],
            ['resigned-volunteers', 'f010_20261119', 'RResign_f010_20261119', 1152, '3'.repeat(64)],
            ['volunteer-tenure', 'f010_20261119', 'RTenure_f010_20261119', 1571, '4'.repeat(64)],
            ['volunteer-family', 'f010_20261119', 'RFamily_f010_20261119', 1803, '5'.repeat(64)],
          ],
        },
        ...legacySnapshotTabs,
      ],
      fetchHandler: (url: string) => {
        const parsed = new URL(url);
        if (parsed.pathname.includes('/lookups/subdistricts')) {
          return JSON.stringify({ items: subdistricts8 });
        }
        if (parsed.pathname.includes('/lookups/villages')) {
          return JSON.stringify({ items: villages85 });
        }
        if (parsed.pathname.includes('/health-services')) {
          const offset = Number(parsed.searchParams.get('offset') ?? '0');
          const limit = Number(parsed.searchParams.get('limit') ?? '10');
          return JSON.stringify({
            items: healthServices18.slice(offset, offset + limit),
            total: healthServices18.length,
            limit,
            offset,
          });
        }
        if (parsed.pathname.includes('/reports/volunteer-gender')) {
          return JSON.stringify({
            success: true,
            message: 'Success',
            items: genderItems,
            total: genderItems.length,
            page: 1,
            pageSize: 100,
          });
        }
        if (parsed.pathname.includes('/dashboard/assignments')) {
          return JSON.stringify({
            provinces: [
              { provinceCode: '54', provinceNameTh: 'แพร่', provinceNameEn: 'Phrae', osmCount: 1 },
            ],
            items: assignmentItems,
            pagination: { page: 1, limit: 100, total: assignmentItems.length, pages: 1 },
          });
        }
        if (parsed.pathname.includes('/reports/resigned-volunteers')) {
          return JSON.stringify({
            success: true,
            message: 'Success',
            items: resignedItems,
            total: resignedItems.length,
            page: 1,
            pageSize: 100,
          });
        }
        if (parsed.pathname.includes('/reports/volunteer-tenure')) {
          return JSON.stringify({
            success: true,
            message: 'Success',
            items: tenureItems,
            total: tenureItems.length,
            page: 1,
            pageSize: 100,
          });
        }
        if (parsed.pathname.includes('/reports/volunteer-family')) {
          return JSON.stringify({
            success: true,
            message: 'Success',
            items: familyItems,
            total: familyItems.length,
            page: 1,
            pageSize: 100,
          });
        }
        throw new Error(`Unexpected URL in VM test: ${url}`);
      },
    });

    // 1. Subdistricts (8 rows)
    const subPrev = roundTripJson(
      context.previewDataset({ endpoint: 'subdistricts', token: VALID_VM_TOKEN }),
    );
    expect(subPrev.ok).toBe(true);
    expect(subPrev.data.status).toBe('READY');
    expect(subPrev.data.counts).toEqual({ insert: 8, update: 0, unchanged: 0, review: 0 });
    const subCommit = roundTripJson(
      context.commitSmallDataset({
        endpoint: 'subdistricts',
        token: VALID_VM_TOKEN,
        expectedFingerprint: subPrev.data.fingerprint,
      }),
    );
    expect(subCommit.ok).toBe(true);
    expect(subCommit.data.status).toBe('COMMITTED_VERIFIED');
    expect(subCommit.data.readback.actualRowCount).toBe(8);

    // 2. Villages (85 rows, expands to 28 columns with @ text format)
    const vilPrev = roundTripJson(
      context.previewDataset({ endpoint: 'villages', token: VALID_VM_TOKEN }),
    );
    expect(vilPrev.ok).toBe(true);
    expect(vilPrev.data.status).toBe('READY');
    expect(vilPrev.data.counts).toEqual({ insert: 85, update: 0, unchanged: 0, review: 0 });
    const vilCommit = roundTripJson(
      context.commitSmallDataset({
        endpoint: 'villages',
        token: VALID_VM_TOKEN,
        expectedFingerprint: vilPrev.data.fingerprint,
      }),
    );
    expect(vilCommit.ok).toBe(true);
    expect(vilCommit.data.status).toBe('COMMITTED_VERIFIED');
    expect(vilCommit.data.readback.actualRowCount).toBe(85);
    const villagesSheet = sheets.find((s) => s.getName() === 'Villages')!;
    expect(villagesSheet.getMaxColumns()).toBe(28);

    // 3. HealthServices (18 rows across 2 offset pages, 1 PLACEHOLDER_COORDS review)
    const hsPrev = roundTripJson(
      context.previewDataset({ endpoint: 'health-services', token: VALID_VM_TOKEN, pageSize: 10 }),
    );
    expect(hsPrev.ok).toBe(true);
    expect(hsPrev.data.status).toBe('READY');
    expect(hsPrev.data.pagesFetched).toBe(2);
    expect(hsPrev.data.counts).toEqual({ insert: 18, update: 0, unchanged: 0, review: 1 });
    expect(hsPrev.data.reviewBreakdown).toEqual({ PLACEHOLDER_COORDS: 1 });
    const hsCommit = roundTripJson(
      context.commitSmallDataset({
        endpoint: 'health-services',
        token: VALID_VM_TOKEN,
        expectedFingerprint: hsPrev.data.fingerprint,
      }),
    );
    expect(hsCommit.ok).toBe(true);
    expect(hsCommit.data.status).toBe('COMMITTED_VERIFIED');
    expect(hsCommit.data.readback.actualRowCount).toBe(18);

    // Confirm 111-row Historical Acceptance Baseline established (8 + 85 + 18 = 111 data rows)
    // and leading-zero "@" text formatting applied across all 3 Reference Datasets
    const countDataRows = (tabName: string) =>
      (sheets.find((s) => s.getName() === tabName)?.state.rows.length ?? 1) - 1;
    expect(
      countDataRows('Subdistricts') + countDataRows('Villages') + countDataRows('HealthServices'),
    ).toBe(111);
    for (const refTab of ['Subdistricts', 'Villages', 'HealthServices']) {
      const refSheet = sheets.find((s) => s.getName() === refTab)!;
      expect(refSheet.state.numberFormats.some((fmt) => fmt.endsWith(':@'))).toBe(true);
    }

    // 4. VolunteerGender (fail-closed when THAIPHC_PERSON_DATA_WRITE_ENABLED=false, then READY + LEGACY_F010_SNAPSHOT_PRESENT + Small-Cell Suppression)
    const vgPrevBlocked = roundTripJson(
      context.previewDataset({ endpoint: 'volunteer-gender', token: VALID_VM_TOKEN }),
    );
    expect(vgPrevBlocked.ok).toBe(true);
    expect(vgPrevBlocked.data.status).toBe('READY');
    expect(vgPrevBlocked.data.writeAllowed).toBe(false);
    expect(vgPrevBlocked.data.blockedGuardReason).toBe('THAIPHC_PERSON_DATA_WRITE_ENABLED');
    expect(vgPrevBlocked.data.legacySnapshotPresent).toBe(true);
    expect(vgPrevBlocked.data.legacySnapshotTab).toBe('RGender_f010_20261119');
    expect(vgPrevBlocked.data.reviewBreakdown).toEqual({ SMALL_CELL_SUPPRESSED: 1 });

    properties.THAIPHC_PERSON_DATA_WRITE_ENABLED = 'true';
    const vgCommit = roundTripJson(
      context.commitSmallDataset({
        endpoint: 'volunteer-gender',
        token: VALID_VM_TOKEN,
        expectedFingerprint: vgPrevBlocked.data.fingerprint,
      }),
    );
    expect(vgCommit.ok).toBe(true);
    expect(vgCommit.data.status).toBe('COMMITTED_VERIFIED');
    expect(vgCommit.data.destinationTab).toBe('VolunteerGender');

    // Helper for the 3 large Keyed Upsert person-level Extended Reports
    const runLargeKeyedReport = (
      endpoint: 'assignments' | 'resigned-volunteers' | 'volunteer-tenure',
      expectedTab: string,
      expectedLegacyTab: string,
      expectedGoldenH1: string,
      expectedReviewBreakdown: Record<string, number>,
    ) => {
      const independentH1 = computeIndependentF010Pseudonym(
        VALID_HMAC_KEY,
        endpoint,
        'SYNTHETIC-UUID-0001',
      );
      expect(independentH1).toBe(expectedGoldenH1);

      const batch = roundTripJson(
        context.previewDatasetBatch({
          endpoint,
          token: VALID_VM_TOKEN,
          startPage: 1,
          batchPages: 10,
          pageSize: 100,
        }),
      );
      expect(batch.ok).toBe(true);
      expect(batch.data.status).toBe('BATCH_OK');
      expect(batch.data.rowDigests[0].key).toBe(independentH1);
      expect(JSON.stringify(batch)).not.toMatch(
        /PRIVATE_VM_|1540600000001|99990000000001|SYNTHETIC-UUID-0001/,
      );

      const preview = roundTripJson(
        context.finalizePreview({
          endpoint,
          sourceTotal: batch.data.sourceTotal,
          pagesFetched: batch.data.pagesFetchedInBatch,
          rowDigests: batch.data.rowDigests,
          aggregateSummary: batch.data.aggregateSummary,
          sampleCandidates: batch.data.sampleCandidates,
        }),
      );
      expect(preview.ok).toBe(true);
      expect(preview.data.status).toBe('READY');
      expect(preview.data.legacySnapshotPresent).toBe(true);
      expect(preview.data.legacySnapshotTab).toBe(expectedLegacyTab);
      expect(preview.data.reviewBreakdown).toEqual(expectedReviewBreakdown);

      const staged = roundTripJson(
        context.stageLargeDatasetBatch({
          endpoint,
          token: VALID_VM_TOKEN,
          expectedFingerprint: preview.data.fingerprint,
          startPage: 1,
          batchPages: 10,
          pageSize: 100,
        }),
      );
      expect(staged.ok).toBe(true);
      expect(staged.data.status).toBe('BATCH_STAGED');
      const stageSheet = sheets.find((s) => s.getName() === staged.data.stagingTabName);
      expect(stageSheet).toBeDefined();
      expect(stageSheet!.isSheetHidden()).toBe(true);

      const committed = roundTripJson(
        context.finalizeLargeDatasetCommit({
          endpoint,
          expectedFingerprint: preview.data.fingerprint,
          runId: staged.data.runId,
        }),
      );
      expect(committed.ok).toBe(true);
      expect(committed.data.status).toBe('COMMITTED_VERIFIED');
      expect(committed.data.destinationTab).toBe(expectedTab);
      expect(committed.data.readback.verified).toBe(true);
      expect(committed.data.readback.stagingTabCleaned).toBe(true);
      expect(sheets.some((s) => s.getName() === staged.data.stagingTabName)).toBe(false);
      expect(JSON.stringify(committed)).not.toMatch(
        new RegExp(`PRIVATE_VM_|${VALID_HMAC_KEY}|${VALID_VM_TOKEN}`),
      );
    };

    // 5. Assignments (F010 h1_ parity + _Stage_* cleanup + RAssign_* preserved)
    runLargeKeyedReport(
      'assignments',
      'Assignments',
      'RAssign_f010_20261119',
      'h1_4f10838fd01347c17a887f30804cd7ec9096af7fca7e3a42e837654f96a31da0',
      {},
    );

    // 6. ResignedVolunteers (F010 h1_ parity + Preserve Source Locality LOCALITY_MISMATCH + _Stage_* cleanup + RResign_* preserved)
    runLargeKeyedReport(
      'resigned-volunteers',
      'ResignedVolunteers',
      'RResign_f010_20261119',
      'h1_94cbfd42e553f1f6601ffb2b901651695dd1ce7f0809229599e0e0ed0002125f',
      { LOCALITY_MISMATCH: 1 },
    );

    // 7. VolunteerTenure (F010 h1_ parity + nullable fields + _Stage_* cleanup + RTenure_* preserved)
    runLargeKeyedReport(
      'volunteer-tenure',
      'VolunteerTenure',
      'RTenure_f010_20261119',
      'h1_66126a00e8b2fc885553b574702c7b19f069a6455edaa9d650d62ff9b528b4b0',
      {},
    );

    // 8. VolunteerFamily (Complete Snapshot + Preserve Source Locality + _ThaiPHCReportCurrent Publication Pointer)
    const famBatch = roundTripJson(
      context.previewDatasetBatch({
        endpoint: 'volunteer-family',
        token: VALID_VM_TOKEN,
        startPage: 1,
        batchPages: 10,
        pageSize: 100,
      }),
    );
    expect(famBatch.ok).toBe(true);
    expect(famBatch.data.status).toBe('BATCH_OK');
    expect(famBatch.data.rowDigests[0].key).toBe('snapshot_preview_00001');
    expect(famBatch.data.rowDigests[0].reviewReasons).toEqual(['LOCALITY_MISMATCH']);
    expect(JSON.stringify(famBatch)).not.toMatch(
      /PRIVATE_VM_FAMILY|PRIVATE_VM_ADDR|1540600000099|99990000000099|SYNTHETIC-VM-VOL-UUID|PRIVATE_VM_VOL_NAME/,
    );

    const famPreview = roundTripJson(
      context.finalizePreview({
        endpoint: 'volunteer-family',
        sourceTotal: famBatch.data.sourceTotal,
        pagesFetched: famBatch.data.pagesFetchedInBatch,
        rowDigests: famBatch.data.rowDigests,
        aggregateSummary: famBatch.data.aggregateSummary,
        sampleCandidates: famBatch.data.sampleCandidates,
      }),
    );
    expect(famPreview.ok).toBe(true);
    expect(famPreview.data.status).toBe('READY');
    expect(famPreview.data.syncMode).toBe('COMPLETE_SNAPSHOT');
    expect(famPreview.data.activeSnapshotTab).toBe('RFamily_f010_20261119');
    expect(famPreview.data.reviewBreakdown).toEqual({ LOCALITY_MISMATCH: 1 });

    const famStage = roundTripJson(
      context.stageLargeDatasetBatch({
        endpoint: 'volunteer-family',
        token: VALID_VM_TOKEN,
        expectedFingerprint: famPreview.data.fingerprint,
        startPage: 1,
        batchPages: 10,
        pageSize: 100,
      }),
    );
    expect(famStage.ok).toBe(true);
    expect(famStage.data.status).toBe('BATCH_STAGED');
    const famSheetObj = sheets.find((s) => s.getName() === famStage.data.stagingTabName)!;
    expect(famSheetObj.isSheetHidden()).toBe(true);

    const famCommit = roundTripJson(
      context.finalizeLargeDatasetCommit({
        endpoint: 'volunteer-family',
        expectedFingerprint: famPreview.data.fingerprint,
        runId: famStage.data.runId,
      }),
    );
    expect(famCommit.ok).toBe(true);
    expect(famCommit.data.status).toBe('COMMITTED_VERIFIED');
    expect(famCommit.data.syncMode).toBe('COMPLETE_SNAPSHOT');
    expect(famCommit.data.readback.verified).toBe(true);
    expect(famCommit.data.readback.publicationPointerVerified).toBe(true);
    expect(famSheetObj.isSheetHidden()).toBe(false);

    // Post-all-8 invariants:
    // A. ชีต1 preserved intact
    expect(sheets.find((s) => s.getName() === 'ชีต1')?.state.rows).toEqual([
      ['baseline-keep', 'do-not-touch'],
    ]);
    // B. Exact 111-row Historical Acceptance Baseline preserved across all 5 Extended Report commits
    expect(countDataRows('Subdistricts')).toBe(8);
    expect(countDataRows('Villages')).toBe(85);
    expect(countDataRows('HealthServices')).toBe(18);
    // C. All 5 F010 Legacy Snapshot tabs preserved untouched (never auto-deleted)
    for (const legacyTab of legacySnapshotTabs) {
      const persisted = sheets.find((s) => s.getName() === legacyTab.name);
      expect(persisted).toBeDefined();
      expect(persisted!.state.rows).toEqual(legacyTab.rows);
    }
    // D. Dashboard reflects all 8 datasets COMMITTED_VERIFIED, zero unresolved runs, zero secrets/PII
    const dashFinal = roundTripJson(context.getDashboardStatus());
    expect(dashFinal.ok).toBe(true);
    expect(dashFinal.data.unresolvedRuns).toEqual([]);
    expect(dashFinal.data.datasets).toHaveLength(8);
    for (const ds of dashFinal.data.datasets) {
      expect(ds.lastStatus).toBe('COMMITTED_VERIFIED');
    }
    expect(
      dashFinal.data.datasets.find((d: { endpoint: string }) => d.endpoint === 'subdistricts')
        ?.rowCount,
    ).toBe(8);
    expect(
      dashFinal.data.datasets.find((d: { endpoint: string }) => d.endpoint === 'villages')
        ?.rowCount,
    ).toBe(85);
    expect(
      dashFinal.data.datasets.find((d: { endpoint: string }) => d.endpoint === 'health-services')
        ?.rowCount,
    ).toBe(18);
    expect(
      dashFinal.data.datasets.find((d: { endpoint: string }) => d.endpoint === 'volunteer-family'),
    ).toMatchObject({
      destinationTab: famStage.data.stagingTabName,
      publicationPointerActive: true,
      rowCount: 1,
    });
    expect(propertyMutations).toEqual([]);
    expect(JSON.stringify(dashFinal)).not.toMatch(/PRIVATE_VM_|MDEyMzQ1Njc4OWFiY2Rl/);
    // E. Zero raw PII written to any sheet in the workbook
    for (const sheet of sheets) {
      expect(JSON.stringify(sheet.state.rows)).not.toMatch(
        /PRIVATE_VM_|1540600000001|1540600000099|99990000000001|99990000000099|SYNTHETIC-UUID-0001|SYNTHETIC-VM-VOL-UUID/,
      );
    }
  });

  it('preserves Missing in Source rows without auto-deletion and retains hidden _Stage_* tabs on failure vs post-readback cleanup in node:vm', () => {
    let currentSubdistricts = build8Subdistricts().slice(0, 2);
    let currentAssignments = [
      makeAssignmentItem('SYNTHETIC-UUID-0001', '1'),
      makeAssignmentItem('SYNTHETIC-UUID-0002', '2'),
    ];
    let failAssignmentsLiveWrite = false;

    const { context, sheets } = createCompiledBundleVmHarness({
      initialSheets: [{ name: 'ชีต1', rows: [['keep']] }],
      fetchHandler: (url: string) => {
        if (url.includes('/lookups/subdistricts')) {
          return JSON.stringify({ items: currentSubdistricts });
        }
        if (url.includes('/dashboard/assignments')) {
          return JSON.stringify({
            provinces: [
              {
                provinceCode: '54',
                provinceNameTh: 'แพร่',
                provinceNameEn: 'Phrae',
                osmCount: currentAssignments.length,
              },
            ],
            items: currentAssignments,
            pagination: {
              page: 1,
              limit: 100,
              total: currentAssignments.length,
              pages: 1,
            },
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
      shouldFailWrite: (sheetName: string, row: number) =>
        failAssignmentsLiveWrite && sheetName === 'Assignments' && row >= 2,
    });

    // 1. Seed 2 Subdistricts, then drop 540602 from source -> MISSING_IN_SOURCE REVIEW & non-deletion
    const subPrev1 = roundTripJson(
      context.previewDataset({ endpoint: 'subdistricts', token: VALID_VM_TOKEN }),
    );
    expect(subPrev1.ok && subPrev1.data.status === 'READY').toBe(true);
    const subCommit1 = roundTripJson(
      context.commitSmallDataset({
        endpoint: 'subdistricts',
        token: VALID_VM_TOKEN,
        expectedFingerprint: subPrev1.data.fingerprint,
      }),
    );
    expect(subCommit1.ok && subCommit1.data.status === 'COMMITTED_VERIFIED').toBe(true);

    currentSubdistricts = [
      { ...build8Subdistricts()[0], name_en: 'Ban Nun Updated' },
      build8Subdistricts()[2],
    ];
    const subPrev2 = roundTripJson(
      context.previewDataset({ endpoint: 'subdistricts', token: VALID_VM_TOKEN }),
    );
    expect(subPrev2.ok).toBe(true);
    expect(subPrev2.data.status).toBe('READY');
    expect(subPrev2.data.counts).toEqual({ insert: 1, update: 1, unchanged: 0, review: 1 });
    expect(subPrev2.data.reviewBreakdown).toEqual({ MISSING_IN_SOURCE: 1 });

    const subCommit2 = roundTripJson(
      context.commitSmallDataset({
        endpoint: 'subdistricts',
        token: VALID_VM_TOKEN,
        expectedFingerprint: subPrev2.data.fingerprint,
      }),
    );
    expect(subCommit2.ok).toBe(true);
    expect(subCommit2.data.status).toBe('COMMITTED_VERIFIED');
    expect(subCommit2.data.readback.actualRowCount).toBe(3);
    const subRows = sheets.find((s) => s.getName() === 'Subdistricts')!.state.rows;
    expect(subRows.slice(1).map((r) => r[0])).toEqual(['540601', '540602', '540603']);

    // 2. Seed 2 Assignments, then drop SYNTHETIC-UUID-0002 -> MISSING_IN_SOURCE REVIEW & non-deletion
    const previewAssignments = () => {
      const batch = roundTripJson(
        context.previewDatasetBatch({
          endpoint: 'assignments',
          token: VALID_VM_TOKEN,
          startPage: 1,
          batchPages: 10,
          pageSize: 100,
        }),
      );
      expect(batch.ok && batch.data.status === 'BATCH_OK').toBe(true);
      const finalized = roundTripJson(
        context.finalizePreview({
          endpoint: 'assignments',
          sourceTotal: batch.data.sourceTotal,
          pagesFetched: batch.data.pagesFetchedInBatch,
          rowDigests: batch.data.rowDigests,
          aggregateSummary: batch.data.aggregateSummary,
          sampleCandidates: batch.data.sampleCandidates,
        }),
      );
      expect(finalized.ok && finalized.data.status === 'READY').toBe(true);
      return finalized.data;
    };

    const assignPrev1 = previewAssignments();
    const assignStage1 = roundTripJson(
      context.stageLargeDatasetBatch({
        endpoint: 'assignments',
        token: VALID_VM_TOKEN,
        expectedFingerprint: assignPrev1.fingerprint,
        startPage: 1,
        batchPages: 10,
        pageSize: 100,
      }),
    );
    const assignCommit1 = roundTripJson(
      context.finalizeLargeDatasetCommit({
        endpoint: 'assignments',
        expectedFingerprint: assignPrev1.fingerprint,
        runId: assignStage1.data.runId,
      }),
    );
    expect(assignCommit1.ok && assignCommit1.data.status === 'COMMITTED_VERIFIED').toBe(true);
    expect(assignCommit1.data.readback.stagingTabCleaned).toBe(true);
    expect(sheets.some((s) => s.getName() === assignStage1.data.stagingTabName)).toBe(false);

    // Drop UUID-0002 and update UUID-0001 villageNo -> verify MISSING_IN_SOURCE preserved
    currentAssignments = [makeAssignmentItem('SYNTHETIC-UUID-0001', '9')];
    const assignPrev2 = previewAssignments();
    expect(assignPrev2.counts).toEqual({ insert: 0, update: 1, unchanged: 0, review: 1 });
    expect(assignPrev2.reviewBreakdown).toEqual({ MISSING_IN_SOURCE: 1 });

    // 3A. Failure retention Case 1: tampered staged cell -> STAGING_DIGEST_MISMATCH retains hidden _Stage_* tab
    const tamperStage = roundTripJson(
      context.stageLargeDatasetBatch({
        endpoint: 'assignments',
        token: VALID_VM_TOKEN,
        expectedFingerprint: assignPrev2.fingerprint,
        startPage: 1,
        batchPages: 10,
        pageSize: 100,
      }),
    );
    expect(tamperStage.ok && tamperStage.data.status === 'BATCH_STAGED').toBe(true);
    const tamperStageSheet = sheets.find((s) => s.getName() === tamperStage.data.stagingTabName)!;
    expect(tamperStageSheet.isSheetHidden()).toBe(true);
    // Corrupt one staged cell on data row (row index 2 -> 3rd sheet row)
    tamperStageSheet.state.rows[2][3] = 'TAMPERED_CELL';

    const tamperFinalize = roundTripJson(
      context.finalizeLargeDatasetCommit({
        endpoint: 'assignments',
        expectedFingerprint: assignPrev2.fingerprint,
        runId: tamperStage.data.runId,
      }),
    );
    expect(tamperFinalize.ok).toBe(true);
    expect(tamperFinalize.data.status).toBe('FAILED_STOP');
    expect(tamperFinalize.data.stopCode).toBe('STAGING_DIGEST_MISMATCH');
    expect(tamperFinalize.data.stagingTabRetained).toBe(tamperStage.data.stagingTabName);
    expect(sheets.some((s) => s.getName() === tamperStage.data.stagingTabName)).toBe(true);
    expect(tamperStageSheet.isSheetHidden()).toBe(true);

    // 3B. Failure retention Case 2: live write failure -> UNKNOWN_OUTCOME_STOP retains hidden _Stage_* tab and raises UNRESOLVED_PREVIOUS_RUN
    const failWriteStage = roundTripJson(
      context.stageLargeDatasetBatch({
        endpoint: 'assignments',
        token: VALID_VM_TOKEN,
        expectedFingerprint: assignPrev2.fingerprint,
        startPage: 1,
        batchPages: 10,
        pageSize: 100,
      }),
    );
    expect(failWriteStage.ok && failWriteStage.data.status === 'BATCH_STAGED').toBe(true);
    failAssignmentsLiveWrite = true;
    const failWriteFinalize = roundTripJson(
      context.finalizeLargeDatasetCommit({
        endpoint: 'assignments',
        expectedFingerprint: assignPrev2.fingerprint,
        runId: failWriteStage.data.runId,
      }),
    );
    failAssignmentsLiveWrite = false;
    expect(failWriteFinalize.ok).toBe(true);
    expect(failWriteFinalize.data.status).toBe('UNKNOWN_OUTCOME_STOP');
    expect(failWriteFinalize.data.syncLogStatus).toBe('STARTED');
    expect(failWriteFinalize.data.stagingTabRetained).toBe(failWriteStage.data.stagingTabName);
    const failWriteStageSheet = sheets.find(
      (s) => s.getName() === failWriteStage.data.stagingTabName,
    );
    expect(failWriteStageSheet).toBeDefined();
    expect(failWriteStageSheet!.isSheetHidden()).toBe(true);

    const dashWithUnresolved = roundTripJson(context.getDashboardStatus());
    expect(dashWithUnresolved.ok).toBe(true);
    expect(dashWithUnresolved.data.unresolvedRuns).toHaveLength(1);
    expect(dashWithUnresolved.data.unresolvedRuns[0]).toMatchObject({
      endpoint: 'assignments',
      runId: failWriteStage.data.runId,
      status: 'STARTED',
    });

    // 3C. Recovery run after inspection: deletes ONLY its own _Stage_* after readback, preserves MISSING_IN_SOURCE row AND prior retained failure staging tabs
    const assignPrevRecovery = previewAssignments();
    expect(assignPrevRecovery.unresolvedPreviousRun?.runId).toBe(failWriteStage.data.runId);
    expect(assignPrevRecovery.reviewBreakdown).toEqual({ MISSING_IN_SOURCE: 1 });

    const recoveryStage = roundTripJson(
      context.stageLargeDatasetBatch({
        endpoint: 'assignments',
        token: VALID_VM_TOKEN,
        expectedFingerprint: assignPrevRecovery.fingerprint,
        acknowledgeUnresolvedRunId: failWriteStage.data.runId,
        startPage: 1,
        batchPages: 10,
        pageSize: 100,
      }),
    );
    expect(recoveryStage.ok && recoveryStage.data.status === 'BATCH_STAGED').toBe(true);
    const recoveryFinalize = roundTripJson(
      context.finalizeLargeDatasetCommit({
        endpoint: 'assignments',
        expectedFingerprint: assignPrevRecovery.fingerprint,
        acknowledgeUnresolvedRunId: failWriteStage.data.runId,
        runId: recoveryStage.data.runId,
      }),
    );
    expect(recoveryFinalize.ok).toBe(true);
    expect(recoveryFinalize.data.status).toBe('COMMITTED_VERIFIED');
    expect(recoveryFinalize.data.readback.verified).toBe(true);
    expect(recoveryFinalize.data.readback.actualRowCount).toBe(2); // 1 updated + 1 MISSING_IN_SOURCE preserved!
    expect(recoveryFinalize.data.readback.stagingTabCleaned).toBe(true);

    // Recovery run's own _Stage_* cleaned up after readback, while prior failure _Stage_* tabs remain retained hidden
    expect(sheets.some((s) => s.getName() === recoveryStage.data.stagingTabName)).toBe(false);
    expect(sheets.some((s) => s.getName() === tamperStage.data.stagingTabName)).toBe(true);
    expect(sheets.some((s) => s.getName() === failWriteStage.data.stagingTabName)).toBe(true);
    expect(sheets.find((s) => s.getName() === 'ชีต1')?.state.rows).toEqual([['keep']]);
  });
});
