import type {
  DatasetEndpoint,
  DatasetGroup,
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
  'string' | 'string_or_null' | 'integer' | 'number' | 'null_only' | 'object' | 'array';

export type ReferenceFieldKind = DatasetFieldKind;

export interface DatasetFieldSpec {
  readonly name: string;
  readonly kind: DatasetFieldKind;
}

export interface KeyedDatasetSchemaSpec<TEndpoint extends DatasetEndpoint = DatasetEndpoint> {
  readonly endpoint: TEndpoint;
  readonly tab: string;
  readonly keyField: string;
  readonly displayNameField: string;
  readonly summaryFieldNames: readonly string[];
  readonly maxRows: number;
  readonly fields: readonly DatasetFieldSpec[];
}

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
export const SYNC_LOG_TAB = '_ThaiPHCSyncLog';
export const SAME_WORKBOOK_APPROVAL_TOKEN = 'OWNER_ONLY_5406_APPROVED';
export const SCHEMA_VERSION = '0.1.0';

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

export function isReferenceEndpoint(endpoint: string): endpoint is ReferenceDatasetEndpoint {
  return endpoint === 'subdistricts' || endpoint === 'villages' || endpoint === 'health-services';
}

export function isSmallKeyedEndpoint(endpoint: string): endpoint is SmallKeyedDatasetEndpoint {
  return isReferenceEndpoint(endpoint) || endpoint === 'volunteer-gender';
}

export function getDatasetDescriptor(endpoint: DatasetEndpoint): DatasetDescriptor {
  const found = DATASET_CATALOG.find((item) => item.endpoint === endpoint);
  if (!found) {
    throw new Error(`UNKNOWN_ENDPOINT:${endpoint}`);
  }
  return found;
}
