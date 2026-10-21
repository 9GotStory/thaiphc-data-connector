# T007A — Safe health-services validation diagnostics

**Context:** On 2026-10-21, the operator ran the merged T007 `health-services` CLI. It reported `HTTP 200` but `INVALID_HEALTH_SERVICE_ROW`, `success=false`, `count=0`. This does **not** establish the source count is zero; validation deliberately refuses to report partially verified results.

The original ThaiPHC `health-services` schema was inferred from only the first **10** entries of a historical `total=18` sample; real provider data (particularly page two) may have nullable or differently formatted values. The existing error code lumps together several field checks. **We do not know which condition failed.**

## Proposed field-name-only diagnostic

On an `INVALID_HEALTH_SERVICE_ROW`, the CLI will additionally return **three safe metadata fields**:

```json
{
  "mode": "LIVE_READ_ONLY",
  "endpoint": "health-services",
  "status": "INVALID_HEALTH_SERVICE_ROW",
  "success": false,
  "httpStatus": 200,
  "count": 0,
  "invalidField": "legacy_5digit_code",
  "pageOffset": 10,
  "rowIndex": 2
}
```

This is a **synthetic example, not the observed failure location**. `invalidField` is a code-owned, finite allowlist of recognized field paths (never a value copied from the API); `pageOffset` is the requested 0-based offset, and `rowIndex` is the 0-based index within that page. This does not include any name, code value, identity, token, coordinates, row content or server error body. Existing aggregate-only successful responses are unchanged. Errors of other classes remain unchanged.

**No validator is relaxed**; failures still produce `count=0` and exit code 2. The exact same fixed HTTPS origin, `limit=10`, `offset=0,10,...`, three repeated exclusion parameters, district/province scope, page/response limits, hidden manual Token input and confirmation remain in place. No extra GETs, retries, files or Sheets.

After an independently reviewed and approved merge, the operator can run:

```powershell
git switch main
git pull origin main
npm.cmd test
npm.cmd run cli -- live-fetch --endpoint health-services --acknowledge-authorized-use
```

Enter `FETCH HEALTH SERVICES 5406`, then paste only the authorized Token value into the hidden second prompt. Share the **sanitized JSON summary only**; do not share actual source records, request headers or Token.

Only once a specific field/type mismatch and page location have been observed should a follow-up issue consider any minimal schema adjustments. Null values should not be coerced, dropped, auto-filled or converted into fictitious identifiers. A technical HTTP 200 result does not independently establish owner authorization.

**Testing:** Node.js 24 synthetic fake responses only, including 12 separate field error categories, second-page error location, non-leakage and existing T005/T006/T007 regressions. No real ThaiPHC traffic during engineering/CI.
