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
3. Copy the three files from `gate0-sandbox/` into the Sandbox GAS project (or push via `clasp` — see **Using `clasp` Safely** below):
   - `gate0-sandbox/appsscript.json` → `appsscript.json`
   - `gate0-sandbox/Gate0Probe.gs` → `Gate0Probe.gs`
   - `gate0-sandbox/Gate0Runner.html` → `Gate0Runner.html`
4. Deploy as a **Web App** (`Execute as: Me`, `Who has access: Only myself`) and authorize the single requested scope (`Connect to an external service`). Confirm the deployment URL is a **Web app** endpoint (`https://script.google.com/macros/s/<sandboxDeploymentId>/exec`), **not** a Library URL (`/macros/library/d/...`).

### Using `clasp` Safely (Sandbox Standalone Only)

If deploying from `thaiphc-data-connector/gate0-sandbox` with `@google/clasp` (`.clasp.json` is gitignored):

> **Important:** `clasp create-script --rootDir .` pulls Google's blank default manifest and **overwrites `gate0-sandbox/appsscript.json`** (dropping `webapp`, `oauthScopes`, and `exceptionLogging: "NONE"`), which causes `clasp create-deployment` to create a Library URL (`/macros/library/d/...`) instead of a Web App (`/exec`). Always restore `appsscript.json` from Git **before** pushing:

```bash
cd thaiphc-data-connector/gate0-sandbox
npx @google/clasp create-script --type standalone --title "ThaiPHC-Gate0-Sandbox" --rootDir .
git checkout -- appsscript.json
npx @google/clasp push --force
npx @google/clasp create-deployment -d "Gate 0 Sandbox Web App"
npx @google/clasp open-script
```

In the opened Apps Script Editor, verify `appsscript.json` shows `exceptionLogging: "NONE"`, single scope `script.external_request`, and `webapp: { executeAs: "USER_DEPLOYING", access: "MYSELF" }`, then open **Deploy → Manage deployments** to copy the **Web app** `/exec` URL.
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

- **Execution Date (Asia/Bangkok):** `2026-11-21 20:23` (`executedAtUtc: 2026-11-21T13:23:30.951Z`)
- **Environment:** `SANDBOX` (isolated standalone GAS project; Production & legacy V3 untouched; `sheetsWrites: 0`, `rawRowsReturned: false`)
- **Overall Status / Decision:** `[x] GO` (`overallStatus: PASS`, `goNoGoRecommendation: GO_CANDIDATE`) · `[ ] NO-GO (Halt & Revisit ADR-0001)`
- **Total Requests / Total Elapsed (ms) / Max Response Bytes:** `26 requests / 29,457 ms / 78,711 bytes` (`0.15%` of `50 MB/call` limit)
- **Observed Average Latency (ms):** `1,124 ms` (max observed `2,954 ms` on `volunteer-family` at `pageSize=100`)
- **Calibrated Page Size & Sequential Batch Size:** `pageSize = 100` (honored across all 6 paginated endpoints: `offset`, `assignment`, `report`) · `10 pages per RPC batch` (`quotaSummary.suggestedSequentialBatchPages = 10`, ~30 s worst-case per batch vs 360 s GAS limit)

| Endpoint | Protocol | HTTP Status | Baseline (`size=10`) | Page 2 Check | `size=50` Behavior | `size=100` Behavior | Recommended Page Size | Locality Warnings |
|---|---|---:|---|---|---|---|---:|---:|
| `subdistricts` | `none` | 200 | PASS (8 items, 294 ms, 2,465 B) | N/A | N/A | N/A | N/A | 0 |
| `health-services` | `offset` | 200 | PASS (10/18, 585 ms, 11,280 B) | PASS (8/18, offset=10, 0 dup, 337 ms) | HONORED (18 items, 590 ms, 20,319 B) | HONORED (18 items, 347 ms, 20,320 B) | 100 | 0 |
| `assignments` | `assignment` | 200 | PASS (10/1,571, 2,877 ms, 8,039 B) | PASS (10/1,571, page=2, 0 dup, 2,573 ms) | HONORED (50 items, 2,846 ms, 39,174 B) | HONORED (100 items, 2,707 ms, 78,711 B) | 100 | 0 |
| `volunteer-gender` | `report` | 200 | PASS (10/85, 308 ms, 2,992 B) | PASS (10/85, page=2, 0 dup, 325 ms) | HONORED (50 items, 306 ms, 14,423 B) | HONORED (85 items, 561 ms, 24,436 B) | 100 | 0 |
| `villages` | `none` | 200 | PASS (85 items, 1,183 ms, 47,770 B) | N/A | N/A | N/A | N/A | 0 |
| `volunteer-family` | `report` | 200 | PASS (10/1,823, 2,352 ms, 6,979 B) | PASS (10/1,823, page=2, stable, 2,207 ms) | HONORED (50 items, 2,296 ms, 34,218 B) | HONORED (100 items, 2,954 ms, 68,419 B) | 100 | 3 |
| `resigned-volunteers` | `report` | 200 | PASS (10/1,152, 357 ms, 5,557 B) | PASS (10/1,152, page=2, 0 dup, 349 ms) | HONORED (50 items, 342 ms, 26,910 B) | HONORED (100 items, 344 ms, 53,839 B) | 100 | 0 |
| `volunteer-tenure` | `report` | 200 | PASS (10/1,571, 362 ms, 5,694 B) | PASS (10/1,571, page=2, 0 dup, 341 ms) | HONORED (50 items, 597 ms, 28,120 B) | HONORED (100 items, 887 ms, 56,104 B) | 100 | 0 |
