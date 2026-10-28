# T009D — Manual Reference Sync and Recovery by Re-Sync — Subdistricts First Write ACCEPTED

Issue: https://github.com/9GotStory/thaiphc-data-connector/issues/53

Decision: the Product Owner authorized **Recovery by Re-Sync** rather than mandatory full Backup/Restore, limited to the three non-person reference datasets, with **separate authorization for every live write**. The CLI simplification (8-topic menu, DPAPI CurrentUser HMAC storage, visible one-character public input) was merged in PRs #59–#61. **One** explicitly approved First Write of `subdistricts` was completed and independently accepted; this **does not** approve `villages`, `health-services`, a second `subdistricts` attempt, or data-level correction.

## Verified First Write — 2026-10-28 (one dataset only)

- **Accepted target:** pinned original ThaiPHC Data Google Sheet; `Subdistricts` has **1 header and 8 data rows**; 20 fields in the reviewed order, eight distinct source keys and subdistrict codes, `district_code=5406` and `_quality_status=VALID` across all rows. Sync metadata and row digests are present. Original `ชีต1` remains empty and unchanged.
- **Receipt vs actual:** operator-reported receiver `COMMITTED`, HTTP 200, one Apps Script POST, 8 inserted / 0 updated / 0 unchanged. The CLI's deliberate `COMMIT_REPORTED_READBACK_REQUIRED` status was resolved by **independent read-only Sheet inspection**, not by re-running the command.
- **Null/source contract:** `province_code` is `NULL` for all eight; `_field_presence_json` records this as `NULL`, consistent with the observed `null_only` field definition. This does not imply the district scope was absent: `district_code` is 5406 on all rows and subdistrict codes were validated by the sender.
- **Safe closure of this attempt:** operator separately confirmed `THAIPHC_RECEIVER_ENABLED=false` and `THAIPHC_WRITE_ENABLED=false` after execution. These are operator attestations, **not** connector-read Apps Script properties.
- **Next candidate:** `villages`, previously **85 observed rows**. No `Villages` tab existed at the most recent read-only metadata inspection. **No current live source count has been verified here**. A new source/scope check, target inventory, safe-window plan, and independent PO authorization are required before any write. `health-services` requires its own separate approval too.

**Never rerun `subdistricts` simply to verify the menu echo or repeat an accepted write. Keep Issue #53 OPEN until the remaining scoped tasks are decided.**

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

**The earlier `subdistricts` First Write is complete. No additional live write is authorized.** Keep both Script Properties at `false` unless a separately approved exact-version, single-endpoint window is opened. Do not resume or repeat an old CLI session. The advanced legacy command below is NOT the recommended menu route:

    npm.cmd run cli -- send-reference-commit --endpoint subdistricts --acknowledge-reference-commit

**Recommended Windows CLI workflow — one-time HMAC setup, followed by a numbered menu:**

**First-time only**, when the Receiver/Write switches are both OFF, run:

    npm.cmd run cli -- hmac-setup

This accepts the **existing** Web App HMAC secret once into a hidden PowerShell prompt and encrypts it using Windows **DPAPI CurrentUser** at `%LOCALAPPDATA%\ThaiPHC\DataConnector\hmac.dpapi` (outside the git checkout). It never prints the key, never passes it in CLI args or an environment variable, and requires the **same Windows user account** to decrypt. A process already running as that user may also decrypt it: this is convenience and OS-account isolation, **not a hardware-backed or admin-proof vault**. Changing Windows profile/user or losing the DPAPI user master key requires one-time setup again; do not export/commit the encrypted blob.

Only **after** local tests, fresh live destination/source preflight, Script Property identity verification and a **new, endpoint-specific PO execution approval**, run:

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

The menu **echoes the selected public one-character digit** and **echoes `Y`** during the one-time write confirmation so the operator can see what they typed. Only these two bounded prompts expose characters; the ThaiPHC Bearer token, Web App HMAC, and other private credentials remain hidden. The correction was merged in PR #61 and is **not** permission to repeat the accepted `subdistricts` write.

Only choices **1–3** may reach `mode=commit`, and only after a separate, endpoint-specific PO approval. Selecting **4** returns `READ_ONLY_NO_COMMIT`; choices **5–8** return `PERSON_DATA_APPROVAL_REQUIRED`. These all exit without reading HMAC, prompting for Bearer, fetching ThaiPHC data or sending a Google Apps Script POST. The menu is **not** a general-purpose read-only query command; any actual read of `volunteer-gender` requires the separately authorized `live-fetch` workflow.

For an eligible selection, read the displayed **one-endpoint / expected count / district 5406** warning, then enter `Y` to authorize **one attempt**. The only per-run secret input is a **private ThaiPHC Bearer token**. There is **no** manually pasted spreadsheet ID, long `COMMIT ...` phrase or recurring HMAC key prompt. Observed row counts are guards, **not current authoritative totals** for the two unpaginated endpoints.

The existing signed HMAC `mode=commit` protocol is **unchanged**. The Windows-local saved HMAC is still required; if missing, the CLI fails closed BEFORE any network request with `HMAC_STORE_NOT_READY` and instructs `hmac-setup`. `commit-menu` cannot set Receiver/Write flags, read live Apps Script Properties, or independently inspect Sheet contents; external checks remain mandatory.

### Windows PowerShell Execution Policy compatibility

Some Windows PCs default to the `Restricted` PowerShell Execution Policy. The original version of `hmac-setup` then failed with `running scripts is disabled on this system` **before saving a key**. Both one-time **set** and per-run **get** now launch the repository's fixed, local `scripts/hmac-current-user.ps1` using `powershell.exe -ExecutionPolicy RemoteSigned` **for the child process only**. This does not modify Windows `CurrentUser` or `LocalMachine` policy or enable any Apps Script writes. **Do not run `Set-ExecutionPolicy` globally, use `Unrestricted`/`Bypass` or invoke unsigned downloaded scripts to work around this failure.**

If a machine's `MachinePolicy` or `UserPolicy` is enforced by the organization, that Group Policy still takes precedence. If the local script is tagged as downloaded from the Internet, RemoteSigned may also refuse it. Both cases must STOP and be reviewed separately; the CLI does not silently fall back to a weaker execution policy. Diagnose with `Get-ExecutionPolicy -List` without changing settings. A successful mock-based Node CI run does **not** prove real Windows DPAPI setup; the operator must verify `HMAC_STORED_CURRENT_USER_DPAPI` locally with Receiver and Write disabled.

Do not run an old `send-reference-commit` command from any interrupted session. Cancel it with Ctrl+C, keep both switches OFF, and use the new menu only after **fresh authorization for a different approved dataset**. The legacy explicit command remains an advanced compatibility path, is subject to the same authorization and HMAC gates, and is not a retry mechanism.

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

| Gate | Status as of 2026-10-28 |
|---|---|
| Real validate-only for 8 / 85 / 18 | PASS; previously verified |
| Recovery by Re-Sync code correction | PR #58 merged |
| Numbered menu + Windows DPAPI + public input echo | PRs #59–#61 merged; PR #61 Windows tests operator-reported **282/282 PASS** (current local HEAD still to be reconfirmed) |
| First live `subdistricts` mode=commit | **ACCEPTED**; 8 rows read back from original Google Sheet |
| Both Apps Script Receiver/Write switches after first write | **OFF**, operator-attested; live connector verification unavailable |
| Second `subdistricts` write or Re-Sync | **NOT AUTHORIZED** |
| Next potential `villages` 85-row first write | **HOLD**; separate exact-version, source/target preflight and PO approval required |
| `health-services` 18-row first write | **HOLD**; separate approval |
| `volunteer-gender` and person-level datasets | **NO COMMIT** |

Keep `THAIPHC_RECEIVER_ENABLED=false` and `THAIPHC_WRITE_ENABLED=false` at rest. No additional live request is authorized from the completed First Write. Keep Issue #53 OPEN.
