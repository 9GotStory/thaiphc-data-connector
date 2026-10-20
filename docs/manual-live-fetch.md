# T005 — Manual Bearer Live Fetch (single lookup, read-only)

**Scope:** one operator-confirmed `GET https://api-thaiphc.hss.moph.go.th/api/v1/lookups/subdistricts?district_code=5406` using a Bearer Token manually pasted by an operator. No other ThaiPHC endpoints are enabled for live requests.

**Status:** Implemented on feature branch for review, **not executed live or merged automatically**. The operator previously reported a local HTTP 200 response with 8 subdistricts from a separate one-shot smoke-test script. That successful operator-reported result is not a live test of this CLI implementation. API-owner permission for reusing a web session token programmatically is still not independently documented ([Issue #13](https://github.com/9GotStory/thaiphc-data-connector/issues/13)); use only an approved credential and within authorized access rights.

## Commands (Node.js 24+, after reviewed Merge)

```powershell
node --version
npm test
npm run cli -- help
npm run cli -- auth-mock --endpoint subdistricts
npm run cli -- live-fetch --endpoint subdistricts --acknowledge-authorized-use
```

**Interactive flow** (no real token shown in examples):

1. Ensure the operator is authorized to make this programmatic request and the Token may be used for it.
2. The terminal will prompt: `Type FETCH SUBDISTRICTS 5406 to confirm`. Type the exact phrase and press Enter. It is a **single-run confirmation**, not permanent authorization.
3. At the second, non-echoing prompt, paste only the actual Bearer token **value** (do not prepend `Bearer `). Press Enter.
4. One read-only HTTPS GET is attempted; the program parses and validates the in-memory JSON then emits only `mode`, `endpoint`, `status`, `success`, `httpStatus`, `count`. A successful valid response may resemble:

```json
{"mode":"LIVE_READ_ONLY","endpoint":"subdistricts","status":"PASS","success":true,"httpStatus":200,"count":8}
```

This is **illustrative output**, not a claim that T005's implementation was tested against the live provider. Actual record counts can change. No raw response rows are printed or saved.

### Security / operational boundaries

- **No credentials as CLI flags, environment variables, `.env`, HTTP URLs, shell history, files, GitHub Actions secrets or persistent logs.** No browser automation or clipboard extraction. An interactive TTY is required for both confirmation and token; no pipe/non-interactive fallback.
- Token entry is non-echoing via `setRawMode` and restores the previous mode on completion, error or cancellation. Input is bounded to 8192 printable ASCII characters and checks the RFC 6750-like b64token character set; reject pasted `Bearer ` prefix and `MOCK_ONLY_` values.
- JavaScript strings / OS process memory cannot be guaranteed completely zeroed. No raw crash dumps or tracing permitted for live runs; use short-lived, authorized tokens and a trusted local machine.
- Fixed TLS hostname `api-thaiphc.hss.moph.go.th`, strict relative path/query `/api/v1/lookups/subdistricts?district_code=5406`, `GET` only, `redirect:'error'`, `credentials:'omit'`, 10-second AbortController timeout, no user-chosen hosts/query/URLs.
- **Exactly one fetch attempt**, with no automatic retries, pagination, background schedule or hidden follow-up calls.
- Aggregate-only output; no token, Authorization header, response body, code-list, citizen ID, patient/volunteer data, server error detail or row-level dataset is returned by the command. No file export, Google Apps Script submission, Google Sheets writes or production deployment.
- Accept 200 with JSON media type and no more than **128 KiB of response data**; accept a maximum of 100 subdistrict rows. Validate the expected fields, district `5406`, six-digit subdistrict codes, `id=code`, uniqueness and source field types. Reject unknown/sensitive fields instead of attempting to redact/guess.
- 401/403, unexpected status, redirect, transport failure, invalid JSON, wrong scope, duplicate code, response-too-large or unexpected fields produce **sanitized error codes** without exposing upstream bodies. Never mistake HTTP 200 alone for validated data.
- `auth-mock` remains synthetic-only, while `inspect`, `dry-run`, `validate` stay offline. The live command refuses all other seven endpoints, token flags, `--output` and user-supplied URLs.

### Testing / release gates

T005 tests use a **fully injected fake fetch** returning constructed `Response` objects, and synthetic non-person lookup records. GitHub CI never contacts ThaiPHC or reads any real Bearer Token. These tests verify request construction, terminal input, HTTP statuses, payload bounds, validation, no raw leakage and existing offline behavior.

- **Implementation authorization:** The user requested this engineering work. Merge still needs explicit SHA/CI-based review and approval.
- **Execution authorization:** This PR does not perform a live GET. The operator must confirm permitted use before actually executing.
- **Data destination authorization:** Nothing here allows real-response storage, Apps Script transfer, personal API calls or Sheets synchronization. Those require separate staged approvals.

**Do not commit actual token values, personal records or full raw response JSON to GitHub.**
