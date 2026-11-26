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
| `THAIPHC_HMAC_KEY_B64` | `<Sandbox-only 32-byte Base64 test key>` | Never reuse the Production F010 HMAC key in Sandbox unless testing key parity on synthetic/controlled data |

### 2.3 Sandbox Verification Steps

1. **Read-Only Guard & Dashboard Check (`Write Guards = OFF`):**
   - [ ] Open Sandbox `/exec` URL. Confirm blue `SANDBOX` badge, exact Sandbox workbook name/masked ID, both Write Guards showing `OFF` (read-only cards, no toggle switches), zero raw personal rows, and all 8 datasets grouped into Reference Datasets (3) and Extended Report Datasets (5).
   - [ ] Run Preview on `subdistricts` and `volunteer-gender` while Write Guards are `OFF`: confirm Preview succeeds read-only with zero Sheet writes and the Confirmation Gate remains locked.
2. **End-to-End Repeatable Sync Across All 8 Datasets (`Write Guards = ON` in Sandbox):**
   - [ ] Set `THAIPHC_WRITE_ENABLED=true` and `THAIPHC_PERSON_DATA_WRITE_ENABLED=true` in Sandbox Script Properties, click **"รีเฟรชสถานะ"** on Dashboard, and verify both badges switch to `ON`.
   - [ ] Sync each dataset one at a time via Preview → Diff Inspection → Sandbox `AlertDialog` Confirm → Commit → `Destination Readback`:

| # | Dataset (`endpoint`) | Sync Strategy | Destination Tab | Mandatory Sandbox Verification |
|---:|---|---|---|---|
| 1 | `subdistricts` | `Keyed Upsert` | `Subdistricts` | Preview counts match live `5406`, leading-zero text intact, `COMMITTED_VERIFIED`, `ชีต1` preserved |
| 2 | `villages` | `Keyed Upsert` | `Villages` | Sheet expands to 28 columns, `code` (9-digit) & `village_code_8digit` keep leading zeros (`@`), `COMMITTED_VERIFIED` |
| 3 | `health-services` | `Keyed Upsert` | `HealthServices` | `offset` pagination completes, `(0, 0)` rows flagged `REVIEW` (`PLACEHOLDER_COORDS`), `COMMITTED_VERIFIED` |
| 4 | `volunteer-gender` | `Keyed Upsert` | `VolunteerGender` | Mode B `Minimized Projection`, `Complementary Small-Cell Suppression` (`1..4` → `null`, `SMALL_CELL_SUPPRESSED`), `COMMITTED_VERIFIED` |
| 5 | `assignments` | `Keyed Upsert` | `Assignments` | Sequential Batched Preview progress, zero raw PII in UI & Sheet, `h1_` `Pseudonymous Key`, hidden `_Stage_*` removed after `Destination Readback` |
| 6 | `resigned-volunteers` | `Keyed Upsert` | `ResignedVolunteers` | Zero raw PII, `h1_` `Pseudonymous Key`, `Preserve Source Locality` (`LOCALITY_MISMATCH` = `REVIEW`), `_Stage_*` cleaned up after readback |
| 7 | `volunteer-tenure` | `Keyed Upsert` | `VolunteerTenure` | Zero raw PII, `h1_` `Pseudonymous Key`, nullable integer/date fields preserved, `_Stage_*` cleaned up after readback |
| 8 | `volunteer-family` | `Complete Snapshot` | `RFamily_<runId>` + `_ThaiPHCReportCurrent` | `Layers` badge, zero raw PII, `Preserve Source Locality` (`LOCALITY_MISMATCH` = `REVIEW`), hidden `RFamily_<runId>` unhidden & `Publication Pointer` updated after readback |

3. **Repeatable Sync, Non-Destructive & Hygiene Checks on Sandbox:**
   - [ ] Re-run Preview on an already-synced dataset (`subdistricts`, `assignments`): confirm `UNCHANGED` classification and zero spurious updates.
   - [ ] Confirm `Missing in Source` rows (if simulated in Sandbox) appear under `REVIEW` (`MISSING_IN_SOURCE`) and are **never auto-deleted** on Commit.
   - [ ] Confirm any seeded `Legacy Snapshot` tab (e.g., `RAssign_*`, prior `RFamily_*`) surfaces `LEGACY_F010_SNAPSHOT_PRESENT` (for keyed reports) and remains completely untouched after Commit.
   - [ ] Confirm `_ThaiPHCSyncLog` records one row per run transitioning to `COMMITTED_VERIFIED` with `readback_verified = TRUE`, and `ชีต1` plus all 3 Reference Datasets remain intact.
   - [ ] Verify Bearer Token hygiene: paste works, show/hide toggle works, **"ล้าง Token"** clears memory immediately, and DevTools confirms zero `localStorage`, `sessionStorage`, or cookie entries.

---

## 3. F010 `THAIPHC_HMAC_KEY_B64` Continuity Verification (Mandatory Before Person-Level Production Writes)

> **Why this gate is critical (ADR-0003):** `assignments`, `resigned-volunteers`, and `volunteer-tenure` derive deterministic `h1_` `Pseudonymous Key` values via the F010 two-step HMAC-SHA256 formula (`THAIPHC_F010_PSEUDONYM_DERIVE_5406` → `THAIPHC_REDACTED_REPORT_V1\0<endpoint>\0<id>`). If `THAIPHC_HMAC_KEY_B64` differs from the prior F010 key on a workbook containing existing F010 records, existing keys will not match and person rows will duplicate.

- [ ] **Check Whether Prior F010 Person Records Exist:** Inspect the target Production workbook(s) for existing `RAssign_*`, `RResign_*`, `RTenure_*`, or keyed person tabs.
  - If **no** prior F010 person records exist, record `"New baseline — no prior F010 person tabs"` and set a fresh 32-byte random Base64 key in `THAIPHC_HMAC_KEY_B64`.
  - If **prior F010 person records exist**, proceed through every check below before enabling `THAIPHC_PERSON_DATA_WRITE_ENABLED`:
- [ ] **Privately Load the Exact F010 Key:** Configure `THAIPHC_HMAC_KEY_B64` in the Production Web App's GAS Script Properties directly from the operator's authorized private secret store (never paste into chat, Git, or logs).
- [ ] **Zero-Write Read-Only Parity Check (`Write Guards = OFF`):**
  1. Keep `THAIPHC_WRITE_ENABLED=false` and `THAIPHC_PERSON_DATA_WRITE_ENABLED=false`.
  2. Open the Production Web App and run **read-only Preview** on `assignments` (and `resigned-volunteers` / `volunteer-tenure` if prior F010 tabs exist).
  3. Compare the `h1_...` sample keys shown in the Mode B Preview against the `_source_key` column in the existing F010 `Legacy Snapshot` tab (`RAssign_*` / `RResign_*` / `RTenure_*`) in Google Sheets.
  4. **PASS:** Matching records produce byte-for-byte identical `h1_...` keys (and if a keyed tab already exists, unchanged records classify as `UNCHANGED` rather than 100% `INSERT` + 100% `MISSING_IN_SOURCE`).
  5. **STOP IMMEDIATELY ON MISMATCH:** Do **not** enable `THAIPHC_PERSON_DATA_WRITE_ENABLED`. Re-verify `THAIPHC_HMAC_KEY_B64` byte-for-byte (check for trailing whitespace/newlines or wrong Base64 padding) before re-running read-only Preview.

---

## 4. Production Script Property Verification (`Write Guards = OFF` Initially)

Before any Production write is authorized, deploy the exact approved commit SHA to the Production GAS Web App project (`Execute as: Me`, `Who has access: Only myself`, `exceptionLogging: "NONE"`, 3 OAuth scopes) and verify **all seven Script Properties** with **both Write Guards initially `OFF`**:

| Script Property | Required Initial Production Value | Verification |
|---|---|---|
| `THAIPHC_ENV` | `PRODUCTION` | Header displays red top hazard strip + solid crimson `PRODUCTION` badge |
| `THAIPHC_SPREADSHEET_ID` | `<Approved Production Reference Workbook ID>` | Matches verified Production `ThaiPHC Data` workbook (confirm 111-row `Historical Acceptance Baseline` + `ชีต1` intact) |
| `THAIPHC_REPORT_SPREADSHEET_ID` | `<Separate Restricted Report Workbook ID>` *or blank if same-workbook approved* | Separate restricted workbook is default; verify Google Drive sharing is strictly owner-only (`shared: false`) |
| `THAIPHC_SAME_WORKBOOK_APPROVAL` | `OWNER_ONLY_5406_APPROVED` *(only if reusing Reference Workbook)* | Omit when using a separate Report Workbook |
| `THAIPHC_WRITE_ENABLED` | **`false`** *(initially OFF)* | Dashboard displays `OFF · ปิดการเขียน (Preview เท่านั้น)` |
| `THAIPHC_PERSON_DATA_WRITE_ENABLED` | **`false`** *(initially OFF)* | Dashboard displays `OFF · ปิดการเขียน (Preview เท่านั้น)` |
| `THAIPHC_HMAC_KEY_B64` | `<Verified F010-compatible 32-byte Base64 key>` | Dashboard Policy Strip displays `"กำหนดค่าแล้ว (พร้อมสร้างรหัสแฝง h1_)"` without exposing the key |

- [ ] **Production Read-Only Pre-Flight (`Write Guards = OFF`):**
  - Open Production `/exec` URL. Confirm crimson `PRODUCTION` strip/badge, zero `UNRESOLVED_PREVIOUS_RUN` warnings, both Write Guards `OFF`, `THAIPHC_HMAC_KEY_B64` configured, and intact 111-row `Historical Acceptance Baseline` (`Subdistricts` 8 / `Villages` 85 / `HealthServices` 18).
  - Run read-only Preview on target datasets to confirm `Diff Classification`, `LEGACY_F010_SNAPSHOT_PRESENT` (where applicable), and `THAIPHC_HMAC_KEY_B64` `h1_` parity with zero Sheet writes.
- [ ] **Post-Approval Steady-State Write Guard Policy:** Only after separate go-live approval (Section 5) may the operator switch `THAIPHC_WRITE_ENABLED=true` (and `THAIPHC_PERSON_DATA_WRITE_ENABLED=true` for Extended Report Datasets). Once live, every Production Commit remains protected by the Preview Fingerprint re-check under `LockService`, typed `PRODUCTION 5406 <endpoint>` `AlertDialog` confirmation, mandatory `Destination Readback`, and No Auto-Retry—while `THAIPHC_WRITE_ENABLED` and `THAIPHC_PERSON_DATA_WRITE_ENABLED` remain server-side emergency kill switches.
- [ ] **Non-ACID Recovery Rule:** If any Production Commit returns `UNKNOWN_OUTCOME_STOP`, `FAILED_STOP`, or leaves `UNRESOLVED_PREVIOUS_RUN` (`STARTED` in `_ThaiPHCSyncLog`), **never blindly retry**. Optionally flip Write Guards to `false`, inspect the target tab, `_ThaiPHCSyncLog`, and any retained hidden `_Stage_*` tab in Google Sheets, and start a fresh Preview → Diff → Confirm cycle only after reconciliation.

---

## 5. Explicit Separate Production Deployment & Cutover Approval Gate

> Leave every box below **unchecked** until the operator independently completes Sandbox UAT and explicitly approves Production cutover.

- [ ] **Candidate Release Verified:** Exact merged commit SHA recorded; Node.js 26 offline CI (`ubuntu-24.04` and `windows-latest`) green; local `npm run build && npm run check` green.
- [ ] **Sandbox UAT Accepted:** All 8 datasets completed end-to-end on isolated Sandbox with `COMMITTED_VERIFIED`, zero raw PII exposure, `ชีต1` & 111-row baseline preserved, `Missing in Source` & `Legacy Snapshot` non-deletion confirmed, and Bearer Token cleared.
- [ ] **F010 `THAIPHC_HMAC_KEY_B64` Continuity Confirmed:** Read-only Production Preview verified byte-for-byte `h1_` parity against prior F010 records (or confirmed clean new baseline).
- [ ] **Production Properties & Sharing Verified (`Write Guards = OFF` Initially):** Owner-only Drive sharing confirmed, `THAIPHC_ENV=PRODUCTION`, both Write Guards confirmed `false` before read-only pre-flight, and legacy F010 GAS V3 receiver untouched until cutover retirement is separately decided.
- [ ] **Explicit Operator Go-Live Approval:** Operator explicitly authorizes Production Web App deployment and enabling Production Write Guards for repeatable sync operations.

### Blank Redacted Sandbox UAT & Pre-Cutover Record

*Keep all Bearer Tokens, HMAC keys, raw personal rows, pseudonym values, and real Spreadsheet/Deployment IDs out of Git and chat.*

```text
Candidate Git SHA / Node.js 26 version:           PENDING
CI Status (ubuntu-24.04 & windows-latest):        PENDING
Sandbox UAT Date (Asia/Bangkok) & Operator:       PENDING
Sandbox 8/8 Datasets COMMITTED_VERIFIED:          PENDING
Sandbox 111-row Baseline, ชีต1 & Legacy Intact:   PENDING
F010 THAIPHC_HMAC_KEY_B64 Parity Verified:        PENDING
Production Drive Sharing (Owner-Only) Verified:   PENDING
Production Write Guards OFF Initial Pre-Flight:   PENDING
Separate Production Deployment Approval Decision: HOLD (Not Yet Approved)
```
