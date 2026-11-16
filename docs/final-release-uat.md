# ThaiPHC Data Connector — Consolidated Release Candidate and ONE Final UAT

Tracking: [Issue #53](https://github.com/9GotStory/thaiphc-data-connector/issues/53).
Product Owner decision on 2026-10-28: **finish implementation, perform one final operator UAT session, then close out**. Do **not** repeatedly ask the operator to run each endpoint audit, npm test, or commit during implementation.

## 1. What "complete" means

The release deliverable is one **manual Windows Node.js 26 reference sync** using the **existing** pinned Web App V3 and original owner-controlled Google Sheet:

| Dataset | Expected at release gate | Release status |
|---|---|---|
| `subdistricts` — `Subdistricts` | 8 *historically observed* rows | **Already accepted** on 2026-10-28: independent Sheet readback; **do not resend** |
| `villages` — `Villages` | 85 *historically observed* rows; unpaginated API, no authoritative total | Code path exists; first real write **HOLD** until final UAT authority |
| `health-services` — `HealthServices` | 18 *historically observed* rows; real API total/complete pagination checked by the sender | Code path exists; first real write **HOLD** until final UAT authority |

The 85/18 figures are **guards**, not claims about the current live source. The source validator rejects unexpected counts, source changes, schema/field anomalies, duplicate keys, out-of-district records, and incomplete health-service pages before any POST. A changed source count **is a STOP/owner-review condition**, not permission to silently rewrite guards or force a commit.

`volunteer-gender` stays **READ ONLY / no materialization** pending the small-cell/privacy review. `assignments`, `volunteer-family`, `resigned-volunteers`, and `volunteer-tenure` remain **PERSON DATA HOLD**. The release **does not claim** eight writable API integrations; changing that boundary requires the appropriate source/data-controller permission, separate implementation and explicit Product Owner decision.

## 2. Completed implementation and safeguards (verify exact release SHA in CI)

- Node 26 CLI routes only approved reference endpoints into a manual sender. `commit-menu` is a numbered eight-topic inventory; menu choices 4–8 cannot reach a write path.
- Windows HMAC is encrypted once with DPAPI CurrentUser; only a private per-run ThaiPHC Bearer input is required for subsequent approved commits. A correct HMAC signature is mandatory for the pinned destination.
- One selected dataset per commit. Strict reference source validation, scope 54/5406, unique keys, bounded fetches, exact signed payload and strict receiver acknowledgment. No automatic retry, no automatic deletion, no background schedule or person-level commit.
- The receiver can be nontransactional. A `COMMITTED` response and CLI exit code 2 (`COMMIT_REPORTED_READBACK_REQUIRED`) **are not final acceptance**: an independent original Sheet readback is required. Unknown/partial results require STOP and reconciliation, **never blind retry**.
- `npm.cmd run cli -- release-plan` is an **offline-only, deterministic release-plan command**. It checks the pinned target identifier *shape* and eight-dataset manifest gates, returns historical expectations and remaining approvals, and makes **zero network calls**. It never reads DPAPI/Bearer or the live Apps Script properties and **never grants permission** for final UAT.
- GitHub Actions runs the complete mock/injected regression suite. CI checks are **developer-side evidence only**; they are not extra operator test sessions.

## 3. Final UAT — ONE coordinated operator session, not three intermediate pilot cycles

**Do not run the following during development.** Initiate a single final session **only after** the release candidate is reviewed/merged at an exact immutable SHA and the Product Owner approves the bounded live window for **updating the existing Web App V3** and the **two still-pending datasets**. The PO's instruction to finish the project is *not itself an approval to transmit real records*. A named authorized ThaiPHC account and valid source-to-destination transfer rights, lawful purpose and access/retention restrictions must already exist. Do not paste any Bearer/HMAC into GitHub or ChatGPT.

### A. One-time entry gate (receiver and writer OFF)

1. On Windows confirm exact released HEAD, clean git working tree and Node 26. Run `npm.cmd test` **once**, at the final release; inspect the result alongside GitHub CI. Do not perform repeated per-PR operator tests.
2. Run **once** `npm.cmd run cli -- release-plan`. Expected `FINAL_UAT_EXECUTION_NOT_AUTHORIZED` is a **correct safety status**. The command validates only the repository metadata; do not misinterpret it as a live test.
3. Inspect the **original** Google Sheet's currently visible tabs and known field/header layout; verify historical `Subdistricts` acceptance (8 data rows, code/source-key uniqueness, district 5406, `VALID`, metadata and `ชีต1` survival), and independently confirm the `Villages` and `HealthServices` targets are absent or authorized empty/upsert-compatible receiver-managed tabs. Stop if any target contains nonreproducible, user-authored or unrelated data.
4. In **the existing V3 Apps Script project**, verify that `THAIPHC_SPREADSHEET_ID` points to the pinned original Sheet ID, and that `THAIPHC_RECEIVER_ENABLED=false` and `THAIPHC_WRITE_ENABLED=false` at rest. Verify HMAC DPAPI availability in the same Windows account without exposing the key. Do not redeploy or create a new sheet.
5. **Versioned V3 source update required for this release candidate:** the receiver now expands a newly created `Villages` tab from the default 26 columns to the required 28 before writing headers. This patch is in GitHub only until the owner's existing V3 is safely updated. During the **same final UAT session**, while both switches remain OFF, use the reviewed `scripts/update-existing-web-app-final.ps1` from the **exact approved release SHA** with Windows PowerShell's process-scoped `RemoteSigned` policy. It first checks a clean `main`, the exact reviewed source/manifest Git blobs, the pinned existing V3 deployment ID, and the remote **preimage**; backs up all pulled files **outside the repository**; and stops on any mismatch before PUSH. It stages ONLY `Code.gs` plus `appsscript.json`, requires explicit `OFF`/`PUSH`/`UPDATE` confirmations, updates ONLY the existing deployment ID, and keeps an operator backup. Do not run the first-install-only `deploy-existing-apps-script.ps1`, bypass a mismatch, deploy a new ID, mix in `dev-receiver.gs`, or enable either switch during the source update. If source push succeeded but deployment update failed, STOP and reconcile the remote state before any POST. This updater itself sends no ThaiPHC request or import POST.
   
   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\\scripts\\update-existing-web-app-final.ps1 -RepoPath .
   ```

6. Record the exact PO-authorized two-dataset write scope: `villages` and `health-services`, district 5406, **at most one commit POST per dataset**, within this **single final UAT session**. Confirm data-owner extraction/transfer permission and acceptance of the unpaginated `villages` completeness limitation. If any check fails, STOP with both switches OFF.

### B. One consolidated execution window

For `villages` only (menu option **2**):
1. Temporarily set Receiver and Write properties to `true` in the verified existing V3 project, then Save.
2. Run `npm.cmd run cli -- commit-menu` **once**, select **2**, type **Y**, paste an authorized ThaiPHC Bearer **privately**. The sender re-fetches/validates the live source before the one allowed POST. If count or schema differs from the accepted observed guard, it must stop before writing.
3. **Immediately** set BOTH properties back to `false`, Save, regardless of CLI result, timeout or exit code. Stop on unknown/partial outcomes.
4. Independently read `Villages` in the **original** Sheet; verify 85 data rows **only if the source still legitimately has that count**, 20 source columns plus eight metadata fields, unique `code` and `_source_key`, all `province_code=54` and `district_code=5406`, intact unrelated tabs, and proper `VALID`/presence/digest/run metadata. Investigate any discrepancy; **do not send another POST**.

**Only if `villages` is independently accepted**, repeat the same **separate one-shot** sequence for `health-services` (menu option **3**) within the **same operator UAT session**. Receiver and Write must begin OFF and be switched OFF immediately after the attempt; the sender requires complete 10+8 pagination plus an authoritative source `total`. Read back `HealthServices`, expected 18 data rows (if legitimately current), source-key uniqueness, 16 source fields plus metadata, geographic scope in the nested province/district/subdistrict fields, and correct receiver row counts. Zero latitude/longitude values observed in earlier source samples are **placeholder coordinates**, never usable map locations; do not invent coordinates.

Do **not** rerun menu option 1 (`subdistricts`) in UAT. Only re-read its previously accepted destination data. There are two separate POSTs maximum for **two distinct authorized first writes**, not a retry of either one.

### C. Single acceptance record and safe closeout

Conclude with one final, redacted receipt containing only: release SHA; Node 26/Windows and final test count/status; exact approved datasets; operator-attested Receiver/Write OFF; source-completeness limitation accepted; receiver replies/POST counts; and independently read-back counts, unique keys, metadata, scope and tab-survival per target. Do not publish individual source records, national IDs, names, Bearer, Web App HMAC, signatures or complete payloads.

**PASS:** All three reference tabs reconcile, all security switches OFF, required provider authorization exists, and no residual unknown or partial write. Close Issue #53 only then.

**HOLD:** Any missing approval, stale/incorrect target, source count/schema change, missing pagination, privilege issue, conflicting/manual destination data, `COMMIT_REPORTED_READBACK_REQUIRED` without independent readback, or unreconciled partial result. Leave Issue #53 OPEN, both switches OFF, and report the bounded blocker. A separate **Recovery by Re-Sync** decision may follow inspection, but is **not automatic**.

## 4. Historical evidence; not a current live connection test

The operator already confirmed 282/282 Windows local tests after merging PR #62, with local HEAD and clean worktree matching `3db171e6735a70d5011f946792536975930683ce`. The original Sheet's `Subdistricts` 8 rows were independently read back; `ชีต1` was intact/empty and no `Villages` tab had yet been created. That evidence is historical at final UAT time and must be rechecked **once at final release**, not on every development step.

See [the manual commit/reconciliation policy](t009d-manual-commit-first-write-gate.md) for failure statuses and security boundaries. The present document is a runbook and does **not** execute or authorize a real data transfer.
