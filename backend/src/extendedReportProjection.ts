import {
  assertSafeString,
  CellValidationError,
  computeDatasetDigest,
  hasOwn,
  isPlainObject,
  SUBDISTRICT_PATTERN,
  validateKeyedRowPreamble,
  VILLAGE_CODE_PATTERN,
  type FieldPresence,
} from './cellValidation.ts';
import {
  ASSIGNMENTS_SCHEMA,
  RESIGNED_VOLUNTEERS_SCHEMA,
  VOLUNTEER_FAMILY_SCHEMA,
  VOLUNTEER_GENDER_SCHEMA,
  VOLUNTEER_TENURE_SCHEMA,
  type KeyedDatasetSchemaSpec,
} from './datasetCatalog.ts';
import type {
  ExtendedAggregateGroup,
  ExtendedMinimizedAttribute,
  LargeKeyedDatasetEndpoint,
  PreviewDiagnostic,
  ReviewReasonCode,
} from './types.ts';

export const SMALL_CELL_THRESHOLD = 5;
const POSITIVE_VILLAGE_NO_PATTERN = /^0*[1-9]\d{0,2}$/;
const NON_NEGATIVE_VILLAGE_NO_PATTERN = /^\d{1,3}$/;

/**
 * Masks a 13-digit Thai citizenId for Preview UI display (ADR-0005), e.g.:
 * "1540612345678" -> "1-5406-xxxxx-xx-x".
 * Full unmasked citizenId values are written only to Google Sheets during Commit.
 */
export function maskCitizenIdForPreview(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const digits = trimmed.replace(/-/g, '');
  if (/^\d{13}$/.test(digits)) {
    return `${digits[0]}-${digits.slice(1, 5)}-xxxxx-xx-x`;
  }
  const prefixLen = Math.min(4, trimmed.length);
  return `${trimmed.slice(0, prefixLen)}•••••`;
}

function formatPreviewAttributeValue(
  fieldName: string,
  val: string | number | boolean | null | undefined,
): string | null {
  if (val === null || val === undefined) return null;
  if (fieldName === 'citizenId') {
    return maskCitizenIdForPreview(String(val));
  }
  return String(val);
}

export interface ProjectedVolunteerGenderRow {
  key: string;
  values: Array<string | number | null>;
  presence: Record<string, FieldPresence>;
  rowDigest: string;
  scopeLabel: string;
  subdistrictCode: string;
  subdistrictName: string;
  minimizedAttributes: ExtendedMinimizedAttribute[];
  reviewReasons: ReviewReasonCode[];
}

export type VolunteerGenderValidationResult =
  | {
      ok: true;
      rows: ProjectedVolunteerGenderRow[];
      datasetDigest: string;
      aggregateSummary: ExtendedAggregateGroup[];
    }
  | {
      ok: false;
      diagnostics: PreviewDiagnostic[];
    };

export interface SuppressedGenderCounts {
  total: number | null;
  male: number | null;
  female: number | null;
  suppressed: boolean;
}

export function formatExtendedScopeLabel(fields: {
  subdistrictCode: string;
  subdistrictName: string;
  villageNo: string;
  villageName: string | null;
  villageCode?: string;
}): string {
  const villageBase = [fields.villageNo ? `หมู่ ${fields.villageNo}` : '', fields.villageName ?? '']
    .filter(Boolean)
    .join(' ');
  const villageWithCode = fields.villageCode
    ? [villageBase, `(${fields.villageCode})`].filter(Boolean).join(' ')
    : villageBase;
  return [
    '54 / 5406',
    `${fields.subdistrictCode} ${fields.subdistrictName}`.trim(),
    villageWithCode,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function formatVolunteerGenderScopeLabel(fields: {
  subdistrictCode: string;
  subdistrictName: string;
  villageNo: string;
  villageName: string;
}): string {
  return formatExtendedScopeLabel(fields);
}

/**
 * Complementary Small-Cell Suppression (threshold = 5):
 * If any of male, female, or total falls in 1..4, both male and female become null,
 * and total becomes null if < 5. Zero counts (0) are never suppressed unless paired with a 1..4 count.
 */
export function applyComplementarySmallCellSuppression(
  male: number,
  female: number,
  total: number,
): SuppressedGenderCounts {
  const needsSuppression = [male, female, total].some(
    (count) => count > 0 && count < SMALL_CELL_THRESHOLD,
  );
  if (!needsSuppression) {
    return { total, male, female, suppressed: false };
  }
  return {
    total: total < SMALL_CELL_THRESHOLD ? null : total,
    male: null,
    female: null,
    suppressed: true,
  };
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function hasLowerLevelLocalityMismatch(
  row: {
    subdistrictCode?: unknown;
    villageCode?: unknown;
    villageNo?: unknown;
  },
  options: { requirePositiveVillageOrdinal?: boolean } = {},
): boolean {
  if (typeof row.subdistrictCode !== 'string' || !SUBDISTRICT_PATTERN.test(row.subdistrictCode)) {
    return true;
  }
  if (
    typeof row.villageCode !== 'string' ||
    !VILLAGE_CODE_PATTERN.test(row.villageCode) ||
    row.villageCode.slice(0, 6) !== row.subdistrictCode
  ) {
    return true;
  }
  const villageOrdinal = Number(row.villageCode.slice(6));
  const minOrdinal = options.requirePositiveVillageOrdinal ? 1 : 0;
  if (!Number.isSafeInteger(villageOrdinal) || villageOrdinal < minOrdinal) {
    return true;
  }
  if (typeof row.villageNo === 'string') {
    const pattern = options.requirePositiveVillageOrdinal
      ? POSITIVE_VILLAGE_NO_PATTERN
      : NON_NEGATIVE_VILLAGE_NO_PATTERN;
    if (!pattern.test(row.villageNo)) {
      return true;
    }
    if (Number(row.villageNo) !== villageOrdinal) {
      return true;
    }
  }
  return false;
}

function isWithinVolunteerGenderScope(row: Record<string, unknown>): boolean {
  return (
    row.provinceCode === '54' &&
    row.districtCode === '5406' &&
    !hasLowerLevelLocalityMismatch(row, { requirePositiveVillageOrdinal: true })
  );
}

export function validateAndProjectVolunteerGenderRows(
  rawItems: readonly unknown[],
  sha256Hex: (input: string) => string,
): VolunteerGenderValidationResult {
  const schema = VOLUNTEER_GENDER_SCHEMA;
  const diagnostics: PreviewDiagnostic[] = [];

  if (rawItems.length === 0) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'INCOMPLETE_SNAPSHOT',
          message: 'ThaiPHC volunteer-gender snapshot returned zero rows.',
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
          message: `Source row count (${rawItems.length}) exceeds maximum safe limit (${schema.maxRows}) for volunteer-gender.`,
        },
      ],
    };
  }

  const allowedFieldNames = new Set(schema.fields.map((f) => f.name));
  const seenKeys = new Set<string>();
  const projectedRows: ProjectedVolunteerGenderRow[] = [];
  const subdistrictAgg = new Map<
    string,
    { groupCode: string; groupLabel: string; rowCount: number; reviewCount: number }
  >();

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

    // Validate all string fields and integer fields
    const validatedStrings = new Map<string, string>();
    const validatedPresence: Record<string, FieldPresence> = {};
    let rowFailed = false;

    for (const field of schema.fields) {
      if (field.kind === 'integer') {
        if (!hasOwn(raw, field.name) || !isNonNegativeSafeInteger(raw[field.name])) {
          diagnostics.push({
            code: 'TYPE_MISMATCH',
            message: `Row #${rowIndex + 1} field "${field.name}" must be a non-negative integer.`,
            field: field.name,
            rowIndex,
          });
          rowFailed = true;
          break;
        }
        continue;
      }

      if (!hasOwn(raw, field.name)) {
        validatedPresence[field.name] = 'ABSENT';
        continue;
      }
      try {
        const safeStr = assertSafeString(raw[field.name], field.name);
        validatedStrings.set(field.name, safeStr);
        validatedPresence[field.name] = 'VALUE';
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

    if (!isWithinVolunteerGenderScope(raw)) {
      diagnostics.push({
        code: 'OUT_OF_GEOGRAPHIC_SCOPE',
        message: `Row #${rowIndex + 1} falls outside Geographic Scope (54 / 5406) for volunteer-gender.`,
        rowIndex,
      });
      continue;
    }

    const rawMale = raw.male as number;
    const rawFemale = raw.female as number;
    const rawTotal = raw.total as number;
    const sum = rawMale + rawFemale;
    if (!Number.isSafeInteger(sum) || sum !== rawTotal) {
      diagnostics.push({
        code: 'GENDER_TOTAL_MISMATCH',
        message: `Row #${rowIndex + 1} failed gender arithmetic invariant (male + female !== total).`,
        field: 'total',
        rowIndex,
      });
      continue;
    }

    seenKeys.add(key);

    // ADR-0005 Full-Field Operator Mode: persist actual non-negative integer counts without 1..4 suppression
    const projectedCountByField: Record<string, number> = {
      total: rawTotal,
      male: rawMale,
      female: rawFemale,
    };

    const values: Array<string | number | null> = [];
    const presence: Record<string, FieldPresence> = {};

    for (const field of schema.fields) {
      if (field.kind === 'integer') {
        const countVal = projectedCountByField[field.name];
        values.push(countVal);
        presence[field.name] = 'VALUE';
      } else {
        const strVal = validatedStrings.get(field.name);
        values.push(strVal === undefined ? null : strVal);
        presence[field.name] = validatedPresence[field.name] ?? 'ABSENT';
      }
    }

    const rowDigest = sha256Hex(JSON.stringify([values, presence]));
    const reviewReasons: ReviewReasonCode[] = [];

    const subdistrictCode = validatedStrings.get('subdistrictCode') ?? '';
    const subdistrictName = validatedStrings.get('subdistrictName') ?? subdistrictCode;
    const villageNo = validatedStrings.get('villageNo') ?? '';
    const villageName = validatedStrings.get('villageName') ?? '';
    const scopeLabel = formatVolunteerGenderScopeLabel({
      subdistrictCode,
      subdistrictName,
      villageNo,
      villageName,
    });

    const minimizedAttributes: ExtendedMinimizedAttribute[] = [
      { field: 'total', value: String(rawTotal) },
      { field: 'male', value: String(rawMale) },
      { field: 'female', value: String(rawFemale) },
    ];

    const groupEntry = subdistrictAgg.get(subdistrictCode);
    if (groupEntry) {
      groupEntry.rowCount += 1;
    } else {
      subdistrictAgg.set(subdistrictCode, {
        groupCode: subdistrictCode,
        groupLabel: subdistrictName,
        rowCount: 1,
        reviewCount: 0,
      });
    }

    projectedRows.push({
      key,
      values,
      presence,
      rowDigest,
      scopeLabel,
      subdistrictCode,
      subdistrictName,
      minimizedAttributes,
      reviewReasons,
    });
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics: diagnostics.slice(0, 25) };
  }

  const aggregateSummary = [...subdistrictAgg.values()].sort((a, b) =>
    a.groupCode < b.groupCode ? -1 : a.groupCode > b.groupCode ? 1 : 0,
  );

  return {
    ok: true,
    rows: projectedRows,
    datasetDigest: computeDatasetDigest(projectedRows, sha256Hex),
    aggregateSummary,
  };
}

export interface ProjectedPersonKeyedRow {
  key: string; // Raw ThaiPHC source `id` (ADR-0005 Full-Field Operator Mode)
  values: Array<string | number | boolean | null>;
  presence: Record<string, FieldPresence>;
  rowDigest: string;
  scopeLabel: string;
  subdistrictCode: string;
  subdistrictName: string;
  minimizedAttributes: ExtendedMinimizedAttribute[];
  reviewReasons: ReviewReasonCode[];
}

export type PersonKeyedValidationResult =
  | {
      ok: true;
      rows: ProjectedPersonKeyedRow[];
      aggregateSummary: ExtendedAggregateGroup[];
    }
  | {
      ok: false;
      diagnostics: PreviewDiagnostic[];
    };

interface PersonKeyedProjectionConfig {
  readonly schema: KeyedDatasetSchemaSpec<LargeKeyedDatasetEndpoint>;
  readonly allowedSourceFields: ReadonlySet<string>;
  readonly subdistrictNameField: 'subdistrictNameTh' | 'subdistrictName';
  readonly hasVillageCode: boolean;
}

function buildPersonKeyedConfig(
  schema: KeyedDatasetSchemaSpec<LargeKeyedDatasetEndpoint>,
  opts: {
    subdistrictNameField: 'subdistrictNameTh' | 'subdistrictName';
    hasVillageCode: boolean;
  },
): PersonKeyedProjectionConfig {
  return {
    schema,
    allowedSourceFields: new Set<string>(schema.fields.map((f) => f.name)),
    ...opts,
  };
}

const PERSON_KEYED_CONFIGS: Readonly<
  Record<LargeKeyedDatasetEndpoint, PersonKeyedProjectionConfig>
> = {
  assignments: buildPersonKeyedConfig(ASSIGNMENTS_SCHEMA, {
    subdistrictNameField: 'subdistrictNameTh',
    hasVillageCode: false,
  }),
  'resigned-volunteers': buildPersonKeyedConfig(RESIGNED_VOLUNTEERS_SCHEMA, {
    subdistrictNameField: 'subdistrictName',
    hasVillageCode: true,
  }),
  'volunteer-tenure': buildPersonKeyedConfig(VOLUNTEER_TENURE_SCHEMA, {
    subdistrictNameField: 'subdistrictName',
    hasVillageCode: true,
  }),
};

/**
 * Server-side Full-Field Operator Mode projection for person-level Keyed Upsert datasets (ADR-0005):
 * - Validates and retains all observed source columns for authorized Google Sheets storage.
 * - Masks 13-digit `citizenId` in Preview UI attributes while keeping full values for Commit.
 * - Enforces Geographic Scope (54 / 5406) on provinceCode and districtCode as a hard gate.
 * - Applies Preserve Source Locality strictly where configured (`resigned-volunteers`).
 * - Uses the raw ThaiPHC `id` directly as `_source_key`.
 */
export function validateAndProjectLargeKeyedRows(
  endpoint: LargeKeyedDatasetEndpoint,
  rawItems: readonly unknown[],
  sha256Hex: (input: string) => string,
  rowIndexOffset = 0,
): PersonKeyedValidationResult {
  const config = PERSON_KEYED_CONFIGS[endpoint];
  const { schema } = config;
  const diagnostics: PreviewDiagnostic[] = [];

  if (rawItems.length === 0) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'INCOMPLETE_SNAPSHOT',
          message: `ThaiPHC ${endpoint} batch returned zero rows.`,
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

  const seenRawIds = new Set<string>();
  const projectedRows: ProjectedPersonKeyedRow[] = [];
  const subdistrictAgg = new Map<
    string,
    { groupCode: string; groupLabel: string; rowCount: number; reviewCount: number }
  >();

  for (let i = 0; i < rawItems.length; i++) {
    const globalRowIndex = rowIndexOffset + i;
    const preamble = validateKeyedRowPreamble(
      rawItems[i],
      globalRowIndex,
      schema.keyField,
      config.allowedSourceFields,
      seenRawIds,
    );
    if (!preamble.ok) {
      diagnostics.push(preamble.diagnostic);
      continue;
    }
    const { record: raw, key: rawId } = preamble;

    let rowFailed = false;

    // Validate and extract all observed source columns (ADR-0005 Full-Field Operator Mode)
    const values: Array<string | number | boolean | null> = [];
    const presence: Record<string, FieldPresence> = {};
    const approvedByName = new Map<string, string | number | boolean | null>();

    for (const field of schema.fields) {
      if (field.kind === 'boolean') {
        if (!hasOwn(raw, field.name) || typeof raw[field.name] !== 'boolean') {
          diagnostics.push({
            code: 'TYPE_MISMATCH',
            message: `Row #${globalRowIndex + 1} field "${field.name}" must be a boolean.`,
            field: field.name,
            rowIndex: globalRowIndex,
          });
          rowFailed = true;
          break;
        }
        const boolVal = raw[field.name] as boolean;
        values.push(boolVal);
        presence[field.name] = 'VALUE';
        approvedByName.set(field.name, boolVal);
        continue;
      }

      if (!hasOwn(raw, field.name)) {
        values.push(null);
        presence[field.name] = 'ABSENT';
        approvedByName.set(field.name, null);
        continue;
      }

      const rawVal = raw[field.name];
      if (field.kind === 'integer' || field.kind === 'integer_or_null') {
        if (field.kind === 'integer_or_null' && rawVal === null) {
          values.push(null);
          presence[field.name] = 'NULL';
          approvedByName.set(field.name, null);
          continue;
        }
        if (!isNonNegativeSafeInteger(rawVal)) {
          diagnostics.push({
            code: 'TYPE_MISMATCH',
            message: `Row #${globalRowIndex + 1} field "${field.name}" must be a non-negative integer${field.kind === 'integer_or_null' ? ' or null' : ''}.`,
            field: field.name,
            rowIndex: globalRowIndex,
          });
          rowFailed = true;
          break;
        }
        values.push(rawVal);
        presence[field.name] = 'VALUE';
        approvedByName.set(field.name, rawVal);
        continue;
      }

      if (field.kind === 'string_or_null' && rawVal === null) {
        values.push(null);
        presence[field.name] = 'NULL';
        approvedByName.set(field.name, null);
        continue;
      }

      try {
        const safeStr = assertSafeString(rawVal, field.name);
        values.push(safeStr);
        presence[field.name] = 'VALUE';
        approvedByName.set(field.name, safeStr);
      } catch (err) {
        const code = err instanceof CellValidationError ? err.code : 'TYPE_MISMATCH';
        diagnostics.push({
          code,
          message:
            err instanceof CellValidationError
              ? err.message
              : `Row #${globalRowIndex + 1} field "${field.name}" failed validation.`,
          field: field.name,
          rowIndex: globalRowIndex,
        });
        rowFailed = true;
        break;
      }
    }
    if (rowFailed) continue;

    // Hard Geographic Scope gate on province 54 and district 5406 for all datasets
    if (raw.provinceCode !== '54' || raw.districtCode !== '5406') {
      diagnostics.push({
        code: 'OUT_OF_GEOGRAPHIC_SCOPE',
        message: `Row #${globalRowIndex + 1} falls outside Geographic Scope (54 / 5406) for ${endpoint}.`,
        rowIndex: globalRowIndex,
      });
      continue;
    }

    const reviewReasons: ReviewReasonCode[] = [];
    if (config.hasVillageCode) {
      if (hasLowerLevelLocalityMismatch(raw)) {
        if (schema.preserveSourceLocality === true) {
          // Preserve Source Locality: keep original ThaiPHC locality fields unaltered and flag REVIEW
          reviewReasons.push('LOCALITY_MISMATCH');
        } else {
          diagnostics.push({
            code: 'OUT_OF_GEOGRAPHIC_SCOPE',
            message: `Row #${globalRowIndex + 1} falls outside Geographic Scope (54 / 5406) for ${endpoint}.`,
            rowIndex: globalRowIndex,
          });
          continue;
        }
      }
    } else if (
      typeof raw.subdistrictCode !== 'string' ||
      !SUBDISTRICT_PATTERN.test(raw.subdistrictCode)
    ) {
      diagnostics.push({
        code: 'OUT_OF_GEOGRAPHIC_SCOPE',
        message: `Row #${globalRowIndex + 1} falls outside Geographic Scope (54 / 5406) for ${endpoint}.`,
        rowIndex: globalRowIndex,
      });
      continue;
    }

    seenRawIds.add(rawId);

    // ADR-0005 Full-Field Operator Mode: use raw source `id` directly as `_source_key`
    const rowDigest = sha256Hex(JSON.stringify([values, presence]));

    const subdistrictCode = String(approvedByName.get('subdistrictCode') ?? '');
    const rawSubName = approvedByName.get(config.subdistrictNameField);
    const subdistrictName =
      typeof rawSubName === 'string' && rawSubName.length > 0 ? rawSubName : subdistrictCode;
    const villageNo = String(approvedByName.get('villageNo') ?? '');
    const rawVillageName = approvedByName.get('villageName');
    const villageName = typeof rawVillageName === 'string' ? rawVillageName : null;
    const rawVillageCode = config.hasVillageCode ? approvedByName.get('villageCode') : undefined;
    const villageCode =
      typeof rawVillageCode === 'string' && rawVillageCode.length > 0 ? rawVillageCode : undefined;

    const scopeLabel = formatExtendedScopeLabel({
      subdistrictCode,
      subdistrictName,
      villageNo,
      villageName,
      villageCode,
    });

    const minimizedAttributes: ExtendedMinimizedAttribute[] = schema.summaryFieldNames.map(
      (fieldName) => ({
        field: fieldName,
        value: formatPreviewAttributeValue(fieldName, approvedByName.get(fieldName)),
      }),
    );

    const groupCode = subdistrictCode.length > 0 ? subdistrictCode : 'UNSPECIFIED';
    const groupLabel = subdistrictName.length > 0 ? subdistrictName : groupCode;
    const hasReview = reviewReasons.length > 0;
    const groupEntry = subdistrictAgg.get(groupCode);
    if (groupEntry) {
      groupEntry.rowCount += 1;
      if (hasReview) {
        groupEntry.reviewCount += 1;
      }
    } else {
      subdistrictAgg.set(groupCode, {
        groupCode,
        groupLabel,
        rowCount: 1,
        reviewCount: hasReview ? 1 : 0,
      });
    }

    projectedRows.push({
      key: rawId,
      values,
      presence,
      rowDigest,
      scopeLabel,
      subdistrictCode,
      subdistrictName,
      minimizedAttributes,
      reviewReasons,
    });
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics: diagnostics.slice(0, 25) };
  }

  const aggregateSummary = [...subdistrictAgg.values()].sort((a, b) =>
    a.groupCode < b.groupCode ? -1 : a.groupCode > b.groupCode ? 1 : 0,
  );

  return {
    ok: true,
    rows: projectedRows,
    aggregateSummary,
  };
}

export function mergeAggregateSummary(
  groups: readonly ExtendedAggregateGroup[],
): ExtendedAggregateGroup[] {
  const byCode = new Map<string, ExtendedAggregateGroup>();
  for (const g of groups) {
    if (
      !g ||
      typeof g.groupCode !== 'string' ||
      g.groupCode.length === 0 ||
      typeof g.groupLabel !== 'string' ||
      !Number.isSafeInteger(g.rowCount) ||
      g.rowCount < 0 ||
      !Number.isSafeInteger(g.reviewCount) ||
      g.reviewCount < 0
    ) {
      continue;
    }
    const existing = byCode.get(g.groupCode);
    if (existing) {
      existing.rowCount += g.rowCount;
      existing.reviewCount += g.reviewCount;
    } else {
      byCode.set(g.groupCode, {
        groupCode: g.groupCode,
        groupLabel: g.groupLabel,
        rowCount: g.rowCount,
        reviewCount: g.reviewCount,
      });
    }
  }
  return [...byCode.values()].sort((a, b) =>
    a.groupCode < b.groupCode ? -1 : a.groupCode > b.groupCode ? 1 : 0,
  );
}

const VOLUNTEER_FAMILY_ALLOWED_SOURCE_FIELDS: ReadonlySet<string> = new Set<string>(
  VOLUNTEER_FAMILY_SCHEMA.fields.map((f) => f.name),
);

export interface ProjectedVolunteerFamilyRow {
  ordinal: number; // 1-based global snapshot ordinal
  key: string; // snapshot_preview_NNNNN (preview) or snapshot_<runId>_NNNNN (commit)
  values: Array<string | null>;
  presence: Record<string, FieldPresence>;
  rowDigest: string;
  scopeLabel: string;
  subdistrictCode: string;
  subdistrictName: string;
  minimizedAttributes: ExtendedMinimizedAttribute[];
  reviewReasons: ReviewReasonCode[];
}

export type VolunteerFamilyValidationResult =
  | {
      ok: true;
      rows: ProjectedVolunteerFamilyRow[];
      aggregateSummary: ExtendedAggregateGroup[];
    }
  | {
      ok: false;
      diagnostics: PreviewDiagnostic[];
    };

/**
 * Server-side Minimized Projection for `volunteer-family` Complete Snapshot rows:
 * - Strips all 9 RESTRICTED_DEFAULT_OMIT direct identifiers before returning or storing anything.
 * - Assigns run-scoped ordinal keys via `buildOrdinalKey(globalOrdinal)` — never guessed-key upsert.
 * - Enforces Geographic Scope (54 / 5406) on provinceCode and districtCode as a hard gate.
 * - Applies Preserve Source Locality: lower-level subdistrict/village mismatches retain original
 *   source values unaltered and surface as `REVIEW` (`LOCALITY_MISMATCH`).
 */
export function validateAndProjectVolunteerFamilyRows(
  rawItems: readonly unknown[],
  sha256Hex: (input: string) => string,
  buildOrdinalKey: (globalOrdinal: number) => string,
  rowIndexOffset = 0,
): VolunteerFamilyValidationResult {
  const schema = VOLUNTEER_FAMILY_SCHEMA;
  const diagnostics: PreviewDiagnostic[] = [];

  if (rawItems.length === 0) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'INCOMPLETE_SNAPSHOT',
          message: 'ThaiPHC volunteer-family batch returned zero rows.',
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
          message: `Source row count (${rawItems.length}) exceeds maximum safe limit (${schema.maxRows}) for volunteer-family.`,
        },
      ],
    };
  }

  const projectedRows: ProjectedVolunteerFamilyRow[] = [];
  const subdistrictAgg = new Map<
    string,
    { groupCode: string; groupLabel: string; rowCount: number; reviewCount: number }
  >();

  for (let i = 0; i < rawItems.length; i++) {
    const globalRowIndex = rowIndexOffset + i;
    const raw = rawItems[i];
    if (!isPlainObject(raw)) {
      diagnostics.push({
        code: 'TYPE_MISMATCH',
        message: `Row #${globalRowIndex + 1} is not a JSON object.`,
        rowIndex: globalRowIndex,
      });
      continue;
    }

    const unexpectedKeys = Object.keys(raw).filter(
      (k) => !VOLUNTEER_FAMILY_ALLOWED_SOURCE_FIELDS.has(k),
    );
    if (unexpectedKeys.length > 0) {
      diagnostics.push({
        code: 'UNEXPECTED_FIELD',
        message: `Row #${globalRowIndex + 1} contains an unexpected source schema field.`,
        rowIndex: globalRowIndex,
      });
      continue;
    }

    let rowFailed = false;

    // Validate and extract all 21 observed source columns (ADR-0005 Full-Field Operator Mode)
    const values: Array<string | null> = [];
    const presence: Record<string, FieldPresence> = {};
    const approvedByName = new Map<string, string | null>();

    for (const field of schema.fields) {
      if (!hasOwn(raw, field.name)) {
        values.push(null);
        presence[field.name] = 'ABSENT';
        approvedByName.set(field.name, null);
        continue;
      }
      const rawVal = raw[field.name];
      if (field.kind === 'string_or_null' && rawVal === null) {
        values.push(null);
        presence[field.name] = 'NULL';
        approvedByName.set(field.name, null);
        continue;
      }
      try {
        const safeStr = assertSafeString(rawVal, field.name);
        values.push(safeStr);
        presence[field.name] = 'VALUE';
        approvedByName.set(field.name, safeStr);
      } catch (err) {
        const code = err instanceof CellValidationError ? err.code : 'TYPE_MISMATCH';
        diagnostics.push({
          code,
          message:
            err instanceof CellValidationError
              ? err.message
              : `Row #${globalRowIndex + 1} field "${field.name}" failed validation.`,
          field: field.name,
          rowIndex: globalRowIndex,
        });
        rowFailed = true;
        break;
      }
    }
    if (rowFailed) continue;

    // Hard Geographic Scope gate on province 54 and district 5406
    if (raw.provinceCode !== '54' || raw.districtCode !== '5406') {
      diagnostics.push({
        code: 'OUT_OF_GEOGRAPHIC_SCOPE',
        message: `Row #${globalRowIndex + 1} falls outside Geographic Scope (54 / 5406) for volunteer-family.`,
        rowIndex: globalRowIndex,
      });
      continue;
    }

    // Preserve Source Locality: keep lower-level subdistrict/village mismatches unaltered and flag REVIEW
    const reviewReasons: ReviewReasonCode[] = hasLowerLevelLocalityMismatch(raw)
      ? ['LOCALITY_MISMATCH']
      : [];

    const globalOrdinal = globalRowIndex + 1;
    const key = buildOrdinalKey(globalOrdinal);
    const rowDigest = sha256Hex(JSON.stringify([values, presence]));

    const subdistrictCode = approvedByName.get('subdistrictCode') ?? '';
    const rawSubName = approvedByName.get('subdistrictName');
    const subdistrictName =
      typeof rawSubName === 'string' && rawSubName.length > 0 ? rawSubName : subdistrictCode;
    const villageNo = approvedByName.get('villageNo') ?? '';
    const villageName = approvedByName.get('villageName') ?? null;
    const rawVillageCode = approvedByName.get('villageCode');
    const villageCode =
      typeof rawVillageCode === 'string' && rawVillageCode.length > 0 ? rawVillageCode : undefined;

    const scopeLabel = formatExtendedScopeLabel({
      subdistrictCode,
      subdistrictName,
      villageNo,
      villageName,
      villageCode,
    });

    const minimizedAttributes: ExtendedMinimizedAttribute[] = schema.summaryFieldNames.map(
      (fieldName) => ({
        field: fieldName,
        value: formatPreviewAttributeValue(fieldName, approvedByName.get(fieldName)),
      }),
    );

    const groupCode = subdistrictCode.length > 0 ? subdistrictCode : 'UNSPECIFIED';
    const groupLabel = subdistrictName.length > 0 ? subdistrictName : groupCode;
    const hasReview = reviewReasons.length > 0;
    const groupEntry = subdistrictAgg.get(groupCode);
    if (groupEntry) {
      groupEntry.rowCount += 1;
      if (hasReview) groupEntry.reviewCount += 1;
    } else {
      subdistrictAgg.set(groupCode, {
        groupCode,
        groupLabel,
        rowCount: 1,
        reviewCount: hasReview ? 1 : 0,
      });
    }

    projectedRows.push({
      ordinal: globalOrdinal,
      key,
      values,
      presence,
      rowDigest,
      scopeLabel,
      subdistrictCode,
      subdistrictName,
      minimizedAttributes,
      reviewReasons,
    });
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics: diagnostics.slice(0, 25) };
  }

  const aggregateSummary = [...subdistrictAgg.values()].sort((a, b) =>
    a.groupCode < b.groupCode ? -1 : a.groupCode > b.groupCode ? 1 : 0,
  );

  return {
    ok: true,
    rows: projectedRows,
    aggregateSummary,
  };
}
