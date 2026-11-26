import { getDashboardStatusWithPlatform } from './dashboardService.ts';
import {
  finalizeLargeDatasetCommitWithPlatform,
  finalizePreviewWithPlatform,
  previewDatasetBatchWithPlatform,
  stageLargeDatasetBatchWithPlatform,
} from './largeKeyedSyncService.ts';
import { bytesToHex } from './pseudonymizer.ts';
import {
  commitSmallDatasetWithPlatform,
  previewDatasetWithPlatform,
} from './referenceSyncService.ts';
import type {
  CommitDatasetResponse,
  CommitSmallDatasetRequest,
  DashboardPlatform,
  DashboardStatusResponse,
  DatasetEndpoint,
  FinalizeLargeDatasetCommitRequest,
  FinalizePreviewRequest,
  HttpFetchOptions,
  HttpFetchResponse,
  PreviewDatasetBatchRequest,
  PreviewDatasetBatchResponse,
  PreviewDatasetRequest,
  PreviewDatasetResponse,
  SheetHandle,
  SpreadsheetHandle,
  StageLargeDatasetBatchRequest,
  StageLargeDatasetBatchResponse,
  SyncPlatform,
  WritableSheetHandle,
  WritableSpreadsheetHandle,
} from './types.ts';

function wrapReadOnlySheet(sheet: GoogleAppsScript.Spreadsheet.Sheet): SheetHandle {
  return {
    getLastRow: () => sheet.getLastRow(),
    getLastColumn: () => sheet.getLastColumn(),
    getValues: (row: number, col: number, numRows: number, numCols: number) =>
      sheet.getRange(row, col, numRows, numCols).getValues(),
  };
}

function wrapWritableSheet(sheet: GoogleAppsScript.Spreadsheet.Sheet): WritableSheetHandle {
  return {
    getName: () => sheet.getName(),
    getLastRow: () => sheet.getLastRow(),
    getLastColumn: () => sheet.getLastColumn(),
    getMaxRows: () => sheet.getMaxRows(),
    getMaxColumns: () => sheet.getMaxColumns(),
    insertColumnsAfter: (afterPosition: number, howMany: number) => {
      sheet.insertColumnsAfter(afterPosition, howMany);
    },
    insertRowsAfter: (afterPosition: number, howMany: number) => {
      sheet.insertRowsAfter(afterPosition, howMany);
    },
    setFrozenRows: (rows: number) => {
      sheet.setFrozenRows(rows);
    },
    hideSheet: () => {
      sheet.hideSheet();
    },
    showSheet: () => {
      sheet.showSheet();
    },
    isSheetHidden: () => sheet.isSheetHidden(),
    getValues: (row: number, col: number, numRows: number, numCols: number) =>
      sheet.getRange(row, col, numRows, numCols).getValues(),
    setValues: (row: number, col: number, values: unknown[][]) => {
      const numRows = values.length;
      const numCols = values[0]?.length ?? 0;
      if (numRows > 0 && numCols > 0) {
        sheet.getRange(row, col, numRows, numCols).setValues(values);
      }
    },
    setNumberFormat: (
      row: number,
      col: number,
      numRows: number,
      numCols: number,
      format: string,
    ) => {
      if (numRows > 0 && numCols > 0) {
        sheet.getRange(row, col, numRows, numCols).setNumberFormat(format);
      }
    },
  };
}

function wrapReadOnlySpreadsheet(
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
): SpreadsheetHandle {
  return {
    getName: () => spreadsheet.getName(),
    getSheetByName: (name: string) => {
      const sheet = spreadsheet.getSheetByName(name);
      return sheet ? wrapReadOnlySheet(sheet) : null;
    },
    getSheetNames: () => spreadsheet.getSheets().map((sheet) => sheet.getName()),
  };
}

function wrapWritableSpreadsheet(
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
): WritableSpreadsheetHandle {
  return {
    getName: () => spreadsheet.getName(),
    getSheetByName: (name: string) => {
      const sheet = spreadsheet.getSheetByName(name);
      return sheet ? wrapWritableSheet(sheet) : null;
    },
    getSheetNames: () => spreadsheet.getSheets().map((sheet) => sheet.getName()),
    insertSheet: (name: string) => wrapWritableSheet(spreadsheet.insertSheet(name)),
    deleteSheetByName: (name: string) => {
      const sheet = spreadsheet.getSheetByName(name);
      if (!sheet) return false;
      spreadsheet.deleteSheet(sheet);
      return true;
    },
  };
}

function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      bytes += 4;
      i += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function formatRunTimestamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    '_',
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join('');
}

function createDashboardPlatform(): DashboardPlatform {
  const scriptProperties = PropertiesService.getScriptProperties();
  return {
    getProperty: (key: string) => scriptProperties.getProperty(key),
    openSpreadsheetById: (id: string) => wrapReadOnlySpreadsheet(SpreadsheetApp.openById(id)),
    now: () => new Date(),
  };
}

function createSyncPlatform(): SyncPlatform {
  const scriptProperties = PropertiesService.getScriptProperties();
  return {
    getProperty: (key: string) => scriptProperties.getProperty(key),
    openSpreadsheetById: (id: string) => wrapWritableSpreadsheet(SpreadsheetApp.openById(id)),
    now: () => new Date(),
    fetchUrl: (url: string, options: HttpFetchOptions): HttpFetchResponse => {
      const response = UrlFetchApp.fetch(url, {
        method: options.method,
        followRedirects: options.followRedirects,
        muteHttpExceptions: options.muteHttpExceptions,
        headers: options.headers,
      });
      const statusCode = response.getResponseCode();
      const rawHeaders = response.getAllHeaders() as Record<string, string | string[]>;
      const rawContent = response.getContent();
      const contentText = response.getContentText('UTF-8');
      const byteLength = Array.isArray(rawContent)
        ? rawContent.length
        : utf8ByteLength(contentText);
      return {
        statusCode,
        headers: rawHeaders ?? {},
        contentText,
        byteLength,
      };
    },
    sha256Hex: (input: string) => {
      const digest = Utilities.computeDigest(
        Utilities.DigestAlgorithm.SHA_256,
        Utilities.newBlob(input).getBytes(),
      );
      return bytesToHex(digest);
    },
    base64Decode: (b64: string) => Utilities.base64Decode(b64),
    base64Encode: (bytes: number[]) => Utilities.base64Encode(bytes),
    hmacSha256Bytes: (input: string, keyBytes: number[]) =>
      Utilities.computeHmacSha256Signature(Utilities.newBlob(input).getBytes(), keyBytes),
    tryScriptLock: (timeoutMs: number) => {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(timeoutMs)) {
        return null;
      }
      return {
        releaseLock: () => lock.releaseLock(),
      };
    },
    flushSpreadsheet: () => {
      SpreadsheetApp.flush();
    },
    generateRunId: (endpoint: DatasetEndpoint, now: Date) => {
      const suffix = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
      const slug = endpoint.replace(/[^a-z0-9]/gi, '').slice(0, 12);
      return `run_${formatRunTimestamp(now)}_${slug}_${suffix}`;
    },
  };
}

export function doGet(): GoogleAppsScript.HTML.HtmlOutput {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('ThaiPHC Data Connector')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

export function getDashboardStatus(): DashboardStatusResponse {
  try {
    return getDashboardStatusWithPlatform(createDashboardPlatform());
  } catch {
    return {
      ok: false,
      error: {
        code: 'DASHBOARD_LOAD_FAILED',
        message: 'Failed to load dashboard status.',
      },
    };
  }
}

export function previewDataset(request: PreviewDatasetRequest): PreviewDatasetResponse {
  try {
    return previewDatasetWithPlatform(request, createSyncPlatform());
  } catch {
    return {
      ok: false,
      error: {
        code: 'PREVIEW_FAILED',
        message: 'Failed to complete read-only dataset preview.',
      },
    };
  }
}

export function previewDatasetBatch(
  request: PreviewDatasetBatchRequest,
): PreviewDatasetBatchResponse {
  try {
    return previewDatasetBatchWithPlatform(request, createSyncPlatform());
  } catch {
    return {
      ok: false,
      error: {
        code: 'PREVIEW_FAILED',
        message: 'Failed to complete batched dataset preview.',
      },
    };
  }
}

export function finalizePreview(request: FinalizePreviewRequest): PreviewDatasetResponse {
  try {
    return finalizePreviewWithPlatform(request, createSyncPlatform());
  } catch {
    return {
      ok: false,
      error: {
        code: 'PREVIEW_FAILED',
        message: 'Failed to finalize read-only dataset preview.',
      },
    };
  }
}

export function commitSmallDataset(request: CommitSmallDatasetRequest): CommitDatasetResponse {
  try {
    return commitSmallDatasetWithPlatform(request, createSyncPlatform());
  } catch {
    return {
      ok: false,
      error: {
        code: 'COMMIT_FAILED',
        message: 'Commit failed unexpectedly before completion.',
      },
    };
  }
}

export function stageLargeDatasetBatch(
  request: StageLargeDatasetBatchRequest,
): StageLargeDatasetBatchResponse {
  try {
    return stageLargeDatasetBatchWithPlatform(request, createSyncPlatform());
  } catch {
    return {
      ok: false,
      error: {
        code: 'COMMIT_FAILED',
        message: 'Staging batch failed unexpectedly.',
      },
    };
  }
}

export function finalizeLargeDatasetCommit(
  request: FinalizeLargeDatasetCommitRequest,
): CommitDatasetResponse {
  try {
    return finalizeLargeDatasetCommitWithPlatform(request, createSyncPlatform());
  } catch {
    return {
      ok: false,
      error: {
        code: 'COMMIT_FAILED',
        message: 'Finalize commit failed unexpectedly.',
      },
    };
  }
}
