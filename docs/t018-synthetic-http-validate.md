# T018 — Synthetic-only validate HTTP redirect and response protocol

Task: [Issue #51](https://github.com/9GotStory/thaiphc-data-connector/issues/51).

## Scope and limitations

The new module src/sync/synthetic-http-validate.mjs exports simulateValidateHttp({prepared, exchanges}). This is a SYNCHRONOUS SIMULATOR, not a live HTTP sender. It accepts T017-built in-memory validate-only envelopes and scripted synthetic HTTP responses. It models the POST-to-Web-App / redirect / GET-response sequence, but contains NO fetch, network adapter, socket, file output, CLI command, or real Apps Script call. No data leaves the Node.js process. It returns only a redacted status summary with counters networkRequests=0, appsScriptPosts=0, sheetsWrites=0.

The initial conceptual POST target is the HTTPS Web App V3 ID already stored in config/thaiphc-targets.json. No arbitrary URLs may be supplied. The previous Library V2 is not an HTTP destination.

## Response and ContentService redirect contract

- The input must be the T017 offline status OFFLINE_ONLY_NOT_SENT, transferApproved=false, with an envelope whose decoded batch is mode=validate, scoped to province 54 and district 5406. Only subdistricts, villages and health-services are supported. No commit mode is available.
- A direct HTTP 200 JSON response may be parsed, or an initial 302/303 may simulate a response redirect to HTTPS host script.googleusercontent.com, exact path /macros/echo, with a nonempty query string. That second simulated request is GET only, with no signed request body, bearer or authorization header.
- Reject 301, 307, 308, relative locations, untrusted hosts, downgrade to HTTP, credentials, custom ports, fragments, redirect loops, extra hops, and automatic retry of POST. Any HTML body accompanying the original 302 is ignored; no user-content token from a redirect is echoed.
- Final response must use application/json (optional UTF-8 charset), be 16 KiB or smaller, and match the strict THAIPHC_SYNC_V1 schema. A 200 transport status is not success unless logical status is VALIDATED, accepted=true, sheetsWrites=0, endpoint and rowCount match, and all mutation counters are zero.
- INGRESS_DISABLED / authentication failures and other receiver rejection statuses never count as validation success. An unexpected COMMITTED status is always an unsafe response. The simulator does not verify HMAC cryptographically; T017 signs requests and verifies them against a local Code.gs VM.
- Real Google Apps Script redirect compatibility has NOT yet been verified by T018. Official documentation: https://developers.google.com/apps-script/guides/content

## Test coverage

New tests provide synthetic 200 success for each of three reference datasets, synthetic 302/303 GET-only follow-ups, logical default-deny errors, wrong/malformed/oversized JSON, login HTML, host/loop/downgrade/credential redirect refusal, commit response refusal, forged commit-mode payload refusal, and a no-network static check. All source rows and keys used by tests are synthetic.

## Future separately authorized gates

T018 does not open receiver/write Script Properties, post to the real Web App, read real ThaiPHC source records, transfer reference rows, or edit Google Sheets. The real write switch must be separately verified OFF (GET METHOD_DISABLED and POST INGRESS_DISABLED alone do not establish this). A future genuine manual transport needs explicit Product Owner approval, privately configured HMAC key, safe Google redirect handling and a bounded timeout. Real source-row transfer additionally needs provider transfer rights, complete-page/snapshot validation and privacy review.

Do not rerun the original Apps Script installer and do not create any new Deployment. The existing project, Web App V3, Sheet and config IDs remain unchanged.
