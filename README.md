# ThaiPHC Data Connector

Private project for a **manual** ThaiPHC data pipeline using **Node.js 26 → Google Apps Script → Google Sheets**.

**Recorded acceptance baseline:** The operator independently accepted **111 reference rows**: Subdistricts 8, Villages 85 and HealthServices 18, as recorded in [Issue #64](https://github.com/9GotStory/thaiphc-data-connector/issues/64). Final UAT re-reads these three tabs and preserves `ชีต1`; **never repeat any of their first writes**. This is historical acceptance, not a fresh live check of data or Script Properties.

**CLI / security:** The existing Windows DPAPI CurrentUser HMAC store is reused during an approved final session. `commit-menu` still gates reference writes and blocks report choices 4–8. Five-report F010 staging uses `private-report-commit` with separate approval and independent readback. No automatic retry or deletion is permitted. Keep Issue #64 open until Final UAT and separate PO closeout.

## Feature 010 — eight API topics, one final UAT

**Runtime:** Node.js **26.x**, selected by `.node-version`, `package.json` and CI on Ubuntu/Windows. Earlier phase documents retain historical runtime evidence.

**Operator-approved goal:** complete five additional report pipelines in the existing Node 26 CLI and Web App V3, then run ONE final real operator UAT. **Do not run development-time live tests, create person-data Sheets or enable any writing switch.**

The existing original `ThaiPHC Data` Sheet has **111 independently accepted reference rows**: Subdistricts 8, Villages 85 and HealthServices 18. These remain unchanged. Feature 010 extends the same CLI with `audit-extended` (read-only) and `private-report-commit` (future final UAT only) for Volunteer Gender, Assignments, Volunteer Family, Resigned Volunteers and Volunteer Tenure. The original `commit-menu` intentionally leaves choices 4–8 disabled to prevent accidental person-data writes; approved report staging uses a **separate command**, not that older reference menu.

Personal reports must be **minimized** and sent into a **separate owner-controlled restricted Google Sheets workbook**; hiding a tab in the original workbook does not restrict who can read it. The new Apps Script receiver requires `THAIPHC_RECEIVER_ENABLED=true`, `THAIPHC_WRITE_ENABLED=true`, **and** `THAIPHC_PERSON_DATA_WRITE_ENABLED=true` only for the narrowly authorized final session, plus `THAIPHC_REPORT_SPREADSHEET_ID` different from the reference Sheet. All three toggles stay **false** during development.

The implementation includes bounded report source reads, privacy filtering/HMAC pseudonyms, 25-row signed staging, digest checks and logical complete-snapshot publication. Family has no verified stable relation-row key, so it uses versioned complete-snapshot replacement **only**, and contradictory source geography causes a safety HOLD pending owner reconciliation. A mocked CI pass does not prove a live V3 deployment or grant data-storage rights.

**Canonical next-stage documentation:** [Feature 010 implementation](docs/feature-010-eight-api-ingestion.md) · [ONE final 8-API UAT runbook](docs/f010-one-final-uat.md) · [GitHub Issue #64](https://github.com/9GotStory/thaiphc-data-connector/issues/64).

## Final UAT preparation

The [PR #66 preparation packet](docs/f010-final-uat-preparation.md) records the checked candidate SHA, Node 26 CI/local evidence, remaining entry gates and an empty redacted acceptance record. Follow the [F010 single final-UAT runbook](docs/f010-one-final-uat.md) for the future authorized session. Keep all three switches OFF during preparation.

Only `scripts/update-f010-existing-v3-final.ps1` supports the reviewed F010 three-file receiver. It requires an approved clean `main`, a matching remote preimage and operator confirmations in that final session. The earlier updater and [T009D runbook](docs/final-release-uat.md) are historical and must not be used for F010.

Run `npm.cmd run cli -- release-plan` to view the offline F010 checklist: all 111 reference rows are re-read only, five reports require approved private complete snapshots, and each signed stage allows one POST attempt. The plan lists all three OFF switches and independent readback/access/retention gates. Expected status remains `FINAL_UAT_EXECUTION_NOT_AUTHORIZED`; planning output never grants transfer permission or checks live state.

## Source API coverage
8 documented endpoints, in [docs/api-inventory.md](docs/api-inventory.md), with observed field schemas under [docs/schemas/](docs/schemas/).

## Repository layout
- `docs/schemas/` — 8 **redacted, observation-based** API schema references
- `docs/api-inventory.md` — overview and known limitations
- `docs/architecture.md` — proposed flow, boundaries and next phases
- `docs/schema-review.md` and `docs/field-matrix.md` — T002 sample-level data-quality review
- `docs/sheet-schema.md` and `docs/sheets-schema.json` — T003 observed schema proposal; three reference tabs have historical independent acceptance (8/85/18)
- `docs/cli-offline.md` — T004 Phase A offline simulator usage
- `docs/live-access-gate.md` — T004B authorization/privacy decision (**HOLD**)
- `src/cli/` — offline-first CLI; bounded, manually confirmed read-only requests for four non-person endpoints
- `src/sync/` — offline preflight plus separately gated real validate/commit transports; no scheduled, automatic, or multi-endpoint writes
- `docs/t017-offline-validate-envelope.md` — T017 signed validate-only wire contract and separate future authorization gates
- `src/sync/synthetic-http-validate.mjs` / `docs/t018-synthetic-http-validate.md` — T018 synthetic HTTP protocol/Google ContentService redirect simulation only (no real POST, no live sender)
- `src/sync/manual-validate-transport.mjs` / `docs/t009d-manual-validate-transport.md` — T009D **real, opt-in HTTPS validate-only sender** for explicitly synthetic rows (no real POST performed by development/CI; live test needs separate approval)
- `src/sync/reference-snapshot.mjs` — opt-in bounded read-only collector that can return three reference datasets in memory (no CLI raw-row output; never auto-sends; transfer approval still required)
- `docs/t009d-source-destination-readiness.md` — historical destination inventory (previously only blank `ชีต1`), source-readiness baseline; re-inspect destination before writing
- `docs/t009d-real-reference-validate-recovery.md` — T009D historical validate-only transport evidence; current first-write recovery policy is the manual commit gate document
- `src/sync/manual-commit-transport.mjs` / `docs/t009d-manual-commit-first-write-gate.md` — historical manually gated reference sender, DPAPI HMAC, pinned target and mandatory readback; never repeat the three accepted first writes
- `tests/` — synthetic offline/schema/live-transport-injection tests, no real API calls in CI
- `apps-script/Code.gs` — T010 guarded receiver source; `apps-script/dev-receiver.gs` is a separate deny-by-default mock **and must not be deployed together**
- `config/thaiphc-targets.json` — existing Script ID, active Web App V3 Deployment ID and Spreadsheet ID (identifiers only, no credentials); the older Library V2 is not the active HTTP target
- `scripts/deploy-existing-apps-script.ps1` — **first-install-only guarded** clasp workflow; it rejects non-starter remote source, so do not rerun for this configuration-only update. See [T011 history/current status](docs/t011-versioned-clasp-deploy.md)
- `docs/manual-sync-contract-preflight.md` — T009A contract gap and prerequisites for later approved Apps Script/Sheets sync

## Local development

```sh
node --version      # Node.js 26.x
npm test            # offline tests; no network requests
npm run cli -- inspect
npm run cli -- dry-run --endpoint villages
npm run cli -- sync-plan # T009A manifest only; status HOLD, no network or writes
# After explicit authorization for read-only ThaiPHC lookup inspection:
# npm run cli -- audit-source --endpoint villages --acknowledge-authorized-use
# DO NOT RUN until separate owner approval for real row transfer and controlled Receiver activation:
# npm run cli -- send-reference-validate --endpoint villages --acknowledge-reference-validate
# Final UAT uses the F010 runbook and five separately approved reports; never resend the accepted references:
# First-time Windows setup only (with Receiver/Write OFF):
# npm.cmd run cli -- hmac-setup
# Report staging uses private-report-commit during the single approved final session.
```

No live API credentials are needed for tests, dry-runs or `sync-plan`. All real read-only fetches require an explicit TTY acknowledgement and an appropriately authorized token.

## Security
Never commit bearer tokens, Google credentials, real citizen IDs, names, addresses or unredacted API responses. `.env` and `.env.*` are ignored apart from `.env.example`. Real-data sync requires authorized API access and explicit approval after dry-run validation.

Work tracking: [T001 Project Foundation](https://github.com/9GotStory/thaiphc-data-connector/issues/1).
