# Architecture — proposed (not implemented)

```text
ThaiPHC API  -- authorized GET + short-lived bearer --> Node.js 24 Manual CLI
           -- validation/pagination/redaction --> local transient payload
           -- authenticated POST --> isolated Google Apps Script Web App
           -- validation/upsert --> controlled Google Sheets
```

## Phases
1. T001: version redacted observed schemas and initialize isolated source layout (this issue).
2. T002: compare keys, nullable values, relationships and known inconsistencies.
3. T003: propose a Sheets schema; review security and retention before provisioning.
4. T004: implement manual, read-only ThaiPHC fetch in Node.js; no credentials committed.
5. T005: implement separately authenticated Apps Script import; reject unauthorized and replayed payloads.
6. T006: staged integration tests (synthetic data first); require approval before writing real data.

## Safety rules
- No unattended login, scraping credentials, or bypass of API access controls.
- Never log or commit ThaiPHC bearer tokens, national ID values, personal names/addresses, full response dumps or Google secrets.
- CLI should accept short-lived authorized credentials interactively or via approved secure provider.
- Validate district and province, API pagination completeness, deduplication, and source anomalies **before** ingestion.
- For real data, enforce access approvals, least privilege, transport security, data minimization, and retention.
- Keep production Google Sheets and deployment untouched until explicitly approved.

## Unresolved decisions
- ThaiPHC permission for programmatic extraction, session/token expiry, and API rate limits.
- Apps Script endpoint authentication/security and failure recovery strategy.
- Storage fields and retention for personal records; Sheets access controls.
