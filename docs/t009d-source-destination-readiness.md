# T009D — Reference source and destination readiness (same Issue #53)

Stage of [Issue #53](https://github.com/9GotStory/thaiphc-data-connector/issues/53), building on merged T009D Sender PR #54. No new simulator-only Issue.

## Read-only destination evidence (2026-10-26)

Read from the connected Google Sheets API, using the existing ID in `config/thaiphc-targets.json`, **without changing the file**:

- Title: `ThaiPHC Data`
- Current sheet tabs: **`ชีต1` only** (`sheetId:0`, grid 1,000 x 26).
- Target tabs **`Subdistricts`**, **`Villages`**, **`HealthServices`**: **not present**.
- Existing `ชีต1!A1:Z3` read returned no values (bounded header/readiness check only).
- User already confirmed `THAIPHC_RECEIVER_ENABLED=false` and `THAIPHC_WRITE_ENABLED=false` after successful one-row synthetic `mode=validate` HTTP UAT. These flag states are **operator-reported**, not verified via Google API.

**Important:** [T010 receiver](../docs/t010-apps-script-receiver.md) has *conditional lazy creation* of the three allowlisted tabs in its eventual `mode=commit` write path. The absence of tabs alone is not a code incompatibility and **does not justify creating tabs now**. However the destination is **not yet populated**, and real `mode=commit` is unapproved. First authorized write would alter real Sheets; back up the file, verify authorized target ownership/access, sheet mapping, pre-write behavior, rollback and idempotency first. Existing `ชีต1` must remain untouched.

The T003 tab columns (12, 20, 16 source fields respectively plus eight metadata columns) are **design contract**, not existing on-sheet headers. There are no production tab headers to compare yet. Do not claim that a blank sheet proves safe writes or provider rights.

## Source readiness command

The new **operator-invoked read-only CLI** uses existing `collectReferenceSnapshot` and T009C projection to validate source field names, row keys, scope, type/null/presence rules and bounded pagination **from real authorized ThaiPHC GET responses**. It keeps reference rows in Node.js memory only, outputs only summary counts and statuses, never writes a raw file, never POSTs to Web App/Sheets.

With an operator-authorized read-only ThaiPHC account **and permission to inspect the three reference endpoints**, in an interactive Windows PowerShell session:

```powershell
npm.cmd run cli -- audit-source --endpoint subdistricts --acknowledge-authorized-use
npm.cmd run cli -- audit-source --endpoint villages --acknowledge-authorized-use
npm.cmd run cli -- audit-source --endpoint health-services --acknowledge-authorized-use
```

**Each invocation is separate and makes actual scoped read-only ThaiPHC HTTPS GET(s)** after hidden-TTY input `READ REFERENCE SNAPSHOT 5406` and hidden authorized **ThaiPHC Bearer** value. The token is NOT the Apps Script HMAC key and never appears in an argument or printed output. Do not run the command without authorized access; prior read access does not imply permission to transfer/store the returned rows.

Output fields include `status:SOURCE_SCHEMA_VALIDATED`, `rowCount`, `pagesFetched`, `observedCountMatches` (historical comparison of 8 / 85 / 18), `completeness`, `networkRequests`, `appsScriptPosts:0`, `sheetsWrites:0`, `transferApproved:false`, `destinationWriteApproved:false`. **The output cannot expose `rows`, token, source field values or request bodies.** If count does not match prior observations, the audit returns a nonzero exit even when structurally valid; diagnose source change rather than overwrite or silently normalize.

Health services use a capped 10-page, 10-row/page offset query with source-reported `total` consistency and complete-page validation. Subdistricts and villages are **unpaginated lookup endpoints with no authoritative total** in their observed response: the count comparison does NOT certify snapshot completeness. These cannot be promoted into production transfer based solely on `SOURCE_SCHEMA_VALIDATED`, even at 8/85.

All Tests use injected fake `fetchImpl`, invented reference rows and fake bearer. No real network calls are made in CI. Existing `live-fetch` remains unchanged and counts-only.

## Unresolved gates — do not convert a read audit into transfer authority

1. **Source rights:** confirm with responsible ThaiPHC data/controller owner that the three lookup datasets can be extracted, transferred and retained by this destination, with purpose, access policy and retention. This is distinct from permission to view ThaiPHC through a bearer.
2. **Complete snapshot:** obtain authoritative scope/count or written acceptance of unpaginated completeness limitations for `subdistricts` and `villages`. No missing-page deletion and no inference that today's counts must equal historical 8/85.
3. **Destination:** confirm the same Spreadsheet is the authorized target, has appropriate restricted sharing, complete agreed 12/20/16+8 headers, plain-text preservation, backup and restore method, and a reconciled first-write/rollback procedure.
4. **Separate write gate:** after code review + source rights, a separately authorized and reversible `mode=commit` pathway would be needed; existing sender enforces *one fixed synthetic row only*. Until then, **do not flip `THAIPHC_WRITE_ENABLED`**, deploy a new Web App, transmit source rows or modify `ชีต1`.
5. **Scope:** `volunteer-gender` and four person-level endpoints stay excluded; no change to those policies.

**Readiness result (2026-10-26):** existing synthetic validate-only HTTP connection **PASS**; live reference-row *storage/commit* **HOLD** on rights/completeness/destination write approval. No work here alters the Google Sheet or the deployed Apps Script.
