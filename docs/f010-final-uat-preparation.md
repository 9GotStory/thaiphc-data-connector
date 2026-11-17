# F010 Final UAT preparation — Draft PR #66

Prepared on **2026-11-16**, with the F010 planner follow-up on **2026-11-17**, using Node **26.13.1** on Windows. Scope: GitHub inspection, local synthetic checks and release-plan/documentation changes for Draft PR #66, then prepare one future operator session. **No merge, deploy, source-data request, real-data transfer, workbook creation, DPAPI access or Script Property change was performed.**

Current decision: **FINAL_UAT_HOLD — operational prerequisites/readback pending.** On 2026-11-17 the owner authorized proceeding with all operations and explicitly selected the existing Google Sheet. The initial no-live-operations evidence below is historical; authorization does not establish completed deployment, credential entry, retention or acceptance. This is a pre-session hold, not a failed live UAT. The canonical procedure remains [one final eight-API UAT](f010-one-final-uat.md), with the [Node 26 release review](node26-release-review.md).

## Existing-workbook owner decision (2026-11-17)

PR #66 merged as `d14d38dfadb2744a1af7ecf1b7e4e5ded6108f3f`. The owner then requested the existing workbook and authorized proceeding. A direct Drive metadata inspection found `shared:false` and a single owner permission. Sheets metadata showed only `ชีต1`, `HealthServices`, `Villages` and `Subdistricts`; this checks tab inventory, not populated row counts or fresh reference acceptance.

The existing-workbook follow-up permits matching destination IDs only when `THAIPHC_SAME_WORKBOOK_APPROVAL` exactly equals `OWNER_ONLY_5406_APPROVED`. Separate restricted workbooks remain the default. Sharing must be independently verified owner-only before each report; the receiver does not query Drive sharing or add OAuth scopes. All three existing write switches and signed staging/readback gates remain required. Synthetic regression verifies all five reports preserve 111 reference rows and `ชีต1`, rejects absent/inexact approval and stops if approval is revoked while waiting for the lock.

For this owner decision, the separate-workbook-only entry boxes below are superseded by the owner-only reuse procedure in the canonical runbook. The current ReportReceiver blob is `16915ad2164a3dc9d78f5820a1b042c2150cc663`; the older pin below belongs to the initial PR #66 evidence. Retention interval and cleanup owner still need an explicit record before importing; no automatic expiry is implemented.

Read-only clasp inspection found the pinned existing V3 deployment and pulled exactly Code.js plus appsscript.json. These had blobs `abc71275ab30dca1f57d1d0e33b8c2773452a194` / `e686fbcd6e758a24247f41ec3dac455abfe30ffc`, not the earlier assumed F009 pair. Source writes were stopped, the exact bytes were backed up outside the repo, and the difference was reviewed: older reference receiver plus existing `webapp.executeAs=USER_DEPLOYING` / `access=ANYONE_ANONYMOUS` settings, with the same two OAuth scopes and exception logging NONE. The dedicated `EXISTING_V3_20261117` migration now accepts only that exact pair and preserves the verified remote manifest bytes. Authentication/HMAC checks and deployment ID remain unchanged; no deployment was performed by the inspection.

## Initial checked engineering evidence (2026-11-16)

GitHub snapshot checked at **2026-11-16 04:22 UTC / 11:22 Asia/Bangkok**. Recheck before any future release decision; these facts are tied to the candidate below.

| Evidence | Observed result |
|---|---|
| [PR #66](https://github.com/9GotStory/thaiphc-data-connector/pull/66) | OPEN, DRAFT, unmerged; mergeable at inspection; no review/comment entries returned |
| Candidate head / local HEAD | `9f87d94ad5ff0da236844c54eb9d35a2bf0a8c61` |
| Branch | `codex/f010-node26-release-8bbb2366` |
| PR base | `main` at `e1ae9596b71cbe4fe95ab26666bc62cd2516e594` (merged PR #65) |
| Working tree before preparation edits | Clean; local HEAD matched remote PR head |
| [Node.js 26 offline checks, run #113](https://github.com/9GotStory/thaiphc-data-connector/actions/runs/43802991859) | Latest PR-triggered run returned for candidate head: completed, SUCCESS |
| Ubuntu CI job | `schema-smoke (ubuntu-24.04)`, job `133087303049`: SUCCESS, including runtime and test steps |
| Windows CI job | `schema-smoke (windows-latest)`, job `133087303260`: SUCCESS, including runtime and test steps |
| Workflow configuration | Node `26`, Ubuntu/Windows matrix; checkout uses the default pull-request ref; no post-merge-main CI claim |
| Local engineering check | `npm.cmd test`: **332 tests, 332 pass, 0 fail, 0 skipped**, Node `v26.13.1`, npm `11.20.0` |
| Offline legacy planner inspection | `npm.cmd run cli -- release-plan`: exit 0, `FINAL_UAT_EXECUTION_NOT_AUTHORIZED`, zero-network plan; limitations below |
| [Issue #64](https://github.com/9GotStory/thaiphc-data-connector/issues/64) | OPEN; latest recorded closeout gate still requires one real Final UAT |

CI was found through the candidate-head workflow lookup. The workflow's default checkout tests the PR merge ref; do not describe this as post-merge `main` verification. Any future head/base change requires matching evidence again.

The local result is developer-side synthetic evidence, not an operator UAT. The initial remote run above covers only `9f87d94`, not the subsequent planner/documentation follow-up. Check the current PR head and its own Ubuntu/Windows CI before any release decision. Before the actual final session, the approved release must be reviewed/merged separately, have matching passing CI, and be checked out as clean `main`; record its final SHA and run the operator's single local test at that release.

## F010 planner follow-up (2026-11-17)

`npm.cmd run cli -- release-plan` now describes the canonical F010 runbook. It marks **all three** historical reference datasets `PREVIOUSLY_ACCEPTED_RECHECK_ONLY`, lists five `PRIVATE_SNAPSHOT_APPROVAL_REQUIRED` reports using complete versioned snapshots, and requires Family source-geography reconciliation. It lists the separate restricted workbook, access/retention approval, all three OFF switches, independent readback, one invocation per approved report and one POST attempt per signed stage. It does not read credentials, contact a service, check live state or authorize execution. The older single-POST-per-dataset planning flag has been removed; transfer and receiver code are unchanged.

Regression checks cover the revised CLI output, no reference first-write labels, the per-stage attempt boundary and all three switch names, while retaining malformed-input/manifest rejection and injected zero-network/zero-secret assertions. The initial historical evidence table above is retained with its original SHA and date; current follow-up CI evidence belongs to the updated PR head.

Local follow-up verification on Windows / Node `v26.13.1`: `npm.cmd test` **332/332 PASS, 0 fail, 0 skipped**; `npm.cmd run cli -- release-plan` exit 0 with the revised F010 contract and `FINAL_UAT_EXECUTION_NOT_AUTHORIZED`. Relative documentation links, `git diff --check` and PowerShell syntax parsing of the updater were checked without executing the updater.

## Procedure selection and historical hazards

- The accepted baseline is **Subdistricts 8 / Villages 85 / HealthServices 18 = 111 reference rows**, recorded by the operator in Issue #64. Re-read all three during final acceptance; **do not resend any reference first write**. No current live counts were checked here.
- `docs/final-release-uat.md` and `scripts/update-existing-web-app-final.ps1` describe the older T009D release. Their Villages/HealthServices first-write instructions are superseded.
- Older `release-plan` output at `9f87d94` used T009D first-write labels for Villages/HealthServices and a single-POST-per-dataset flag. Those are superseded by the F010 planner follow-up; do not use saved old output as the current plan.
- F010 uses **one invocation per approved report**, with one POST attempt per signed stage and multiple stages per report. Neither a fresh invocation nor a new plan grants permission to retry an ambiguous stage.
- The only F010 updater is `scripts/update-f010-existing-v3-final.ps1`; read it now, execute it only during a separately approved final session. Its remote preimage remains unverified here.

## Receiver pins checked offline

`git ls-tree HEAD` and the passing F010 contract tests agree with these reviewed repository blobs:

| File / guard | Git blob SHA-1 |
|---|---|
| `apps-script/Code.gs` | `e542d585d4d4840836c9f1114ac350081ebe5952` |
| `apps-script/ReportReceiver.gs` | `72e362054cd838ebe52ac3a4e593233ca69fab6f` |
| `apps-script/appsscript.json` | `a8134a3237b2dce1f54ce16a943fbe3e232ce436` |
| Required existing deployed `Code.gs` preimage | `f7d878389fe46cfde8619f75a1f9746f45b469a3` — expected only, not live checked |

No clasp command was run. A remote source/file-list/preimage mismatch must STOP the future updater; do not change pins to bypass it. Source push followed by deployment-update failure also requires reconciliation before any import.

## Pending entry gates for the one final session

All boxes remain **unchecked**. No live state or operator approval is inferred from passing tests.

- [ ] Independent release review and separate PO merge decision; exact approved merged SHA, passing matching CI, clean Windows `main`, Node 26 patch version and one local operator test result recorded.
- [ ] Authorized operator and source/data-controller confirm district 5406, permitted five-report categories, minimized fields and source-to-private-destination transfer purpose.
- [ ] Owner approves and inspects a second restricted workbook, access list, no broad link sharing, visible empty default tab, existing-tab inventory and a documented retention interval/manual disposal owner. Do not create it during preparation.
- [ ] Operator privately verifies `THAIPHC_REPORT_SPREADSHEET_ID` differs from the original `THAIPHC_SPREADSHEET_ID`; record attestation only, never destination IDs here.
- [ ] Operator verifies `THAIPHC_RECEIVER_ENABLED`, `THAIPHC_WRITE_ENABLED` and `THAIPHC_PERSON_DATA_WRITE_ENABLED` are false or absent before update. Current live flag values are unknown to this preparation.
- [ ] Existing V3 source backup and exact preimage verified during the approved session; guarded three-file update of the **existing** deployment only. Reconfirm all three flags OFF afterward.
- [ ] Existing CurrentUser HMAC availability checked privately by the operator in the final session; no key/token/signature is included in any receipt.
- [ ] Gender threshold 5 and complementary suppression approved; historical Family geographic inconsistencies resolved in source, or explicitly recorded as a STOP/HOLD. No guessed-key upsert, dropped rows or silent repairs.
- [ ] One bounded session and independent readback reviewer agreed; all three flags OFF immediately after each report result, rejection, timeout or cancellation and at session end.

## Eight-dataset acceptance worksheet

Fill only during the authorized final session. `PENDING` means no fresh source or destination inspection has occurred. Historical estimates in the runbook must never substitute for actual source totals.

| Dataset | Final-session action | Required evidence | Current evidence |
|---|---|---|---|
| Subdistricts | Re-read only; no resend | 8 accepted rows, unique keys, scope/metadata, unrelated tabs intact | PENDING |
| Villages | Re-read only; no resend | 85 accepted rows, unique keys, scope/metadata | PENDING |
| HealthServices | Re-read only; no resend | 18 accepted rows, unique keys, scope/metadata | PENDING |
| VolunteerGender | One approved private snapshot invocation | Actual source rows/pages, suppression, matching digest/count and current pointer | PENDING |
| Assignments | One approved private snapshot invocation | Complete source pages/total, minimized fields, unique pseudonyms, independent snapshot/pointer readback | PENDING |
| VolunteerFamily | One approved complete-snapshot invocation if source reconciles | Complete pages/total, compatible geography, run-scoped identity, independent snapshot/pointer readback | PENDING; historical source anomaly unresolved here |
| ResignedVolunteers | One approved private snapshot invocation | Complete source pages/total, minimized fields, unique pseudonyms, independent snapshot/pointer readback | PENDING |
| VolunteerTenure | One approved private snapshot invocation | Complete source pages/total, minimized fields, unique pseudonyms, independent snapshot/pointer readback | PENDING |

Use the endpoint sequence and command in the canonical runbook only after every entry gate passes. There is no live command to execute as part of this packet.

For each report, independently check that the versioned complete snapshot is in the restricted workbook and `_ThaiPHCReportCurrent` points to that exact snapshot with the approved row count and manifest digest. Verify source scope, key uniqueness, absence of omitted identity/name/address/private-code columns and gender suppression. Preserve the original 111 reference rows and `ชีต1`.

`REPORT_FINALIZED_READBACK_REQUIRED` / `accepted:false` is a request for independent inspection, not acceptance. On source/schema/page/scope/access mismatches, `SOURCE_NOT_READY`, `TRANSFER_INPUT_REJECTED`, `STAGE_OUTCOME_UNKNOWN_STOP` or any ambiguous/partial outcome: turn all three flags OFF, inspect staging/current-pointer state privately and HOLD. Never repeat a POST, restart blindly, edit the pointer or delete partial snapshots before reconciliation. Older snapshots have no automatic expiry.

## Blank redacted final acceptance record

Copy/fill once during the final session. Keep raw rows, direct identifiers, pseudonym values, workbook/deployment IDs, tokens, HMAC, signatures and payloads out of GitHub/ChatGPT; retain detailed inspection privately.

```text
Session time / redacted operator and independent reviewer: PENDING
Approved release main SHA / matching CI run and result: PENDING
Windows Node 26 patch / one local operator test result: PENDING
Approved categories, minimized fields, scope and authority attestation: PENDING
Private workbook access / retention interval / disposal owner attestation: PENDING
Existing V3 backup, preimage, updated version / source pins verified privately: PENDING
All THREE switches OFF before update / after update: PENDING

Per report (repeat for all five):
  Endpoint / actual source rows, pages and completeness: PENDING
  Chunk count / stage outcomes and attempt counts / manifest digest: PENDING
  Independent restricted snapshot and current-pointer counts/digest match: PENDING
  Scope, unique keys, omitted fields / suppression / Family geography: PENDING
  All THREE switches OFF immediately after result: PENDING

Reference re-read 8 / 85 / 18, keys/metadata and ชีต1 survival: PENDING
All THREE switches OFF at session end / partial-state reconciliation: PENDING
Overall decision: FINAL_UAT_HOLD
Redacted blocker(s): Final session not authorized or executed; entry evidence pending.
Separate PO Issue #64 closeout decision: PENDING — leave OPEN
```

Set `FINAL_UAT_ACCEPTED` only after **all eight datasets** independently reconcile and every approval, privacy and OFF-switch condition is evidenced. Otherwise retain `FINAL_UAT_HOLD` and record only the precise redacted blocker. Issue #64 closure is a separate PO decision.
