# Feature 010 — complete 8-topic ThaiPHC manual connector code candidate

Issue: https://github.com/9GotStory/thaiphc-data-connector/issues/64
Draft PR: https://github.com/9GotStory/thaiphc-data-connector/pull/65

## User-approved goal

Complete **implementation for all 8 API topics**, run only developer-side mocked/CI verification during construction, then **ONE operator Final UAT** to verify real ThaiPHC transfers, Apps Script Web App V3 and Google Sheets. Do not require intermediate user testing or move real people into Sheets before final data-owner approval and source/destination permissions are confirmed.

## Existing accepted production baseline (must stay untouched)

Original `ThaiPHC Data` workbook: `Subdistricts` 8, `Villages` 85 and `HealthServices` 18, total **111** data rows. User-attested both `THAIPHC_RECEIVER_ENABLED` and `THAIPHC_WRITE_ENABLED` FALSE after the accepted transfers. These three reference APIs and the original `ชีต1` have **no new source write route** under F010; do not re-run the three original first-writes.

## Engineering implementation in F010

| Component | Files | Behavior |
|---|---|---|
| Five-report bounded reader | `src/sync/extended-report-source.mjs` | Opt-in HTTPS GET, explicit authorization, exact scope, bounded pages, raw person rows kept only within private in-memory staging caller |
| Source audit | `src/sync/extended-report-audit.mjs` | Pagination completeness, district 5406, stable identity for 3 person reports, gender totals, source type/shape, small cells, Family relation/anomalies |
| Minimized projection | `src/sync/extended-minimized-projection.mjs` | Excludes `RESTRICTED_DEFAULT_OMIT` fields, keyed domain-separated HMAC pseudonyms, gender complementary suppression, Family **run-scoped** (no upsert) identity |
| Immutable chunk plan | `src/sync/extended-batch-plan.mjs` | Up to 2,500 rows; 25-row/125KB chunks and per-chunk/run SHA-256 digests; limits canonical JSON per Sheet cell |
| Signed sender | `src/sync/extended-report-transport.mjs` | Existing V3 URL, HMAC for every start/chunk/finalize, allowlisted Google redirect, one attempt per stage, no automatic retry or acceptance without readback |
| Private V3 receiver | `apps-script/Code.gs` and `apps-script/ReportReceiver.gs` | Existing reference protocol remains intact. New report modes require ALL THREE private/ingress/write switches; **different restricted workbook**, pre-publication digest verification, versioned tabs and current-pointer index |
| CLI | `src/cli/index.mjs`, `src/cli/live-tty.mjs` | `audit-extended` READ ONLY, `private-report-commit` exact final-UAT confirmations; no token/HMAC argv, no raw person logs. Old `commit-menu` options 4–8 stay blocked to prevent accidental personal transfer |
| Deployment | `scripts/update-f010-existing-v3-final.ps1` | One final owner-run source backup, exact Git preimage check, three-file allowlist, three OFF flags, update ONLY existing V3; never run from CI |
| Testing | `tests/extended-*.test.mjs`, `tests/apps-script-extended-receiver.test.mjs`, `tests/f010-release-contract.test.mjs` | Synthetic person data, mocked HTTP/Sheets, E2E signed staging, scope/PII/privacy, digest mismatch, unauthorized/partial result stop and immutable SHA pins |

## Report datasets

| Source | Historical count only | Target data policy | Publishing rule |
|---|---:|---|---|
| `volunteer-gender` | 85 village rows | Village aggregate only, suppress both male/female values if either is below 5; suppress total if below 5 | Valid complete snapshot; privacy review and private workbook |
| `assignments` | 1,571 | Minimized status/geography; HMAC pseudonym, omit names/national IDs/volunteer IDs | Complete versioned snapshot; no partial publication |
| `volunteer-family` | 1,803 | Minimized geography/relation status, no personal names, address or national IDs; **no verified source relation key** | New immutable complete snapshot only; never guessed-key upsert |
| `resigned-volunteers` | 1,150 | Minimized status/retirement info, HMAC pseudonym; no direct identifiers | Complete versioned snapshot |
| `volunteer-tenure` | 1,571 | Minimized duration/year/geography, HMAC pseudonym; no direct identifiers | Complete versioned snapshot |

The historical counts are not live source authority. Source data may change. In particular the supplied Family source sample contains geographic mismatches and no unique relation key; the audit will **STOP** instead of silently deleting/fixing them. That is a genuine source-quality/approval gate at final UAT, not a reason to invent identity semantics.

## Security, limitations and final UAT

- Use a **separate restricted Google Sheets workbook** for five report datasets; do not use the broadly shared original reference workbook as a person data sink. A hidden tab does not enforce read permission. `THAIPHC_REPORT_SPREADSHEET_ID` must be configured privately and must differ from `THAIPHC_SPREADSHEET_ID`.
- New `THAIPHC_PERSON_DATA_WRITE_ENABLED` switch defaults **OFF**. The existing Receiver/Write flags must also be OFF except in the exact separately approved Final UAT window. GitHub CI has no OAuth, token, write keys or live destination use.
- Snapshot stages in a restricted workbook are hidden until completed. Only the `_ThaiPHCReportCurrent` pointer identifies a verified complete snapshot. This is **not an ACID transaction**; a failed stage can remain hidden. Unknown responses require independent inspection, **never automatic retry**.
- No automatic deletion: the owner decides retention, legal purpose, access and cleanup for superseded snapshot tabs. Do not assert that merely having a Bearer token proves retention approval.
- Old legacy update script is intentionally pinned to earlier receiver blobs, and is **not suitable for F010**. The new F010 updater verifies all three reviewed file blobs; no new deployment ID is created.
- Draft code and successful mock CI do **not** mean the updated V3 is live or all five reports have been persisted/accepted. Real Google access, private destination setup, data-owner controls and independent verification occur **once at final UAT**.
- **[One final UAT runbook](f010-one-final-uat.md)** is the canonical procedure. If the Family source still includes incompatible geographic relations, UAT remains HOLD until that source/owner decision is resolved.

**Release status:** code staged in Draft PR #65; do not merge/Deploy or change Script Properties without the separate release gate. Issue #64 closes only after the independent final eight-dataset acceptance.
