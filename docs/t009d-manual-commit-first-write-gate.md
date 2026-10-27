# T009D — Recovery by Re-Sync (no mandatory Backup/Restore) — FIRST-WRITE HOLD

Issue: https://github.com/9GotStory/thaiphc-data-connector/issues/53

Decision: the Product Owner authorized **Recovery by Re-Sync** (not full Backup/Restore) for the three ThaiPHC reference datasets only. After a separate first-write authorization, the operator reported that the CLI required too many repeated prompts and asked for simplification. This follow-up PR changes only the CLI interaction; it does **not** perform, renew, or extend a real-write authorization, change Script Properties, or write any Google Sheet.

## What is — and is not — recoverable

Re-fetching source records plus keyed upsert can repair **incomplete application of the same current upstream reference state**, after inspection and separate authorization. The Apps Script receiver updates existing source keys, appends missing keys, **never automatically deletes records**, and is **not transactional**. Therefore a partial write, lost HTTP response, or upstream change is **not** permission to retry.

Re-Sync cannot guarantee recovery of:
- historical state or former values overwritten after ThaiPHC itself changes;
- locally edited cells, locally created rows, formulas/formatting, manually deleted values or unrelated tabs;
- data errors caused by an incorrect upstream response, incompleteness or lost deleted records.
For `subdistricts` (observed 8) and `villages` (observed 85), upstream provides **no authoritative total**: matching old counts is a guard against unexpected change, **not** a completeness certificate. `health-services` (observed 18) has an API total across two pages.

No first-write occurs if there is user-authored or otherwise non-reproducible information in any destination target tab. If such information is discovered, **STOP and obtain an independent preservation strategy and PO approval** (a backup might then be necessary). Leave `ชีต1` and other unrelated tabs untouched.

## 1. Pre-commit read-only inspection — performed by operator, NOT automated by CLI

While both Script Properties are `false`:
1. Verify the exact owner-controlled existing Spreadsheet ID, and that the Script Properties project's `THAIPHC_SPREADSHEET_ID` points to the same original target. Verify the approved V3 Web App project/deployment identity; no redeployment is required for this code-only change.
2. Inspect the target Sheet's current tabs and target tab (`Subdistricts`, `Villages` or `HealthServices`) as applicable: tab/header column order, data row count, key column and `_source_key` uniqueness, `_row_digest` availability, formula cells, manual changes and any unrelated content. First-run expectation of empty/new target tabs must be verified again, not assumed from previous checks.
3. Determine and record an independently reviewed source-only inventory (counts only; no source rows or credentials in issue logs), with read-only permissions. If a target tab differs from the expected receiver-managed layout, has duplicate keys, local edits or any content not reconstructable from ThaiPHC, **STOP**.

**Inspection remains an external prerequisite, not a repetitive CLI question.** The CLI does not independently read Google Sheets or Apps Script properties. The destination ID is read from pinned `config/thaiphc-targets.json`; the operator must compare the live receiver's `THAIPHC_SPREADSHEET_ID` with that configured ID before opening the write window. The endpoint-specific confirmation is a deliberate live-write action, **not evidence of a completed Sheet inventory**.

## 2. Separate live first-write authority and guarded CLI

**Do not run this command while this change remains a draft or while the previous CLI session is open.** Abort any existing input prompt with Ctrl+C and restore both Script Properties to `false` if enabled. After PR review/merge and local tests, obtain a **new, exact-version one-endpoint first-write execution approval**:

    npm.cmd run cli -- send-reference-commit --endpoint subdistricts --acknowledge-reference-commit

**Only three hidden prompts, in order:**
1. `COMMIT subdistricts 8 ROWS 5406` (or the expected 85/18 for the other separately authorized endpoint) — **one explicit live-write confirmation**, after reading the independently approved scope and understanding partial-write/re-sync limitations.
2. Private ThaiPHC Bearer token.
3. Private destination Web App HMAC key.

**No manual Spreadsheet ID, separate general inventory phrase or recovery-risk phrase** is requested. The URL and spreadsheet ID remain pinned to repository configuration; no CLI `--url`, `--spreadsheet`, `--token`, or multi-endpoint modes are supported. This convenience does **not** enable the Receiver/Write properties or independently verify that their live `THAIPHC_SPREADSHEET_ID` matches the pinned value. Never turn both switches on unless the separately authorized one-shot window is active.

Then source fetch and strict validation: district 5406, reference-only endpoints, full observed count, fields/schema/keys checked, health-services total/pagination. A fresh signed `mode=commit` envelope must exactly match the source snapshot in memory; at most **one** pinned Web App POST, followed by at most one allowlisted **bodyless GET** for Google ContentService redirect. No retry, schedule, deletion, arbitrary target, mass update or person-level sync.

A strict receiver `COMMITTED` reply only produces `COMMIT_REPORTED_READBACK_REQUIRED`, `destinationReadbackVerified:false`, and deliberate nonzero CLI exit code. The separate operator readback is mandatory.

## 3. Post-write readback and recovery decision

1. Immediately return `THAIPHC_RECEIVER_ENABLED=false` and `THAIPHC_WRITE_ENABLED=false` after **any** commit attempt, whatever its response.
2. Reopen the **original** Google Sheet read-only. Compare the intended target tab (and unrelated tab survival) with the submitted endpoint, receiver-reported count, key uniqueness, expected scope, headers, presence/digest metadata and actual row count. Record **counts and statuses only**, not source records/secrets.
3. If everything is independently reconciled, only then declare the specific one-endpoint sync accepted. Note that the existing CLI cannot itself perform Sheet readback or mark acceptance.
4. If the server replies `REJECTED`, the network times out, counters differ, the response is lost, readback is incomplete, or source changed: classify as **UNKNOWN / PARTIAL POSSIBLE**, keep both gates OFF, and STOP. **Do not automatically retry or claim rollback.**
5. Identify which keys were inserted/updated/missing/mismatched in the destination through read-only inspection and verify the **latest complete upstream snapshot** again. If all target data is exclusively managed by ThaiPHC and reproducible, propose a bounded, fresh **manual Re-Sync** to repair missing or outdated keyed rows, **under its own separate PO approval**. Never delete absent upstream keys automatically; never assume this restores a prior historical state.
6. If any non-reproducible or manual content is involved, block Re-Sync and request a separate recovery/preservation decision. Do not blindly rewrite unrelated tabs.

## Status and separation of approvals

| Gate | Status |
|---|---|
| Real validate-only for 8 / 85 / 18 | PASS; closed |
| Recovery by Re-Sync code correction | PR #58 merged; Node tests passed |
| Prompt simplification | Draft PR, pending review and code-merge gate |
| Prior live destination read-only inventory | PASS when last inspected, recheck if changed |
| First live mode=commit execution on simplified code | HOLD; require new exact-version PO gate |
| Post-commit readback and any corrective Re-Sync | NOT EXECUTED / MUST BE SEPARATELY APPROVED |

Keep `THAIPHC_RECEIVER_ENABLED=false` and `THAIPHC_WRITE_ENABLED=false` outside a separately authorized first-write window. If switches were enabled for the interrupted old CLI session, the operator must immediately turn both back OFF; no first-write has been confirmed. Keep Issue #53 OPEN.
