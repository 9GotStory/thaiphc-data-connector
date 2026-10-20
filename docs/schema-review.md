# T002 — ThaiPHC Cross-Endpoint Schema & Data Quality Review

**Date:** 2026-10-20 (Asia/Bangkok)  
**Scope:** 8 API endpoints documented under `docs/schemas/`. Reference geography: Phrae `54`, Song `5406`.  
**Evidence:** Full **85-row villages lookup** JSON; **10-row of 18** health-services JSON; user-provided page-1 **10-row snippets** for assignments, volunteer-gender, volunteer-family, resigned-volunteers and volunteer-tenure; eight subdistrict lookup entries reported in T001 docs. **No live API calls** were made.  
**Classification:** **OBSERVED** = directly supported by the supplied sample; **UNVERIFIED** = would require extra pages/semantics/server-side tests; **CANDIDATE** = proposed future join, not a confirmed foreign key.

## A. Coverage and response envelopes

| API | Row grain in observed response | Rows reviewed | Root / pagination fields | Count exposed by API |
|---|---|---:|---|---:|
| `dashboard/assignments` | assignment/person | 10, page 1 | `provinces[]`, `items[]`, `pagination{page,limit,total,pages}` | 1,571 |
| `lookups/subdistricts` | subdistrict | 8 (documented) | `items[]` | 8 observed; no total |
| `lookups/villages` | village | **85/85** in supplied lookup | `items[]` | 85 observed; no total |
| `geo-management/health-services` | health-service unit | **10 of 18** | `items[]`, `total`, `limit`, `offset` | 18 |
| `reports/volunteer-gender` | village aggregated gender counts | 10, page 1 | `success`, `message`, `items[]`, `total`, `page`, `pageSize` | 85 |
| `reports/volunteer-family` | volunteer/family relation row | 10, page 1 | same reports envelope | 1,803 |
| `reports/resigned-volunteers` | historical person/status row | 10, page 1 | same reports envelope | 1,150 |
| `reports/volunteer-tenure` | volunteer/person tenure row | 10, page 1 | same reports envelope | 1,571 |

All reported totals above are **snapshot values**, not independently collected across all pages. Equal totals do **not** prove equivalent record sets or matching definitions. Full field/type inventory: [Field Matrix](field-matrix.md), and exact sample-derived types in `docs/schemas/`.

## B. Primary/reference-code checks

### B1. Village lookup: exhaustive checks over the supplied 85 rows — OBSERVED

- Exactly **85** objects, with the same **20** top-level keys per item; **85 unique** values each for `code`, `id`, and `village_code_8digit`.
- `id === code` in **85/85** rows.
- `code === subdistrict_code + zeroPad3(village_no)` in **85/85** rows.
- `village_code_8digit === subdistrict_code + zeroPad2(village_no)` in **85/85** rows.
- `label === name_th` in **85/85** rows.
- Codes begin with `54` and `5406` consistently for the supplied lookup, and subdistricts span **8** codes.
- Counts by subdistrict: `540601:11`, `540602:12`, `540603:17`, `540604:12`, `540605:13`, `540606:10`, `540607:4`, `540608:6` (sum **85**).
- `(subdistrict_code, village_no)` is unique within this sample. This is an observation, **not** an official database constraint.
- WARNING: observed code format is not proof that prefix-derived keys will always be valid for future geography or historical rows. Prefer exact crosswalk lookup rather than repairing conflicting values.

### B2. Subdistrict reference — OBSERVED / limitation

- T001 subdistrict schema documents eight codes `540601` through `540608`; the 85 villages' subdistrict codes all occur within that set.
- `subdistricts.items[].province_code`, `province_name_th`, and `province_name_en` were `null` in **8/8** documented records. Never require these fields for joining in T003.
- The full original subdistrict JSON is **not** attached as a separate machine-readable file in this review. Reconciliation uses its documented codes, not an independent byte-for-byte reparse.

### B3. Health service references — OBSERVED / unresolved

- The **10** displayed health-service codes, legacy 5-digit codes and legacy 9-digit codes are each unique **within the displayed page**.
- Every returned health service has one `service_areas[]` entry in the sample, with matching service-location subdistrict; **10/10** coordinates are `latitude=0` and `longitude=0`. Treat `(0,0)` as **unusable/placeholder** for mapping, not a true verified location.
- Village `health_service_code` is non-null in **10/85** village records: **9** point to `GA0006419` and **1** points to `BA0000588`; **75/85** have `null`.
- All **9** `GA0006419` references resolve to the displayed 10-service page; the **1** `BA0000588` code does not. This is **UNRESOLVED**, not a proven broken foreign key: the remaining eight services were not supplied.
- The displayed `GA0006419` service's `service_areas[].village_nos` lists `["2"]`, while nine village rows link to its code (not limited to village 2). **Do not assume** the nested array is a complete coverage/catchment list. Its exact semantics remain unverified.

## C. Report ↔ geography relationships (page-1-only)

| Endpoint | Rows in sample | Code present in 85-village lookup | Geography consistency | Deduplication observation |
|---|---:|---:|---|---|
| `volunteer-gender` | 10 | **10/10** | `subdistrictCode`, `villageNo`, `villageName` match lookup **10/10**; also `male + female === total` **10/10** | **10** distinct village codes |
| `volunteer-family` | 10 | **8/10** | **7/10** fully match; **1** cross-subdistrict mismatch; **2** have village codes absent from Song's lookup | Multiple rows may legitimately share village code |
| `resigned-volunteers` | 10 | **10/10** | Geography code, village number/name match the supplied lookup **10/10** | **9** distinct villages; repeats are not duplicate persons |
| `volunteer-tenure` | 10 | **10/10** | Geography code, village number/name match **10/10** | **8** distinct villages; repeats are not duplicate persons |
| `dashboard/assignments` | 10 | **Not verified row-by-row** | 10/10 province/district fields match the supplied filter; `villageName` is `null` in **10/10** | Uniqueness across pages unknown |

### C1. Confirmed volunteer-family anomalies — HIGH (review / quarantine candidates, not corrected)

The first three page-1 rows have discrepant geographic fields. No personal names, personal `osmCode` or national IDs are reproduced here.

| Sample row | Response fields | Lookup observation | Interpretation |
|---|---|---|---|
| Family #1 | `subdistrictCode="540210"`, `villageCode="540603006"`, `villageNo="6"` | Village code belongs to `540603` (Huai Mai / ห้วยหม้าย), not `540210` | **MISMATCH** between reported subdistrict and village; do not silently normalize |
| Family #2 | `subdistrictCode="540601"`, `villageCode="540303004"`, `villageNo="10"` | Code not in 85-row Song lookup, and prefix `5403` differs from filtered `5406` | **OUT-OF-SCOPE/UNRESOLVED**; could be stale/cross-district geography, not verified |
| Family #3 | `subdistrictCode="540601"`, `villageCode="540405002"`, `villageNo="11"` | Code not in 85-row Song lookup, and prefix `5404` differs from filtered `5406` | **OUT-OF-SCOPE/UNRESOLVED**; do not substitute a village with the same name |

The other **7/10** family sample rows reference `540601001` and agree with the lookup. Seven rows for one village are **not** duplicate records by themselves because the report's row grain is a person/family relationship, not a unique-village table.

### C2. Gender and tenure arithmetic — OBSERVED / limits

- Gender sample rows 1–10 aggregate to `total=227`, `male=45`, `female=182`; all ten rows satisfy `male+female=total`. This **does not** imply the same total as `assignments.pagination.total=1571` or the complete 85-village gender report.
- For the ten tenure sample records, `tenureYears === 2569 - startYear` is true **10/10**; this is consistent with Buddhist year 2569 (2026 CE), but an implementation must **not** hard-code or recompute tenure from this observational pattern.
- `startYear` and `osmYear` are integers in a Buddhist-year-shaped range; `approvalDate` uses `YYYY-MM-DD` Gregorian-like strings. `retirementDate` and `retirementReason` are `null` **10/10** in the displayed tenure rows. Non-null types must be confirmed independently.
- Resigned sample `retirementReason` includes `resigned` and `died`; `volunteerStatus="already_volunteer"` and `approvalStatus="approved"` also appear. These likely belong to different lifecycle concepts; do **not** call the combinations logically invalid without an authoritative semantics definition.

### C3. Cross-report identities — CANDIDATE only

- `assignments.items[].id` and `volunteer-tenure.items[].id` are **candidate** person identifiers (same formatting); equal populations/keys across pages remain unverified.
- `volunteer-family.items[].volunteerId` is a **candidate** relation to volunteer `id` (one matching volunteer identity appears across the submitted family and tenure page-1 samples, but coverage and uniqueness are not established).
- `osmCode` appears across assignments, tenure and family reports but may be 14 or 15 characters in observed assignments; never convert to number or derive geography from a fixed substring without confirmation.
- `citizenId` must **not** be used as a routine join key or persisted by default; its storage would require documented authority, necessity, permissions, security and retention.

## D. Nulls, duplicates, and schema traps

| Observation | Count | Handling for downstream design |
|---|---:|---|
| Villages `name_en`, `metro_status`, `health_service_name_en` | **85/85 null** each | Non-null type unknown; distinguish absent/null |
| Villages `health_service_code`, `health_service_name_th` | **75/85 null** each | Optional reference, not mandatory FK |
| Health-services `health_service_name_en`, `deleted_at` | **10/10 null** each | Preserve null/unknown typing |
| Health-services `latitude`, `longitude` | **10/10 numeric zero** | Do not treat as validated geo coordinates |
| Assignments `villageName` | **10/10 null** | Join on code/number, not names |
| Tenure `retirementDate`, `retirementReason` | **10/10 null** | Preserve null values |
| Subdistricts `province_* ` described above | **8/8 null** | District/subdistrict code path instead |
| Assignments/tenure `osmStatus=""` vs resigned `osmStatus="0"` | different observed strings | Empty string `""` ≠ `"0"` ≠ numeric `0` ≠ `null` |

**Duplicate rules:** Primary-key candidates are **per endpoint/grain**, not inferred from a repeated village reference. No duplicate village keys or displayed health-service codes were found in the respective supplied datasets. Sample report rows with repeated `villageCode` are expected; full-dataset uniqueness of person identifiers **UNVERIFIED**.

## E. Proposed joins and operational decisions for T003 (all provisional)

| Source field | Candidate target | Confidence | Guard |
|---|---|---|---|
| Reports `villageCode` (string) | Villages `code` (string) | Strong for observed in-scope rows | Reject/quarantine unresolved codes; do not auto-create villages |
| Reports `subdistrictCode` | Subdistricts `code` | Strong for 8 known Tambons | Cross-check `villageCode` rather than trust label |
| Assignments `subdistrictCode + villageNo` | Villages `subdistrict_code + village_no` | Candidate | Preserve original raw types; compare safely, don't assert unique across real population |
| Villages `health_service_code` | Health services `health_service_code` | Partial (9 linked, 1 unresolved) | Re-evaluate only with all 18 services |
| Families `volunteerId` | Tenure/assignments `id` | Candidate | Verify identity match across pages before enforcing |
| Health services `service_areas[].village_nos[]` | Villages in corresponding `subdistrict_code` | Cautious candidate | Semantics of `service_areas` not established |

Never replace source values based on guessed prefix, nearest geography, Thai name equality, or row index. Do not use report row `total` as the same metric as root `total`.

## F. Blockers / open questions before T003 can be *finalized*

1. Obtain the **remaining eight health-services rows** through an authorized manual request and recheck unresolved `BA0000588` and service-area meanings.
2. Confirm `volunteer-family` geographic anomalies with an authorized ThaiPHC data owner; determine whether legacy district codes are legitimate and the preferred correction channel.
3. Verify optional/non-null types and actual uniqueness/pagination behavior with appropriately authorized samples. Do not assume example-only nulls mean permanent nulls.
4. Confirm meanings and change semantics for `approvalStatus`, `osmStatus`, `volunteerStatus`, `retirementReason`, `tenureYears` and time zones.
5. Determine whether reports contain personal/sensitive data that must be excluded from future Google Sheets entirely; complete access controls/retention design before real-data processing.
6. Clarify `health-services.service_areas` whether it means record location, declared villages, service coverage, or something else.
7. Confirm `volunteer-gender` aggregate scope: the equality of reported `total=85` and the village count doesn't prove all 85 rows or matching snapshots.

**T002 decision:** Suitable for a **documented schema baseline and provisional T003 planning**, but **NOT READY for unconditional referential enforcement or real-data sync**. All anomalies remain recorded exactly as returned, and no source data was modified. This is an independent *sample-level* review, not full API certification.
