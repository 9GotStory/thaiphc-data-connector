# ThaiPHC Data Connector

Private project for a **manual** ThaiPHC data pipeline using **Node.js 24 → Google Apps Script → Google Sheets**.

**Current status: T001–T004 Phase A completed. Node.js 24 CLI supports OFFLINE synthetic inspect/validate/dry-run only. T004B live-access authorization gate is HOLD. No live API requests, Apps Script ingestion or Google Sheets writes have been implemented.**

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
- `src/cli/` — offline-only CLI; **no live transport implementation**
- `tests/` — offline synthetic/schema tests

## Local development

```sh
node --version      # Node.js 24 or later
npm test            # offline tests; no network requests
npm run cli -- inspect
npm run cli -- dry-run --endpoint villages
```

No live API credentials are needed for the foundation tests.

## Security
Never commit bearer tokens, Google credentials, real citizen IDs, names, addresses or unredacted API responses. `.env` and `.env.*` are ignored apart from `.env.example`. Real-data sync requires authorized API access and explicit approval after dry-run validation.

Work tracking: [T001 Project Foundation](https://github.com/9GotStory/thaiphc-data-connector/issues/1).
