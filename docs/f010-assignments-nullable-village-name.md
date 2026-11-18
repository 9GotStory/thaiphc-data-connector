# F010 Assignments nullable village name correction

The operator's 2026-11-18 read-only audit checked 158 pages / 1,571 rows, with
no geography or candidate-key issues. Its sole type mismatch was 64 string
`villageName` values against a first-page null-only assumption. The remaining
1,507 values were null. The import stopped before any Apps Script POST.

`docs/sheets-schema.json` and `apps-script/ReportReceiver.gs` now agree on
`string_or_null` for Assignments `villageName` only. Nulls and safe strings are
preserved. Numbers, booleans, objects, arrays and unsafe text remain rejected;
the eight existing restricted source fields remain omitted. Diagnostic output
contains only manifest field labels, expected/observed types and issue counts.
Unknown source field names and source values are never echoed.

## Rollout

The local fix alone cannot update the live receiver. The existing pinned V3
deployment was independently listed at version 4 on 2026-11-18. The updater's
`F010_V4_20261117` baseline checks its exact three-file predecessor before any
push, preserves the remote manifest bytes, backs up source first, and updates
only the same deployment ID. It retains clean-main and OFF/PUSH/UPDATE gates.

After merging the exact tested candidate with Windows and Ubuntu Node 26 CI
passing, update the checkout to clean main and keep all three switches OFF:

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\scripts\update-f010-existing-v3-final.ps1 -RepoPath . -RemoteBaseline F010_V4_20261117
```

Pinned receiver report blobs:

- Previous V4: `16915ad2164a3dc9d78f5820a1b042c2150cc663`
- Nullable-name replacement: `1ae3b44d4c676242e43886324a6757c01e87b981`
- Code remains `e542d585d4d4840836c9f1114ac350081ebe5952`.
- The existing V4 manifest remains `e686fbcd6e758a24247f41ec3dac455abfe30ffc`.

Verify the deployed version and exact files after updating, then follow the
single final-UAT runbook for a fresh Assignments plan with current source/count
confirmations. Preserve every prior attempted receipt. Never repeat an
uncertain stage, re-import the accepted reference rows or re-import the
already verified VolunteerGender snapshot. Independent readback is required
after any new report finalizes. Issue #64 remains open.

Local Node 26 offline validation: 345 tests passed, including the full-size
64-string/1,507-null source mix, mixed-null/text signed staging and publication,
PII omission, invalid types/text, schema diagnostics and existing safety gates.
This test result is not a claim of live deployment or report acceptance.
