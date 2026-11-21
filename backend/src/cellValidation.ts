import type { PreviewDiagnostic, PreviewStopCode } from './types.ts';

export const MAX_CELL_LENGTH = 32767;
export const SUBDISTRICT_PATTERN = /^54060[1-8]$/;
export const VILLAGE_CODE_PATTERN = /^54060[1-8]\d{3}$/;
export const FORMULA_INJECTION_PATTERN = /^\s*[=+\-@]/;

export type FieldPresence = 'ABSENT' | 'NULL' | 'VALUE';

export class CellValidationError extends Error {
  readonly code: PreviewStopCode;

  constructor(code: PreviewStopCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function hasAsciiControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

export function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function assertSafeString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new CellValidationError('TYPE_MISMATCH', `Field "${fieldName}" must be a string.`);
  }
  if (value.length > MAX_CELL_LENGTH) {
    throw new CellValidationError(
      'TYPE_MISMATCH',
      `Field "${fieldName}" exceeds maximum Google Sheets cell length.`,
    );
  }
  if (hasAsciiControlChar(value)) {
    throw new CellValidationError(
      'ASCII_CONTROL_CHAR',
      `Field "${fieldName}" contains forbidden ASCII control characters.`,
    );
  }
  if (FORMULA_INJECTION_PATTERN.test(value)) {
    throw new CellValidationError(
      'FORMULA_INJECTION_DETECTED',
      `Field "${fieldName}" starts with a forbidden spreadsheet formula prefix (=, +, -, @).`,
    );
  }
  return value;
}

export function validateKeyedRowPreamble(
  raw: unknown,
  rowIndex: number,
  keyField: string,
  allowedFieldNames: ReadonlySet<string>,
  seenKeys: ReadonlySet<string>,
):
  | { ok: true; record: Record<string, unknown>; key: string }
  | { ok: false; diagnostic: PreviewDiagnostic } {
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      diagnostic: {
        code: 'TYPE_MISMATCH',
        message: `Row #${rowIndex + 1} is not a JSON object.`,
        rowIndex,
      },
    };
  }

  const unexpectedKeys = Object.keys(raw).filter((k) => !allowedFieldNames.has(k));
  if (unexpectedKeys.length > 0) {
    return {
      ok: false,
      diagnostic: {
        code: 'UNEXPECTED_FIELD',
        message: `Row #${rowIndex + 1} contains unexpected schema field "${unexpectedKeys[0]}".`,
        field: unexpectedKeys[0],
        rowIndex,
      },
    };
  }

  if (!hasOwn(raw, keyField) || raw[keyField] === null) {
    return {
      ok: false,
      diagnostic: {
        code: 'MISSING_SOURCE_KEY',
        message: `Row #${rowIndex + 1} is missing required key field "${keyField}".`,
        field: keyField,
        rowIndex,
      },
    };
  }

  let key: string;
  try {
    key = assertSafeString(raw[keyField], keyField);
    if (key.length === 0) {
      return {
        ok: false,
        diagnostic: {
          code: 'MISSING_SOURCE_KEY',
          message: `Row #${rowIndex + 1} has an empty key field "${keyField}".`,
          field: keyField,
          rowIndex,
        },
      };
    }
  } catch (err) {
    const code = err instanceof CellValidationError ? err.code : 'TYPE_MISMATCH';
    return {
      ok: false,
      diagnostic: {
        code,
        message:
          err instanceof CellValidationError
            ? err.message
            : `Row #${rowIndex + 1} key field "${keyField}" is invalid.`,
        field: keyField,
        rowIndex,
      },
    };
  }

  if (seenKeys.has(key)) {
    return {
      ok: false,
      diagnostic: {
        code: 'DUPLICATE_SOURCE_KEY',
        message: `Duplicate source key detected at row #${rowIndex + 1}.`,
        field: keyField,
        rowIndex,
      },
    };
  }

  return { ok: true, record: raw, key };
}

export function computeDatasetDigest(
  rows: ReadonlyArray<{ key: string; rowDigest: string }>,
  sha256Hex: (input: string) => string,
): string {
  const digestInput = rows
    .map((r) => [r.key, r.rowDigest] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return sha256Hex(JSON.stringify(digestInput));
}
