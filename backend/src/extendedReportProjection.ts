import {
  assertSafeString,
  CellValidationError,
  computeDatasetDigest,
  hasOwn,
  SUBDISTRICT_PATTERN,
  validateKeyedRowPreamble,
  VILLAGE_CODE_PATTERN,
  type FieldPresence,
} from './cellValidation.ts';
import { VOLUNTEER_GENDER_SCHEMA } from './datasetCatalog.ts';
import type {
  ExtendedAggregateGroup,
  ExtendedMinimizedAttribute,
  PreviewDiagnostic,
  ReviewReasonCode,
} from './types.ts';

export const SMALL_CELL_THRESHOLD = 5;
const POSITIVE_VILLAGE_NO_PATTERN = /^0*[1-9]\d{0,2}$/;

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

export function formatVolunteerGenderScopeLabel(fields: {
  subdistrictCode: string;
  subdistrictName: string;
  villageNo: string;
  villageName: string;
}): string {
  const villageSuffix = [fields.villageNo ? `หมู่ ${fields.villageNo}` : '', fields.villageName]
    .filter(Boolean)
    .join(' ');
  return ['54 / 5406', `${fields.subdistrictCode} ${fields.subdistrictName}`.trim(), villageSuffix]
    .filter(Boolean)
    .join(' · ');
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

function isWithinVolunteerGenderScope(row: Record<string, unknown>): boolean {
  if (
    row.provinceCode !== '54' ||
    row.districtCode !== '5406' ||
    typeof row.subdistrictCode !== 'string' ||
    !SUBDISTRICT_PATTERN.test(row.subdistrictCode) ||
    typeof row.villageCode !== 'string' ||
    !VILLAGE_CODE_PATTERN.test(row.villageCode) ||
    row.villageCode.slice(0, 6) !== row.subdistrictCode
  ) {
    return false;
  }

  const villageOrdinal = Number(row.villageCode.slice(6));
  if (!Number.isSafeInteger(villageOrdinal) || villageOrdinal < 1) {
    return false;
  }

  if (typeof row.villageNo === 'string') {
    if (!POSITIVE_VILLAGE_NO_PATTERN.test(row.villageNo)) {
      return false;
    }
    if (Number(row.villageNo) !== villageOrdinal) {
      return false;
    }
  }

  return true;
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

    // Apply server-side Complementary Small-Cell Suppression BEFORE constructing stored values or preview rows
    const suppressed = applyComplementarySmallCellSuppression(rawMale, rawFemale, rawTotal);

    const projectedCountByField: Record<string, number | null> = {
      total: suppressed.total,
      male: suppressed.male,
      female: suppressed.female,
    };

    const values: Array<string | number | null> = [];
    const presence: Record<string, FieldPresence> = {};

    for (const field of schema.fields) {
      if (field.kind === 'integer') {
        const countVal = projectedCountByField[field.name];
        values.push(countVal);
        presence[field.name] = countVal === null ? 'NULL' : 'VALUE';
      } else {
        const strVal = validatedStrings.get(field.name);
        values.push(strVal === undefined ? null : strVal);
        presence[field.name] = validatedPresence[field.name] ?? 'ABSENT';
      }
    }

    // Uniform F010 _row_digest over post-suppression minimized values & presence (zero pre-suppression leakage)
    const rowDigest = sha256Hex(JSON.stringify([values, presence]));
    const reviewReasons: ReviewReasonCode[] = suppressed.suppressed
      ? ['SMALL_CELL_SUPPRESSED']
      : [];

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
      { field: 'total', value: suppressed.total === null ? null : String(suppressed.total) },
      { field: 'male', value: suppressed.male === null ? null : String(suppressed.male) },
      { field: 'female', value: suppressed.female === null ? null : String(suppressed.female) },
    ];

    const groupEntry = subdistrictAgg.get(subdistrictCode);
    if (groupEntry) {
      groupEntry.rowCount += 1;
      if (suppressed.suppressed) {
        groupEntry.reviewCount += 1;
      }
    } else {
      subdistrictAgg.set(subdistrictCode, {
        groupCode: subdistrictCode,
        groupLabel: subdistrictName,
        rowCount: 1,
        reviewCount: suppressed.suppressed ? 1 : 0,
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
