# T009A — Manual Sync Destination Contract Preflight (offline only)

**Status:** PROPOSED / NO TRANSFER / NO WRITES. [Issue #29](https://github.com/9GotStory/thaiphc-data-connector/issues/29).

## Evidence and why this is a separate task

Operator-reported Live UAT verified bounded read-only ThaiPHC GETs for:
- `subdistricts`: 8 records.
- `villages`: 85 records.
- `health-services`: 18 records; all 18 have `(latitude,longitude)=(0,0)` placeholders, **not usable map coordinates**.
- `volunteer-gender`: 85 **village report rows** across 9 pages; reported district total 1,571 (male 387, female 1,184). Village-level data could present a small-cell privacy risk; the aggregate result is not person-row data.

This establishes **operator-reported read/validation**, not permission to store, and does not establish Apps Script API compatibility. The existing Live Fetch code deliberately returns *only aggregate summaries*, discarding individual reference records; a successful CLI status does **not** contain the rows to populate Sheets.

`docs/sheets-schema.json` (T003) is a **draft design manifest** listing 8 logical tabs and metadata fields. It has not been verified against an existing Apps Script deployment, spreadsheet, schema, authentication flow or import permissions. **Do not invent an endpoint URL, login, API key, access token or writable spreadsheet.**

## Available offline preflight

After an approved merge:

```powershell
npm.cmd run cli -- sync-plan
npm.cmd run cli -- sync-plan --endpoint subdistricts
npm.cmd run cli -- sync-plan --endpoint villages
npm.cmd run cli -- sync-plan --endpoint health-services
npm.cmd run cli -- sync-plan --endpoint volunteer-gender
```

The command reads only the committed T003 manifest; it does **not** contact ThaiPHC, Apps Script or Sheets, open a browser, prompt for tokens, or read/write source records. Exit code 0 means **only that the offline design report was generated successfully**, never authorization to sync. All reported targets carry `writeAllowed:false`, `sourceRowTransfer:NOT_IMPLEMENTED` and `destinationContract:UNVERIFIED`. `--token`, `--url`, `--output`, `--max-pages` and `--acknowledge-authorized-use` are rejected. Manifest tampering/incomplete datasets also fail closed.

## Explicit gate matrix

| Source endpoint | T003 tab | State before real destination verification |
|---|---|---|
| `subdistricts` | `Subdistricts` | `DESTINATION_CONTRACT_REQUIRED` |
| `villages` | `Villages` | `DESTINATION_CONTRACT_REQUIRED` |
| `health-services` | `HealthServices` | `DESTINATION_CONTRACT_REQUIRED` |
| `volunteer-gender` | `VolunteerGender` | `PRIVACY_REVIEW_REQUIRED` for village rows |
| `assignments` | `Assignments` | `PERSON_DATA_DISABLED` |
| `volunteer-family` | `VolunteerFamily` | `PERSON_DATA_DISABLED` (no verified stable relation key) |
| `resigned-volunteers` | `ResignedVolunteers` | `PERSON_DATA_DISABLED` |
| `volunteer-tenure` | `VolunteerTenure` | `PERSON_DATA_DISABLED` |

This issue does **not** enable any write, even for the three reference datasets. `volunteer-gender` can remain a district-level summary for analysis without transferring village-grain rows; do not conflate the two products.

## Proposed trust boundary and payload contract **to verify, not yet implement**

```text
ThaiPHC GET (operator only)
  -> bounded validated source rows IN MEMORY [NOT IMPLEMENTED IN LIVE FETCH]
  -> purpose/field allowlist + complete-snapshot validation [NOT IMPLEMENTED]
  -> destination-specific authenticated manual transfer [CONTRACT UNKNOWN]
  -> Apps Script validated ingress / dry-run transaction [UNKNOWN]
  -> authorized Google Sheets tab(s) with reversible writes [NOT APPROVED]
```

### Destination facts required before a sender exists

1. **Existing Apps Script contract:** deployment identity, authoritative source repository or nonsecret API documentation; actual POST request schema, response/error schema, version, supported datasets, maximum request bytes, execution limits, and replay/auth behavior. **Do not infer** a `doPost` URL or accept arbitrary user-supplied HTTP URLs.
2. **Independent destination authorization:** named operator role, permission to write, approved target spreadsheet/tabs, credentials and revocation strategy, approved audit/retention rules. No secrets in Git, console, CLI flags, or tickets.
3. **Align actual header names with the T003 proposal:** `Subdistricts` has 12 source columns, `Villages` has 20, `HealthServices` has 16. Preserve exact spelling and case and the eight proposed metadata names `_schema_version`, `_sync_run_id`, `_source_key`, `_fetched_at_utc`, `_quality_status`, `_field_presence_json`, `_last_seen_run_id`, `_row_digest`. They are **proposed**, not deployed.
4. **Preserve fidelity:** code-like fields such as `06413`, nine-digit village codes and `legacy_9digit_code` remain strings with leading zeroes. Represent missing / JSON `null` / empty String separately via `_field_presence_json`; serialize health service nested objects/arrays without flattening or assuming a facility catchment. Avoid spreadsheets interpreting formula-like text as executable formulas; verify a destination-specific text-safe write method before enabling it.
5. **Integrity and rollback:** complete all pages and validate geography, totals, keys and row counts **before** transfer; agree on idempotency key / run ID and server replay controls, staged write + reconciliation + restore, no implicit deletes, safe bounded batches and immutable non-PII audit. No partial updates or "success" on a truncated page.
6. **Privacy:** verify permitted transfer fields, owners and retention; restrict gender village rows until a reviewed small-cell suppression/aggregation policy exists. The four person-level endpoints remain disabled for both fetch-to-storage and data movement.
7. **Authentication:** ThaiPHC Bearer must **never** double as Apps Script destination authentication. Choose a destination-compatible secure method after examining the **actual** receiver capabilities. Do not assume arbitrary Authorization headers are readable by a Google Apps Script Web App.

## Next minimal increments (after approval and actual contract evidence)

- **T009B:** compare existing Apps Script API schema with this T003 proposal (read-only review; explicitly record every mismatch). No URL, credential or real-data call is needed for that analysis.
- **T009C:** add **in-memory** validated source-row projection for `subdistricts`, `villages`, `health-services` with synthetic-only tests, zero-coordinates marker and exact source-field case; build no write path before reviewing retention/transport details.
- **T009D:** separately implement a destination-specific manual authenticated sender plus Apps Script receiver and dry-run/staged rollback **in isolated dev**, then ask for explicit real-write authorization. Until then, all data is either mock or discarded after local read-only validation.

**No implied end-to-end sync approval.** A successful read, Git merge, or preflight report does not authorize POST to Apps Script or writes to Sheets.
