import type {
  DatasetEndpoint,
  DatasetGroup,
  LargeKeyedDatasetEndpoint,
  PaginationProtocol,
  ReferenceDatasetEndpoint,
  SmallKeyedDatasetEndpoint,
  SyncMode,
} from './types.ts';

export interface DatasetDescriptor {
  readonly endpoint: DatasetEndpoint;
  readonly group: DatasetGroup;
  readonly syncMode: SyncMode;
  readonly paginationProtocol: PaginationProtocol;
  readonly defaultTab: string;
  readonly legacyPrefix: string | null;
}

export type DatasetFieldKind =
  | 'string'
  | 'string_or_null'
  | 'integer'
  | 'integer_or_null'
  | 'number'
  | 'boolean'
  | 'null_only'
  | 'object'
  | 'array';

export type ReferenceFieldKind = DatasetFieldKind;

export interface DatasetFieldSpec {
  readonly name: string;
  readonly kind: DatasetFieldKind;
}

export interface DatasetSchemaSpec<TEndpoint extends DatasetEndpoint = DatasetEndpoint> {
  readonly endpoint: TEndpoint;
  readonly tab: string;
  readonly displayNameField: string;
  readonly summaryFieldNames: readonly string[];
  readonly maxRows: number;
  readonly preserveSourceLocality?: boolean;
  readonly fields: readonly DatasetFieldSpec[];
}

export interface KeyedDatasetSchemaSpec<
  TEndpoint extends DatasetEndpoint = DatasetEndpoint,
> extends DatasetSchemaSpec<TEndpoint> {
  readonly keyField: string;
}

export type CompleteSnapshotSchemaSpec<TEndpoint extends DatasetEndpoint = DatasetEndpoint> =
  DatasetSchemaSpec<TEndpoint>;

export type ReferenceSchemaSpec = KeyedDatasetSchemaSpec<ReferenceDatasetEndpoint>;

export const DATASET_CATALOG: readonly DatasetDescriptor[] = [
  {
    endpoint: 'subdistricts',
    group: 'reference',
    syncMode: 'KEYED_UPSERT',
    paginationProtocol: 'none',
    defaultTab: 'Subdistricts',
    legacyPrefix: null,
  },
  {
    endpoint: 'villages',
    group: 'reference',
    syncMode: 'KEYED_UPSERT',
    paginationProtocol: 'none',
    defaultTab: 'Villages',
    legacyPrefix: null,
  },
  {
    endpoint: 'health-services',
    group: 'reference',
    syncMode: 'KEYED_UPSERT',
    paginationProtocol: 'offset',
    defaultTab: 'HealthServices',
    legacyPrefix: null,
  },
  {
    endpoint: 'volunteer-gender',
    group: 'extended_report',
    syncMode: 'KEYED_UPSERT',
    paginationProtocol: 'report',
    defaultTab: 'VolunteerGender',
    legacyPrefix: 'RGender_',
  },
  {
    endpoint: 'assignments',
    group: 'extended_report',
    syncMode: 'KEYED_UPSERT',
    paginationProtocol: 'assignment',
    defaultTab: 'Assignments',
    legacyPrefix: 'RAssign_',
  },
  {
    endpoint: 'volunteer-family',
    group: 'extended_report',
    syncMode: 'COMPLETE_SNAPSHOT',
    paginationProtocol: 'report',
    defaultTab: 'RFamily_<runId>',
    legacyPrefix: 'RFamily_',
  },
  {
    endpoint: 'resigned-volunteers',
    group: 'extended_report',
    syncMode: 'KEYED_UPSERT',
    paginationProtocol: 'report',
    defaultTab: 'ResignedVolunteers',
    legacyPrefix: 'RResign_',
  },
  {
    endpoint: 'volunteer-tenure',
    group: 'extended_report',
    syncMode: 'KEYED_UPSERT',
    paginationProtocol: 'report',
    defaultTab: 'VolunteerTenure',
    legacyPrefix: 'RTenure_',
  },
] as const;

export const REPORT_CURRENT_TAB = '_ThaiPHCReportCurrent';
export const REPORT_CURRENT_HEADERS = [
  'endpoint',
  'run_id',
  'snapshot_sheet',
  'row_count',
  'manifest_digest',
] as const;
export const REPORT_CURRENT_TEXT_COLUMN_INDICES: readonly number[] = REPORT_CURRENT_HEADERS.reduce<
  number[]
>((acc, header, idx) => {
  if (header !== 'row_count') {
    acc.push(idx + 1);
  }
  return acc;
}, []);
export const SYNC_LOG_TAB = '_ThaiPHCSyncLog';
export const STAGING_TAB_PREFIX = '_Stage_';
export const VOLUNTEER_FAMILY_SNAPSHOT_PREFIX = 'RFamily_';
export const SAME_WORKBOOK_APPROVAL_TOKEN = 'OWNER_ONLY_5406_APPROVED';
export const SCHEMA_VERSION = '0.1.0';
export const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
export const FAMILY_PREVIEW_KEY_PATTERN = /^snapshot_preview_\d{5}$/;

export function buildStagingTabName(endpoint: DatasetEndpoint, runId: string): string {
  return `${STAGING_TAB_PREFIX}${endpoint}_${runId}`;
}

export function buildFamilySnapshotTabName(runId: string): string {
  return `${VOLUNTEER_FAMILY_SNAPSHOT_PREFIX}${runId}`;
}

export function buildFamilyPreviewRowKey(ordinal: number): string {
  return `snapshot_preview_${String(ordinal).padStart(5, '0')}`;
}

export function buildFamilySnapshotRowKey(runId: string, ordinal: number): string {
  return `snapshot_${runId}_${String(ordinal).padStart(5, '0')}`;
}

/**
 * Exact 8 trailing metadata columns matching the deployed 111-row Historical Acceptance Baseline
 * (apps-script/Code.gs and docs/sheets-schema.json).
 */
export const KEYED_UPSERT_METADATA_COLUMNS = [
  '_schema_version',
  '_sync_run_id',
  '_source_key',
  '_fetched_at_utc',
  '_quality_status',
  '_field_presence_json',
  '_last_seen_run_id',
  '_row_digest',
] as const;

export const SYNC_LOG_HEADERS = [
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
] as const;

export const SYNC_LOG_TEXT_COLUMN_COUNT = SYNC_LOG_HEADERS.indexOf('preview_digest') + 1;

export const REFERENCE_SCHEMAS: Readonly<Record<ReferenceDatasetEndpoint, ReferenceSchemaSpec>> = {
  subdistricts: {
    endpoint: 'subdistricts',
    tab: 'Subdistricts',
    keyField: 'code',
    displayNameField: 'name_th',
    summaryFieldNames: ['name_th', 'name_en', 'postal_code'],
    maxRows: 20,
    fields: [
      { name: 'code', kind: 'string' },
      { name: 'id', kind: 'string' },
      { name: 'name_th', kind: 'string' },
      { name: 'name_en', kind: 'string' },
      { name: 'postal_code', kind: 'string' },
      { name: 'label', kind: 'string' },
      { name: 'district_code', kind: 'string' },
      { name: 'district_name_th', kind: 'string' },
      { name: 'district_name_en', kind: 'string' },
      { name: 'province_code', kind: 'null_only' },
      { name: 'province_name_th', kind: 'null_only' },
      { name: 'province_name_en', kind: 'null_only' },
    ],
  },
  villages: {
    endpoint: 'villages',
    tab: 'Villages',
    keyField: 'code',
    displayNameField: 'name_th',
    summaryFieldNames: ['name_th', 'subdistrict_name_th', 'village_no', 'health_service_code'],
    maxRows: 150,
    fields: [
      { name: 'code', kind: 'string' },
      { name: 'village_code_8digit', kind: 'string' },
      { name: 'id', kind: 'string' },
      { name: 'name_th', kind: 'string' },
      { name: 'name_en', kind: 'null_only' },
      { name: 'village_no', kind: 'integer' },
      { name: 'metro_status', kind: 'null_only' },
      { name: 'label', kind: 'string' },
      { name: 'subdistrict_code', kind: 'string' },
      { name: 'subdistrict_name_th', kind: 'string' },
      { name: 'subdistrict_name_en', kind: 'string' },
      { name: 'district_code', kind: 'string' },
      { name: 'district_name_th', kind: 'string' },
      { name: 'district_name_en', kind: 'string' },
      { name: 'province_code', kind: 'string' },
      { name: 'province_name_th', kind: 'string' },
      { name: 'province_name_en', kind: 'string' },
      { name: 'health_service_code', kind: 'string_or_null' },
      { name: 'health_service_name_th', kind: 'string_or_null' },
      { name: 'health_service_name_en', kind: 'null_only' },
    ],
  },
  'health-services': {
    endpoint: 'health-services',
    tab: 'HealthServices',
    keyField: 'health_service_code',
    displayNameField: 'health_service_name_th',
    summaryFieldNames: ['health_service_name_th', 'legacy_5digit_code', 'latitude', 'longitude'],
    maxRows: 100,
    fields: [
      { name: 'health_service_code', kind: 'string' },
      { name: 'health_service_name_th', kind: 'string' },
      { name: 'health_service_name_en', kind: 'null_only' },
      { name: 'legacy_5digit_code', kind: 'string' },
      { name: 'legacy_9digit_code', kind: 'string' },
      { name: 'village_no', kind: 'string' },
      { name: 'latitude', kind: 'number' },
      { name: 'longitude', kind: 'number' },
      { name: 'health_service_type', kind: 'object' },
      { name: 'province', kind: 'object' },
      { name: 'district', kind: 'object' },
      { name: 'subdistrict', kind: 'object' },
      { name: 'service_areas', kind: 'array' },
      { name: 'created_at', kind: 'string' },
      { name: 'updated_at', kind: 'string' },
      { name: 'deleted_at', kind: 'null_only' },
    ],
  },
};

export const VOLUNTEER_GENDER_SCHEMA: KeyedDatasetSchemaSpec<'volunteer-gender'> = {
  endpoint: 'volunteer-gender',
  tab: 'VolunteerGender',
  keyField: 'villageCode',
  displayNameField: 'villageName',
  summaryFieldNames: ['total', 'male', 'female'],
  maxRows: 150,
  fields: [
    { name: 'provinceCode', kind: 'string' },
    { name: 'provinceName', kind: 'string' },
    { name: 'districtCode', kind: 'string' },
    { name: 'districtName', kind: 'string' },
    { name: 'subdistrictCode', kind: 'string' },
    { name: 'subdistrictName', kind: 'string' },
    { name: 'villageCode', kind: 'string' },
    { name: 'villageNo', kind: 'string' },
    { name: 'villageName', kind: 'string' },
    { name: 'total', kind: 'integer' },
    { name: 'male', kind: 'integer' },
    { name: 'female', kind: 'integer' },
  ],
};

export const SMALL_KEYED_SCHEMAS: Readonly<
  Record<SmallKeyedDatasetEndpoint, KeyedDatasetSchemaSpec<SmallKeyedDatasetEndpoint>>
> = {
  ...REFERENCE_SCHEMAS,
  'volunteer-gender': VOLUNTEER_GENDER_SCHEMA,
};

/**
 * Exact 8 direct personal identifier fields on `assignments` (docs/sheets-schema.json).
 * Persisted in Full-Field Operator Mode (ADR-0005); `citizenId` is masked in Preview UI.
 */
export const ASSIGNMENTS_RESTRICTED_SOURCE_FIELDS = [
  'id',
  'osmCode',
  'citizenId',
  'prefixNameTh',
  'prefixNameEn',
  'firstName',
  'lastName',
  'fullName',
] as const;

/**
 * All 25 observed source columns on `Assignments` (ADR-0005 Full-Field Operator Mode),
 * paired with the uniform 8 trailing Keyed Upsert metadata columns (33 columns total).
 */
export const ASSIGNMENTS_SCHEMA: KeyedDatasetSchemaSpec<'assignments'> = {
  endpoint: 'assignments',
  tab: 'Assignments',
  keyField: 'id',
  displayNameField: 'fullName',
  summaryFieldNames: [
    'osmCode',
    'fullName',
    'citizenId',
    'isActive',
    'status',
    'approvalStatus',
    'volunteerStatus',
    'villageName',
  ],
  maxRows: 2500,
  fields: [
    { name: 'id', kind: 'string' },
    { name: 'osmCode', kind: 'string_or_null' },
    { name: 'citizenId', kind: 'string_or_null' },
    { name: 'prefixNameTh', kind: 'string_or_null' },
    { name: 'prefixNameEn', kind: 'string_or_null' },
    { name: 'firstName', kind: 'string_or_null' },
    { name: 'lastName', kind: 'string_or_null' },
    { name: 'fullName', kind: 'string_or_null' },
    { name: 'provinceCode', kind: 'string' },
    { name: 'provinceNameTh', kind: 'string' },
    { name: 'districtCode', kind: 'string' },
    { name: 'districtNameTh', kind: 'string' },
    { name: 'subdistrictCode', kind: 'string' },
    { name: 'subdistrictNameTh', kind: 'string' },
    { name: 'villageNo', kind: 'string' },
    { name: 'villageName', kind: 'string_or_null' },
    { name: 'isActive', kind: 'boolean' },
    { name: 'status', kind: 'string' },
    { name: 'osmStatus', kind: 'string' },
    { name: 'osmShowbbody', kind: 'string' },
    { name: 'approvalStatus', kind: 'string' },
    { name: 'volunteerStatus', kind: 'string' },
    { name: 'createdAt', kind: 'string' },
    { name: 'requestDate', kind: 'string' },
    { name: 'updatedAt', kind: 'string' },
  ],
};

/**
 * Exact 4 direct personal identifier fields on `resigned-volunteers` (docs/sheets-schema.json).
 * Persisted in Full-Field Operator Mode (ADR-0005); `citizenId` is masked in Preview UI.
 */
export const RESIGNED_VOLUNTEERS_RESTRICTED_SOURCE_FIELDS = [
  'id',
  'citizenId',
  'firstName',
  'lastName',
] as const;

/**
 * All 18 observed source columns on `ResignedVolunteers` (ADR-0005 Full-Field Operator Mode),
 * paired with the uniform 8 trailing Keyed Upsert metadata columns (26 columns total).
 */
export const RESIGNED_VOLUNTEERS_SCHEMA: KeyedDatasetSchemaSpec<'resigned-volunteers'> = {
  endpoint: 'resigned-volunteers',
  tab: 'ResignedVolunteers',
  keyField: 'id',
  displayNameField: 'firstName',
  summaryFieldNames: [
    'citizenId',
    'firstName',
    'lastName',
    'retirementDate',
    'retirementReason',
    'osmStatus',
    'volunteerStatus',
    'approvalStatus',
  ],
  maxRows: 2500,
  preserveSourceLocality: true,
  fields: [
    { name: 'id', kind: 'string' },
    { name: 'citizenId', kind: 'string_or_null' },
    { name: 'firstName', kind: 'string_or_null' },
    { name: 'lastName', kind: 'string_or_null' },
    { name: 'retirementDate', kind: 'string' },
    { name: 'retirementReason', kind: 'string_or_null' },
    { name: 'osmStatus', kind: 'string' },
    { name: 'volunteerStatus', kind: 'string' },
    { name: 'approvalStatus', kind: 'string' },
    { name: 'provinceCode', kind: 'string' },
    { name: 'provinceName', kind: 'string' },
    { name: 'districtCode', kind: 'string' },
    { name: 'districtName', kind: 'string' },
    { name: 'subdistrictCode', kind: 'string' },
    { name: 'subdistrictName', kind: 'string' },
    { name: 'villageCode', kind: 'string' },
    { name: 'villageNo', kind: 'string' },
    { name: 'villageName', kind: 'string' },
  ],
};

/**
 * Exact 5 direct personal identifier fields on `volunteer-tenure` (docs/sheets-schema.json).
 * Persisted in Full-Field Operator Mode (ADR-0005); `citizenId` is masked in Preview UI.
 */
export const VOLUNTEER_TENURE_RESTRICTED_SOURCE_FIELDS = [
  'id',
  'citizenId',
  'osmCode',
  'firstName',
  'lastName',
] as const;

/**
 * All 21 observed source columns on `VolunteerTenure` (ADR-0005 Full-Field Operator Mode),
 * paired with the uniform 8 trailing Keyed Upsert metadata columns (29 columns total).
 */
export const VOLUNTEER_TENURE_SCHEMA: KeyedDatasetSchemaSpec<'volunteer-tenure'> = {
  endpoint: 'volunteer-tenure',
  tab: 'VolunteerTenure',
  keyField: 'id',
  displayNameField: 'firstName',
  summaryFieldNames: [
    'osmCode',
    'firstName',
    'lastName',
    'citizenId',
    'startYear',
    'tenureYears',
    'osmYear',
    'approvalDate',
    'retirementDate',
    'retirementReason',
    'osmStatus',
  ],
  maxRows: 2500,
  fields: [
    { name: 'id', kind: 'string' },
    { name: 'citizenId', kind: 'string_or_null' },
    { name: 'osmCode', kind: 'string_or_null' },
    { name: 'firstName', kind: 'string_or_null' },
    { name: 'lastName', kind: 'string_or_null' },
    { name: 'startYear', kind: 'integer_or_null' },
    { name: 'tenureYears', kind: 'integer_or_null' },
    { name: 'osmYear', kind: 'integer_or_null' },
    { name: 'approvalDate', kind: 'string_or_null' },
    { name: 'retirementDate', kind: 'string_or_null' },
    { name: 'retirementReason', kind: 'string_or_null' },
    { name: 'osmStatus', kind: 'string_or_null' },
    { name: 'provinceCode', kind: 'string' },
    { name: 'provinceName', kind: 'string' },
    { name: 'districtCode', kind: 'string' },
    { name: 'districtName', kind: 'string' },
    { name: 'subdistrictCode', kind: 'string' },
    { name: 'subdistrictName', kind: 'string' },
    { name: 'villageCode', kind: 'string' },
    { name: 'villageNo', kind: 'string' },
    { name: 'villageName', kind: 'string' },
  ],
};

export const LARGE_KEYED_SCHEMAS: Readonly<
  Record<LargeKeyedDatasetEndpoint, KeyedDatasetSchemaSpec<LargeKeyedDatasetEndpoint>>
> = {
  assignments: ASSIGNMENTS_SCHEMA,
  'resigned-volunteers': RESIGNED_VOLUNTEERS_SCHEMA,
  'volunteer-tenure': VOLUNTEER_TENURE_SCHEMA,
};

/**
 * Exact 9 direct personal identifier fields on `volunteer-family` (docs/sheets-schema.json).
 * Persisted in Full-Field Operator Mode (ADR-0005); `citizenId` is masked in Preview UI.
 */
export const VOLUNTEER_FAMILY_RESTRICTED_SOURCE_FIELDS = [
  'osmCode',
  'citizenId',
  'prefixName',
  'firstName',
  'lastName',
  'fullName',
  'address',
  'volunteerId',
  'volunteerName',
] as const;

/**
 * All 21 observed source columns on `volunteer-family` Complete Snapshots
 * (`RFamily_<runId>`, ADR-0005 Full-Field Operator Mode), paired with 8 trailing metadata
 * columns (29 columns total). Uses run-scoped ordinal keys (`snapshot_<runId>_NNNNN`).
 */
export const VOLUNTEER_FAMILY_SCHEMA: CompleteSnapshotSchemaSpec<'volunteer-family'> = {
  endpoint: 'volunteer-family',
  tab: 'RFamily_<runId>',
  displayNameField: 'fullName',
  summaryFieldNames: [
    'osmCode',
    'fullName',
    'citizenId',
    'gender',
    'status',
    'statusLabel',
    'address',
    'volunteerName',
  ],
  maxRows: 2500,
  preserveSourceLocality: true,
  fields: [
    { name: 'provinceCode', kind: 'string' },
    { name: 'provinceName', kind: 'string' },
    { name: 'districtCode', kind: 'string' },
    { name: 'districtName', kind: 'string' },
    { name: 'subdistrictCode', kind: 'string' },
    { name: 'subdistrictName', kind: 'string' },
    { name: 'villageCode', kind: 'string' },
    { name: 'villageNo', kind: 'string' },
    { name: 'villageName', kind: 'string' },
    { name: 'osmCode', kind: 'string_or_null' },
    { name: 'citizenId', kind: 'string_or_null' },
    { name: 'prefixName', kind: 'string_or_null' },
    { name: 'firstName', kind: 'string_or_null' },
    { name: 'lastName', kind: 'string_or_null' },
    { name: 'fullName', kind: 'string_or_null' },
    { name: 'gender', kind: 'string' },
    { name: 'address', kind: 'string_or_null' },
    { name: 'status', kind: 'string' },
    { name: 'statusLabel', kind: 'string' },
    { name: 'volunteerId', kind: 'string_or_null' },
    { name: 'volunteerName', kind: 'string_or_null' },
  ],
};

export function isVolunteerFamilyEndpoint(endpoint: string): endpoint is 'volunteer-family' {
  return endpoint === 'volunteer-family';
}

export function isReferenceEndpoint(endpoint: string): endpoint is ReferenceDatasetEndpoint {
  return endpoint === 'subdistricts' || endpoint === 'villages' || endpoint === 'health-services';
}

export function isSmallKeyedEndpoint(endpoint: string): endpoint is SmallKeyedDatasetEndpoint {
  return isReferenceEndpoint(endpoint) || endpoint === 'volunteer-gender';
}

export function isLargeKeyedEndpoint(endpoint: string): endpoint is LargeKeyedDatasetEndpoint {
  return (
    endpoint === 'assignments' ||
    endpoint === 'resigned-volunteers' ||
    endpoint === 'volunteer-tenure'
  );
}

export function getDatasetDescriptor(endpoint: DatasetEndpoint): DatasetDescriptor {
  const found = DATASET_CATALOG.find((item) => item.endpoint === endpoint);
  if (!found) {
    throw new Error(`UNKNOWN_ENDPOINT:${endpoint}`);
  }
  return found;
}
