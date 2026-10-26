# T009D — Real manual validate-only HTTPS transport (one feature)

Tracking: [T009D Issue #53](https://github.com/9GotStory/thaiphc-data-connector/issues/53). This is **implementation Stage A** within a single feature, not another offline simulator milestone.

## Delivered technical behavior
- `src/sync/manual-validate-transport.mjs` contains an **actual HTTPS fetch transport** that POSTs an existing T017 signed envelope to the **existing Web App V3**, pinned by `config/thaiphc-targets.json`. It makes no network calls by importing it.
- `src/cli/index.mjs` exposes one narrow manual command to construct **synthetic-only reference data** in memory, ask for explicit hidden-TTY confirmation, ask separately for a **destination HMAC secret** privately, generate a new signed `mode=validate` envelope and POST it to Web App V3. It never fetches real ThaiPHC rows or reuses a ThaiPHC bearer as destination credentials.
- If Google ContentService returns 302/303, the client accepts only the exact HTTPS `script.googleusercontent.com/macros/echo` path with query string; follows with **one bodyless GET**, never forwards the signed POST or credentials, and never retries a POST.
- Hard request timeout 10 seconds; bounded final response 16 KiB; HTTP status, content type, `THAIPHC_SYNC_V1`, `accepted`, `status`, endpoint, row count, mutation counts and `sheetsWrites=0` must all pass. HTTP 200 alone is not successful validation. Redirects outside the allowlist, 307/308 and unexpected `COMMITTED` reject.
- No CLI `--url`, `--token`, `--output`, `--mode commit`, source row file or automatic scheduler. Results only contain non-sensitive status/counters, **not** source row payloads, HMAC signatures, redirect tokens or raw HTTP errors.

## Operator command — DO NOT RUN until separately authorized for a real POST
From the repository on Windows PowerShell, **only after Product Owner approves a limited synthetic Web App test**:

```powershell
npm.cmd run cli -- send-validate --synthetic --endpoint villages --acknowledge-synthetic-post
```

The tool requires a true interactive terminal; it asks for exact confirmation:

```text
POST SYNTHETIC VALIDATE 5406
```

It then asks for the private **44-character base64 destination HMAC key**, with terminal echo disabled. Never paste that secret in chat, a GitHub Issue, environment flags, or shell command history.

- While `THAIPHC_RECEIVER_ENABLED=false`/absent, the expected **logical** status if a call is made is `INGRESS_DISABLED`. The command reports a non-zero exit code, even if HTTP 200.
- For an independently approved authenticated validation test: operator first verifies `THAIPHC_WRITE_ENABLED=false` and safe Script Properties, approves temporary `THAIPHC_RECEIVER_ENABLED=true`, provides the privately configured matching destination HMAC key and sends **synthetic `mode=validate` only**. A successful response is `VALIDATED` with `sheetsWrites=0`. Turn off receiver after test.
- The command cannot write to Sheets because its batch always uses `mode=validate`. **Do not enable `THAIPHC_WRITE_ENABLED` in this phase.**
- Google ContentService redirect security is tested by injected HTTP responses, but actual Web App access settings and real redirect chains remain to be verified at live UAT.

## CI and tests
`npm.cmd test` on Windows or `npm test` on CI uses injected `fetchImpl` only, with fake HMAC keys and fabricated rows. The test code never calls the real Web App. It tests HMAC compatibility, endpoint allowlists, exact config target, POST/GET split, unsafe redirects, errors, no retry, and TTY guards. It also retains the T017/T018 offline tests.

## Bounded reference snapshot collection (code complete; not wired to outbound POST)

`src/sync/reference-snapshot.mjs` exports `collectReferenceSnapshot({endpoint,confirm,getToken,fetchImpl,manifest})`. Unlike the existing CLI aggregate read-only summaries, it can return **the actual source reference rows in memory** after explicit `READ REFERENCE SNAPSHOT 5406` confirmation and a privately supplied authorized ThaiPHC bearer. It supports only the same three allowlisted endpoints, reuses the already-tested source validators, checks the exact 54/5406 request scope, bounds HTTP responses/timeouts and pagination, and invokes T009C projection to reject unexpected source fields, unsafe cells and duplicate keys.

For health-services it reads at most 10 pages of 10 records and checks page offsets, total consistency and actual row counts; for the unpaginated subdistrict/village lookups, **there is no authoritative source total**, so a single response does NOT prove the complete population. `observedCountMatches` is a comparison against operator-reported historical counts 8/85/18, **not a completeness certification**. Its result always has `transferApproved:false`, `appsScriptPosts:0`, `sheetsWrites:0`. On success `rows` contains private in-memory reference values; **never print, log, write or upload that return object**.

This collector is intentionally not exposed as a new raw-row CLI command and is not connected to the network sender. Its HTTP behavior is tested with **injected synthetic fetch responses only**, without accessing real ThaiPHC. Before any real source snapshot read/transfer, confirm provider access/transfer rights and an operator-approved data-handling process.

The **outbound Web App sender independently enforces the exact one-row synthetic fixture**, even if given a correctly HMAC-signed different reference row. This is a concrete protection against accidentally sending collected real ThaiPHC rows through the newly added sender.

## Remaining within T009D / actual reference sync goal

The existing ThaiPHC `live-fetch` CLI commands **still report aggregates only**. The new `reference-snapshot` collector can hold bounded rows in memory, but the real network sender intentionally accepts **synthetic fixture rows only**. A real source-data sync therefore still requires an explicit provider-transfer authorization, a safe manual operator workflow and a distinct reviewed capability for transmitting approved complete snapshots to a writable destination. The unpaginated lookup completeness gap must be resolved or separately accepted by the data owner.

The three allowed source datasets remain `subdistricts`, `villages`, `health-services`. `volunteer-gender` is privacy HOLD; the four person-grain endpoints remain disabled. Confirm ThaiPHC provider extraction/transfer rights and destination sharing/retention before transferring source rows.

**Current authorization stops at code development and local/CI mocks.** No actual HTTP POST has been sent by this implementation task, no Script Properties were changed, no new Script/Deployment was created, and no Spreadsheet or Sheet tabs were touched. Real `mode=commit` and Google Sheets writes remain a separately approved later gate requiring backup, verification and rollback.
