# ThaiPHC Data Connector

Private project for a **manual** ThaiPHC data pipeline using **Node.js 24 → Google Apps Script → Google Sheets**.

**Current status (2026-10-27):** Operator-reported live ThaiPHC → Node → Web App V3 *validate-only* PASS for all three real reference datasets (subdistricts 8, villages 85, health-services 18); Apps Script Receiver and Write properties were returned to `false` after testing. **No real Sheets writes have been performed**. PR #57 introduced a deliberately gated, manual, single-endpoint **`mode=commit`** sender. PR #58 adopted **Recovery by Re-Sync** with external target inventory. This follow-up adds a **numbered CLI dataset menu** and one-time **Windows DPAPI CurrentUser** HMAC secret setup; normal commits prompt only for menu selection, `Y` and private ThaiPHC bearer. The menu lists **all 8 documented ThaiPHC APIs**: 3 reference datasets are COMMIT GATED (separate per-endpoint PO approval required), `volunteer-gender` is READ ONLY / NO COMMIT, and the remaining 4 person-level datasets are PERSON DATA HOLD / NO COMMIT; selecting any blocked option sends no API or Sheet request. The Web App HMAC is still cryptographically required but no longer typed every run. Destination is pinned in configuration. A first write on the updated code still requires separate exact-version PO authorization. A `COMMITTED` reply is NOT proof of persisted data: independent destination readback is mandatory. The user-owned Google Sheet was last read with only `ชีต1`; its current contents must be re-checked before writing. `volunteer-gender` and person-level endpoints remain out of scope.

## Source API coverage
8 documented endpoints, in [docs/api-inventory.md](docs/api-inventory.md), with observed field schemas under [docs/schemas/](docs/schemas/).

## Repository layout
- `docs/schemas/` — 8 **redacted, observation-based** API schema references
- `docs/api-inventory.md` — overview and known limitations
- `docs/architecture.md` — proposed flow, boundaries and next phases
- `docs/schema-review.md` and `docs/field-matrix.md` — T002 sample-level data-quality review
- `docs/sheet-schema.md` and `docs/sheets-schema.json` — T003 draft Sheets model (not provisioned)
- `docs/cli-offline.md` — T004 Phase A offline simulator usage
- `docs/live-access-gate.md` — T004B authorization/privacy decision (**HOLD**)
- `src/cli/` — offline-first CLI; bounded, manually confirmed read-only requests for four non-person endpoints
- `src/sync/` — T009A offline-only destination preflight and T017 **in-memory HMAC validate-envelope preparation**; no network POST/Sheets writes or live sender
- `docs/t017-offline-validate-envelope.md` — T017 signed validate-only wire contract and separate future authorization gates
- `src/sync/synthetic-http-validate.mjs` / `docs/t018-synthetic-http-validate.md` — T018 synthetic HTTP protocol/Google ContentService redirect simulation only (no real POST, no live sender)
- `src/sync/manual-validate-transport.mjs` / `docs/t009d-manual-validate-transport.md` — T009D **real, opt-in HTTPS validate-only sender** for explicitly synthetic rows (no real POST performed by development/CI; live test needs separate approval)
- `src/sync/reference-snapshot.mjs` — opt-in bounded read-only collector that can return three reference datasets in memory (no CLI raw-row output; never auto-sends; transfer approval still required)
- `docs/t009d-source-destination-readiness.md` — historical destination inventory (previously only blank `ชีต1`), source-readiness baseline; re-inspect destination before writing
- `docs/t009d-real-reference-validate-recovery.md` — T009D historical validate-only transport evidence; current first-write recovery policy is the manual commit gate document
- `src/sync/manual-commit-transport.mjs` / `docs/t009d-manual-commit-first-write-gate.md` — dormant, one-shot reference sender, Windows `commit-menu` selection with separate local DPAPI HMAC setup, pinned target, no automatic retries and independent Sheet readback
- `tests/` — synthetic offline/schema/live-transport-injection tests, no real API calls in CI
- `apps-script/Code.gs` — T010 guarded receiver source; `apps-script/dev-receiver.gs` is a separate deny-by-default mock **and must not be deployed together**
- `config/thaiphc-targets.json` — existing Script ID, active Web App V3 Deployment ID and Spreadsheet ID (identifiers only, no credentials); the older Library V2 is not the active HTTP target
- `scripts/deploy-existing-apps-script.ps1` — **first-install-only guarded** clasp workflow; it rejects non-starter remote source, so do not rerun for this configuration-only update. See [T011 history/current status](docs/t011-versioned-clasp-deploy.md)
- `docs/manual-sync-contract-preflight.md` — T009A contract gap and prerequisites for later approved Apps Script/Sheets sync

## Local development

```sh
node --version      # Node.js 24 or later
npm test            # offline tests; no network requests
npm run cli -- inspect
npm run cli -- dry-run --endpoint villages
npm run cli -- sync-plan # T009A manifest only; status HOLD, no network or writes
# After explicit authorization for read-only ThaiPHC lookup inspection:
# npm run cli -- audit-source --endpoint villages --acknowledge-authorized-use
# DO NOT RUN until separate owner approval for real row transfer and controlled Receiver activation:
# npm run cli -- send-reference-validate --endpoint villages --acknowledge-reference-validate
# Real Sheets COMMIT is also on HOLD pending separate PO first-write approval and destination inspection:
# First-time Windows setup only (with Receiver/Write OFF):
# npm.cmd run cli -- hmac-setup
# After new exact-version first-write PO approval, use the numbered menu:
# npm.cmd run cli -- commit-menu
```

No live API credentials are needed for tests, dry-runs or `sync-plan`. All real read-only fetches require an explicit TTY acknowledgement and an appropriately authorized token.

## Security
Never commit bearer tokens, Google credentials, real citizen IDs, names, addresses or unredacted API responses. `.env` and `.env.*` are ignored apart from `.env.example`. Real-data sync requires authorized API access and explicit approval after dry-run validation.

Work tracking: [T001 Project Foundation](https://github.com/9GotStory/thaiphc-data-connector/issues/1).
