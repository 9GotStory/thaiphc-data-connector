# T009D — Manual real-reference commit: FIRST-WRITE HOLD

Issue: https://github.com/9GotStory/thaiphc-data-connector/issues/53

This increment adds code and synthetic tests, not a real write. The three reference datasets (8 / 85 / 18) have passed validate-only HTTP; Receiver and Write properties were confirmed OFF. No backup, disposable restore, live commit, or destination change is claimed here.

## Command, only after SEPARATE first-write PO approval

    npm.cmd run cli -- send-reference-commit --endpoint subdistricts --acknowledge-reference-commit

This command is not authorized for execution by the current PR approval. The scope is exactly one manually selected reference dataset at a time, fixed district 5406 and pinned Web App V3. No multi-endpoint job, schedule, arbitrary URL, bearer/HMAC argument, person-level record, or volunteer-gender transfer.

The CLI obtains hidden operator evidence BEFORE any source GET:
1. Exact hidden phrase: BACKUP VERIFIED RESTORE TESTED 5406. **Operator attestation only**; does not mean this CLI independently queried Drive or verified the backup.
2. Different backup spreadsheet copy ID (must not equal canonical target, no ID shown in output).
3. Exact endpoint confirmation: COMMIT subdistricts 8 ROWS 5406; for villages use 85; for health-services use 18.

Only then collect one genuine scope-pinned ThaiPHC source snapshot using private Bearer, inspect rows and schema in memory, require observed 8/85/18 and strict key checks; health-services needs its two pages and API total. Other two have no authoritative total, so 8/85 is a conservative stop-on-change rule, not completeness proof. Obtain separate hidden HMAC key after source passes. Build a fresh HMAC-signed COMMIT envelope matching the projected snapshot exactly, then at most one HTTPS POST to existing Web App V3 and only allowlisted Google redirect via bodyless GET.

Receiver status COMMITTED is not considered proof of persisted state: emit COMMIT_REPORTED_READBACK_REQUIRED and destinationReadbackVerified:false with inserted/updated/unchanged/write-call counters. Require independent Google Sheets readback/reconciliation and exit the CLI nonzero deliberately. Reply counters must match inserted+updated+unchanged=expected batch rows and sheetsWrites=updated+(inserted>0?1:0) per reviewed receiver.

On POST timeout, lost reply, unexpected 5xx, malformed response, unsafe redirect or receiver REJECTED, output OUTCOME_UNKNOWN_STOP. The receiver might have performed some writes, so **never retry automatically** or presume rollback; stop, close flags, inspect and restore by separate approval. A pre-write WRITE_DISABLED / INGRESS_DISABLED denial is a STOP too.

## Backup and restore DRILL (not performed by PR)

Before FIRST live write and while both Apps Script properties are OFF:
1. Independently verify the exact existing destination Spreadsheet ID and V3 deployment/project identity; cross-check THAIPHC_SPREADSHEET_ID privately with the canonical target.
2. Read-only inventory the original spreadsheet: tab names, IDs, headers, formats, values/formulas, row/key/digest counts and restricted sharing. Previously only an empty ชีต1 was present; verify again, don't assume it remains blank.
3. Create a full timestamped Drive COPY, different spreadsheet ID. Open it and compare tab structure, data, formats and any formulas; store proof privately, never secrets/source rows in GitHub.
4. On a disposable third workbook, demonstrate actual restore from the verified backup. Read back for equivalence. A backup without tested restore does not clear this gate.
5. Obtain explicit PO authorization for exactly one bounded first-write endpoint/window, with backup proof and a verified restoration procedure. Only then, privately enable BOTH Receiver and Write gates for the approved window. This PR cannot toggle flags.
6. After live commit, promptly disable both gates even if unknown or failed. Read back actual original Sheet by ID and compare source keys/values/digests, header order, number formatting, record totals, unrelated tabs and ชีต1 untouched. Accept only after independent reconciliation. If incomplete, stop and use an explicit owner-approved recovery restoring the ORIGINAL ID and unrelated content rather than blindly delete or recreate tabs.

Receiver writes are NOT transactional: it updates existing keyed rows one by one then appends. There is no automatic deletion of source-missing keys, no durable replay ledger and no guaranteed rollback. Do not retry after a lost response.

## Gate status

- Offline synthetic commit sender/transport/tests: Draft PR, pending review and CI.
- Real validate-only 8 + 85 + 18: PASS, closed.
- First-write backup and recovery test: NOT YET DONE.
- Any real COMMIT, Sheet mutation or restore: NOT APPROVED and NOT EXECUTED.
- Stage Issue #53: OPEN.

Both properties must remain false now. Existing Apps Script code, deployment, target configuration, Google Sheets, and CI workflows must not be changed in this PR.
