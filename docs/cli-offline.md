# T004 — ThaiPHC Node.js 24 CLI (Phase A: Offline-only)

**Status: SIMULATION ONLY.** No real ThaiPHC requests, no bearer token handling, no source-data export, no Google Apps Script or Sheets integration. The tool never calls global fetch. It accepts only an explicitly mock-branded transport and returns aggregate-only results.

## Getting started

    node --version
    npm test
    npm run cli -- help
    npm run cli -- inspect
    npm run cli -- inspect --endpoint health-services
    npm run cli -- dry-run --endpoint villages
    npm run cli -- validate --endpoint volunteer-gender
    npm run cli -- dry-run --endpoint health-services --max-pages 2

Inspect displays allowlisted source paths and pagination modes. Dry-run and validate run the **same synthetic fixture transport** through the validator and return aggregate JSON only. They cannot read arbitrary local response dumps or credentials. A person-grain source is BLOCKED even in simulation; this deliberately does not imply permission for real extraction.

Commands and flags not on the allowlist, especially --live, --token and --output, return a constant refusal without echoing input. Scope is fixed to province 54, district 5406; page size 1–100 and safety page limit 1–250.

## Observed request mapping

| Endpoint | Request Query | Response pagination |
|---|---|---|
| assignments | page, pageSize, provinceCode, districtCode, osmStatus (empty), osm_status (empty), approval_status, order_by, sort_dir | pagination.page, limit, total, pages; provinces[] |
| subdistricts | district_code | items[] only |
| villages | province_code, district_code | items[] only |
| health-services | limit, offset, health_service_type_ids_exclude repeated **three times**, province_code, district_code | items[], total, limit, offset |
| volunteer-gender; volunteer-family | page, pageSize, province, district | success, message, items[], total, page, pageSize |
| resigned-volunteers; volunteer-tenure | page, pageSize, provinceCode, districtCode, province, district | same report envelope |

The exact repeated health-service type exclusion UUIDs are ordinary observed query values, not credentials. The duplicate spelling and blank status filters are preserved as received; no assumptions are made about their server meaning. Source of evidence: docs/schemas and docs/api-inventory.md, not an official API contract.

## Collector

- collectOffline(endpoint, {transport, pageSize, maxPages, maxRetries, retryDelay}) requires a createMockTransport-branded function; it does NOT expose a live transport factory.
- A mock transport returns {status, body} entirely in memory. Returned summaries expose only mode, endpoint, status, pages, records, requestAttempts, issueCounts. No rows, person keys, tokens, raw error messages or response bodies are returned or logged.
- Pagination must echo requested page, pageSize, offset and limit. Totals must remain stable across pages. Missing items, impossible totals, invalid shapes, missing keys and repeated stable keys cause a **BLOCKED** fail-closed result.
- Lookups are currently unpaginated, as observed. Never invent server pagination for them.
- Retry only mock 429/502/503/504 and thrown transport errors, with bounded retries and injectable backoff (50, 100, 200 ms). Authorization failures do not retry.
- The simulator has MAX 250 pages per run; a cap reached before completion returns PARTIAL, not COMPLETE. There are no real network requests or request timing assumptions.
- Codes remain source strings, including leading zeros; row-checks flag observed geography inconsistencies and do not rewrite them or infer geography from osmCode. Gender subtotal checks operate on counts only. Repeated villageCode in a person report is never a person deduplication key.
- The volunteer-family source lacks a verified relation-row ID and person data is not approved; all four person-grain endpoints stay BLOCKED.
- Root pagination total and item-row total are different fields. An unrecognized server status cannot be assumed safe.

| Status | Meaning | Downstream use |
|---|---|---|
| COMPLETE | Synthetic pages reconciled; non-person dataset passed checks | No authorization for storage |
| PARTIAL | Incomplete pages, transport failure or safety cap | Entire run unusable |
| BLOCKED | Invalid shape/keys/authorization, or disabled person source | No data exported |
| QUARANTINED | Geographical or arithmetic anomalies | Aggregate issue counts only |

There is no persistent intermediate payload, write path, spreadsheet destination, or Apps Script endpoint in this Phase A code. All test fixtures are synthetic; T002 only supplies prior redacted geography evidence and no individual records. This project still has unresolved source gaps: 8 of 18 health services not supplied, ambiguous service_areas semantics, family geography inconsistencies and no family-row stable key.

## Phase B authorization gate — NOT OPEN

A separate user-approved issue/decision is needed to establish API permission, least-privileged short-lived credential transport, explicit operator invocation, scope controls, rate-limits/timeouts and safe response processing. Person-level APIs need a lawful/necessary data and retention decision before any live retrieval. Neither this CLI nor the mere presence of a bearer token in the user environment grants permission to access ThaiPHC.

## Acceptance boundary

T004 Phase A passes only when eight descriptor queries and all mock-only scenarios pass Node.js 24 CI; the PR must be independently reviewed and merged only after explicit approval. Real API access, export, Apps Script ingestion, Sheets creation and writes are separate downstream gates.
