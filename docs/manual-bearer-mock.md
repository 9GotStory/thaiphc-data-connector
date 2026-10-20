# T004C — Manual Bearer Token Mock Flow

**Status: MOCK-ONLY IMPLEMENTATION. LIVE ThaiPHC API ACCESS: HOLD.**

Related: [Issue #11](https://github.com/9GotStory/thaiphc-data-connector/issues/11), [T004B authorization/privacy gate](live-access-gate.md), [T004 offline CLI](cli-offline.md). This feature demonstrates the future operator experience **using synthetic credentials and an in-process mock only**, not real provider authentication.

## What is implemented

- A **TTY-only, non-echoing prompt** using Node.js raw terminal mode (with input size bound, cancellation, input errors, time limit, and terminal state restoration).
- An intentionally restrictive token format: `MOCK_ONLY_` followed by 8–64 safe ASCII characters. **Actual JWTs, browser session Bearer Tokens and ordinary credentials are rejected**, even if valid at ThaiPHC.
- A mock `Authorization: Bearer MOCK_ONLY_...` header passed **only to a branded in-process mock responder**, never over HTTP.
- `GET` to the already observed **relative** path `/api/v1/lookups/subdistricts` with fixed district `5406`, validated against the existing T004 request descriptor. A request for any other endpoint is refused.
- Aggregate-only result reporting: `mode`, `endpoint`, `status`, `pages`, `records`, `requestAttempts`, `issueCounts`. No token, headers or individual source rows are in the output.
- No changes to the previous CLI commands for inspecting and validating all 8 simulated API endpoints.

## Usage — synthetic tokens ONLY

Run in an actual interactive terminal with Node.js 24 or newer:

```sh
npm test
npm run cli -- auth-mock --endpoint subdistricts
```

At the terminal prompt, **type a fake token only**, such as `MOCK_ONLY_12345678`. Input characters are not echoed. Press Enter to run the offline mock; Ctrl+C / Ctrl+D / Escape cancels the input. The command refuses piped stdin, redirected non-TTY stderr, `--live`, `--token`, `--output`, arbitrary endpoint IDs, or URL overrides. It does not read `.env`, command-line token flags, clipboard data or stored credentials.

**Do not paste a real ThaiPHC token into `auth-mock`.** In this phase, a real credential cannot improve the test and is intentionally rejected.

## Flow under test

```text
Mock-only TTY prompt (non-echoing)
       ↓
Validate exact synthetic token pattern
       ↓
Allowlist endpoint: subdistricts only
       ↓
In-process Authorization: Bearer MOCK_ONLY_... header
       ↓
Branded synthetic responder; NO SOCKET/NETWORK REQUEST
       ↓
Existing offline page/shape/duplicate/scope validation
       ↓
Aggregate-only status and counts; no exported rows
```

### Negative-case tests

Tests cover fake-only policy, token/input cancellation, too-long text, no TTY/noninteractive stdin, restoration of prior terminal raw mode, inability to call person-level endpoints or other reference APIs, header shape inside the mock, sanitized HTTP 403 and mock exceptions, suppression of identifiers/error bodies, and no invocation of the global `fetch` transport.

### Security boundaries and limitations

- Terminal echo is suppressed **only during the prompt**; token values still temporarily exist as JavaScript strings. JavaScript runtime memory cannot be reliably wiped. The test zeroes received Buffer bytes when possible, not all possible copies in memory. The rule **never use real credentials here** is the actual safety boundary.
- A mock callback is code supplied by the caller and should be regarded as trusted **test code only**. The mock-brand check is not a sandbox or protection from deliberately malicious code; no untrusted plugins or handlers may be loaded. Source code itself contains no live HTTP client.
- No one has established provider permission for programmatic use of manually copied browser credentials. A browser login is not sufficient proof of authorization for programmatic data extraction. Do not use browser-token capture automation or add auth recovery bypass.
- No personal-data endpoints are enabled. This feature is not a request dispatcher, does not provision Google Sheets, does not call Apps Script, and cannot perform production or background synchronization.
- Mock success does **not** validate ThaiPHC server behavior, live auth, pagination, rate limits, token expiry, or lawful permission. These remain **UNKNOWN / HOLD** under T004B.

## Separate gates before a real read-only pilot

1. **Provider/data-owner authority:** confirm a permitted API access method, including whether manual reuse of session Bearer Tokens is allowed, for named endpoint and district `5406`.
2. **Implementation approval:** a new, separately scoped reviewed issue/PR to introduce any real HTTPS transport; verify TLS, hostname/path allowlist, redirect refusal, timeouts, size limits, explicit consent and no sensitive persistence.
3. **Operator run approval:** new confirmation before the first real GET even after code review. No implicit authorization from GitHub Merge or an offline demo.
4. **Separate transfer/write approval:** no Google Apps Script ingress or Google Sheets writes unless independently authorized and verified later.

**T004C acceptance:** mock-only TTY + header wiring tested on Node.js 24 CI; PR independently reviewed and merged only after explicit user approval; real API gate stays **HOLD**.
