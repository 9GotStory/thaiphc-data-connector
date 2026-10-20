# T006 — ThaiPHC Villages Live Fetch (Read-only)

**Status: implementation candidate, mock CI required; no live provider request performed in this PR.**

Following the operator's real success for `subdistricts` (HTTP 200, 8 records), T006 proposes **one additional read-only endpoint** with the *same manually entered Bearer Token mechanism*. Authentication success on one endpoint does not establish entitlement to every endpoint: each endpoint can apply different permissions, geographic filters and response rules.

## Exact proposed command (after reviewed and authorized merge)

```powershell
git pull origin main
npm.cmd test
npm.cmd run cli -- live-fetch --endpoint villages --acknowledge-authorized-use
```

First enter `FETCH VILLAGES 5406` at the **hidden confirmation prompt**. Then paste **only the Bearer Token value** (no `Bearer ` prefix) at the second hidden prompt. The confirmation is specific to villages; `FETCH SUBDISTRICTS 5406` is not accepted for villages.

- Exact destination: `GET https://api-thaiphc.hss.moph.go.th/api/v1/lookups/villages?province_code=54&district_code=5406`
- **One** GET, no retries, no pagination, no automatic sync, no redirected requests or arbitrary domains/paths. HTTPS and normal TLS verification required.
- Reuses Node.js 24 secure interactive TTY input; Token is not read from flags, environment variables or a file. No screenshots, raw Token or full Response should be pasted into GitHub/ChatGPT.
- 10-second AbortController timeout; 128 KiB bounded JSON reader shared with T005; max **150** village entries. Conservative limits fail closed instead of truncating.
- Response must be `{items:[...]}` with no unexpected root fields. Observed source envelope is **unpaginated**.
- The observed 20 item fields are allowlisted. Validation checks province `54`, district `5406`, subdistrict in `540601`–`540608`; nine-digit village `code` and `id`, eight-digit `village_code_8digit`, integer `village_no` and expected code relationships, uniqueness, and `label = name_th`.
- Sample-null `name_en`, `metro_status`, `health_service_name_en` and nullable `health_service_code`/`health_service_name_th` are handled without silently fabricating values. If a previously unknown type appears, stop with a sanitized validation code and review the schema. No automatic correction or cross-endpoint service join.
- Only sanitized aggregate status/counts are printed: `count`, `subdistrictCounts` (8 counts, one per administrative code), `healthServiceLinkedCount`, and `healthServiceNullCount`. **No village names, individual rows, token or error response body** are emitted.
- Other live endpoints remain denied, including person-level APIs. Offline `validate`, `dry-run` and the synthetic `auth-mock` remain unchanged. **No Google Apps Script / Sheets integration or writes.**

## Expected comparison from 2026-10-20 sample (not a fixed production invariant)

| Indicator | Previously observed |
|---|---:|
| Village rows | 85 |
| Eight subdistrict group sizes (`540601` through `540608`) | 11, 12, 17, 12, 13, 10, 4, 6 |
| Village rows with a non-null `health_service_code` | 10 |
| Village rows with `health_service_code=null` | 75 |

The earlier 85-row dataset had **20 observed fields per item**, unique codes and `id=code`. Counts are *observations* and can change. T006 validates record structure, geography, uniqueness and relationships, **not that the server must forever return exactly 85 villages**.

## Future test sequence

1. Execute `npm.cmd test`: all CI tests use synthetic lookup data and injected HTTP `Response` objects, never an actual Token.
2. After **explicit merge approval**, run the CLI locally with an appropriately authorized credential.
3. Report the sanitized JSON result only. If `PASS`, compare aggregate counts to the historical sample, then plan reference API `health-services` as a separate issue.
4. If `HTTP_401`, `HTTP_403`, `UNEXPECTED_RESPONSE_SCHEMA`, `INVALID_VILLAGE_RELATION`, `RESPONSE_TOO_LARGE` or another error occurs, do **not** bypass validation or send raw personal/source data; review the code safely before extending behavior.

T006 does not establish provider authorization for programmatic Bearer use. It is a technical implementation, not an entitlement grant; Issue #13's closure did not alter that fact.
