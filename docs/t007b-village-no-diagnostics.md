# T007B — Safe village_no failure reason classification

**Source evidence:** The operator ran the merged T007A CLI and reported HTTP 200 with `status=INVALID_HEALTH_SERVICE_ROW`, `invalidField=village_no`, `pageOffset=10`, `rowIndex=0`. This means the **first row on page two** (global item 11) did not satisfy the current validation predicate. Neither its value nor JSON type has been observed, and the CLI's `count=0` does **not** establish the source contains zero health services.

## Minimal diagnostic change

T007B adds **one additional constant-owned output field**, `invalidReason`, only when `status=INVALID_HEALTH_SERVICE_ROW` and `invalidField=village_no`. The reason can be one of:

| Code | Interpretation |
|---|---|
| `NULL_VALUE` | The JSON value was null |
| `NUMBER_TYPE` | The JSON value was a number (actual numeric value withheld) |
| `BOOLEAN_TYPE` | The JSON value was true/false (actual value withheld) |
| `ARRAY_TYPE`, `OBJECT_TYPE` | The JSON value had the wrong structural type |
| `MISSING_OR_UNDEFINED` | Missing/undefined internal value (not normally representable as a JSON value with all required keys) |
| `OTHER_TYPE` | Another unsupported runtime type |
| `EMPTY_STRING` | An empty string |
| `INVALID_STRING_FORMAT` | Nonconforming text: not 1–3 decimal digits |
| `ZERO_NOT_ALLOWED` | Numeric string zero |
| `UNCLASSIFIED_INVALID` | Reserved fail-closed diagnostic fallback |

The reason is a static code-owned string, **not a value from the API**. The previous `invalidField`, `pageOffset` and `rowIndex` are preserved. Actual `village_no` values, lengths, names, service codes, coordinates, sensitive data, upstream bodies and credentials are never included.

### Synthetic example, NOT the observed provider value

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
  "invalidReason":"NULL_VALUE"
}
```

**No validation rule is loosened:** `village_no` is still accepted only as a nonempty, positive, 1–3 digit **string**, and no type coercion is performed. All other statuses and valid outputs remain unchanged, including the 10-page/100-row read-only limits, HTTPS target, exact query, hidden operator confirmation, and manually entered Bearer Token. No extra HTTP requests or data persistence occur.

## Tests and operator follow-up

Node.js 24 mock-only tests cover synthetic null, number, boolean, array, object, blank, malformed, zero and valid string cases, plus page offset/index, other error kinds and output non-leakage. No real provider GET or real Token used in development or CI.

After independently reviewed **and explicitly approved** merge, the operator runs:

```powershell
git switch main
git pull origin main
npm.cmd test
npm.cmd run cli -- live-fetch --endpoint health-services --acknowledge-authorized-use
```

At the hidden TTY prompt, enter `FETCH HEALTH SERVICES 5406`, then paste only an appropriately authorized Bearer Token **value** in the second prompt. Share only sanitized JSON; do not share the Token, response body or health service rows.

**Next decision depends on evidence:** `NULL_VALUE` may motivate permitting absent village number for specific health-service types, while `NUMBER_TYPE` could indicate a string/number representation mismatch. Neither should be assumed before the observed classification; implementation must preserve the original data semantics. Closing the historical permission-evidence issue did not itself establish external API-owner authorization.
