# ThaiPHC Data Connector

Private project for a **manual** ThaiPHC data pipeline using **Node.js 24 → Google Apps Script → Google Sheets**.

**Current status: Project foundation and API schema inventory only. No live sync or Google Sheets write has been implemented.**

## Source API coverage
8 documented endpoints, in [docs/api-inventory.md](docs/api-inventory.md), with observed field schemas under [docs/schemas/](docs/schemas/).

## Repository layout
- `docs/schemas/` — 8 **redacted, observation-based** API schema references
- `docs/api-inventory.md` — overview and known limitations
- `docs/architecture.md` — proposed flow, boundaries and next phases
- `src/` — future manual CLI code
- `apps-script/` — future isolated receiver code
- `tests/` — offline scaffold/schema tests

## Local development

```sh
node --version      # Node.js 24 or later
npm test            # offline tests; no network requests
```

No live API credentials are needed for the foundation tests.

## Security
Never commit bearer tokens, Google credentials, real citizen IDs, names, addresses or unredacted API responses. `.env` and `.env.*` are ignored apart from `.env.example`. Real-data sync requires authorized API access and explicit approval after dry-run validation.

Work tracking: [T001 Project Foundation](https://github.com/9GotStory/thaiphc-data-connector/issues/1).
