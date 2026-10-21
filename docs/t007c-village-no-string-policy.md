# T007C — Align health-service `village_no` with observed string type

## Live UAT evidence and scope

On 2026-10-21, the operator reported:
```json
{
  "mode":"LIVE_READ_ONLY",
  "endpoint":"health-services",
  "status":"INVALID_HEALTH_SERVICE_ROW",
  "success":false,
  "httpStatus":200,
  "count":0,
  "invalidField":"village_no",
  "pageOffset":10,
  "rowIndex":0,
  "invalidReason":"INVALID_STRING_FORMAT"
}
```

Interpretation: The first record on page 2 (overall record 11) has a **string** `village_no` that does not match our own `^\\d{1,3}$` restriction. No real string value or length was disclosed or observed. The pre-existing source schema, derived from 10 example records only, documents a string type (sample `"4"`), **not** a guaranteed decimal-string format. `count=0` is a fail-closed result, not an API count.

## Minimal validation change

`items[].village_no` is now interpreted as **opaque source-provided reference text**, not parsed as a numeric village identifier and never used for joining/cross-referencing the separate villages endpoint.

- Accept a **JSON string only**, length 1–64 UTF-16 code units, containing non-whitespace text.
- Reject `null`, numeric/boolean/object/array types, an empty/whitespace-only string, ASCII controls and DEL, and strings consisting solely of ASCII zero digits (ignoring outer whitespace for this one check).
- **Do not** coerce a Number to String, trim, parse, normalize, replace or invent a value.
- The previously invented digit-only and 1–3 digit length restrictions are removed **only for `items[].village_no`**. Examples of *synthetically permitted* opaque strings include `"4"`, `"01"`, `"1234"`, `"1-3"`, `"หมู่ 4"`. This **does not assert** any of these actually appeared in the live API.
- The code never emits the source value, field length, names, service codes, coordinates, bodies or token. For rejected values, `invalidField`, `pageOffset`, `rowIndex` and a fixed `invalidReason` remain.
- `invalidReason` for strings is now `EMPTY_STRING`, `BLANK_STRING`, `STRING_TOO_LONG`, `CONTROL_CHARACTER`, `ZERO_NOT_ALLOWED` or fallback `UNCLASSIFIED_INVALID` as appropriate. Non-string categories unchanged.
- **No modification to `service_areas[].village_nos[]`**: that is a distinct field with its own validation; if it fails, treat it as new evidence instead of broadening this patch.
- All 16-field source allowlists, province/district/subdistrict scope, code uniqueness, bounded total/offset/limit, 10-page/100-row maximum, per-GET timeout/body caps, fixed GET URI with repeated exclusions, and Manual Bearer TTY remain unchanged.

## Test and rollout gates

Node.js 24 synthetic tests verify both-page mock success for numeric, multi-number and Thai opaque strings; reject wrong types, blank/zero/control/overlong strings; verify no values leak and the separate nested area check stays strict. Existing T005/T006/T007/T007A/T007B regression coverage is preserved.

Engineering/CI makes **no real ThaiPHC request** and handles **no actual token**, records or Apps Script/Sheets data. Review the exact branch SHA and CI, and **do not merge without explicit user approval**.

After an approved merge, the operator can locally run:
```powershell
git switch main
git pull origin main
npm.cmd test
npm.cmd run cli -- live-fetch --endpoint health-services --acknowledge-authorized-use
```
Enter `FETCH HEALTH SERVICES 5406` at the hidden confirmation prompt, then only an appropriately authorized Bearer Token **value** at the second hidden prompt. Share the **aggregate-only JSON result** (not raw API rows/token). A PASS is only confirmed after all pages and other fields validate; another error should be addressed by its specific evidence rather than bypassed.

**Important limitation:** accepting an opaque string verifies bounded type/shape, not that it is a valid or matchable village number. Downstream data mapping must define an explicit policy for this field, separate from this read-only fetch.
