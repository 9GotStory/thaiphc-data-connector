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

**Do not run live commits while this change remains a draft or while the prior CLI session is open.** Abort the old session with Ctrl+C and restore both Script Properties to `false` if enabled. A new, exact-version one-endpoint first-write execution approval is required after review/merge/local tests. The advanced legacy command below is NOT the recommended menu route:

    npm.cmd run cli -- send-reference-commit --endpoint subdistricts --acknowledge-reference-commit

**Recommended Windows CLI workflow — one-time HMAC setup, followed by a numbered menu:**

**First-time only**, when the Receiver/Write switches are both OFF, run:

    npm.cmd run cli -- hmac-setup

This accepts the **existing** Web App HMAC secret once into a hidden PowerShell prompt and encrypts it using Windows **DPAPI CurrentUser** at `%LOCALAPPDATA%\ThaiPHC\DataConnector\hmac.dpapi` (outside the git checkout). It never prints the key, never passes it in CLI args or an environment variable, and requires the **same Windows user account** to decrypt. A process already running as that user may also decrypt it: this is convenience and OS-account isolation, **not a hardware-backed or admin-proof vault**. Changing Windows profile/user or losing the DPAPI user master key requires one-time setup again; do not export/commit the encrypted blob.

After PR review, local tests, live target preflight and **new PO first-write approval for the exact merged code**, run:

    npm.cmd run cli -- commit-menu

The menu presents **all 8 observed ThaiPHC API topics** with explicit groups. This is an **inventory display**, not blanket permission to commit:

| CLI selection | Dataset | Menu status | Commit |
|---|---|---|---|
| 1 | `subdistricts` — ตำบล (8 observed rows) | COMMIT GATED | Eligible **only with its own explicit PO authorization** |
| 2 | `villages` — หมู่บ้าน (85 observed rows) | COMMIT GATED | Same separate authorization required |
| 3 | `health-services` — หน่วยบริการสุขภาพ (18 observed rows) | COMMIT GATED | Same separate authorization required |
| 4 | `volunteer-gender` — อสม. จำแนกตามเพศ | READ ONLY | **Blocked** (menu does not perform a read) |
| 5 | `assignments` — การมอบหมาย อสม. | PERSON DATA HOLD | **Blocked** |
| 6 | `volunteer-family` — ครอบครัว อสม. | PERSON DATA HOLD | **Blocked** |
| 7 | `resigned-volunteers` — อสม. ที่ลาออก | PERSON DATA HOLD | **Blocked** |
| 8 | `volunteer-tenure` — อายุงาน อสม. | PERSON DATA HOLD | **Blocked** |
| 0 | Cancel | CANCELLED | **No operation** |

Only choices **1–3** may reach `mode=commit`, and only after a separate, endpoint-specific PO approval. Selecting **4** returns `READ_ONLY_NO_COMMIT`; choices **5–8** return `PERSON_DATA_APPROVAL_REQUIRED`. These all exit without reading HMAC, prompting for Bearer, fetching ThaiPHC data or sending a Google Apps Script POST. The menu is **not** a general-purpose read-only query command; any actual read of `volunteer-gender` requires the separately authorized `live-fetch` workflow.

For an eligible selection, read the displayed **one-endpoint / expected count / district 5406** warning, then enter `Y` to authorize **one attempt**. The only per-run secret input is a **private ThaiPHC Bearer token**. There is **no** manually pasted spreadsheet ID, long `COMMIT ...` phrase or recurring HMAC key prompt. Observed row counts are guards, **not current authoritative totals** for the two unpaginated endpoints.

The existing signed HMAC `mode=commit` protocol is **unchanged**. The Windows-local saved HMAC is still required; if missing, the CLI fails closed BEFORE any network request with `HMAC_STORE_NOT_READY` and instructs `hmac-setup`. `commit-menu` cannot set Receiver/Write flags, read live Apps Script Properties, or independently inspect Sheet contents; external checks remain mandatory.

### Windows PowerShell Execution Policy compatibility

Some Windows PCs default to the `Restricted` PowerShell Execution Policy. The original version of `hmac-setup` then failed with `running scripts is disabled on this system` **before saving a key**. Both one-time **set** and per-run **get** now launch the repository's fixed, local `scripts/hmac-current-user.ps1` using `powershell.exe -ExecutionPolicy RemoteSigned` **for the child process only**. This does not modify Windows `CurrentUser` or `LocalMachine` policy or enable any Apps Script writes. **Do not run `Set-ExecutionPolicy` globally, use `Unrestricted`/`Bypass` or invoke unsigned downloaded scripts to work around this failure.**

If a machine's `MachinePolicy` or `UserPolicy` is enforced by the organization, that Group Policy still takes precedence. If the local script is tagged as downloaded from the Internet, RemoteSigned may also refuse it. Both cases must STOP and be reviewed separately; the CLI does not silently fall back to a weaker execution policy. Diagnose with `Get-ExecutionPolicy -List` without changing settings. A successful mock-based Node CI run does **not** prove real Windows DPAPI setup; the operator must verify `HMAC_STORED_CURRENT_USER_DPAPI` locally with Receiver and Write disabled.

Do not run the old `send-reference-commit` command from an interrupted session. Cancel it with Ctrl+C, set both switches OFF, review and merge the proposed change under the separate PO gate, then use the new menu only after authorization. The old explicit CLI command is preserved as an advanced compatibility path, and still enforces one endpoint and private credentials; it also retrieves HMAC from Windows DPAPI.

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
| Numbered CLI menu and Windows DPAPI secret store | Draft PR, pending review and code-merge gate |
| Prior live destination read-only inventory | PASS when last inspected, recheck if changed |
| First live mode=commit execution on simplified code | HOLD; require new exact-version PO gate |
| Post-commit readback and any corrective Re-Sync | NOT EXECUTED / MUST BE SEPARATELY APPROVED |

Keep `THAIPHC_RECEIVER_ENABLED=false` and `THAIPHC_WRITE_ENABLED=false` outside a separately authorized first-write window. If switches were enabled for the interrupted old CLI session, the operator must immediately turn both back OFF; no first-write has been confirmed. Keep Issue #53 OPEN.
