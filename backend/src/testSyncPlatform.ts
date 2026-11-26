import { createHash, createHmac } from 'node:crypto';
import type {
  HttpFetchOptions,
  HttpFetchResponse,
  SyncPlatform,
  WritableSheetHandle,
  WritableSpreadsheetHandle,
} from './types.ts';

export const TEST_REF_SHEET_ID = '1REFdefGHIjklMNOpqrSTUvwxYZ0123456789';
export const TEST_REPORT_SHEET_ID = '1REPdefGHIjklMNOpqrSTUvwxYZ0123456789';
export const TEST_HMAC_KEY_B64 = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

export interface MockSheetState {
  name: string;
  rows: unknown[][];
  maxRows: number;
  maxColumns: number;
  frozenRows: number;
  hidden: boolean;
  numberFormats: Map<string, string>;
  writeOps: string[];
}

export interface MockWorkbookState {
  name: string;
  sheets: Map<string, MockSheetState>;
  sheetOrder: string[];
}

export function testSha256Hex(input: string): string {
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

export function jsonHttpResponse(body: unknown, status = 200): HttpFetchResponse {
  const text = JSON.stringify(body);
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    contentText: text,
    byteLength: Buffer.byteLength(text, 'utf8'),
  };
}

export function createFakeSyncPlatformEnv(opts: {
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
    [TEST_REF_SHEET_ID]: {
      name: 'ThaiPHC Reference (Sandbox)',
      initialSheets: [{ name: 'ชีต1', rows: [['keep-ref']] }],
    },
    [TEST_REPORT_SHEET_ID]: {
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
      showSheet: () => {
        state.hidden = false;
        state.writeOps.push('showSheet');
      },
      isSheetHidden: () => state.hidden,
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
    THAIPHC_SPREADSHEET_ID: TEST_REF_SHEET_ID,
    THAIPHC_REPORT_SPREADSHEET_ID: TEST_REPORT_SHEET_ID,
    THAIPHC_WRITE_ENABLED: 'true',
    THAIPHC_PERSON_DATA_WRITE_ENABLED: 'true',
    THAIPHC_FULL_PII_WRITE_ENABLED: 'true',
    THAIPHC_HMAC_KEY_B64: TEST_HMAC_KEY_B64,
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
    now: () => new Date(opts.nowIso ?? '2026-11-22T02:00:00.000Z'),
    fetchUrl: (url: string, options: HttpFetchOptions) => {
      fetchCalls.push({ url, options });
      return opts.fetchHandler(url, options);
    },
    sha256Hex: testSha256Hex,
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
      const slug = endpoint.replace(/[^a-z0-9]/gi, '').slice(0, 12);
      return `run_20261122_${slug}_${String(runSeq).padStart(2, '0')}`;
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
