# ThaiPHC Data Connector

Private project for a **manual** ThaiPHC data pipeline using **Node.js 24 → Google Apps Script → Google Sheets**.

**Current status (2026-10-26):** Operator-reported manual read-only Live UAT PASS for `subdistricts` (8), `villages` (85), `health-services` (18, all coordinates zero) and `volunteer-gender` (85 village report rows, 1,571 source-aggregated volunteers). These remain **explicit opt-in, bounded, aggregate-output-only** CLI requests. T003 Google Sheets schema remains a **draft**. T010 Apps Script receiver source was pushed to the **existing Script project** on 2026-10-22. The previously targeted deployment is **Library V2**, not an HTTP endpoint. An owner-created **Web App V3** in the same project returned an expected read-only GET response (`METHOD_DISABLED`, `accepted:false`, `sheetsWrites:0`). GET does not prove receiver/write Script Properties are disabled; recheck both before any POST. T009D now includes code for an **opt-in real HTTPS synthetic-only validate sender** and separately a bounded **in-memory reference snapshot collector**; no live signed POST has been performed, no real ThaiPHC source rows are authorized for downstream transfer, and no real Sheet write has been verified. Person-level export remains disabled. Provider authorization and destination transfer rights are separate checks.

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
```

No live API credentials are needed for tests, dry-runs or `sync-plan`. All real read-only fetches require an explicit TTY acknowledgement and an appropriately authorized token.

## Security
Never commit bearer tokens, Google credentials, real citizen IDs, names, addresses or unredacted API responses. `.env` and `.env.*` are ignored apart from `.env.example`. Real-data sync requires authorized API access and explicit approval after dry-run validation.

Work tracking: [T001 Project Foundation](https://github.com/9GotStory/thaiphc-data-connector/issues/1).
