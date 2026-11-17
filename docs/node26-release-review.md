# Node 26 release review and final-UAT checklist

The [PR #66 preparation packet](f010-final-uat-preparation.md) records the dated PR/CI check, Windows verification and pending operator evidence for this candidate.

## Reviewed baseline

This release follow-up is based on merged Feature 010 main
`e1ae9596b71cbe4fe95ab26666bc62cd2516e594` (PR #65), not the older
reference-only local checkout at `7c9334a`. The canonical implementation is
[Feature 010](feature-010-eight-api-ingestion.md) with the
[one final eight-API UAT](f010-one-final-uat.md).

The existing documented production acceptance is **111 reference rows**:
Subdistricts 8, Villages 85, HealthServices 18. This is historical independent
acceptance recorded by the operator, not a fresh live verification by this review.
Never repeat those three first-writes. All five report imports remain pending
live deployment, owner approval and independent final readback.

## Runtime and engineering changes

- Node **26.x** is the required major in package engines and `.node-version`.
  GitHub Actions tests this same major on Ubuntu and Windows.
- The offline `release-plan` matches F010: re-read all three accepted reference
  datasets without resending, five approval-gated private snapshots, all three
  OFF switches, and one POST attempt per signed stage. It grants no live authority.
- Reviewed receiver blob tests normalize CRLF/LF only. Their immutable source
  content pins and the preimage guard remain enforced.
- The staged sender shares the existing strict Google ContentService redirect
  validator, including the port restriction. Each successful receipt has exact
  stage fields, row count and write count. Invalid UTF-8 responses stop the run.
- A chunk plan owns frozen copies of rows and manifest arrays. An attempted
  in-memory transfer plan cannot be submitted again. Ambiguous results still
  require inspection; a new invocation is not permission to retry.
- Queued receiver requests recheck all applicable OFF switches after acquiring
  the script lock. Private imports require valid reference and report workbook
  identifiers. Different IDs are the default; same-workbook use requires the
  exact `THAIPHC_SAME_WORKBOOK_APPROVAL=OWNER_ONLY_5406_APPROVED` property and
  independent owner-only sharing verification before each report.

All verification uses synthetic HTTP and Sheets. No ThaiPHC request, source-data
transfer, DPAPI access, Apps Script deployment, workbook creation or live switch
change is part of engineering checks.

## Final-UAT scope

| Dataset | Implementation | Required final evidence |
|---|---|---|
| Subdistricts | Previously accepted reference flow | Re-read 8 accepted rows; do not resend |
| Villages | Previously accepted reference flow | Re-read 85 accepted rows; do not resend |
| HealthServices | Previously accepted reference flow | Re-read 18 accepted rows; do not resend |
| VolunteerGender | Private complete snapshot, complementary suppression | Actual source total, suppressed cells, private snapshot/pointer readback |
| Assignments | Minimized private snapshot, keyed pseudonyms | Complete pages, source total, unique pseudonyms and independent readback |
| VolunteerFamily | Run-scoped complete snapshot; never guessed-key upsert | Source geography reconciled, complete pages and independent readback |
| ResignedVolunteers | Minimized private snapshot, keyed pseudonyms | Complete pages, source total, unique pseudonyms and independent readback |
| VolunteerTenure | Minimized private snapshot, keyed pseudonyms | Complete pages, source total, unique pseudonyms and independent readback |

Family has an implemented snapshot path. It must still HOLD if the source has
the documented incompatible geographic relations. Do not silently repair/drop
records or describe the whole project as accepted when that remains unresolved.

## Receiver candidate pins

| File / guard | Git blob SHA-1 |
|---|---|
| Code.gs | `e542d585d4d4840836c9f1114ac350081ebe5952` |
| ReportReceiver.gs | `16915ad2164a3dc9d78f5820a1b042c2150cc663` |
| appsscript.json | `a8134a3237b2dce1f54ce16a943fbe3e232ce436` |
| Original F009-reviewed Code.gs preimage | `f7d878389fe46cfde8619f75a1f9746f45b469a3` |
| Observed existing-V3 Code.js preimage (2026-11-17) | `abc71275ab30dca1f57d1d0e33b8c2773452a194` |
| Observed existing-V3 manifest preimage (2026-11-17) | `e686fbcd6e758a24247f41ec3dac455abfe30ffc` |

Use only the F010 three-file guarded updater during the approved final session.
The older updater intentionally rejects this receiver. An unexpected remote
preimage is a STOP condition; the review does not claim the candidate is live.
The observed V3 needs `-RemoteBaseline EXISTING_V3_20261117`, which accepts only
the exact observed Code/manifest pair. Both modes preserve the verified remote
manifest bytes, including existing V3 `executeAs`/`access`; no arbitrary hash
override or deployment access change is provided. The earlier read-only pull
was backed up before any source push; its mismatch with the original F009
assumption was investigated, not ignored.

## Acceptance record to complete once

- Exact reviewed/merged release SHA and passing Node 26 CI for that SHA.
- Node patch version, Windows local test result and redacted operator identity.
- Existing V3/source preimage and restricted report-workbook access/retention;
  same-workbook use also needs exact approval and owner-only sharing evidence.
- Explicit permitted report categories, minimized fields and source-transfer rights.
- Operator-attested all THREE switches OFF before update, after each run and at end.
- Per-report source rows/pages, chunk count, stage outcome, manifest digest and
  independently verified snapshot/current-pointer count. No names, IDs, token,
  HMAC, signatures, payloads or source rows in the acceptance record.
- Reference 8/85/18 counts and unrelated-tab survival.
- `FINAL_UAT_ACCEPTED` only after all eight datasets reconcile; otherwise
  `FINAL_UAT_HOLD` and the precise source/access/readback blocker. Keep Issue #64
  open until the separate Product Owner closeout decision.
