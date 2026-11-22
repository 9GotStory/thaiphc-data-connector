import {
  computeDatasetDigest,
  hasOwn,
  isPlainObject,
  type FieldPresence,
} from './cellValidation.ts';
import type { KeyedDatasetSchemaSpec } from './datasetCatalog.ts';
import {
  applyTextFormatsToRange,
  type CellScalar,
  type ProjectedKeyedRowBase,
} from './keyedSyncCore.ts';
import { PSEUDONYMOUS_KEY_PATTERN, SHA256_HEX_PATTERN } from './pseudonymizer.ts';
import type {
  AppEnvironment,
  LargeKeyedDatasetEndpoint,
  WritableSheetHandle,
  WritableSpreadsheetHandle,
} from './types.ts';

export const STAGING_PROTOCOL_VERSION = 'THAIPHC_STAGE_V1';
export const MAX_STAGING_TAB_NAME_LENGTH = 95;

export interface StagingMetadata {
  version: typeof STAGING_PROTOCOL_VERSION;
  endpoint: LargeKeyedDatasetEndpoint;
  env: AppEnvironment;
  runId: string;
  expectedFingerprintDigest: string;
  expectedSourceTotal: number;
  expectedDatasetDigest: string;
  expectedSheetRevisionFingerprint: string;
  pageSize: number;
  lastPageStaged: number;
  totalPages: number;
  stagedRowCount: number;
  chunkDigests: string[];
  status: 'STAGING';
}

export function getStagingHeaders(schema: KeyedDatasetSchemaSpec): string[] {
  return [
    '_source_key',
    ...schema.fields.map((f) => f.name),
    '_field_presence_json',
    '_row_digest',
    '__chunk_ordinal',
  ];
}

export function getStagingTextColumnIndices(schema: KeyedDatasetSchemaSpec): number[] {
  const cols: number[] = [1]; // _source_key
  for (let i = 0; i < schema.fields.length; i++) {
    const kind = schema.fields[i].kind;
    if (
      kind === 'string' ||
      kind === 'string_or_null' ||
      kind === 'null_only' ||
      kind === 'object' ||
      kind === 'array'
    ) {
      cols.push(i + 2);
    }
  }
  cols.push(schema.fields.length + 2); // _field_presence_json
  cols.push(schema.fields.length + 3); // _row_digest
  return cols;
}

export function computeChunkDigest(
  rows: ReadonlyArray<{ key: string; rowDigest: string }>,
  sha256Hex: (input: string) => string,
): string {
  return sha256Hex(JSON.stringify(rows.map((r) => [r.key, r.rowDigest])));
}

export function writeStagingBatch(params: {
  spreadsheet: WritableSpreadsheetHandle;
  schema: KeyedDatasetSchemaSpec<LargeKeyedDatasetEndpoint>;
  stageTabName: string;
  isFirstBatch: boolean;
  existingStageSheet: WritableSheetHandle | null;
  priorStagedRowCount: number;
  chunkOrdinal: number;
  rows: readonly ProjectedKeyedRowBase[];
  nextMeta: StagingMetadata;
}): { ok: true } | { ok: false; message: string } {
  const {
    spreadsheet,
    schema,
    stageTabName,
    isFirstBatch,
    existingStageSheet,
    priorStagedRowCount,
    chunkOrdinal,
    rows,
    nextMeta,
  } = params;

  const stagingHeaders = getStagingHeaders(schema);
  const textCols = getStagingTextColumnIndices(schema);
  const rowsToWrite: CellScalar[][] = rows.map((r) => [
    r.key,
    ...r.values.map((v) => (v === null ? '' : v)),
    JSON.stringify(r.presence),
    r.rowDigest,
    chunkOrdinal,
  ]);

  let stageSheet: WritableSheetHandle;
  if (isFirstBatch) {
    if (spreadsheet.getSheetByName(stageTabName)) {
      return { ok: false, message: `Hidden staging tab "${stageTabName}" already exists.` };
    }
    stageSheet = spreadsheet.insertSheet(stageTabName);
    stageSheet.hideSheet();
    const maxCols = stageSheet.getMaxColumns();
    if (maxCols < stagingHeaders.length) {
      stageSheet.insertColumnsAfter(maxCols, stagingHeaders.length - maxCols);
    }
    stageSheet.setValues(2, 1, [stagingHeaders]);
    stageSheet.setFrozenRows(2);
    const formatRows = Math.max(1, stageSheet.getMaxRows() - 2);
    applyTextFormatsToRange(stageSheet, 3, formatRows, textCols);
  } else {
    if (!existingStageSheet) {
      return { ok: false, message: `Hidden staging tab "${stageTabName}" was not found.` };
    }
    stageSheet = existingStageSheet;
  }

  const startRow = priorStagedRowCount + 3;
  const endRow = startRow + rowsToWrite.length - 1;
  if (endRow > stageSheet.getMaxRows()) {
    stageSheet.insertRowsAfter(stageSheet.getMaxRows(), endRow - stageSheet.getMaxRows());
  }
  applyTextFormatsToRange(stageSheet, startRow, rowsToWrite.length, textCols);
  stageSheet.setValues(startRow, 1, rowsToWrite);
  stageSheet.setValues(1, 1, [[JSON.stringify(nextMeta)]]);
  return { ok: true };
}

export function parseStagingMetadata(
  sheet: WritableSheetHandle,
  schema: KeyedDatasetSchemaSpec<LargeKeyedDatasetEndpoint>,
  expected: {
    endpoint: LargeKeyedDatasetEndpoint;
    env: AppEnvironment;
    runId: string;
    expectedFingerprintDigest: string;
  },
): { ok: true; meta: StagingMetadata } | { ok: false; message: string } {
  const expectedHeaders = getStagingHeaders(schema);
  if (sheet.getLastRow() < 2 || sheet.getLastColumn() !== expectedHeaders.length) {
    return {
      ok: false,
      message: 'Hidden staging tab structure is incomplete or header column count does not match.',
    };
  }
  const headerRow = sheet.getValues(2, 1, 1, expectedHeaders.length)[0] ?? [];
  if (!expectedHeaders.every((h, idx) => headerRow[idx] === h)) {
    return {
      ok: false,
      message: 'Hidden staging tab headers do not match expected minimized schema.',
    };
  }
  const rawMetaCell = sheet.getValues(1, 1, 1, 1)[0]?.[0];
  if (typeof rawMetaCell !== 'string' || rawMetaCell.length === 0) {
    return { ok: false, message: 'Hidden staging tab metadata is missing.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawMetaCell);
  } catch {
    return { ok: false, message: 'Hidden staging tab metadata is not valid JSON.' };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, message: 'Hidden staging tab metadata is malformed.' };
  }
  if (
    parsed.version !== STAGING_PROTOCOL_VERSION ||
    parsed.endpoint !== expected.endpoint ||
    parsed.env !== expected.env ||
    parsed.runId !== expected.runId ||
    parsed.expectedFingerprintDigest !== expected.expectedFingerprintDigest ||
    parsed.status !== 'STAGING' ||
    !Number.isSafeInteger(parsed.expectedSourceTotal) ||
    (parsed.expectedSourceTotal as number) < 1 ||
    typeof parsed.expectedDatasetDigest !== 'string' ||
    typeof parsed.expectedSheetRevisionFingerprint !== 'string' ||
    !Number.isSafeInteger(parsed.pageSize) ||
    (parsed.pageSize as number) < 1 ||
    !Number.isSafeInteger(parsed.lastPageStaged) ||
    (parsed.lastPageStaged as number) < 1 ||
    !Number.isSafeInteger(parsed.totalPages) ||
    (parsed.totalPages as number) < 1 ||
    !Number.isSafeInteger(parsed.stagedRowCount) ||
    (parsed.stagedRowCount as number) < 0 ||
    !Array.isArray(parsed.chunkDigests) ||
    parsed.chunkDigests.some((d) => typeof d !== 'string' || !SHA256_HEX_PATTERN.test(d))
  ) {
    return { ok: false, message: 'Hidden staging tab metadata failed integrity checks.' };
  }
  const meta = parsed as unknown as StagingMetadata;
  if (sheet.getLastRow() !== meta.stagedRowCount + 2) {
    return {
      ok: false,
      message: 'Hidden staging tab row count does not match recorded stagedRowCount.',
    };
  }
  return { ok: true, meta };
}

export function reconstructAndVerifyStagedRows(
  sheet: WritableSheetHandle,
  schema: KeyedDatasetSchemaSpec<LargeKeyedDatasetEndpoint>,
  meta: StagingMetadata,
  sha256Hex: (input: string) => string,
):
  | { ok: true; rows: ProjectedKeyedRowBase[]; datasetDigest: string }
  | { ok: false; code: 'DUPLICATE_SOURCE_KEY' | 'STAGING_DIGEST_MISMATCH'; message: string } {
  const expectedHeaders = getStagingHeaders(schema);
  const totalCols = expectedHeaders.length;
  const fieldCount = schema.fields.length;
  const presenceColIdx = fieldCount + 1;
  const digestColIdx = fieldCount + 2;
  const chunkColIdx = fieldCount + 3;

  const rawRows = sheet.getValues(3, 1, meta.stagedRowCount, totalCols);
  const seenKeys = new Set<string>();
  const reconstructedRows: ProjectedKeyedRowBase[] = [];
  const rowsByChunk = new Map<number, Array<{ key: string; rowDigest: string }>>();

  for (let i = 0; i < rawRows.length; i++) {
    const cells = rawRows[i];
    const key = cells[0];
    if (typeof key !== 'string' || !PSEUDONYMOUS_KEY_PATTERN.test(key)) {
      return {
        ok: false,
        code: 'STAGING_DIGEST_MISMATCH',
        message: `Staged row #${i + 1} has a malformed Pseudonymous Key.`,
      };
    }
    if (seenKeys.has(key)) {
      return {
        ok: false,
        code: 'DUPLICATE_SOURCE_KEY',
        message: `Duplicate Pseudonymous Key detected across staged batches at row #${i + 1}.`,
      };
    }
    seenKeys.add(key);

    const rawPresence = cells[presenceColIdx];
    const storedDigest = cells[digestColIdx];
    const chunkOrdinal = cells[chunkColIdx];
    if (
      typeof rawPresence !== 'string' ||
      typeof storedDigest !== 'string' ||
      !SHA256_HEX_PATTERN.test(storedDigest) ||
      typeof chunkOrdinal !== 'number' ||
      !Number.isSafeInteger(chunkOrdinal) ||
      chunkOrdinal < 1 ||
      chunkOrdinal > meta.chunkDigests.length
    ) {
      return {
        ok: false,
        code: 'STAGING_DIGEST_MISMATCH',
        message: `Staged row #${i + 1} has corrupted metadata or chunk ordinal.`,
      };
    }

    let parsedPresence: unknown;
    try {
      parsedPresence = JSON.parse(rawPresence);
    } catch {
      return {
        ok: false,
        code: 'STAGING_DIGEST_MISMATCH',
        message: `Staged row #${i + 1} has invalid _field_presence_json.`,
      };
    }
    if (!isPlainObject(parsedPresence)) {
      return {
        ok: false,
        code: 'STAGING_DIGEST_MISMATCH',
        message: `Staged row #${i + 1} _field_presence_json must be an object.`,
      };
    }

    const values: Array<CellScalar | null> = [];
    const presence: Record<string, FieldPresence> = {};

    for (let fIdx = 0; fIdx < fieldCount; fIdx++) {
      const field = schema.fields[fIdx];
      if (!hasOwn(parsedPresence, field.name)) {
        return {
          ok: false,
          code: 'STAGING_DIGEST_MISMATCH',
          message: `Staged row #${i + 1} is missing presence state for "${field.name}".`,
        };
      }
      const pState = parsedPresence[field.name];
      if (pState !== 'ABSENT' && pState !== 'NULL' && pState !== 'VALUE') {
        return {
          ok: false,
          code: 'STAGING_DIGEST_MISMATCH',
          message: `Staged row #${i + 1} has invalid presence state for "${field.name}".`,
        };
      }
      presence[field.name] = pState;
      const cell = cells[fIdx + 1];

      if (pState === 'ABSENT' || pState === 'NULL') {
        if (cell !== '' && cell !== null && cell !== undefined) {
          return {
            ok: false,
            code: 'STAGING_DIGEST_MISMATCH',
            message: `Staged row #${i + 1} cell "${field.name}" does not match ${pState} presence.`,
          };
        }
        values.push(null);
      } else if (field.kind === 'boolean') {
        if (typeof cell !== 'boolean') {
          return {
            ok: false,
            code: 'STAGING_DIGEST_MISMATCH',
            message: `Staged row #${i + 1} boolean cell "${field.name}" failed type verification.`,
          };
        }
        values.push(cell);
      } else {
        if (typeof cell !== 'string') {
          return {
            ok: false,
            code: 'STAGING_DIGEST_MISMATCH',
            message: `Staged row #${i + 1} text cell "${field.name}" failed type verification.`,
          };
        }
        values.push(cell);
      }
    }

    const recomputedDigest = sha256Hex(JSON.stringify([values, presence]));
    if (recomputedDigest !== storedDigest) {
      return {
        ok: false,
        code: 'STAGING_DIGEST_MISMATCH',
        message: `Staged row #${i + 1} failed independent _row_digest verification.`,
      };
    }

    const chunkList = rowsByChunk.get(chunkOrdinal);
    if (chunkList) {
      chunkList.push({ key, rowDigest: recomputedDigest });
    } else {
      rowsByChunk.set(chunkOrdinal, [{ key, rowDigest: recomputedDigest }]);
    }

    reconstructedRows.push({
      key,
      values,
      presence,
      rowDigest: recomputedDigest,
      reviewReasons: [],
    });
  }

  for (let ord = 1; ord <= meta.chunkDigests.length; ord++) {
    const chunkEntries = rowsByChunk.get(ord);
    if (!chunkEntries || chunkEntries.length === 0) {
      return {
        ok: false,
        code: 'STAGING_DIGEST_MISMATCH',
        message: `Staged chunk #${ord} is missing from hidden staging tab.`,
      };
    }
    if (computeChunkDigest(chunkEntries, sha256Hex) !== meta.chunkDigests[ord - 1]) {
      return {
        ok: false,
        code: 'STAGING_DIGEST_MISMATCH',
        message: `Staged chunk #${ord} digest does not match recorded staging manifest.`,
      };
    }
  }

  return {
    ok: true,
    rows: reconstructedRows,
    datasetDigest: computeDatasetDigest(reconstructedRows, sha256Hex),
  };
}
