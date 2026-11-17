# Feature 010 — ONE final operator UAT for ALL EIGHT ThaiPHC APIs

Preparation only: use the [PR #66 preparation packet](f010-final-uat-preparation.md) to review engineering evidence, pending entry gates and the blank acceptance record. No live session has been performed by that preparation.

Tracking: [Issue #64](https://github.com/9GotStory/thaiphc-data-connector/issues/64), [PR #65](https://github.com/9GotStory/thaiphc-data-connector/pull/65). The [Node 26 release review](node26-release-review.md) records the current candidate checks. This procedure is a **future final acceptance session**, not an instruction to execute during development. No real person records, token values, signatures or raw payloads belong in GitHub/ChatGPT.

## Deliverables and unchanged production baseline

- The existing `ThaiPHC Data` workbook with accepted reference tabs **Subdistricts (8)**, **Villages (85)** and **HealthServices (18)** is **untouched** by Feature 010. Never commit these again as part of final UAT. Existing `ชีต1` must survive.
- The existing Windows Node.js 26 CLI and **existing Web App V3 deployment** are reused. Never target Library V2 or create a new Web App deployment.
- Five report topics are separately entered through `private-report-commit --endpoint <endpoint> --acknowledge-private-transfer`. `commit-menu` remains intentionally restricted to the three previously accepted reference-write routes; menu choices 4–8 still do not automatically permit person storage.
- User privacy: the five report datasets go to a **restricted Google Sheets workbook**, separate by default. On 2026-11-17 the owner explicitly requested the existing workbook, and Drive metadata showed `shared:false` with only the owner permission. Reuse requires fresh owner-only sharing verification and exact `THAIPHC_SAME_WORKBOOK_APPROVAL=OWNER_ONLY_5406_APPROVED`; absent/inexact approval still rejects matching IDs. The receiver checks this approval property, not Drive permissions. Tab protection/hiding does **NOT** restrict readers. No names, full national IDs, addresses, volunteer identity codes or raw persons are sent: restricted fields are omitted, person identity is a keyed pseudonym and gender small cells are suppressed. Do not broaden sharing while snapshots remain.
- The receiver stores each run in a **new immutable versioned snapshot tab** plus a final `_ThaiPHCReportCurrent` index. Chunks are staged and only a verified complete run receives the current pointer. This is a **logical publication gate**, not an ACID database transaction; partial hidden sheets can exist after failure and must be reconciled manually.
- Older snapshots do **not** delete automatically. Owner must set a documented, lawful retention interval and manually review/erase superseded tabs after independent reconciliation. Do not presume retention or unrestricted workbook sharing is approved.

## Before the ONE final UAT starts

1. Review and merge exact F010 source SHA with passing GitHub Actions CI. Operator updates the Windows checkout to that exact `main`, clean working tree, Node.js 26. Run local `npm.cmd test` once; no interim endpoint-specific operator tests.
2. Inspect the owner-approved restricted report workbook. Keep a visible default tab so staging can be hidden, and inventory existing report/run tabs. Set `THAIPHC_REPORT_SPREADSHEET_ID` privately. Normally it differs from `THAIPHC_SPREADSHEET_ID`. For the owner's existing-workbook choice, verify Drive shows no public/domain/group/other-user access, configure both IDs to that same approved file and set `THAIPHC_SAME_WORKBOOK_APPROVAL=OWNER_ONLY_5406_APPROVED` while all three switches remain OFF. Recheck sharing before every report; a missing/inexact approval or unverified privacy is STOP. The CLI never accepts a destination ID, and the updater does not configure these properties.
3. Confirm technical access/official purpose for district 5406 and approve the specific report categories and minimized fields. The existing personal ThaiPHC Bearer is **not** proof of every retention/sharing permission. Explicitly review the small-cell threshold of 5 and restricted-field omission. Family rows have no stable relation key: accept only **complete-snapshot replacement**, never upsert from guessed identity. Any detected cross-district/cross-subdistrict family records must be resolved or explicitly stop; do not repair/drop them silently.
4. Ensure **all three flags are false or absent** in the *existing* V3 project's Script Properties:
   `THAIPHC_RECEIVER_ENABLED=false`, `THAIPHC_WRITE_ENABLED=false`, `THAIPHC_PERSON_DATA_WRITE_ENABLED=false`.
5. During this same authorized session, use `scripts/update-f010-existing-v3-final.ps1` to back up the exact current remote source, verify its selected exact Code/manifest preimage pair, stage only **Code.gs, ReportReceiver.gs and appsscript.json**, and update the **existing V3 deployment ID**. Do not use the older T009D updater. The 2026-11-17 read-only inspection found Code.js blob `abc71275ab30dca1f57d1d0e33b8c2773452a194` and manifest blob `e686fbcd6e758a24247f41ec3dac455abfe30ffc`, so select `EXISTING_V3_20261117`. The separate `F009_REVIEWED` default retains the earlier pair; neither mode accepts arbitrary hashes. The verified remote manifest bytes are preserved to retain existing V3 execution/access settings. The updater requires explicit `OFF`, `PUSH` and `UPDATE` confirmations and sends no ThaiPHC/person POST. Any mismatch with the selected pair is **STOP**.

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\scripts\update-f010-existing-v3-final.ps1 -RepoPath . -RemoteBaseline EXISTING_V3_20261117
```

6. Reconfirm three flags remain OFF after deploying, configured destination IDs match the approved mode, and sharing remains restricted (owner-only for existing-workbook reuse). The new privacy switch and same-workbook approval are independent of the two existing reference switches. Removing same-workbook approval blocks subsequent stages after the script lock without changing the accepted reference tabs.

## Single consolidated execution window

Choose each report **one at a time** in the same operator final-UAT session. Before **each** report, enable all three flags only within the explicitly approved limited window; promptly set all three **false** immediately after the result, even for rejection, timeout, unknown result or cancellation. Avoid activating more than one report simultaneously. Every command requires a private ThaiPHC Bearer and exact interactive approval of source scope and current data-row count; the HMAC is loaded from the Windows CurrentUser protected store.

| Sequence | Report | Historical *estimate*, never a fixed source total | CLI argument |
|---|---|---:|---|
| 4 | Volunteer Gender | 85 village rows | `volunteer-gender` |
| 5 | Assignments | 1,571 | `assignments` |
| 6 | Volunteer Family | 1,803 | `volunteer-family` |
| 7 | Resigned Volunteers | 1,150 | `resigned-volunteers` |
| 8 | Volunteer Tenure | 1,571 | `volunteer-tenure` |

For **each** approved report, the operator calls the command below exactly **once** with the appropriate endpoint ID:

```powershell
npm.cmd run cli -- private-report-commit --endpoint volunteer-gender --acknowledge-private-transfer
```

Change only the endpoint argument for the remaining four reports. This command requests every required source page (page size 10), verifies a stable total, district 5406, allowlisted fields, candidate identities and type constraints **before** creating any stage; never prints person records. It derives a distinct pseudonym-key purpose from the stored HMAC, discards restricted direct identifiers, applies gender small-cell suppression and organizes a complete snapshot into sequential 25-row/125KB chunks with SHA-256 digests. Each stage is independently HMAC-signed, posts at most once, and is validated by V3. A successful `REPORT_FINALIZED` server response is **still not the acceptance result**: the CLI returns `REPORT_FINALIZED_READBACK_REQUIRED` / `accepted:false` until an independent restricted-workbook readback.

**Stop immediately** if any report returns `SOURCE_NOT_READY`, `STAGE_OUTCOME_UNKNOWN_STOP`, `TRANSFER_INPUT_REJECTED`, a source total/page/key/scope mismatch, unknown/partial write result, a cross-area Family record or a private destination access/headers problem. Do not retry any HTTP POST, manually change the stage pointer or blindly restart. Inspect the destination staging tab and current-pointer sheet first. Family snapshots cannot safely perform incremental upsert.

## One final independent readback and closure

The final review must establish, **per dataset**:
- The new report snapshot tab is in the approved restricted workbook, either separate by default or the explicitly approved owner-only original workbook. The `_ThaiPHCReportCurrent` entry points to the exact versioned completed snapshot; its row count and manifest digest match the approved redacted receipts and staging manifest. For original-workbook reuse, record fresh owner-only access evidence and verify that the report operation changed none of the reference tabs or `ชีต1`.
- The correct number of rows exists, unique pseudonym/source keys are present, source district scope is 5406, candidate key conflicts and source anomalies are either absent or an explicit documented blocker; privacy-omitted columns (citizen IDs, names, addresses, private codes) are **not** materialized.
- Gender cells with a count below 5 have both sex-specific values suppressed; the total is suppressed if below 5. Family uses complete-snapshot staging/replacement, not fabricated relation upsert.
- The original three reference sheets still contain exactly **8 / 85 / 18** previously accepted rows; old `ชีต1` is preserved. No original reference first-write is repeated.
- The operator attests **all three switches false** after every import and at the end, and the exact V3 deployment source/version and access/retention policy are documented.
- If all eight datasets reconcile, classify the entire project `FINAL_UAT_ACCEPTED` and close Feature 010 (Issue #64) by separate PO closeout. Otherwise classify `FINAL_UAT_HOLD` with only the redacted failure facts and leave both issues open if needed.

**Important:** passing CI means *engineering contract checked under fake HTTP/mock Sheets*, not live deployment, source-export rights or acceptance. This runbook does **not** grant permission to write, enable switches or create a person Sheet.
