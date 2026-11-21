import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const backendDir = fileURLToPath(new URL('..', import.meta.url));
const manifestPath = resolve(backendDir, 'appsscript.json');
const distCodePath = resolve(backendDir, 'dist/Code.js');
const distManifestPath = resolve(backendDir, 'dist/appsscript.json');
const distHtmlPath = resolve(backendDir, 'dist/index.html');
const buildScriptPath = resolve(backendDir, 'build.mjs');

const VALID_SHEET_ID = '1SMOKEdefGHIjklMNOpqrSTUvwxYZ01234567';
const VALID_HMAC_KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

describe('GAS Backend Bundle & Manifest Smoke Verification (node:vm)', () => {
  it('declares minimal OAuth scopes, Asia/Bangkok, V8, NONE exception logging, and MYSELF Web App access', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
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
  });

  it('compiles to backend/dist/Code.js and executes doGet and getDashboardStatus cleanly inside node:vm', () => {
    execFileSync(process.execPath, [buildScriptPath], { cwd: backendDir, stdio: 'pipe' });

    expect(existsSync(distCodePath)).toBe(true);
    expect(existsSync(distManifestPath)).toBe(true);
    expect(existsSync(distHtmlPath)).toBe(true);

    const bundledHtml = readFileSync(distHtmlPath, 'utf8');
    expect(bundledHtml).toContain('<div id="root"></div>');
    expect(bundledHtml).toContain('<script type="module"');
    expect(bundledHtml).toMatch(/<style[\s>]/);

    const code = readFileSync(distCodePath, 'utf8');
    const propertyMutations: string[] = [];

    const properties: Record<string, string> = {
      THAIPHC_ENV: 'SANDBOX',
      THAIPHC_SPREADSHEET_ID: VALID_SHEET_ID,
      THAIPHC_SAME_WORKBOOK_APPROVAL: 'OWNER_ONLY_5406_APPROVED',
      THAIPHC_WRITE_ENABLED: 'false',
      THAIPHC_PERSON_DATA_WRITE_ENABLED: 'false',
      THAIPHC_HMAC_KEY_B64: VALID_HMAC_KEY,
    };

    const makeFakeSheet = (name: string, rows: unknown[][]) => {
      const state = {
        rows: rows.map((r) => [...r]),
        maxRows: Math.max(100, rows.length + 10),
        maxColumns: Math.max(26, ...rows.map((r) => r.length)),
      };
      return {
        getName: () => name,
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
        getRange: (row: number, col: number, numRows: number, numCols: number) => ({
          getValues: () =>
            Array.from({ length: numRows }, (_, r) =>
              Array.from(
                { length: numCols },
                (_, c) => state.rows[row - 1 + r]?.[col - 1 + c] ?? '',
              ),
            ),
          setValues: (vals: unknown[][]) => {
            for (let r = 0; r < vals.length; r++) {
              const idx = row - 1 + r;
              while (state.rows.length <= idx) state.rows.push([]);
              for (let c = 0; c < vals[r].length; c++) {
                state.rows[idx][col - 1 + c] = vals[r][c];
              }
            }
          },
          setNumberFormat: () => undefined,
        }),
      };
    };

    const sheets = [
      makeFakeSheet('ชีต1', [['baseline-keep']]),
      makeFakeSheet('Subdistricts', [
        [
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
        ],
      ]),
      makeFakeSheet('_ThaiPHCSyncLog', [
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
          'run_20261121_0800',
          '2026-11-21T01:00:00.000Z',
          'SANDBOX',
          'subdistricts',
          'KEYED_UPSERT',
          'COMMITTED_VERIFIED',
          'abc',
          0,
          0,
          0,
          0,
          true,
        ],
      ]),
    ];

    const htmlCalls: Array<{
      filename: string;
      title?: string;
      metaTags: Array<[string, string]>;
      xFrameMode?: string;
    }> = [];

    const mockSubdistrictPayload = JSON.stringify({
      items: [
        {
          code: '540601',
          id: '540601',
          name_th: 'บ้านหนุน',
          name_en: 'Ban Nun',
          postal_code: '54120',
          label: 'บ้านหนุน / Ban Nun',
          district_code: '5406',
          district_name_th: 'สอง',
          district_name_en: 'Song',
          province_code: null,
          province_name_th: null,
          province_name_en: null,
        },
      ],
    });

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
              const s = makeFakeSheet(name, []);
              sheets.push(s);
              return s;
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
        fetch: () => ({
          getResponseCode: () => 200,
          getAllHeaders: () => ({ 'Content-Type': 'application/json' }),
          getContent: () => Array.from(Buffer.from(mockSubdistrictPayload, 'utf8')),
          getContentText: () => mockSubdistrictPayload,
        }),
      },
      Utilities: {
        DigestAlgorithm: { SHA_256: 'SHA_256' },
        newBlob: (str: string) => ({
          getBytes: () => Array.from(Buffer.from(str, 'utf8')),
        }),
        computeDigest: (_alg: string, bytes: number[]) =>
          Array.from(createHash('sha256').update(Buffer.from(bytes)).digest()),
        getUuid: () => '12345678-1234-1234-1234-1234567890ab',
      },
    };

    const context = vm.createContext(sandbox);
    vm.runInContext(code, context, { filename: 'Code.js', timeout: 2000 });

    expect(typeof context.doGet).toBe('function');
    expect(typeof context.getDashboardStatus).toBe('function');
    expect(typeof context.previewDataset).toBe('function');
    expect(typeof context.commitSmallDataset).toBe('function');

    context.doGet();
    expect(htmlCalls).toHaveLength(1);
    expect(htmlCalls[0]).toEqual({
      filename: 'index',
      title: 'ThaiPHC Data Connector',
      metaTags: [['viewport', 'width=device-width, initial-scale=1']],
      xFrameMode: 'DEFAULT',
    });

    const result = JSON.parse(JSON.stringify(context.getDashboardStatus()));
    expect(result.ok).toBe(true);
    expect(result.data.env).toBe('SANDBOX');
    expect(result.data.guards.hmacKeyConfigured).toBe(true);
    expect(result.data.datasets).toHaveLength(8);
    expect(result.data.datasets[0]).toMatchObject({
      endpoint: 'subdistricts',
      rowCount: 0,
      lastRunId: 'run_20261121_0800',
      lastStatus: 'COMMITTED_VERIFIED',
    });

    // Smoke-verify bundled previewDataset + commitSmallDataset in node:vm
    properties.THAIPHC_WRITE_ENABLED = 'true';
    const previewRes = JSON.parse(
      JSON.stringify(
        context.previewDataset({
          endpoint: 'subdistricts',
          token: 'synthetic_vm_token_1234567890',
        }),
      ),
    );
    expect(previewRes.ok).toBe(true);
    expect(previewRes.data.status).toBe('READY');
    expect(previewRes.data.counts).toEqual({ insert: 1, update: 0, unchanged: 0, review: 0 });

    const commitRes = JSON.parse(
      JSON.stringify(
        context.commitSmallDataset({
          endpoint: 'subdistricts',
          token: 'synthetic_vm_token_1234567890',
          expectedFingerprint: previewRes.data.fingerprint,
        }),
      ),
    );
    expect(commitRes.ok).toBe(true);
    expect(commitRes.data.status).toBe('COMMITTED_VERIFIED');
    expect(commitRes.data.readback.verified).toBe(true);
    expect(commitRes.data.readback.unrelatedTabsPreserved).toBe(true);

    expect(propertyMutations).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(VALID_HMAC_KEY);
    expect(JSON.stringify(commitRes)).not.toContain('synthetic_vm_token_1234567890');
  });
});
