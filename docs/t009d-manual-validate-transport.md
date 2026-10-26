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

## Remaining within T009D / actual reference sync goal

The existing ThaiPHC `live-fetch` commands **only report aggregate results**. They deliberately discard source rows, so no real source data can yet be synchronized to Sheets. The next implementation pass **within this same feature**, rather than a succession of simulator Issues, must obtain explicitly authorized, complete, bounded source snapshots in process memory, validate all pages and keys, and link that to the signed sender under a specific reference-data transfer approval.

The three allowed source datasets remain `subdistricts`, `villages`, `health-services`. `volunteer-gender` is privacy HOLD; the four person-grain endpoints remain disabled. Confirm ThaiPHC provider extraction/transfer rights and destination sharing/retention before transferring source rows.

**Current authorization stops at code development and local/CI mocks.** No actual HTTP POST has been sent by this implementation task, no Script Properties were changed, no new Script/Deployment was created, and no Spreadsheet or Sheet tabs were touched. Real `mode=commit` and Google Sheets writes remain a separately approved later gate requiring backup, verification and rollback.
