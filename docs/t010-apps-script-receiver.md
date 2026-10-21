# T010 — ThaiPHC Apps Script Receiver (existing user-owned project)

**Status:** SOURCE WRITTEN, **NOT INSTALLED / NOT DEPLOYED / NOT ENABLED**.  
**Issue:** [#37](https://github.com/9GotStory/thaiphc-data-connector/issues/37)  
**Destination already confirmed (read-only via connected Drive):** Google Spreadsheet title **ThaiPHC Data**, time zone `Asia/Bangkok`, currently only `ชีต1`. The actual Spreadsheet ID and Script/Deployment IDs were supplied privately in conversation and are intentionally **not embedded in Git**.

## 1. Source files / deployment boundary

- `apps-script/Code.gs`: complete standalone Apps Script V8 Web App receiver source. It has `doPost(e)` plus `doGet()`; no 3rd-party packages.
- `apps-script/appsscript.json`: V8 manifest, minimal spreadsheet and Script Properties scopes. This is a source file, **not** proof that the existing Apps Script project has already been updated.
- `tests/apps-script-receiver.test.mjs`: Node.js `node:vm` synthetic mocks exercising the **identical GAS source**, HMAC, row validation and a **fake** SpreadsheetApp implementation. Tests do **not** open Drive or send HTTP.

**Safety defaults:** If `THAIPHC_RECEIVER_ENABLED` is not exactly `true`, every HTTP POST returns `INGRESS_DISABLED` before parsing any request. If only the receiver is enabled, authenticated `mode=validate` works without opening Sheets, but `mode=commit` returns `WRITE_DISABLED` until a separate `THAIPHC_WRITE_ENABLED=true` setting is expressly approved. No automatic scheduling, deployment or hidden Sheets update.

**Important:** This is new code to be **installed into the existing Script ID after separate approval**, not source recovered from that existing project. The existing **Deployment ID must not be treated as updated**; a script edit and deployment version are separate operations.

## 2. Allowed datasets and default isolation

| Source | Exact proposed tab | Original T003 fields | Key | Per-request limit |
|---|---|---:|---|---:|
| `subdistricts` | `Subdistricts` | 12 | `code` | 20 |
| `villages` | `Villages` | 20 | `code` | 150 |
| `health-services` | `HealthServices` | 16 | `health_service_code` | 100 |

All writes (if later explicitly enabled) require a **separately configured spreadsheet ID** in Script Properties and target only these exact tabs. Missing tabs are created lazily; existing `ชีต1` is not renamed/deleted/edited. Existing expected tabs with unknown/mismatched headers are **rejected**, not overwritten. Existing reference keys are updated in place; new keys are appended; unseen old keys are **never auto-deleted**. Value and presence round-trip follow T003 `_field_presence_json` semantics. The eight T003 metadata headers are explicitly supported.

Out of scope/always rejected: `volunteer-gender` village-level counts (privacy/small-cell gate) and `assignments`, `volunteer-family`, `resigned-volunteers`, `volunteer-tenure` person-grain records. The existing Node.js CLI's source Live Fetch behavior remains aggregate-output only and **does not yet provide full live row batches** for this receiver. A **separate sender feature** is needed before the original end-to-end Manual Sync goal can be executed.

## 3. Exact signed request contract (proposed V1; not yet live)

Apps Script Web Apps do not expose an arbitrary incoming `Authorization` header to `doPost(e)`. Hence the independent Node → Apps Script authentication is **HMAC-SHA256 in the JSON POST body**, NOT reuse of the ThaiPHC bearer.

The entire request `application/json` has exactly:

```json
{
  "version": "THAIPHC_SYNC_V1",
  "timestamp": 1792576800000,
  "nonce": "an_unpredictable_nonce_of_length_24",
  "payloadB64": "<standard base64 encoded UTF-8 JSON batch>",
  "signature": "<standard base64 HMAC SHA-256>"
}
```

**These are format examples; the timestamp/nonce/signature above are not a working request.** The sender must use its current clock and new cryptographically random nonce per request. No token is put in the URL or command arguments. Signing input is the **literal UTF-8** string:

```text
THAIPHC_SYNC_V1\n{timestamp}\n{nonce}\n{payloadB64}
```

Compute `base64(HMAC_SHA256(raw 32-byte shared secret, signing input))` using the shared 32-byte secret. The secret is stored as **standard base64** in a Script Property and entered separately in the future Node sender via a confidential channel; never commit it, log it, or send it in a GitHub issue.

The decoded `payloadB64` JSON has exactly:

```json
{
  "schemaVersion": "0.1.0",
  "mode": "validate",
  "endpoint": "villages",
  "scope": {"provinceCode": "54", "districtCode": "5406"},
  "runId": "a-unique-nonsecret-run-id",
  "fetchedAtUtc": "2026-10-21T00:00:00.000Z",
  "sourceFieldNames": ["<ALL 20 EXACT names from T003, in order>"],
  "rows": [
    {
      "key": "<synthetic-reference-key>",
      "values": ["<source-value-aligned-with-headers>", "..."],
      "presence": {"<every approved source field>": "VALUE"}
    }
  ]
}
```

This abbreviated example illustrates shape **only**, not a valid full row. Valid `rows` are the exact in-memory T009C projected reference rows. `mode` may only be `validate` or separately approved `commit`. `runId` is nonsecret, 8–64 `[A-Za-z0-9_-]` characters; `fetchedAtUtc` is an ISO UTC timestamp.

The receiver limits body bytes/characters, HMAC verifies the **encoded payload itself**, compares signature bytes without early-exit, requires a timestamp within 5 minutes, and refuses nonce reuse through a 10-minute Apps Script script-cache entry while guarded by `LockService.getScriptLock()`. **CacheService is best-effort and is not a durable replay ledger**; idempotent keyed updates help prevent duplicates, but operational replay/nonrollback protection must not be overstated. Deploy using HTTPS only.

Apps Script ContentService may return a logical rejection with HTTP 200 and may redirect a successful response through Google-owned infrastructure. The future sender **must parse the JSON `accepted` and `status`**; it must not equate HTTP 200 with success and must never forward the ThaiPHC Bearer or HMAC secret through an unchecked redirect. Do not automate the sender until its Google Apps Script behavior is explicitly tested.

## 4. Installation plan (NOT executed by ChatGPT)

1. **After PR review/explicit approval**, open the **existing** Apps Script project whose Script ID you provided. Do not create a separate project, replace the existing Deployment ID, or change any deployed Web App until specifically authorized.
2. Add or replace `Code.gs` using `apps-script/Code.gs` and review `appsscript.json` (manifest visible in Apps Script project settings). Do not put IDs/credentials in code.
3. In Apps Script **Project Settings → Script properties**, add these values, privately:
   - `THAIPHC_SPREADSHEET_ID` = the **existing** `ThaiPHC Data` spreadsheet ID you supplied.
   - `THAIPHC_HMAC_KEY_B64` = your own **new random 32-byte key** encoded as standard base64. One local Windows command to generate it: `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"`. Never post the output in chat/issue/CI logs; do not reuse a ThaiPHC token.
   - `THAIPHC_RECEIVER_ENABLED` = `false` by default.
   - `THAIPHC_WRITE_ENABLED` = `false` by default.
4. Obtain separate owner approval before enabling **signed validation-only** or deploying/updating a Web App. If a real `commit` test is later approved, **back up the spreadsheet first** and verify the intended tab/header/access; only then explicitly enable `THAIPHC_WRITE_ENABLED`.
5. Do not install triggers, enable automatic refresh, share the spreadsheet publicly, or log/copy any real raw API rows to GitHub. When deploying, use the least exposed access mode that actually supports your Node client; "Execute as me" + public URL grants the script owner's Sheets rights to the handler, so the HMAC secret's protection is essential and must be tested carefully.

## 5. Sheet storage behavior / limits

Before mutating anything, the handler authenticates and validates all incoming rows, strict headers/field kinds, declared geographic scope, duplicate source keys and mode. Each approved new tab has the source columns in exact T003 order and these eight metadata columns:

`_schema_version, _sync_run_id, _source_key, _fetched_at_utc, _quality_status, _field_presence_json, _last_seen_run_id, _row_digest`

Identifiers and other text cells receive plain-text number formatting before first write; formula-like strings beginning with `=,+,-,@` or ASCII controls are refused rather than interpreted by `Range.setValues`. The 0/0 facility coordinates are preserved as source placeholders and **must not be plotted as usable map coordinates**. Nested facility JSON is stored as text, not exploded.

A commit updates changed keyed rows individually and appends new keyed rows as one bounded block. It **does not perform full transactional rollback** if Google rejects a write mid-run, and it does not delete missing old keys. Each next run can re-upsert, but a manual backup and inspection are required before real writes. It makes no claim that a source dataset is complete just because the POST has valid JSON: the separate authorized Node fetch/pagination layer must validate completeness before sending.

## 6. Test / readiness gates

Run `npm.cmd test` in Windows PowerShell on the associated PR branch after review; all T010 tests use **synthetic** source rows, local HMAC fixtures, an in-memory fake `SpreadsheetApp`, and the exact `Code.gs` loaded in `node:vm`. The tests must pass on Node.js 24 CI.

**Not yet done:** installed source in the user's Script ID; actual `doPost` HTTP request; authenticated dry-run over the deployed endpoint; live ThaiPHC row export; live Google Sheets writes, recovery/restore UAT or an end-to-end real-data sync. Those steps require separate approval. Existing spreadsheet tabs/data and deployment remain unchanged by this PR.
