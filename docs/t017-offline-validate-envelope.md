# T017 — Offline-only HMAC validate-envelope preparation

**Scope:** Source-only/synthetic-only groundwork for the future manual Node.js sender. [Issue #49](https://github.com/9GotStory/thaiphc-data-connector/issues/49).

## What T017 adds
`src/sync/offline-validate-envelope.mjs` exports `buildOfflineValidateEnvelope(options)`: a synchronous in-memory adapter that accepts **injected reference records**, applies existing `projectReferenceRows` (T009C) and builds a T010-compatible **HMAC-SHA256 signed `mode=validate` envelope**.

This is **NOT a live sender**. It does not fetch ThaiPHC, issue POST, read the Web App URL, print a credential, write files, or access Google Sheets. The returned `envelope.payloadB64` contains the projected source row contents (base64 **is not encryption**); it must remain in process memory, **never** in logs, issue comments, chat transcripts or committed fixtures. Tests use synthetic rows and a synthetic 32-byte HMAC key only.

### Public API (code illustration only — no outbound request)
```js
import {buildOfflineValidateEnvelope} from './src/sync/offline-validate-envelope.mjs';

// These values must be injected privately by a later authorized caller.
// T017 does not implement source fetching or secret acquisition.
const prepared=buildOfflineValidateEnvelope({
  endpoint:'subdistricts', rows:syntheticRows, manifest:validatedManifest,
  keyB64:syntheticTestKeyB64, runId:'synthetic-run-0001',
  fetchedAtUtc:'2026-10-22T09:00:00.000Z'
});
// Do not print/serialize/POST prepared.envelope; inspect only safe counters.
if(prepared.status!=='OFFLINE_ONLY_NOT_SENT') throw Error('NOT_OFFLINE');
```

The function requires exact option names, a canonical 32-byte base64 key, explicit `runId`, UTC `fetchedAtUtc`, and a checked `timestampMs` (defaults to current milliseconds). A fresh crypto-random 24-character URL-safe nonce is generated internally on every call. Signed bytes are the exact UTF-8:
```text
THAIPHC_SYNC_V1\n{timestamp}\n{nonce}\n{payloadB64}
```
The JSON envelope is `{version,timestamp,nonce,payloadB64,signature}`, with the decoded payload exactly `{schemaVersion:'0.1.0',mode:'validate',endpoint,scope:{provinceCode:'54',districtCode:'5406'},runId,fetchedAtUtc,sourceFieldNames,rows}`.

### Safety bounds
- Only `subdistricts`, `villages`, `health-services`; all personal endpoints and `volunteer-gender` are blocked. No `commit` mode option exists.
- Scope and source types come from the strict T009C projection. The returned object includes `transferApproved:false`, `networkRequests:0`, `appsScriptPosts:0`, `sheetsWrites:0`.
- Reject empty projected batches, malformed/unsafe identifiers and source values, invalid key/time/run ID, wrong T003 schema version, and encoded payloads beyond the receiver's 550,000-character base64 and 700,000-character envelope limits.
- This function **does not** certify live source authorization, total pagination completeness, a stable snapshot, rights to send downstream, Web App access mode, live redirect behavior, or a destination schema. The source projection's design-only status is **not** upgraded to approval.
- This task adds no CLI switch. Existing `live-fetch` stays read-only aggregate output, and `sync-plan` remains `HOLD`.

### Verification
`npm.cmd test` (Windows Node 24) / `npm test` covers synthetic fixtures for all three datasets, HMAC, replay nonce uniqueness, preserved leading-zero IDs and ABSENT/NULL/VALUE, scope/type/size rejection, and `Code.gs` in the existing T010 VM with `THAIPHC_RECEIVER_ENABLED=true`, `THAIPHC_WRITE_ENABLED=false` **inside a fake sandbox only**. No real Apps Script request is made by tests. Fake Sheet access must stay zero.

### Separate future authorizations
1. Independently verify **both real Script Properties** remain OFF/absent. The existing Web App V3 GET `METHOD_DISABLED` and POST `INGRESS_DISABLED` smoke responses do not validate the write switch.
2. Design an explicitly authorized **manual validate-only HTTP transport** that pins the configured Web App URL, handles Google ContentService redirects safely and validates JSON `accepted/status` (not just HTTP 200). Test access mode and `INGRESS_DISABLED` first. Do **not** switch the real receiver ON merely to run T017 tests.
3. Only after separate approval and source row transfer/privacy decisions, design bounded full-page live source retrieval into memory; `volunteer-gender` village rows and all four person-level datasets remain excluded.
4. Real `mode=commit` is **out of scope**. A later independent Product Owner authorization requires spreadsheet backup, schema/header checks, destination rights, rollback and idempotency review. The existing `ชีต1` is untouched.

**Deployment state:** Web App V3 is already owner-deployed; T017 changes no Script/Deployment/Spreadsheet IDs, source `Code.gs`, Script Properties or Google Sheets.
