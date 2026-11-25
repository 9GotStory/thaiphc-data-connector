# Sandbox UAT & Production Pre-Cutover Checklist — ThaiPHC Data Connector

**Scope:** Manual operator readiness runbook for the React + Google Apps Script (`HtmlService` + `google.script.run`) Repeatable Sync Web Application covering all eight authorized ThaiPHC datasets for `Geographic Scope (54 / 5406)` (Phrae province `54`, Song district `5406`).

> **Non-Authorization Notice:** This checklist is a preparation and verification guide only. Passing offline CI, Playwright Browser QA, or Sandbox UAT does **not** authorize Production deployment, Production Script Property changes, or live Production writes. Production cutover requires explicit separate operator approval in **Section 5**.

---

## 1. Mandatory Isolation & Access Guardrails (Check Before Sandbox UAT)

- [ ] **Isolated Sandbox GAS Project & Sandbox Workbook Only:** Deploy UAT builds exclusively to a standalone **Sandbox** Apps Script project bound to a dedicated **Sandbox** Google Sheets workbook. Never touch the Production `ThaiPHC Data` workbook or the legacy F010 GAS V3 deployment during Sandbox UAT.
- [ ] **Single-Operator Access (`Only myself`):** Confirm `backend/dist/appsscript.json` declares `timeZone: "Asia/Bangkok"`, `runtimeVersion: "V8"`, `exceptionLogging: "NONE"`, `webapp: { executeAs: "USER_DEPLOYING", access: "MYSELF" }`, and strictly the three minimal OAuth scopes (`spreadsheets`, `script.storage`, `script.external_request`).
- [ ] **Local Build Clean & Verified:** From a clean Git checkout at the candidate commit SHA on Node.js 26, run `npm run build && npm run check` and confirm:
  - All legacy offline `node --test` tests pass (`npm test`).
  - Typecheck, ESLint, Prettier, frontend Vitest, and backend Vitest (including 8-dataset `node:vm` compiled `Code.js` verification) pass.
  - `backend/dist/` contains strictly three files: `Code.js`, `index.html` (single-file bundle), and `appsscript.json`.
- [ ] **Bearer Token Discipline:** Paste your short-lived ThaiPHC Bearer Token only into the masked Sync Workspace input. Never paste tokens or HMAC keys into Script Properties logs, Git, screenshots, or chat. Click **"ล้าง Token"** immediately when finished.

---

## 2. Sandbox Deployment & End-to-End Verification (All 8 Datasets)

### 2.1 Deploy Built Bundle to Sandbox GAS Project

If using `@google/clasp` against your standalone Sandbox script (`.clasp.json` is gitignored):

1. Run `npm run build` from `thaiphc-data-connector/` so `backend/dist/` holds the freshly compiled `Code.js`, `index.html`, and `appsscript.json`.
2. Push **only** `backend/dist/` to the standalone Sandbox GAS project (`clasp push --force` with `rootDir: "./dist"` in `backend/.clasp.json`; never overwrite `backend/appsscript.json` with a default blank manifest).
3. In the Apps Script Editor, inspect `appsscript.json` (`exceptionLogging: "NONE"`, 3 OAuth scopes, `MYSELF` access), then create/update a **Web app** deployment (`Execute as: Me`, `Who has access: Only myself`) and open its `/exec` URL.

### 2.2 Configure Sandbox Script Properties (`Project Settings > Script Properties`)

| Script Property | Sandbox UAT Value | Notes |
|---|---|---|
| `THAIPHC_ENV` | `SANDBOX` | Must render blue `SANDBOX` badge in header & Dashboard |
| `THAIPHC_SPREADSHEET_ID` | `<Sandbox Reference Sheet ID>` | Isolated Sandbox workbook containing default `ชีต1` |
| `THAIPHC_REPORT_SPREADSHEET_ID` | *(Optional)* `<Sandbox Report Sheet ID>` | Leave blank only when testing owner-only same-workbook mode |
| `THAIPHC_SAME_WORKBOOK_APPROVAL` | `OWNER_ONLY_5406_APPROVED` *(only if same workbook)* | Omit first to confirm fail-closed guard blocking |
| `THAIPHC_WRITE_ENABLED` | `false` initially → `true` for Sandbox write tests | Start `false` to verify read-only Preview & locked Commit |
| `THAIPHC_PERSON_DATA_WRITE_ENABLED` | `false` initially → `true` for Extended Report tests | Start `false` to verify fail-closed person-data guard |
| `THAIPHC_FULL_PII_WRITE_ENABLED` | `false` initially → `true` for Full-Field Operator Mode (ADR-0005) | Required explicit third guard before committing any Extended Report with full columns/PII |
| `THAIPHC_HMAC_KEY_B64` | *(Optional / Legacy F010 only)* | No longer required under ADR-0005 Full-Field Operator Mode (raw `id` used as `_source_key`) |

### 2.3 Sandbox Verification Steps

1. **Read-Only Guard & Dashboard Check (`Write Guards = OFF`):**
   - [ ] Open Sandbox `/exec` URL. Confirm blue `SANDBOX` badge, exact Sandbox workbook name/masked ID, all three Write Guards (`THAIPHC_WRITE_ENABLED`, `THAIPHC_PERSON_DATA_WRITE_ENABLED`, `THAIPHC_FULL_PII_WRITE_ENABLED`) showing `OFF` (read-only cards, no toggle switches), zero raw personal rows on Dashboard, and all 8 datasets grouped into Reference Datasets (3) and Extended Report Datasets (5).
   - [ ] Run Preview on `subdistricts` and `volunteer-gender` while Write Guards are `OFF`: confirm Preview succeeds read-only with zero Sheet writes and the Confirmation Gate remains locked.
2. **End-to-End Repeatable Sync Across All 8 Datasets (`Write Guards = ON` in Sandbox):**
   - [ ] Set `THAIPHC_WRITE_ENABLED=true`, `THAIPHC_PERSON_DATA_WRITE_ENABLED=true`, and `THAIPHC_FULL_PII_WRITE_ENABLED=true` in Sandbox Script Properties, click **"รีเฟรชสถานะ"** on Dashboard, and verify all three badges switch to `ON`.
   - [ ] Sync each dataset one at a time via Preview → Diff Inspection → Sandbox `AlertDialog` Confirm → Commit → `Destination Readback`:

| # | Dataset (`endpoint`) | Sync Strategy | Destination Tab | Mandatory Sandbox Verification |
|---:|---|---|---|---|
| 1 | `subdistricts` | `Keyed Upsert` | `Subdistricts` | Preview counts match live `5406`, leading-zero text intact, `COMMITTED_VERIFIED`, `ชีต1` preserved |
| 2 | `villages` | `Keyed Upsert` | `Villages` | Sheet expands to 28 columns, `code` (9-digit) & `village_code_8digit` keep leading zeros (`@`), `COMMITTED_VERIFIED` |
| 3 | `health-services` | `Keyed Upsert` | `HealthServices` | `offset` pagination completes, `(0, 0)` rows flagged `REVIEW` (`PLACEHOLDER_COORDS`), `COMMITTED_VERIFIED` |
| 4 | `volunteer-gender` | `Keyed Upsert` | `VolunteerGender` | Full-Field Operator Mode (`ADR-0005`): actual integer counts persisted without `1..4` small-cell suppression, `COMMITTED_VERIFIED` |
| 5 | `assignments` | `Keyed Upsert` | `Assignments` | Sequential Batched Preview progress, `citizenId` masked in Preview (`1-5406-xxxxx-xx-x`), full 33 columns (25 source + 8 metadata) persisted with raw `id` `_source_key` and `@` text format on `citizenId`/`osmCode`, hidden `_Stage_*` removed after `Destination Readback` |
| 6 | `resigned-volunteers` | `Keyed Upsert` | `ResignedVolunteers` | `citizenId` masked in Preview, full 26 columns persisted with raw `id` `_source_key`, `Preserve Source Locality` (`LOCALITY_MISMATCH` = `REVIEW`), `_Stage_*` cleaned up after readback |
| 7 | `volunteer-tenure` | `Keyed Upsert` | `VolunteerTenure` | `citizenId` masked in Preview, full 29 columns persisted with raw `id` `_source_key`, nullable integer/date fields preserved, `_Stage_*` cleaned up after readback |
| 8 | `volunteer-family` | `Complete Snapshot` | `RFamily_<runId>` + `_ThaiPHCReportCurrent` | `Layers` badge, `citizenId` masked in Preview, full 26 columns (21 source + 5 snapshot metadata) persisted in `RFamily_<runId>`, `Preserve Source Locality` (`LOCALITY_MISMATCH` = `REVIEW`), hidden `RFamily_<runId>` unhidden & `Publication Pointer` updated after readback |

3. **Repeatable Sync, Non-Destructive & Hygiene Checks on Sandbox:**
   - [ ] Re-run Preview on an already-synced dataset (`subdistricts`, `assignments`): confirm `UNCHANGED` classification and zero spurious updates.
   - [ ] Confirm `Missing in Source` rows (if simulated in Sandbox) appear under `REVIEW` (`MISSING_IN_SOURCE`) and are **never auto-deleted** on Commit.
   - [ ] Confirm any seeded `Legacy Snapshot` tab (e.g., `RAssign_*`, prior `RFamily_*`) surfaces `LEGACY_F010_SNAPSHOT_PRESENT` (for keyed reports) and remains completely untouched after Commit.
   - [ ] Confirm `_ThaiPHCSyncLog` records one row per run transitioning to `COMMITTED_VERIFIED` with `readback_verified = TRUE`, and `ชีต1` plus all 3 Reference Datasets remain intact.
   - [ ] Verify Bearer Token hygiene: paste works, show/hide toggle works, **"ล้าง Token"** clears memory immediately, and DevTools confirms zero `localStorage`, `sessionStorage`, or cookie entries.

---

## 3. ADR-0005 Schema & Existing Tab Compatibility Verification (Mandatory Before Person-Level Production Writes)

> **Why this gate is critical (`ADR-0005`):** Full-Field Operator Mode supersedes `ADR-0003` for the Repeatable Sync Web App. `assignments` (33 cols), `resigned-volunteers` (26 cols), and `volunteer-tenure` (29 cols) store all observed source columns and use raw ThaiPHC `id` as `_source_key` (no longer requiring `THAIPHC_HMAC_KEY_B64`). Legacy F010 snapshot tabs (`RAssign_*`, `RResign_*`, `RTenure_*`, `RGender_*`, `RFamily_*`) remain untouched alongside the new tabs.

- [ ] **Check Existing Fixed Destination Tabs:** Inspect the target workbook for any prior minimized-schema `Assignments`, `ResignedVolunteers`, or `VolunteerTenure` tabs (from pre-ADR-0005 testing).
  - If a prior minimized-schema tab exists on the same tab name, `HEADER_MISMATCH` will safely halt commits until the operator archives/renames or removes the old tab.
  - Legacy F010 snapshot tabs (`RAssign_*`, `RResign_*`, `RTenure_*`, `RGender_*`, `RFamily_*`) are preserved untouched and never auto-deleted.
- [ ] **Verify Strict Owner-Only Google Drive Access:** Before setting `THAIPHC_FULL_PII_WRITE_ENABLED=true`, verify that the target Report Workbook is strictly restricted (`shared: false`, owner-only or explicitly authorized Song District `5406` public health officers only, no "Anyone with the link").

---

## 4. Production Script Property Verification (`Write Guards = OFF` Initially)

Before any Production write is authorized, deploy the exact approved commit SHA to the Production GAS Web App project (`Execute as: Me`, `Who has access: Only myself`, `exceptionLogging: "NONE"`, 3 OAuth scopes) and verify **all Script Properties** with **all three Write Guards initially `OFF`**:

| Script Property | Required Initial Production Value | Verification |
|---|---|---|
| `THAIPHC_ENV` | `PRODUCTION` | Header displays red top hazard strip + solid crimson `PRODUCTION` badge |
| `THAIPHC_SPREADSHEET_ID` | `<Approved Production Reference Workbook ID>` | Matches verified Production `ThaiPHC Data` workbook (confirm 111-row `Historical Acceptance Baseline` + `ชีต1` intact) |
| `THAIPHC_REPORT_SPREADSHEET_ID` | `<Separate Restricted Report Workbook ID>` *or blank if same-workbook approved* | Separate restricted workbook is default; verify Google Drive sharing is strictly owner-only (`shared: false`) |
| `THAIPHC_SAME_WORKBOOK_APPROVAL` | `OWNER_ONLY_5406_APPROVED` *(only if reusing Reference Workbook)* | Omit when using a separate Report Workbook |
| `THAIPHC_WRITE_ENABLED` | **`false`** *(initially OFF)* | Dashboard displays `OFF · ปิดการเขียน (Preview เท่านั้น)` |
| `THAIPHC_PERSON_DATA_WRITE_ENABLED` | **`false`** *(initially OFF)* | Dashboard displays `OFF · ปิดการเขียน (Preview เท่านั้น)` |
| `THAIPHC_FULL_PII_WRITE_ENABLED` | **`false`** *(initially OFF)* | Dashboard displays `OFF · ปิดการเขียนข้อมูลเต็มรูปแบบ (Preview เท่านั้น)` |
| `THAIPHC_HMAC_KEY_B64` | *(Optional / Legacy F010 CLI only)* | Not required for Web App under ADR-0005 |

- [ ] **Production Read-Only Pre-Flight (`Write Guards = OFF`):**
  - Open Production `/exec` URL. Confirm crimson `PRODUCTION` strip/badge, zero `UNRESOLVED_PREVIOUS_RUN` warnings, all three Write Guards `OFF`, and intact 111-row `Historical Acceptance Baseline` (`Subdistricts` 8 / `Villages` 85 / `HealthServices` 18).
  - Run read-only Preview on target datasets to confirm `Diff Classification`, `LEGACY_F010_SNAPSHOT_PRESENT` (where applicable), and server-side masked `citizenId` (`1-5406-xxxxx-xx-x`) with zero Sheet writes.
- [ ] **Post-Approval Steady-State Write Guard Policy:** Only after separate go-live approval (Section 5) may the operator switch `THAIPHC_WRITE_ENABLED=true` (and `THAIPHC_PERSON_DATA_WRITE_ENABLED=true` + `THAIPHC_FULL_PII_WRITE_ENABLED=true` for Extended Report Datasets). Once live, every Production Commit remains protected by the Preview Fingerprint re-check under `LockService`, typed `PRODUCTION 5406 <endpoint>` `AlertDialog` confirmation, mandatory `Destination Readback`, and No Auto-Retry—while all three Write Guards remain server-side emergency kill switches.
- [ ] **Non-ACID Recovery Rule:** If any Production Commit returns `UNKNOWN_OUTCOME_STOP`, `FAILED_STOP`, or leaves `UNRESOLVED_PREVIOUS_RUN` (`STARTED` in `_ThaiPHCSyncLog`), **never blindly retry**. Optionally flip Write Guards to `false`, inspect the target tab, `_ThaiPHCSyncLog`, and any retained hidden `_Stage_*` tab in Google Sheets, and start a fresh Preview → Diff → Confirm cycle only after reconciliation.

---

## 5. Explicit Separate Production Deployment & Cutover Approval Gate

> Leave every box below **unchecked** until the operator independently completes Sandbox UAT and explicitly approves Production cutover.

- [ ] **Candidate Release Verified:** Exact merged commit SHA recorded; Node.js 26 offline CI (`ubuntu-24.04` and `windows-latest`) green; local `npm run build && npm run check` green.
- [ ] **Sandbox UAT Accepted:** All 8 datasets completed end-to-end on isolated Sandbox with `COMMITTED_VERIFIED`, masked `citizenId` in Preview UI and full columns persisted cleanly with `@` format in Google Sheets, `ชีต1` & 111-row baseline preserved, `Missing in Source` & `Legacy Snapshot` non-deletion confirmed, and Bearer Token cleared.
- [ ] **ADR-0005 Access & Tab Compatibility Confirmed:** Owner-only Drive sharing confirmed on target Report Workbook, and any pre-ADR-0005 minimized person tabs archived/handled cleanly.
- [ ] **Production Properties & Sharing Verified (`Write Guards = OFF` Initially):** Owner-only Drive sharing confirmed, `THAIPHC_ENV=PRODUCTION`, all three Write Guards confirmed `false` before read-only pre-flight, and legacy F010 GAS V3 receiver untouched until cutover retirement is separately decided.
- [ ] **Explicit Operator Go-Live Approval:** Operator explicitly authorizes Production Web App deployment and enabling Production Write Guards for repeatable sync operations.

### Blank Redacted Sandbox UAT & Pre-Cutover Record

*Keep all Bearer Tokens, HMAC keys, raw personal rows, citizen IDs, and real Spreadsheet/Deployment IDs out of Git and chat.*

```text
Candidate Git SHA / Node.js 26 version:           PENDING
CI Status (ubuntu-24.04 & windows-latest):        PENDING
Sandbox UAT Date (Asia/Bangkok) & Operator:       PENDING
Sandbox 8/8 Datasets COMMITTED_VERIFIED:          PENDING
Sandbox 111-row Baseline, ชีต1 & Legacy Intact:   PENDING
ADR-0005 Full-Field & Masked Preview Verified:    PENDING
Production Drive Sharing (Owner-Only) Verified:   PENDING
Production Write Guards OFF Initial Pre-Flight:   PENDING
Separate Production Deployment Approval Decision: HOLD (Not Yet Approved)
```
