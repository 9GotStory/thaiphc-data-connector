# F010 receiver rejection diagnostics

## Observed operator-session failure (2026-11-17)

The first VolunteerGender import stopped at `report-start` with
`STAGE_OUTCOME_UNKNOWN_STOP`. Nine source GETs, one stage POST and one receipt
GET were recorded. No chunk/finalize was attempted; independent inspection
found no report/current-pointer tabs in the intended original workbook.

Separate, non-writing checks established:

- The existing V3 GET/ContentService path returns the expected JSON protocol.
- The existing fixture-locked synthetic `validate` route returns `VALIDATED`
  using the protected Windows HMAC. It sends no real source row and cannot
  access/write Sheets in the verified receiver.
- A fresh, nonexistent diagnostic run with finalize-only metadata returned
  `REPORT_DESTINATION_NOT_CONFIGURED`, accepted=false and sheetsWrites=0.
  The verified receiver rejects this guard failure before opening a workbook;
  a missing run also fails before any write. This was not a retry of the failed
  report-start, and no start/chunk or person rows were sent by this probe.

At least one configured destination ID or the exact same-workbook approval is
missing/incorrect. This is not a Bearer, HMAC or transport diagnosis. The report
guard response also means the three enable checks passed at that inspection;
an operator completing a terminal prompt is not independent proof that flags
are OFF on the server.

## Actionable error output without weaker transfer gates

The sender now retains an optional `receiverStatus` for exact, allowlisted
receiver rejection schemas. It exposes only the code, never the response text,
unknown fields, source rows, signatures, destination IDs or run IDs. Report
rejections must match the current endpoint/run and applicable chunk counters.

For example, an exact `REPORT_DESTINATION_NOT_CONFIGURED` response still returns
`status: STAGE_OUTCOME_UNKNOWN_STOP`, `accepted: false`, the attempted stage and
`receiverStatus: REPORT_DESTINATION_NOT_CONFIGURED`.

This field is a diagnostic, not acceptance or permission to retry. A rejection
after earlier chunks does not undo their writes; generic `REJECTED` may follow
a partial write. Every attempted plan remains blocked from resubmission and
all ambiguous/partial outcomes still require independent reconciliation.
Malformed, extra-field or mismatched responses remain unknown and unprinted.

## Existing-workbook setup correction

With all three enable flags false, privately set
`THAIPHC_REPORT_SPREADSHEET_ID` to the actual pinned original workbook ID, not
the name of another Script Property or explanatory placeholder text. Set
`THAIPHC_SAME_WORKBOOK_APPROVAL` to the exact value
`OWNER_ONLY_5406_APPROVED`. Save in the existing Apps Script project's settings.
Keep the original workbook owner-only. No deploy is needed to correct Script
Properties; never repeat reference writes or an uncertain stage to test them.

This sender-only change does not modify the deployed V3 source or enable any
switch. Follow the existing final-UAT runbook after the configuration and the
failed run have been reconciled. Issue #64 remains open.
