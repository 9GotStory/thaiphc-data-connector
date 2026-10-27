# T009D — Recovery by Re-Sync (no mandatory Backup/Restore) — FIRST-WRITE HOLD

Issue: https://github.com/9GotStory/thaiphc-data-connector/issues/53

Decision: the Product Owner authorized replacing the full Google Sheets backup-ID / restore-drill **requirement** with **Recovery by Re-Sync** for **only** the three reproducible ThaiPHC reference datasets: `subdistricts`, `villages`, `health-services`. This changes the operator gate, not the signed protocol or Apps Script receiver. It does **not** authorize the first live write, change Script Properties, or create/change any Google Sheet.

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

The CLI only obtains **operator attestations** for this inspection. It cannot access Google Sheets to verify the target or compare rows. A typed confirmation is not proof an inventory happened.

## 2. Separate live first-write authority and guarded CLI

**Do not run this command now.** After PR review/merge, local tests and a **separate PO one-endpoint first-write approval** (which will specify the first-write window and post-write verification):

    npm.cmd run cli -- send-reference-commit --endpoint subdistricts --acknowledge-reference-commit

The hidden operator prompts are:
- `DESTINATION INVENTORY VERIFIED 5406` — operator previously checked live destination structure and absence of non-source edits;
- exact **original approved destination Spreadsheet ID** (hidden; rejects any other ID; no backup file ID);
- `RE-SYNC LIMITATIONS ACCEPTED 5406` — explicitly acknowledges non-atomic writes, impossibility of historical/local-edit rollback, and STOP before any re-sync;
- endpoint-specific `COMMIT subdistricts 8 ROWS 5406` (or 85/18 for the other endpoints);
- separate private ThaiPHC bearer and Web App HMAC key, hidden from output and logs.

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
| Code-only switch from Backup/Restore requirement to Recovery by Re-Sync | Authorized for development; Draft PR pending review |
| Actual Google Sheets pre-commit read-only inventory | NOT EXECUTED |
| Real mode=commit / first Sheet write | NOT APPROVED / NOT EXECUTED |
| Post-commit readback and any corrective Re-Sync | NOT EXECUTED / MUST BE SEPARATELY APPROVED |

Keep `THAIPHC_RECEIVER_ENABLED=false` and `THAIPHC_WRITE_ENABLED=false` until an explicit and separately scoped PO first-write approval. Keep Issue #53 OPEN.
