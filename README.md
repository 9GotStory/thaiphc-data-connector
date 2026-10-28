# ThaiPHC Data Connector

Private project for a **manual** ThaiPHC data pipeline using **Node.js 24 → Google Apps Script → Google Sheets**.

**Current verified status (2026-10-28):** The separately PO-authorized, **single** `subdistricts` First Write to the original ThaiPHC Data Google Sheet **succeeded and was independently read back**: 8 data rows plus 1 header in `Subdistricts`, 8 distinct `code` and `_source_key` values, `district_code=5406`, `_quality_status=VALID`, complete metadata, and unrelated original `ชีต1` intact/empty. The receiver reported `COMMITTED` / 8 inserted / one POST; acceptance was based on **separate destination readback**, not on that receipt alone. The operator explicitly attested that both Apps Script enable switches were returned to `false` afterward; current live Script Properties cannot be independently queried from this repository. The source `province_code` was `NULL` in all 8 rows, consistent with the observed schema (`null_only`). This acceptance applies **only to subdistricts** — it does **not** authorize a second attempt or other datasets.

**CLI / security:** PRs #59–#61 were merged. On Windows, the one-time DPAPI CurrentUser store was verified by the operator (`HMAC_READ_OK`). `commit-menu` shows all 8 documented APIs: 3 reference datasets are **COMMIT GATED** individually, `volunteer-gender` is **READ ONLY / NO COMMIT**, and 4 person-level datasets are **PERSON DATA HOLD**. Public one-character choices and `Y` are echoed; private Bearer/HMAC values are not. The target remains pinned, HMAC signature required, no auto-retry or auto-deletion, and each actual write still requires a **fresh, endpoint-specific PO authorization** and independent readback. The next candidate is **`villages` (85 previously observed rows)**; its live count/completeness and current destination inventory are not yet accepted. Keep Issue #53 OPEN.

## Final release candidate (one operator UAT, no interim live tests)

The Product Owner directed **implementation first, one consolidated Final UAT, then project closeout**. See [Final release/UAT acceptance](docs/final-release-uat.md) for the single operator session, source-permission gate, existing V3 receiver update, one-shot `villages`/`health-services` first writes and independent acceptance of all three reference tabs. During development, keep `THAIPHC_RECEIVER_ENABLED=false` and `THAIPHC_WRITE_ENABLED=false`; do **not** rerun the previously accepted `subdistricts` First Write.

A source-only fix for the new `Villages` tab's **28 columns** is present in `apps-script/Code.gs`. **It is not live merely because code is merged**: the exact reviewed V3 deployment must be safely updated **once during approved Final UAT**, using the backup-and-preimage-guarded `scripts/update-existing-web-app-final.ps1`. The previous `scripts/deploy-existing-apps-script.ps1` is a first-install-only tool and deliberately rejects the already installed receiver; do not try to bypass it. Neither script may run from CI.

To view the developer-side final release checklist **without any network or secret access**:

```powershell
npm.cmd run cli -- release-plan
```

Its expected status is `FINAL_UAT_EXECUTION_NOT_AUTHORIZED`. An offline plan never grants data transfer rights or proves live readiness. `villages` (historical 85, no source total) and `health-services` (historical 18, paginated total) still require one **fresh, explicit final-UAT authorization** and source-owner permission; `volunteer-gender` and all person-level datasets remain nonwritable.

## Source API coverage
8 documented endpoints, in [docs/api-inventory.md](docs/api-inventory.md), with observed field schemas under [docs/schemas/](docs/schemas/).

## Repository layout
- `docs/schemas/` — 8 **redacted, observation-based** API schema references
- `docs/api-inventory.md` — overview and known limitations
- `docs/architecture.md` — proposed flow, boundaries and next phases
- `docs/schema-review.md` and `docs/field-matrix.md` — T002 sample-level data-quality review
- `docs/sheet-schema.md` and `docs/sheets-schema.json` — T003 observed schema proposal; only the separately approved `Subdistricts` tab has been materialized
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
- `src/sync/manual-commit-transport.mjs` / `docs/t009d-manual-commit-first-write-gate.md` — manually gated one-shot reference sender, DPAPI HMAC, pinned target and mandatory readback; only `subdistricts` 8-row First Write accepted
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
# No second or additional real Sheets COMMIT is authorized; every endpoint needs independent approval and destination inspection:
# First-time Windows setup only (with Receiver/Write OFF):
# npm.cmd run cli -- hmac-setup
# Only after fresh, exact-version, one-endpoint PO approval for a NEW dataset, use the numbered menu:
# npm.cmd run cli -- commit-menu
```

No live API credentials are needed for tests, dry-runs or `sync-plan`. All real read-only fetches require an explicit TTY acknowledgement and an appropriately authorized token.

## Security
Never commit bearer tokens, Google credentials, real citizen IDs, names, addresses or unredacted API responses. `.env` and `.env.*` are ignored apart from `.env.example`. Real-data sync requires authorized API access and explicit approval after dry-run validation.

Work tracking: [T001 Project Foundation](https://github.com/9GotStory/thaiphc-data-connector/issues/1).
