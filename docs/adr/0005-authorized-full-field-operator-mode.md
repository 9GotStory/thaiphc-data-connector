# Authorize Full-Field Operator Mode for Extended Report Datasets with Masked Preview Citizen IDs and Explicit Write Guard

Status: accepted (supersedes ADR-0003 for the React + GAS Web Application)

Public health officers for Song district (`5406`) need to track, supervise, audit, correct, and supplement volunteer and family records across all eight ThaiPHC datasets because the upstream ThaiPHC portal lacks district-level reconciliation and QA views. Under the legacy F010 Minimized Projection policy (ADR-0003), direct identifiers (`citizenId`, names, `osmCode`, `address`, `volunteerId`, `volunteerName`) were stripped before storage and counts `1..4` in `volunteer-gender` were suppressed, making it impossible for authorized officers to identify which specific record to inspect or fix in ThaiPHC. By explicit decision of the authorized single operator, the React + GAS Web Application switches to **Full-Field Operator Mode** for all five Extended Report Datasets:

1. **Full Source Schema Persisted to Google Sheets:**
   - `volunteer-gender` (12 source + 8 metadata = 20 columns): stores actual non-negative integer counts (`total`, `male`, `female`) without `1..4` suppression.
   - `assignments` (25 source + 8 metadata = 33 columns), `resigned-volunteers` (18 source + 8 metadata = 26 columns), and `volunteer-tenure` (21 source + 8 metadata = 29 columns): persist all observed source columns including `id`, `citizenId`, `osmCode`, and name columns as plain text (`@` format) via `Keyed Upsert`, using the raw ThaiPHC `id` as `_source_key` (no longer requiring `THAIPHC_HMAC_KEY_B64`).
   - `volunteer-family` (21 source + 8 metadata = 29 columns): persists all observed source columns via `Complete Snapshot` (`RFamily_<runId>` + `_ThaiPHCReportCurrent`), retaining run-scoped ordinal keys (`snapshot_<runId>_NNNNN`) and `Preserve Source Locality`.
   - Non-key PII columns (`citizenId`, `osmCode`, `prefixName*`, `firstName`, `lastName`, `fullName`, `address`, `volunteerId`, `volunteerName`) accept explicit `null` when omitted by ThaiPHC (`string_or_null`), while retaining strict non-null type, ASCII control character, and formula-injection checks.
2. **Masked Preview `citizenId`:**
   - In the Web App Preview UI, operator-identifying fields (`fullName`/`firstName`/`lastName`, `osmCode`, `address`, `volunteerName`, etc.) are shown so the operator can verify anomalies before commit, while 13-digit `citizenId` values are always masked server-side before returning to the browser (`1-5406-xxxxx-xx-x`) to reduce shoulder-surfing and DOM exposure. Exact unmasked `citizenId` text is written only to Google Sheets during Commit.
3. **Explicit Three-Switch Server-Side Write Guard + Existing Workbook Policy:**
   - Committing any Extended Report Dataset requires all three server-side GAS Script Properties to be `'true'`: `THAIPHC_WRITE_ENABLED`, `THAIPHC_PERSON_DATA_WRITE_ENABLED`, and **`THAIPHC_FULL_PII_WRITE_ENABLED`** (default `false` / fail-closed), in addition to the existing workbook policy (`THAIPHC_REPORT_SPREADSHEET_ID` separate workbook by default, or `THAIPHC_SAME_WORKBOOK_APPROVAL=OWNER_ONLY_5406_APPROVED` for owner-only same-workbook reuse).

## Considered Options

- **Full-Field Operator Mode with `THAIPHC_FULL_PII_WRITE_ENABLED` Guard & Masked Preview `citizenId` (Chosen):** Gives authorized district officers complete data in Google Sheets to audit and remediate ThaiPHC records while keeping explicit server-side fail-closed guards, masked Preview citizen IDs, single-operator `MYSELF` access, and `exceptionLogging: "NONE"`.
- **Ephemeral In-Memory QA View Only (Keep Sheets Minimized):** Preserves zero PII in Google Sheets, but cannot persist operator tracking notes or cross-dataset spreadsheet lookups over time.
- **Store Names/`osmCode` Only, Omit `citizenId` & `address`:** Reduces sensitivity slightly, but omits fields the operator requested for full reconciliation against ThaiPHC.

## Consequences

- **Supersedes ADR-0003 in the Web App:** `THAIPHC_HMAC_KEY_B64` is no longer required for Web App operations, and `h1_` pseudonyms are replaced by raw ThaiPHC `id` as `_source_key` on the three keyed person datasets. Legacy F010 CLI code (`src/`) and offline legacy tests (`tests/`) remain untouched as the historical F010 archive.
- **Safe Schema Transition (`HEADER_MISMATCH`):** Any pre-existing minimized `Assignments`, `ResignedVolunteers`, or `VolunteerTenure` tab has fewer columns than the Full-Field schema; `readDestinationState` fails closed with `HEADER_MISMATCH` rather than corrupting columns. Existing F010 `Legacy Snapshot` tabs (`RAssign_*`, `RResign_*`, `RTenure_*`, `RGender_*`, prior `RFamily_*`) remain untouched and are never auto-deleted.
- **Operator PDPA & Access Governance Responsibility:** Because Google Sheets now stores direct personal identifiers (`citizenId`, full names, addresses), the operator must restrict Google Drive sharing strictly to authorized personnel (owner-only by default), maintain `Only myself` Web App access, and keep `THAIPHC_FULL_PII_WRITE_ENABLED` off whenever writes are not actively performed.
