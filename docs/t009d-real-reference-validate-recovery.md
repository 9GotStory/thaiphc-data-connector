# T009D — Manual real-reference validate-only delivery and first-write recovery

Tracking: [Issue #53](https://github.com/9GotStory/thaiphc-data-connector/issues/53), same feature. Stage C source audits have already observed `subdistricts=8`, `villages=85`, `health-services=18` with valid schema. The Product Owner handles use permissions; **do not stall implementation with repeat questions on rights**.

## Implemented Stage D — real source rows to Web App in validate mode only

Source row transfer is now a separately gated, *opt-in* Node.js CLI pathway, distinct from the unchanged one-row synthetic sender. It is **not enabled automatically**, and it does not carry `mode=commit`.

```powershell
npm.cmd run cli -- send-reference-validate --endpoint subdistricts --acknowledge-reference-validate
```

**DO NOT RUN until a separate Product Owner authorization for the first genuine real-row POST, and an explicitly bounded receiver-on / write-off test window.** The present user-confirmed Script Properties must remain:

```text
THAIPHC_RECEIVER_ENABLED=false
THAIPHC_WRITE_ENABLED=false
```

The command requires one exact non-echoed TTY phrase: `TRANSFER REFERENCE VALIDATE 5406`, then asks privately for the **ThaiPHC source bearer**, and only if source preflight passes, the **distinct destination HMAC key**. Neither is accepted via command-line flags, environment variables, files or process logs.

Steps in-memory per *single* endpoint:

1. Use previously tested strict bounded source collector, scoped to province 54/district 5406. No person/gender datasets and no arbitrary URL.
2. Enforce known baseline counts **8/85/18**, unique keys, strict original source field schemas and normalized projection; `health-services` must match its API's authoritative `total` over both pages. For unpaginated lookups, current 8/85 are historical observed counts, **not authoritative proof of completeness**. This limited baseline-match policy intentionally blocks any changed counts pending operator review.
3. Construct a fresh T017-compatible signed `mode=validate` batch from the actual in-memory row array. The real-reference transport independently checks that the POST batch matches the verified source snapshot exactly, endpoint and count. The synthetic-only sender is still fixture-locked.
4. Issue **one** HTTPS signed POST to the pinned existing Google Apps Script Web App V3; handle only the pre-reviewed secure Google ContentService redirect with a **bodyless GET** and no retry, even after ambiguous network failure.
5. Accept success only for an exact `VALIDATED` structured protocol response with correct endpoint, full rowCount, accepted=true, all mutation counters and `sheetsWrites=0`; HTTP 200 by itself is not enough.
6. Emit **only redacted summary metadata**. Never print/serialize the snapshot or signed envelope to terminal, GitHub, file or logs. No automatic scheduling.

### Important scope boundary

This is a **real-data validate-only transport implementation**, not a live execution claim and **not a complete production Sync**. In `mode=validate`, the deployed receiver should check the entire batch and HMAC but **must not open or write Google Sheets**; it may write its nonce to a short-lived cache. First actual data persistence awaits separate `mode=commit` code and explicit bounded owner authorization.

In offline CI all HTTP interactions use injected synthetic fetch implementations, test bearer and fake HMAC keys; no real ThaiPHC GET/Apps Script POST takes place.

## Stage E — Backup/Restore and first-write readiness

Destination: the already designated **ThaiPHC Data** Google Sheet. Previous read-only destination inspection found only existing empty `ชีต1`; **no** `Subdistricts`, `Villages`, `HealthServices` tab exists yet. Current receiver code can lazily create these only during a later authorized `mode=commit`; do not create tabs or deploy another project merely to prepare.

When a genuine write trial is separately approved, the operator must first:

1. Turn both ingress/write flags **OFF** and inventory current destination sheet ID, tab IDs, names, headers, row counts and expected key/digest ranges without leaking source data. Confirm `ชีต1` is not to be touched.
2. Create a **full separate copy** of the existing destination spreadsheet with timestamped backup name. Verify new Drive file ID differs from original; reopen copy, compare exact tab structure, original header and nonempty cell counts before trusting it. Record backup file URL in an owner-private change record, **not** in a public log if sensitive.
3. Prove **restore** using a **throwaway copy** before the first production write: with receiver flags OFF, restore known pre-test content and metadata from the backup into that disposable workbook. Verify sheet names, headers, format, row values/formulas where appropriate and row/key counts. A backup without a demonstrated restore path is insufficient.
4. Get a separate explicit Product Owner authorization for a bounded one-endpoint, one-run production write, with exact approved count, destination ID, and execution window. Only then may the operator temporarily set `THAIPHC_RECEIVER_ENABLED=true` and `THAIPHC_WRITE_ENABLED=true` as directed by that independent gate. The present PR provides **no such write command**.
5. After a separately developed write path, compare committed counts, digests and expected values against the approved read snapshot, do not auto-delete missing keys. If partial write, stale data, mixed schema or unknown state occurs, **STOP**, set both flags false, do not blindly retry, and restore *the original destination* from the verified backup, preserving the original spreadsheet ID, ownership/sharing and unrelated tabs. For this initially blank target, remove only the newly created allowed target tabs on separate explicit recovery approval; **never delete `ชีต1`**. If pre-existing data are present at write time, plan range-by-range restoration based on the freshly observed backup instead of assuming the target remains blank.
6. Read back the restored destination and compare it against the pre-write inventory. Never claim atomicity: Apps Script writes may partially complete. Record non-sensitive audit evidence in Issue #53, and turn both gates OFF when complete.

### Stop rules
- Never write to `ชีต1` or rename it.
- Never auto-delete source-missing keys after an incomplete lookup response.
- Never treat 8/85 as an API-guaranteed full snapshot.
- Never send `volunteer-gender` or person-level endpoints downstream.
- Never enable write from this PR: the receiver and current deployment remain unchanged.
- Never export source rows to backup documentation or attach production data/token to GitHub.

This is an implementable operational plan for a **future**, separately approved first-write. No Google Drive copy, Sheet edit, Apps Script deployment, Script Properties change or actual source POST was performed while authoring this document.
