# ThaiPHC Data Connector

Private project for a **manual** ThaiPHC data pipeline using **Node.js 24 → Google Apps Script → Google Sheets**.

**Current status (2026-10-21):** Operator-reported manual read-only Live UAT PASS for `subdistricts` (8), `villages` (85), `health-services` (18, all coordinates zero) and `volunteer-gender` (85 village report rows, 1,571 source-aggregated volunteers). These remain **explicit opt-in, bounded, aggregate-output-only** CLI requests. T003 Google Sheets schema is still a **draft**, and no Apps Script ingestion, destination API integration, person-level live endpoints or Sheets writes have been implemented. Provider authorization and destination transfer rights are separate checks.

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
- `src/sync/` — T009A offline-only destination contract preflight; no row export/POST/writes
- `tests/` — synthetic offline/schema/live-transport-injection tests, no real API calls in CI
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
