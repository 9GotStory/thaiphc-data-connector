import {
  assertSafeString,
  CellValidationError,
  computeDatasetDigest,
  hasOwn,
  isPlainObject,
  MAX_CELL_LENGTH,
  SUBDISTRICT_PATTERN,
  validateKeyedRowPreamble,
  VILLAGE_CODE_PATTERN,
  type FieldPresence,
} from './cellValidation.ts';
import {
  REFERENCE_SCHEMAS,
  type ReferenceFieldKind,
  type ReferenceSchemaSpec,
} from './datasetCatalog.ts';
import type { PreviewDiagnostic, ReferenceDatasetEndpoint, ReviewReasonCode } from './types.ts';

export type { FieldPresence } from './cellValidation.ts';

const MAX_NESTED_DEPTH = 8;
const MAX_NESTED_ITEMS = 150;

export interface ProjectedReferenceRow {
  key: string;
  values: Array<string | number | null>;
  presence: Record<string, FieldPresence>;
  rowDigest: string;
  displayName: string;
  displayCode: string;
  reviewReasons: ReviewReasonCode[];
}

export type ReferenceValidationResult =
  | {
      ok: true;
      rows: ProjectedReferenceRow[];
      datasetDigest: string;
    }
  | {
      ok: false;
      diagnostics: PreviewDiagnostic[];
    };

function canonicalizeJsonValue(value: unknown, fieldName: string, depth = 0): unknown {
  if (depth > MAX_NESTED_DEPTH) {
    throw new CellValidationError(
      'TYPE_MISMATCH',
      `Nested field "${fieldName}" exceeds maximum depth.`,
    );
  }
  if (value === null) return null;
  if (typeof value === 'string') {
    return assertSafeString(value, fieldName);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new CellValidationError(
        'TYPE_MISMATCH',
        `Nested field "${fieldName}" contains a non-finite number.`,
      );
    }
    return value;
  }
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    if (value.length > MAX_NESTED_ITEMS) {
      throw new CellValidationError(
        'TYPE_MISMATCH',
        `Nested array "${fieldName}" exceeds maximum item limit.`,
      );
    }
    return value.map((item) => canonicalizeJsonValue(item, fieldName, depth + 1));
  }
  if (!isPlainObject(value)) {
    throw new CellValidationError(
      'TYPE_MISMATCH',
      `Nested field "${fieldName}" contains an unsupported value type.`,
    );
  }
  const sortedKeys = Object.keys(value).sort();
  if (sortedKeys.length > MAX_NESTED_ITEMS) {
    throw new CellValidationError(
      'TYPE_MISMATCH',
      `Nested object "${fieldName}" exceeds maximum key limit.`,
    );
  }
  const canonical: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    assertSafeString(key, `${fieldName}.${key}`);
    canonical[key] = canonicalizeJsonValue(value[key], `${fieldName}.${key}`, depth + 1);
  }
  return canonical;
}

function projectFieldValue(
  fieldName: string,
  kind: ReferenceFieldKind,
  value: unknown,
): string | number | null {
  if (value === null) {
    if (kind !== 'null_only' && kind !== 'string_or_null') {
      throw new CellValidationError('TYPE_MISMATCH', `Field "${fieldName}" cannot be null.`);
    }
    return null;
  }
  if (kind === 'null_only') {
    throw new CellValidationError(
      'TYPE_MISMATCH',
      `Observed null-only field "${fieldName}" received a non-null value.`,
    );
  }
  if (kind === 'string' || kind === 'string_or_null') {
    return assertSafeString(value, fieldName);
  }
  if (kind === 'integer') {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      throw new CellValidationError('TYPE_MISMATCH', `Field "${fieldName}" must be an integer.`);
    }
    return value;
  }
  if (kind === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new CellValidationError(
        'TYPE_MISMATCH',
        `Field "${fieldName}" must be a finite number.`,
      );
    }
    return value;
  }
  if (kind === 'object') {
    if (!isPlainObject(value)) {
      throw new CellValidationError('TYPE_MISMATCH', `Field "${fieldName}" must be a JSON object.`);
    }
    const serialized = JSON.stringify(canonicalizeJsonValue(value, fieldName));
    if (serialized.length > MAX_CELL_LENGTH) {
      throw new CellValidationError(
        'TYPE_MISMATCH',
        `Serialized JSON for "${fieldName}" exceeds maximum cell length.`,
      );
    }
    return serialized;
  }
  if (kind === 'array') {
    if (!Array.isArray(value)) {
      throw new CellValidationError('TYPE_MISMATCH', `Field "${fieldName}" must be a JSON array.`);
    }
    const serialized = JSON.stringify(canonicalizeJsonValue(value, fieldName));
    if (serialized.length > MAX_CELL_LENGTH) {
      throw new CellValidationError(
        'TYPE_MISMATCH',
        `Serialized JSON for "${fieldName}" exceeds maximum cell length.`,
      );
    }
    return serialized;
  }
  throw new CellValidationError('TYPE_MISMATCH', `Unsupported field kind for "${fieldName}".`);
}

function isWithinReferenceScope(
  endpoint: ReferenceDatasetEndpoint,
  row: Record<string, unknown>,
): boolean {
  if (endpoint === 'subdistricts') {
    return (
      row.district_code === '5406' &&
      typeof row.code === 'string' &&
      SUBDISTRICT_PATTERN.test(row.code) &&
      row.id === row.code
    );
  }

  if (endpoint === 'villages') {
    if (
      row.province_code !== '54' ||
      row.district_code !== '5406' ||
      typeof row.subdistrict_code !== 'string' ||
      !SUBDISTRICT_PATTERN.test(row.subdistrict_code) ||
      typeof row.code !== 'string' ||
      !VILLAGE_CODE_PATTERN.test(row.code) ||
      row.code.slice(0, 6) !== row.subdistrict_code ||
      row.id !== row.code ||
      typeof row.village_no !== 'number' ||
      !Number.isSafeInteger(row.village_no) ||
      row.village_no < 1 ||
      row.village_no > 99
    ) {
      return false;
    }
    const expected9 = `${row.subdistrict_code}${String(row.village_no).padStart(3, '0')}`;
    const expected8 = `${row.subdistrict_code}${String(row.village_no).padStart(2, '0')}`;
    return row.code === expected9 && row.village_code_8digit === expected8;
  }

  // health-services
  if (
    !isPlainObject(row.province) ||
    row.province.province_code !== '54' ||
    !isPlainObject(row.district) ||
    row.district.district_code !== '5406' ||
    !isPlainObject(row.subdistrict) ||
    typeof row.subdistrict.subdistrict_code !== 'string' ||
    !SUBDISTRICT_PATTERN.test(row.subdistrict.subdistrict_code) ||
    typeof row.health_service_code !== 'string' ||
    row.health_service_code.length === 0 ||
    typeof row.latitude !== 'number' ||
    !Number.isFinite(row.latitude) ||
    row.latitude < -90 ||
    row.latitude > 90 ||
    typeof row.longitude !== 'number' ||
    !Number.isFinite(row.longitude) ||
    row.longitude < -180 ||
    row.longitude > 180
  ) {
    return false;
  }

  if (Array.isArray(row.service_areas)) {
    for (const area of row.service_areas) {
      if (
        !isPlainObject(area) ||
        typeof area.subdistrict_code !== 'string' ||
        !SUBDISTRICT_PATTERN.test(area.subdistrict_code)
      ) {
        return false;
      }
    }
  }

  return true;
}

function extractDisplayMeta(
  schema: ReferenceSchemaSpec,
  row: Record<string, unknown>,
  key: string,
): { displayName: string; displayCode: string } {
  const nameVal = row[schema.displayNameField];
  return {
    displayName: typeof nameVal === 'string' && nameVal.length > 0 ? nameVal : key,
    displayCode: key,
  };
}

export function validateAndProjectReferenceRows(
  endpoint: ReferenceDatasetEndpoint,
  rawItems: readonly unknown[],
  sha256Hex: (input: string) => string,
): ReferenceValidationResult {
  const schema: ReferenceSchemaSpec = REFERENCE_SCHEMAS[endpoint];
  const diagnostics: PreviewDiagnostic[] = [];

  if (rawItems.length === 0) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'INCOMPLETE_PAGINATION',
          message: 'Source dataset returned zero rows.',
        },
      ],
    };
  }

  if (rawItems.length > schema.maxRows) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'ROW_LIMIT_EXCEEDED',
          message: `Source row count (${rawItems.length}) exceeds maximum safe limit (${schema.maxRows}) for ${endpoint}.`,
        },
      ],
    };
  }

  const allowedFieldNames = new Set(schema.fields.map((f) => f.name));
  const seenKeys = new Set<string>();
  const projectedRows: ProjectedReferenceRow[] = [];

  for (let rowIndex = 0; rowIndex < rawItems.length; rowIndex++) {
    const preamble = validateKeyedRowPreamble(
      rawItems[rowIndex],
      rowIndex,
      schema.keyField,
      allowedFieldNames,
      seenKeys,
    );
    if (!preamble.ok) {
      diagnostics.push(preamble.diagnostic);
      continue;
    }
    const { record: raw, key } = preamble;

    const values: Array<string | number | null> = [];
    const presence: Record<string, FieldPresence> = {};
    let rowFailed = false;

    for (const field of schema.fields) {
      if (!hasOwn(raw, field.name)) {
        presence[field.name] = 'ABSENT';
        values.push(null);
        continue;
      }
      const fieldValue = raw[field.name];
      try {
        if (fieldValue === null) {
          presence[field.name] = 'NULL';
          values.push(projectFieldValue(field.name, field.kind, null));
        } else {
          presence[field.name] = 'VALUE';
          values.push(projectFieldValue(field.name, field.kind, fieldValue));
        }
      } catch (err) {
        const code = err instanceof CellValidationError ? err.code : 'TYPE_MISMATCH';
        diagnostics.push({
          code,
          message:
            err instanceof CellValidationError
              ? err.message
              : `Row #${rowIndex + 1} field "${field.name}" failed validation.`,
          field: field.name,
          rowIndex,
        });
        rowFailed = true;
        break;
      }
    }

    if (rowFailed) {
      continue;
    }

    if (!isWithinReferenceScope(endpoint, raw)) {
      diagnostics.push({
        code: 'OUT_OF_GEOGRAPHIC_SCOPE',
        message: `Row #${rowIndex + 1} falls outside Geographic Scope (54 / 5406) for ${endpoint}.`,
        rowIndex,
      });
      continue;
    }

    seenKeys.add(key);

    // Exact F010 / 111-row Historical Acceptance Baseline row digest formula
    const rowDigest = sha256Hex(JSON.stringify([values, presence]));
    const { displayName, displayCode } = extractDisplayMeta(schema, raw, key);
    const reviewReasons: ReviewReasonCode[] = [];
    if (endpoint === 'health-services' && raw.latitude === 0 && raw.longitude === 0) {
      reviewReasons.push('PLACEHOLDER_COORDS');
    }

    projectedRows.push({
      key,
      values,
      presence,
      rowDigest,
      displayName,
      displayCode,
      reviewReasons,
    });
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics: diagnostics.slice(0, 25) };
  }

  return {
    ok: true,
    rows: projectedRows,
    datasetDigest: computeDatasetDigest(projectedRows, sha256Hex),
  };
}
