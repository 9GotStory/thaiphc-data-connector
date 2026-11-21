import { getDashboardStatusWithPlatform } from './dashboardService.ts';
import type {
  DashboardPlatform,
  DashboardStatusResponse,
  SheetHandle,
  SpreadsheetHandle,
} from './types.ts';

function wrapSheet(sheet: GoogleAppsScript.Spreadsheet.Sheet): SheetHandle {
  return {
    getLastRow: () => sheet.getLastRow(),
    getLastColumn: () => sheet.getLastColumn(),
    getValues: (row: number, col: number, numRows: number, numCols: number) =>
      sheet.getRange(row, col, numRows, numCols).getValues(),
  };
}

function wrapSpreadsheet(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet): SpreadsheetHandle {
  return {
    getName: () => spreadsheet.getName(),
    getSheetByName: (name: string) => {
      const sheet = spreadsheet.getSheetByName(name);
      return sheet ? wrapSheet(sheet) : null;
    },
    getSheetNames: () => spreadsheet.getSheets().map((sheet) => sheet.getName()),
  };
}

function createGasPlatform(): DashboardPlatform {
  const scriptProperties = PropertiesService.getScriptProperties();
  return {
    getProperty: (key: string) => scriptProperties.getProperty(key),
    openSpreadsheetById: (id: string) => wrapSpreadsheet(SpreadsheetApp.openById(id)),
    now: () => new Date(),
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
    return getDashboardStatusWithPlatform(createGasPlatform());
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
