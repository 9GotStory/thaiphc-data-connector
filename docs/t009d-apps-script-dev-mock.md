# T009D — Apps Script Mock Receiver (source-only, synthetic)

**Status: DEV MOCK ONLY · NOT DEPLOYED · INGRESS DISABLED · NO SHEETS WRITES**  
**Tracking:** [Issue #35](https://github.com/9GotStory/thaiphc-data-connector/issues/35).  
**Prerequisites:** [T009B receiver audit](t009b-apps-script-contract-audit.md), [T009C reference projection](t009c-reference-memory-projection.md), T003 `sheets-schema.json` v0.1.0.

## Why this is mock-only

The actual Google Apps Script ingress handler, endpoint URL, authentication contract, target spreadsheet identity and retention/write approval remain **UNVERIFIED**. This issue adds source code for a **new, isolated and deliberately disabled** receiver *proposal*; it does **not** imply that a functioning or deployed receiver exists.

The Apps Script source is `apps-script/dev-receiver.gs`. There are **two different boundaries**:

- `doPost(_event)`: the *only externally routable Apps Script Web App handler*. It **always returns** `{"status":"INGRESS_DISABLED","writeAllowed":false,"sheetsWrites":0}`, without reading, parsing or authenticating request content. **No real HTTP sender must be configured, even to test it.**
- `validateMockBatch_(payload)`: internal-only, pure synchronous JavaScript validator used **locally** in Node.js `node:vm` tests with the exact `.gs` source. It does **not** accept HTTP calls, read/write Sheets, record payloads, return source values, schedule jobs, or perform destination authentication. Its input is **synthetic fixture objects**, not real ThaiPHC data.

**No deployment or connection is authorized.** Do **not** paste this code into a live Apps Script deployment, enable public web app access, use any real spreadsheet ID, or copy real ThaiPHC reference rows to test it.

## Proposed mock contract (NOT a deployed API)

Internal test payload, injected directly into `validateMockBatch_`, is a single in-memory object with exactly:

- `mode: "SYNTHETIC_ONLY"`, `intent: "VALIDATE_ONLY"`, `contractVersion: "T009D-MOCK-1"`
- `schemaVersion: "0.1.0"`, `endpoint` in `subdistricts | villages | health-services`, and matching proposed `tab`
- `scope: {"provinceCode":"54","districtCode":"5406"}`
- `destinationContract: "UNVERIFIED"`, `snapshotCompleteness: "NOT_VERIFIED"`, `writeAllowed: false`
- `sourceFieldNames` in exact T003 column order and `rowCount` matching `rows.length`
- `rows[]` from the **synthetic** T009C `projectReferenceRows()` return, each exactly `{key,values,presence}`. The `values` array holds source field values **only transiently within the test process**; `presence` distinguishes `ABSENT`, `NULL`, `VALUE` for every source column.

Accepted mock validation result is **only a sanitized summary**, such as:
```json
{"mode":"SYNTHETIC_ONLY","status":"MOCK_VALIDATED","endpoint":"villages","tab":"Villages","rowsValidated":2,"destinationContract":"UNVERIFIED","snapshotCompleteness":"NOT_VERIFIED","writeAllowed":false,"sheetsWrites":0,"appsScriptPosts":0,"actualIngress":false}
```

This example is a **synthetic demonstration**, not a real API response or a count from ThaiPHC. Invalid payloads return `MOCK_REJECTED`, a fixed reason code, `rowsValidated=0`, and `sheetsWrites=0`. No partial success, no value echo and no persistence.

## Validation and scope

The `.gs` source pins T003 *draft* column names, field kinds, proposed keys and conservative row bounds (20, 150, 100). Node CI compares this pinned mock metadata **against the actual checked-in manifest** so a future source-schema change fails closed. Mock validation checks strict envelopes, fixed province/district, key uniqueness, row count, case-sensitive source fields, `ABSENT`/`NULL`/`VALUE` semantics, integer/number/string/JSON cell types, bounded text and 512 KiB total JSON size; it rejects extra credential/PII fields, formula-leading/control strings, malformed nested JSON and out-of-scope subdistrict/village/facility references. All rejections are **all-or-nothing** in memory, not transactional rollback because **no write occurs**.

`volunteer-gender` at village level is excluded pending small-cell privacy approval. All four person-grain datasets `assignments`, `volunteer-family`, `resigned-volunteers` and `volunteer-tenure` are excluded. User-supplied credentials cannot toggle validation into a real data receiver.

## Running the isolated tests

No dependencies or Google credentials are required:

```powershell
npm.cmd test
```

The T009D tests load the **same** `dev-receiver.gs` bytes inside Node.js `node:vm` with a synthetic `ContentService` stub. The tests generate synthetic reference inputs, run them through the previously merged T009C memory projection, then validate those projected rows through `validateMockBatch_`. They also exercise many refusal cases and show that `doPost` **always** denies, including when passed an apparently valid synthetic body. Tests do not call `clasp`, Apps Script, ThaiPHC, or Google Sheets.

## What is NOT implemented and the real next gate

- No real Apps Script deployment; no HTTP endpoint accepting requests or invented destination URL/auth.
- No actual Sheet creation, header provisioning, append/upsert, read-before-write, transaction, rollback or retry. **No operational idempotency/replay guarantees are claimed.**
- No complete live pagination-to-memory handoff, no POST serializer for real rows, no real ThaiPHC credential or data, no user-facing row export, no automated schedule.
- No approval to send, retain, or write any user/reference rows and no person-level processing.

**Next task requires an explicit decision** on the source of truth for the receiver (an existing nonsecret Apps Script project or a newly approved isolated DEV receiver), a genuine authentication/authorization model, real destination schema/ownership, and separate synthetic staged-write/restore acceptance. The receiver must fail closed on all uncertain contracts. A reviewed and merged T009D **mock** does not unlock real data transfer.
