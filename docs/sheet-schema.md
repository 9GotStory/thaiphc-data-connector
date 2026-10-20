# T003 — Google Sheets Schema Design for 8 ThaiPHC APIs

**Status: DRAFT / DESIGN-ONLY.** This PR is **not** permission to create a spreadsheet, connect Apps Script, fetch ThaiPHC, or write personal records.

Source: [API inventory](api-inventory.md), [T001 schemas](schemas/), [T002 review](schema-review.md), [T002 field matrix](field-matrix.md). The source evidence is sample-derived; there is **no official full-dataset contract**. Proposed machine-readable contract: [sheets-schema.json](sheets-schema.json); full 145-field mapping: [sheet-field-mapping.md](sheet-field-mapping.md).

## 1. Logical Sheets (eight source datasets)

| Tab | API | Observed item fields | Nested leaf paths | Proposed upsert key | Population / write gate |
|---|---|---:|---:|---|---|
| `Assignments` | `assignments` | 25 | 0 | `id` | `PERSON_DATA_APPROVAL_REQUIRED` |
| `Subdistricts` | `subdistricts` | 12 | 0 | `code` | `ELIGIBLE_AFTER_APPROVAL` |
| `Villages` | `villages` | 20 | 0 | `code` | `ELIGIBLE_AFTER_APPROVAL` |
| `HealthServices` | `health-services` | 16 | 17 | `health_service_code` | `ELIGIBLE_AFTER_APPROVAL` |
| `VolunteerGender` | `volunteer-gender` | 12 | 0 | `provinceCode`+`districtCode`+`villageCode` | `ELIGIBLE_AFTER_PRIVACY_REVIEW` |
| `VolunteerFamily` | `volunteer-family` | 21 | 0 | **NONE** | `PERSON_DATA_APPROVAL_REQUIRED` |
| `ResignedVolunteers` | `resigned-volunteers` | 18 | 0 | `id` | `PERSON_DATA_APPROVAL_REQUIRED` |
| `VolunteerTenure` | `volunteer-tenure` | 21 | 0 | `id` | `PERSON_DATA_APPROVAL_REQUIRED` |

All 8 are **proposed logical tabs**. No tabs are created by T003. The four person-grain data sources (`Assignments`, `VolunteerFamily`, `ResignedVolunteers`, `VolunteerTenure`) are **disabled for writes by default**. Subdistrict, village and health-service lookups remain subject to explicit destination authorization; gender aggregates need an additional small-cell/privacy review.

Two **optional support tabs** are proposed, `_SyncRuns` (non-PII pagination and run audit) and `_Quarantine` (redacted validation events, **no raw person payloads**). These are *not* ThaiPHC endpoints.

## 2. Field mapping, types and nested JSON

- Retain **exact original field names**, spelling and case as column headers (e.g. `osmShowbbody`, `village_no` and `villageNo` are distinct). All 145 observed top-level item fields are catalogued in [sheet-field-mapping.md](sheet-field-mapping.md) with original field names and privacy policy.
- Keep code-like values (`code`, `id`, `osmCode`, `villageCode`, `subdistrictCode`, `health_service_code`, `legacy_5digit_code`, postal code, etc.) **as strings** and format TEXT. Never coerce them into numbers; zero prefixes matter. Person-linked codes need policy approval or exclusion.
- Propose **RAW** writes with explicit PLAIN_TEXT format for strings, and actual numeric/boolean values for observed numeric/boolean types. Do **not** use `USER_ENTERED` for raw imported strings because it can parse as formula or convert identifiers and dates. Do not assume Apps Script `setValues` has equivalent protection: test and escape/neutralize formula-leading strings before selecting a write API. Source: [Google Sheets API values guide](https://developers.google.com/workspace/sheets/api/guides/values).
- Keep `createdAt`, `requestDate`, `updatedAt`, `created_at`, `updated_at`, `approvalDate`, `retirementDate` as source-formatted **TEXT** in T003, not Sheets date serials. Parse explicitly only for validation. `startYear` and `osmYear` are integer values shaped as **Buddhist-era years** and must not be silently converted; `tenureYears` is an observed derived integer, not a key.
- Preserve each top-level nested field in the **same-named column** as deterministic JSON text: `health_service_type`, `province`, `district`, `subdistrict`, `service_areas`. The 17 nested leaf paths remain **documented only**, not duplicated as columns. `service_areas[]` could contain multiple objects and `village_nos[]` multiple strings; do not explode rows or infer full service coverage.
- Do not silently truncate JSON/strings or corrupt sheet cell content. At integration stage apply per-cell length and volume checks; route overlong items to a safe non-PII quarantine or abort; decide whether child tabs are required once all 18 services and actual array sizes are known.

## 3. Null / absent / empty string semantics

Sheets cells alone **cannot reliably distinguish** absent, JSON `null`, and `""`. A safe proposed projection adds `_field_presence_json` as a JSON object describing each **approved and permitted** source field as `ABSENT`, `NULL` or `VALUE`. An empty string has state `VALUE` and cell text `""`. A zero or `false` also has state `VALUE`. A null-only sample type is recorded `UNKNOWN_NULL_ONLY` in the machine manifest; no future type is invented.

**This is a proposed design**, not a running encoder/decoder. The future implementation must prove round-trip fidelity with synthetic data and avoid including restricted field presence.

## 4. Upsert, duplicates and snapshot boundaries

| Dataset | Key / handling | Evidence grade |
|---|---|---|
| `Subdistricts` | `code` | Observed distinct in 8 documented records |
| `Villages` | `code` | Observed unique 85/85 in supplied lookup |
| `HealthServices` | `health_service_code` | Observed distinct 10/10 only (of 18); **provisional** |
| `VolunteerGender` | `(provinceCode,districtCode,villageCode)` for a **current scoped snapshot** | Distinct for 10/85 sampled villages; provisional |
| `Assignments` | `id` | Candidate person key, gate required; **not approved for use** |
| `VolunteerFamily` | **NO VERIFIED KEY**; block row-level upsert entirely | Same volunteer can have multiple members, repeated village; no relation-row ID observed |
| `ResignedVolunteers` | `id` | Candidate person key; lifecycle uniqueness unverified; gate required |
| `VolunteerTenure` | `id` | Candidate person key; derived tenure changes, gate required |

**Never deduplicate on `villageCode` for person records.** The same `villageCode` occurs legitimately in multiple rows. A stable identity cannot be manufactured from an unsalted personal-data hash, row order, or an arbitrary personal identifier. Full cross-page checks and authorized personal-data policy must precede any person-level upsert.

Define two distinct future semantics: *current-state upsert* replaces the matching row in one geographic scope after validation; *historical snapshot archiving* (if ever needed) adds a separate explicit snapshot identity rather than overloading current keys. Root `total` is pagination metadata, while `volunteer-gender.items[].total` is a village metric.

**Deletion policy:** No automatic deletion from a partial page, filter change, failed request or unknown lifecycle state. Even after full-page success, deletion/tombstoning requires a separate approved policy and reversible audit.

## 5. Quality checks and quarantine (design)

Planned statuses: `VALID` / `WARNING` / `QUARANTINED` / `BLOCKED`. Proposed fail-closed gates:
- `MISSING_KEY`, `DUPLICATE_SOURCE_KEY`, `INCOMPLETE_PAGESET` or `PRIVACY_BLOCKED` → **BLOCKED**; do not write.
- `GEOGRAPHY_MISMATCH`, `UNRESOLVED_VILLAGE`, `UNRESOLVED_HEALTH_SERVICE` → **QUARANTINED** pending investigation (no raw person row retained).
- `NULL_ONLY_TYPE_UNKNOWN`, `UNVERIFIED_SOURCE_STATUS`, zero/zero coordinates → **WARNING** unless field is required for a critical use.
- `UNSAFE_TEXT`, invalid JSON shape, overlong cell → **BLOCKED**, preserving only safe exception metadata.

T002 observations that **must not** be silently fixed: `VolunteerFamily` has one mismatched subdistrict and two codes outside the lookup scope in the ten-row sample; `Villages` has **75/85 `health_service_code=null`**; of its ten non-null references, **one `BA0000588`** is not in the **first ten** of 18 health-service rows; all displayed services have `latitude=longitude=0`. None establishes a complete FK invariant or reliable geolocation.

Avoid raw API JSON in `_Quarantine` or application logs. For a restricted person row, log only sanitized issue codes/counts/run IDs; no cleartext IDs, names, addresses, credentials, person-key hashes, or partial response bodies. Do not attempt to repair geographic codes using village names or assumed ID prefixes.

## 6. Pagination, security, recovery and capacity gate

- Respect each endpoint's distinct pagination style: assignments `page/pageSize` request but `pagination.page/limit/total/pages` response; reports `page/pageSize`; health service `limit/offset`; lookup responses currently show only `items[]`.
- Proposed run states: `PLANNED` → `FETCHING` → `VALIDATING` → `DRY_RUN_READY` → `COMMITTED` or `ABORTED`. No write if authorization fails or page count/scope/keys cannot be reconciled. Do not calculate missing pagination totals from a sample.
- Authenticate Node.js → Apps Script independently from ThaiPHC bearer; plan request signing, strict scope, replay protection and least-privileged Google account. This issue **implements none**.
- Future read/backup + staged write + verify + rollback must be specified before mutation. Quarantined rows should not be included in a normal update set without review.
- For current Sheets scalability, Google [announced up to 20 million cells per spreadsheet in September 2026](https://workspaceupdates.googleblog.com/2026/09/doubled-cell-limits-in-google-sheets-now-generally-available.html); this is a platform upper bound, **not** the working target. Reassess quota, Apps Script execution duration, payload size, cell limits and batching at T005; do not create a single giant multi-million cell sheet by default.

## 7. Decision gates before provisioning a real spreadsheet

1. Explicit scope and named destination spreadsheet; owner sharing, Google account and lawful access.
2. Confirm what personal records (if any) may be stored; purpose, consent/authority as appropriate, roles, retention, deidentification; by default they are **not stored**.
3. Validate remaining 8 health services and interpret nested service area geography.
4. Resolve/accept with documented treatment the family geography inconsistencies; obtain a stable row key for family relationships or exclude that tab's rows.
5. Test full-page continuity, idempotency, null/absent serialization, formula injection controls, batched writes, failure/restore and duplicate handling using synthetic data.
6. Explicit independent approval for spreadsheet creation and later separate approval for real-data writes.

**Exit criterion for T003:** a testable, versioned *proposal* for all eight API layouts and non-destructive exception handling. **No API calls, Google Sheets or Apps Script changes, imports, or deployments.**
