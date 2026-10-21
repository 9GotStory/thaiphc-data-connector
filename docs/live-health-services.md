# T007 — Health Services Live Fetch (bounded, read-only)

**State:** Candidate implementation for review; no live ThaiPHC request was made during development. The T005/T006 operator reported successful API GETs with a manually entered Bearer Token, but this does **not** establish that another endpoint permits use of the same token.

## Command (only after separate approved merge)

```powershell
git pull origin main
npm.cmd test
npm.cmd run cli -- live-fetch --endpoint health-services --acknowledge-authorized-use
```

1. At the hidden confirmation prompt, type **`FETCH HEALTH SERVICES 5406`** exactly and press Enter.
2. At the second hidden prompt, paste **only the Bearer Token value** (no `Bearer ` prefix). Use only an appropriately authorized token.
3. The CLI requests only the observed **reference health-services** source for province `54` / district `5406`. It makes repeated read-only GETs if needed for pagination. It never prints rows or persists raw responses.

## Exact HTTP scope and pagination

- Fixed HTTPS origin `https://api-thaiphc.hss.moph.go.th`, path `/api/v1/geo-management/health-services`.
- Fixed query order: `limit=10`, `offset=0,10,...`, three **repeated** `health_service_type_ids_exclude` UUIDs exactly as recorded in the existing `src/cli/endpoints.mjs` descriptor, then `province_code=54&district_code=5406`.
- The same manually pasted Token is used for this bounded series, only after one endpoint-specific confirmation. **No** background runs, retries, redirects, arbitrary URLs, user-supplied pagination or multi-endpoint live mode.
- At most **10 pages / 100 records**, with **10 seconds per GET** and existing **128 KiB JSON body cap per GET**. Exceeding a limit fails closed; these are safety limits, not assertions that the source always has 18 rows.
- Response envelope must be exactly `items[]`, `total`, `limit`, `offset`. The offset and limit must match the request, `total` must stay constant across pages and each page's item count must match the expected size. Repeated keys across pages, malformed or out-of-scope items, inconsistent or truncated pages result in a sanitized non-PASS status.
- The observed *first-page-only* source document has `total=18` with `limit=10`. The unseen second page has not been verified. The CLI must successfully validate *both* pages before returning PASS.

## Reference-only row validation

The observed 16-field health-service schema and nested `health_service_type`, `province`, `district`, `subdistrict`, and `service_areas[]` structures are allowlisted. Codes, IDs and legacy codes must remain strings (preserving leading zeros). The CLI checks district/province and one of `540601`–`540608`, uniqueness of `health_service_code` across all pages, numeric finite coordinates, nested field types and limits. Unexpected/sensitive fields fail closed.

- `latitude=0` / `longitude=0` found in the observed first page are **placeholders / unverified**, not valid geolocations. The CLI returns a count only, not coordinates.
- `service_areas[].village_nos` is not assumed to be a complete catchment definition, and the nested service area can differ from the main service's subdistrict. No inferred foreign keys.
- Historical `health_service_name_en=null` and `deleted_at=null` do **not** prove future types. Accepts bounded optional text where observed nulls leave types unknown; rejects other types, rather than silently coercing.
- If the remaining eight rows have other fields, shapes or permissions, the CLI may return `UNEXPECTED_RESPONSE_SCHEMA` or other sanitized validation codes. This would need reviewed adjustments, not bypassing checks.

## Example aggregate output — illustrative, **not** an actual T007 live result

```json
{
  "mode": "LIVE_READ_ONLY",
  "endpoint": "health-services",
  "status": "PASS",
  "success": true,
  "httpStatus": 200,
  "count": 18,
  "total": 18,
  "pagesFetched": 2,
  "zeroCoordinateCount": 18
}
```

**Important:** `zeroCoordinateCount=18` above is purely a synthetic example; **only the first 10 records' (0,0) coordinates were documented previously**. The number 18 is a reported historical total, not a new or verified live count.

Error outputs contain sanitized status, HTTP status and zero count only. No upstream error bodies or partially fetched rows appear even when a later page fails.

## Security, tests and gates

- Real Token input is hidden in an interactive TTY; rejected from flags, environment, files, shell history and mock tokens; input is bounded. The JS/OS runtime cannot guarantee full erasure from memory, so use a trusted local terminal.
- Test suite uses **only synthetic records, fake TTY and injected fake fetch**. There is no real GET, credential or user-record collection in CI.
- No Apps Script, Google Sheets, raw export, local database, production deployment, personally identifying volunteer records or additional live endpoint.
- T007 requires independent source/SHA/CI review followed by **explicit user approval before merge**. Only after that should the operator test locally using the permitted Token and share aggregate JSON only.
- Issue #13 was closed as Not Planned, not as a data-owner authorization determination.
