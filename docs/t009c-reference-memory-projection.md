# T009C — Reference Row Memory Projection (synthetic-only)

**Issue [#33](https://github.com/9GotStory/thaiphc-data-connector/issues/33) · No live source call, no data transfer, no persistence**

## Purpose and limits

T009A local operator testing (142/142 PASS and `sync-plan` showing 8 non-writable targets, zero requests/posts/writes) verifies the **offline gate**, not an Apps Script destination. T009B [audit](t009b-apps-script-contract-audit.md) confirms **the actual Apps Script receiver and authentication contract are unverified**.

To prepare a narrow later integration without inventing a receiver, this task adds only a **pure function** `projectReferenceRows(endpoint,rows,manifest)` in `src/sync/reference-projection.mjs`. This function **accepts already-present objects in memory**; it performs **no GET, POST, token prompt, I/O, spreadsheet mutation or CLI output**. It is not wired into `live-fetch` or `sync-plan`. Development/tests use **synthetic fixtures only**. It has **not** processed or serialized live ThaiPHC reference rows.

## Allowed inputs and T003 draft projection

Only the three reference datasets are supported:

| Endpoint | Proposed tab | Original case-sensitive source field count | Proposed key | In-memory row limit |
|---|---|---:|---|---:|
| `subdistricts` | `Subdistricts` | 12 | `code` | 20 |
| `villages` | `Villages` | 20 | `code` | 150 |
| `health-services` | `HealthServices` | 16 | `health_service_code` | 100 |

These are **conservative local limits, not confirmed API-provider or Apps Script limits**. The input T003 manifest must still be in `DRAFT_DESIGN_ONLY` state with all 8 known tab/gate definitions and `DESIGN_ONLY_NO_WRITES`. The accepted inputs are **not** claims of fetched page completeness.

For each injected row the function checks:
- Exact source field allowlist (including observed spelling and case), identifier keys as **strings**, scoped province 54/district 5406 and 8 known subdistrict codes; unique keys within the injected set. Does **not** infer names/joins.
- Non-null observed field types from T003. `null_only` fields accept `null` or *absent*, not unverified values. Distinguishes `ABSENT`, `NULL`, `VALUE` for every source field; an empty source string is `VALUE` and remains empty, not null.
- Numeric types remain numbers, leading-zero IDs remain **strings**. Text with ASCII controls or formula-like leading `=,+,-,@` is **rejected** at this provisional stage, not silently escaped or coerced. Text cells are limited to 32,767 characters; this does not constitute a Google Sheets write-safety proof.
- `health-services` nested top-level `health_service_type`, `province`, `district`, `subdistrict` and `service_areas` are deterministic JSON *text* in memory (object keys sorted; original array order kept, bounded depth/size). The function does not certify semantic facility catchment from nested `service_areas`.
- Facilities with latitude/longitude of `0/0` are **counted as placeholders**; no geographic position is invented. Nonzero values are in coordinate ranges but not independently verified geospatial accuracy.

Returned data remains **in-process only** in `rows[].values` (aligned with `sourceFieldNames`) plus `rows[].presence` and `rows[].key`. It is intentionally **not** a production POST body or spreadsheet write request. Do **not** print this return object in a CLI, paste it into GitHub, log it, save it to a file, or send it to a receiver: it may contain reference source values and nested service areas in later uses.

The return object explicitly states `status=NOT_READY_FOR_TRANSFER`, `destinationContract=UNVERIFIED`, `snapshotCompleteness=NOT_VERIFIED`, `writeAllowed=false`, `metadataColumns=UNIMPLEMENTED`, `networkRequests=0`, `appsScriptPosts=0`, `sheetsWrites=0`. There is **no** ability to turn these status flags to writable using command flags or an authorization claim.

## Blocked endpoints and remaining work

**Always rejected here**: `volunteer-gender` (even though its source data are village-level aggregates, granular values require a separate small-cell privacy decision); `assignments`, `volunteer-family`, `resigned-volunteers`, `volunteer-tenure` (person level). The public `live-fetch` CLI stays aggregate-output-only and person-grain-denying.

This pure function **does not** verify:
- That an injected set contains all pages/rows of a snapshot or that live API permissions allow downstream sharing.
- That the destination has any actual spreadsheet tab or the proposed eight metadata columns, or that its HTTP handler understands a particular JSON format.
- That a spreadsheet API uses RAW/PLAIN_TEXT safely rather than evaluating strings as formulas, or that rollback, idempotency, replay prevention and retention are implemented.

**Next gate:** verify the **actual** Apps Script receiver source/contract or receive explicit approval for a new isolated DEV receiver; only then design a separate synthetic-only adapter and staged writing tests. A separate Product Owner/authorization approval is required before any real source-row transfer or Sheets mutation.

## Engineering checks

Use `npm.cmd test` on Windows or `npm test` with Node.js 24. The new T009C tests cover valid synthetic projected rows, source field order, presence semantics, nested deterministic JSON, preserved code strings, zero-coordinates metadata, duplicate/out-of-scope/unknown field refusal, huge/unsafe cells, disabled datasets, tampered manifest and no network/write implementation.

**No Merge, deployment, Apps Script calls, Sheets access or live data import is authorized by this task.**
