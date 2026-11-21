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

    const makeFakeSheet = (name: string, rows: unknown[][]) => ({
      getName: () => name,
      getLastRow: () => rows.length,
      getLastColumn: () => (rows[0] ? rows[0].length : 0),
      getRange: (row: number, col: number, numRows: number, numCols: number) => ({
        getValues: () =>
          Array.from({ length: numRows }, (_, r) =>
            Array.from({ length: numCols }, (_, c) => rows[row - 1 + r]?.[col - 1 + c] ?? ''),
          ),
      }),
    });

    const sheets = [
      makeFakeSheet('Subdistricts', [['code'], ['540601'], ['540602']]),
      makeFakeSheet('_ThaiPHCSyncLog', [
        ['run_id', 'timestamp_utc', 'env', 'endpoint', 'sync_mode', 'status'],
        [
          'run_20261121_0800',
          '2026-11-21T01:00:00.000Z',
          'SANDBOX',
          'subdistricts',
          'KEYED_UPSERT',
          'COMMITTED_VERIFIED',
        ],
      ]),
    ];

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
        openById: (id: string) => {
          if (id !== VALID_SHEET_ID) throw new Error('WRONG_ID');
          return {
            getId: () => id,
            getName: () => 'ThaiPHC VM Sandbox',
            getSheetByName: (name: string) => sheets.find((s) => s.getName() === name) ?? null,
            getSheets: () => sheets,
          };
        },
      },
    };

    const context = vm.createContext(sandbox);
    vm.runInContext(code, context, { filename: 'Code.js', timeout: 2000 });

    expect(typeof context.doGet).toBe('function');
    expect(typeof context.getDashboardStatus).toBe('function');

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
      rowCount: 2,
      lastRunId: 'run_20261121_0800',
      lastStatus: 'COMMITTED_VERIFIED',
    });
    expect(propertyMutations).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(VALID_HMAC_KEY);
  });
});
