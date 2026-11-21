# Gate 0 — Sandbox `UrlFetchApp` Connectivity & Pagination Checklist

**Purpose:** Prove empirically—before investing in Tickets `02`–`08`—that Google Apps Script `UrlFetchApp` egress IPs can reach `https://api-thaiphc.hss.moph.go.th` without geo-blocking or WAF rejection, measure real latency and payload byte sizes against Personal Gmail (`@gmail.com`) quotas, and observe real pagination / page-size behavior across `none`, `offset`, `assignment`, and `report` protocols within `Geographic Scope (54 / 5406)`.

---

## Mandatory Isolation Guardrails (Check Every Box Before Starting)

- [ ] **Brand-new isolated Sandbox Google Apps Script project only.** NEVER deploy Gate 0 into the Production Web App, NEVER attach it to the Production `ThaiPHC Data` workbook, and NEVER touch the legacy F010 GAS V3 script project (`config/thaiphc-targets.json`).
- [ ] **Zero Google Sheets writes:** Verify `gate0-sandbox/appsscript.json` contains ONLY `https://www.googleapis.com/auth/script.external_request` in `oauthScopes` (no Sheets, Drive, or Script Properties scopes) and `exceptionLogging: "NONE"`.
- [ ] **Single-operator access:** Deploy the Sandbox Web App with `Execute as: Me` (`USER_DEPLOYING`) and `Who has access: Only myself` (`MYSELF`).
- [ ] **Temporary Bearer Token discipline:** Paste the short-lived ThaiPHC Bearer Token ONLY into the password-masked browser input of `Gate0Runner.html`. NEVER hardcode the token in `.gs` files, Script Properties, chat messages, or Git. Click **"ล้าง Token"** immediately after recording the sanitized result.

---

## Step-by-Step Sandbox Execution

1. Open [script.google.com](https://script.google.com) signed in with your personal `@gmail.com` account and create a **new standalone Apps Script project** named e.g. `ThaiPHC-Gate0-Sandbox-Probe`.
2. In **Project Settings**, enable **"Show `appsscript.json` manifest file in editor"**.
3. Copy the three files from `gate0-sandbox/` into the Sandbox GAS project (or push from an isolated local copy via `clasp` with a Sandbox-only `.clasp.json`, which is gitignored):
   - `gate0-sandbox/appsscript.json` → `appsscript.json`
   - `gate0-sandbox/Gate0Probe.gs` → `Gate0Probe.gs`
   - `gate0-sandbox/Gate0Runner.html` → `Gate0Runner.html`
4. Deploy as a **Web App** (`Execute as: Me`, `Who has access: Only myself`) and authorize the single requested scope (`Connect to an external service`).
5. Open the Sandbox `/exec` URL in your browser.
6. Paste your short-lived ThaiPHC Bearer Token (token value only, without `Bearer `), keep the 4 default endpoints checked (`subdistricts`, `health-services`, `assignments`, `volunteer-gender`) and candidate page sizes `10, 50, 100`, and click **"เริ่มทดสอบ Gate 0 (Read-Only)"**.
7. *(Optional)* Run a second check with the remaining 4 endpoints (`villages`, `volunteer-family`, `resigned-volunteers`, `volunteer-tenure`) to confirm `Preserve Source Locality` counts and report pagination parity.
8. Click **"คัดลอกผล JSON"** (safe aggregate diagnostics only; contains zero raw personal rows and zero token values), then click **"ล้าง Token"** and close the Sandbox tab.

---

## Personal Gmail (`@gmail.com`) Quota Reference

| Quota | Official Limit | Gate 0 Check Target |
|---|---|---|
| `UrlFetchApp` calls | **20,000 calls/day** | Confirm full-sync call count (Preview + Commit) stays well below daily limit |
| `UrlFetchApp` response size | **50 MB/call** | Confirm `maxResponseBytes` is a tiny fraction of `50 MB` even at larger page sizes |
| Script execution runtime | **6 minutes/execution** (`360 s`) | Calibrate sequential pages per client-orchestrated RPC batch (`suggestedSequentialBatchPages`) with ≥2x latency headroom |

---

## Go/No-Go Decision Criteria

- **GO (Proceed to Ticket 02):**
  - `overallStatus === "PASS"` and `goNoGoRecommendation === "GO_CANDIDATE"` across `none` (`subdistricts`), `offset` (`health-services`), `assignment` (`assignments`), and `report` (`volunteer-gender`).
  - Zero `HTTP_403`, zero HTML WAF challenge pages (`UNEXPECTED_CONTENT_TYPE`), zero `REDIRECT_REJECTED`, and zero `OUT_OF_SCOPE` rows.
  - Observed latency and `maxResponseBytes` fit safely inside `20,000 calls/day`, `50 MB/call`, and `6 minutes/execution`.
- **RETRY TOKEN ONLY:**
  - `overallStatus === "AUTH_FAILED"` (`HTTP_401`): token expired or malformed. Obtain a fresh operator token and rerun once.
- **NO-GO — HALT DOWNSTREAM TICKETS IMMEDIATELY:**
  - `HTTP_403`, `UNEXPECTED_CONTENT_TYPE` (WAF/geo-block HTML page), `REDIRECT_REJECTED`, or repeated `FETCH_EXCEPTION` from Google Apps Script egress IPs.
  - **Action:** Stop immediately. Do NOT start Ticket `02`–`08`. Revisit ADR-0001 runtime architecture before writing further application code.

---

## Recorded Sandbox Gate 0 Evidence (No Tokens, No Raw Rows)

- **Execution Date (Asia/Bangkok):** `YYYY-MM-DD HH:mm`
- **Environment:** `SANDBOX` (isolated standalone GAS project; Production & legacy V3 untouched)
- **Overall Status / Decision:** `[ ] GO` · `[ ] NO-GO (Halt & Revisit ADR-0001)`
- **Total Requests / Total Elapsed (ms) / Max Response Bytes:** `___ requests / ___ ms / ___ bytes`
- **Observed Average Latency (ms):** `___ ms`
- **Calibrated Sequential Batch Size (pages per RPC call):** `___ pages` _(from `quotaSummary.suggestedSequentialBatchPages` + operator review)_

| Endpoint | Protocol | HTTP Status | Baseline (`size=10`) | Page 2 Check | `size=50` Behavior | `size=100` Behavior | Recommended Page Size | Locality Warnings |
|---|---|---:|---|---|---|---|---:|---:|
| `subdistricts` | `none` | | | N/A | N/A | N/A | N/A | 0 |
| `health-services` | `offset` | | | | | | | 0 |
| `assignments` | `assignment` | | | | | | | 0 |
| `volunteer-gender` | `report` | | | | | | | 0 |
| `villages` *(optional)* | `none` | | | N/A | N/A | N/A | N/A | 0 |
| `volunteer-family` *(optional)* | `report` | | | | | | | |
| `resigned-volunteers` *(optional)* | `report` | | | | | | | |
| `volunteer-tenure` *(optional)* | `report` | | | | | | | 0 |
