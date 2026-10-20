# T003 — Source-to-Sheet Field Mapping (Design Only)

**Baseline:** `docs/field-matrix.md` (162 observed paths). **Physical source columns: 145** + **17 nested leaf-path references**; nested leaves are NOT duplicate columns. Each source field keeps identical case/spelling. Google Sheets itself is NOT created.

**Legend:** `RESTRICTED_DEFAULT_OMIT` means source field documented but NOT transferred by default. All person-grain datasets are blocked until a separate approval decision. `UNKNOWN_NULL_ONLY` means sample value always `null` and cannot establish an actual non-null type.

## Assignments — `/api/v1/dashboard/assignments`

Row grain: one assignment/person record. Write gate: **PERSON_DATA_APPROVAL_REQUIRED**. Key: `id`.
 
| Original source field = proposed column | Observed type | Proposed cell type | Default privacy handling |
|---|---|---|---|
| `id` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `osmCode` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `citizenId` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `prefixNameTh` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `prefixNameEn` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `firstName` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `lastName` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `fullName` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `provinceCode` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `provinceNameTh` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `districtCode` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `districtNameTh` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `subdistrictCode` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `subdistrictNameTh` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `villageNo` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `villageName` | null (10/10) | `UNKNOWN_NULL_ONLY` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `isActive` | boolean | `BOOLEAN` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `status` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `osmStatus` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `osmShowbbody` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `approvalStatus` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `volunteerStatus` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `createdAt` | string (ISO 8601 timestamp) | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `requestDate` | string (ISO 8601 timestamp) | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `updatedAt` | string (ISO 8601 timestamp) | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |

## Subdistricts — `/api/v1/lookups/subdistricts`

Row grain: one subdistrict. Write gate: **ELIGIBLE_AFTER_APPROVAL**. Key: `code`.
 
| Original source field = proposed column | Observed type | Proposed cell type | Default privacy handling |
|---|---|---|---|
| `code` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `id` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `name_th` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `name_en` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `postal_code` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `label` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `district_code` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `district_name_th` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `district_name_en` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `province_code` | null only | `UNKNOWN_NULL_ONLY` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `province_name_th` | null only | `UNKNOWN_NULL_ONLY` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `province_name_en` | null only | `UNKNOWN_NULL_ONLY` | `ALLOW_ONLY_IF_DATASET_APPROVED` |

## Villages — `/api/v1/lookups/villages`

Row grain: one village. Write gate: **ELIGIBLE_AFTER_APPROVAL**. Key: `code`.
 
| Original source field = proposed column | Observed type | Proposed cell type | Default privacy handling |
|---|---|---|---|
| `code` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `village_code_8digit` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `id` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `name_th` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `name_en` | null เท่านั้น (ชนิดอื่นยังไม่ทราบ) | `UNKNOWN_NULL_ONLY` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `village_no` | integer | `NUMBER` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `metro_status` | null เท่านั้น (ชนิดอื่นยังไม่ทราบ) | `UNKNOWN_NULL_ONLY` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `label` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `subdistrict_code` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `subdistrict_name_th` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `subdistrict_name_en` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `district_code` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `district_name_th` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `district_name_en` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `province_code` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `province_name_th` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `province_name_en` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `health_service_code` | string / null | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `health_service_name_th` | string / null | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `health_service_name_en` | null เท่านั้น (ชนิดอื่นยังไม่ทราบ) | `UNKNOWN_NULL_ONLY` | `ALLOW_ONLY_IF_DATASET_APPROVED` |

## HealthServices — `/api/v1/geo-management/health-services`

Row grain: one health service unit. Write gate: **ELIGIBLE_AFTER_APPROVAL**. Key: `health_service_code`.
 
| Original source field = proposed column | Observed type | Proposed cell type | Default privacy handling |
|---|---|---|---|
| `health_service_code` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `health_service_name_th` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `health_service_name_en` | null | `UNKNOWN_NULL_ONLY` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `legacy_5digit_code` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `legacy_9digit_code` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `village_no` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `latitude` | number | `NUMBER` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `longitude` | number | `NUMBER` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `health_service_type` | object | `JSON_TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `province` | object | `JSON_TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `district` | object | `JSON_TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `subdistrict` | object | `JSON_TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `service_areas` | array<object> | `JSON_TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `created_at` | string (datetime) | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `updated_at` | string (datetime) | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `deleted_at` | null | `UNKNOWN_NULL_ONLY` | `ALLOW_ONLY_IF_DATASET_APPROVED` |

Nested paths (retained inside original JSON column, **not** extra columns):

| Observed nested path | Parent JSON column | Observed type |
|---|---|---|
| `health_service_type.id` | `health_service_type` | string (UUID-formatted) |
| `health_service_type.name_th` | `health_service_type` | string |
| `health_service_type.name_en` | `health_service_type` | string |
| `province.province_code` | `province` | string |
| `province.province_name_th` | `province` | string |
| `province.province_name_en` | `province` | string |
| `district.district_code` | `district` | string |
| `district.district_name_th` | `district` | string |
| `district.district_name_en` | `district` | string |
| `subdistrict.subdistrict_code` | `subdistrict` | string |
| `subdistrict.subdistrict_name_th` | `subdistrict` | string |
| `subdistrict.subdistrict_name_en` | `subdistrict` | string |
| `service_areas[].id` | `service_areas` | string (UUID-formatted) |
| `service_areas[].subdistrict_code` | `service_areas` | string |
| `service_areas[].subdistrict_name_th` | `service_areas` | string |
| `service_areas[].village_nos` | `service_areas` | array<string> |
| `service_areas[].is_primary` | `service_areas` | boolean |

## VolunteerGender — `/api/v1/reports/volunteer-gender`

Row grain: one village gender aggregation for a snapshot. Write gate: **ELIGIBLE_AFTER_PRIVACY_REVIEW**. Key: `provinceCode` + `districtCode` + `villageCode`.
 
| Original source field = proposed column | Observed type | Proposed cell type | Default privacy handling |
|---|---|---|---|
| `provinceCode` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `provinceName` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `districtCode` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `districtName` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `subdistrictCode` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `subdistrictName` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `villageCode` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `villageNo` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `villageName` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `total` | integer | `NUMBER` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `male` | integer | `NUMBER` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `female` | integer | `NUMBER` | `ALLOW_ONLY_IF_DATASET_APPROVED` |

## VolunteerFamily — `/api/v1/reports/volunteer-family`

Row grain: one volunteer/family-member relationship row. Write gate: **PERSON_DATA_APPROVAL_REQUIRED**. Key: NONE (BLOCKED).
 
| Original source field = proposed column | Observed type | Proposed cell type | Default privacy handling |
|---|---|---|---|
| `provinceCode` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `provinceName` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `districtCode` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `districtName` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `subdistrictCode` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `subdistrictName` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `villageCode` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `villageNo` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `villageName` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `osmCode` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `citizenId` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `prefixName` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `firstName` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `lastName` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `fullName` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `gender` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `address` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `status` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `statusLabel` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `volunteerId` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `volunteerName` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |

## ResignedVolunteers — `/api/v1/reports/resigned-volunteers`

Row grain: one retired-volunteer/person row. Write gate: **PERSON_DATA_APPROVAL_REQUIRED**. Key: `id`.
 
| Original source field = proposed column | Observed type | Proposed cell type | Default privacy handling |
|---|---|---|---|
| `id` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `citizenId` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `firstName` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `lastName` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `retirementDate` | string (date YYYY-MM-DD) | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `retirementReason` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `osmStatus` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `volunteerStatus` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `approvalStatus` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `provinceCode` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `provinceName` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `districtCode` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `districtName` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `subdistrictCode` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `subdistrictName` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `villageCode` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `villageNo` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `villageName` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |

## VolunteerTenure — `/api/v1/reports/volunteer-tenure`

Row grain: one volunteer tenure row. Write gate: **PERSON_DATA_APPROVAL_REQUIRED**. Key: `id`.
 
| Original source field = proposed column | Observed type | Proposed cell type | Default privacy handling |
|---|---|---|---|
| `id` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `citizenId` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `osmCode` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `firstName` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `lastName` | string | `TEXT` | `RESTRICTED_DEFAULT_OMIT` |
| `startYear` | integer | `NUMBER` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `tenureYears` | integer | `NUMBER` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `osmYear` | integer | `NUMBER` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `approvalDate` | string (date YYYY-MM-DD) | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `retirementDate` | null only | `UNKNOWN_NULL_ONLY` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `retirementReason` | null only | `UNKNOWN_NULL_ONLY` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `osmStatus` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `provinceCode` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `provinceName` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `districtCode` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `districtName` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `subdistrictCode` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `subdistrictName` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `villageCode` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `villageNo` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |
| `villageName` | string | `TEXT` | `ALLOW_ONLY_IF_DATASET_APPROVED` |

## Reserved metadata fields

Metadata columns have a leading underscore, are appended **after** the original source columns, and do **not** rename or replace source fields. Future source fields beginning with underscore must trigger collision review.

| Metadata column | Meaning |
|---|---|
| `_schema_version` | versioned design contract |
| `_sync_run_id` | approved import run identity; no token |
| `_source_key` | approved stable non-person key only; person keys require privacy gate |
| `_fetched_at_utc` | ISO 8601 UTC fetch time, not source timestamp |
| `_quality_status` | VALID/WARNING/QUARANTINED/BLOCKED |
| `_field_presence_json` | per approved source column: ABSENT/NULL/VALUE; restricted fields omitted |
| `_last_seen_run_id` | last complete validated snapshot run; no deletion automatically |
| `_row_digest` | non-sensitive rows only, sha256 of approved canonical fields; no unsalted hash of personal data |

Do not write unapproved person fields into `_field_presence_json`, `_row_digest` or quarantine logs. Values from API response envelopes (`success`, `message`, root `total`, `page`, `pageSize`, `limit`, `offset`, `pagination`) are **run metadata** and must not be mistaken for item-row columns.
