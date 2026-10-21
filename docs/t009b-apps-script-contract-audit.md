# T009B — Apps Script Receiver Contract Audit (read-only)

**Status: HOLD — ACTUAL_APPS_SCRIPT_RECEIVER_UNVERIFIED**  
**Scope:** ThaiPHC `54/5406` → Node.js Manual CLI → Apps Script → Google Sheets  
**Audit date:** 2026-10-21; Issue [#31](https://github.com/9GotStory/thaiphc-data-connector/issues/31).

## 1. What was actually verified

| Evidence examined | Supported finding | What this does **not** establish |
|---|---|---|
| Repository `9GotStory/thaiphc-data-connector`, `main` `d0840ef118c7d23d8538f8d6844165189f1cd832`, complete recursive Git tree (60 entries, not truncated) | No receiver `.gs` source, `.clasp` configuration, or connected Apps Script service implementation present | Apps Script does not exist anywhere else |
| `docs/architecture.md` | Node.js → authenticated Apps Script → Sheets is a **proposed** architecture | A deployed `doPost`, endpoint URL or receiver contract |
| `docs/sheet-schema.md`, `docs/sheets-schema.json` v0.1.0 | Eight **proposed** logical tabs with case-sensitive columns, candidate keys, null-presence design and 8 proposed metadata fields | Actual destination tabs, headers, owner, approvals or upsert behavior |
| Existing `src/cli/live-*.mjs`, `src/cli/index.mjs` | Four manually approved, bounded **read-only** source fetchers; output is counts/aggregates only | Transfer-ready source rows, payload encoder, Apps Script sender or any write |
| Operator-reported Live UAT, recorded in Issues #25/#27 and earlier T005/T006 issues | Subdistricts=8, villages=85, health-services=18 (all zero coordinates), volunteer-gender=85 village report rows and district sum 1,571 (387 male, 1,184 female) | Downstream transfer/store rights or agreement with a deployed Sheets schema |
| Connected Drive metadata search for `thaiphc`, `Apps Script`, `API` | No matching, verified **project-specific ThaiPHC Apps Script receiver** identified from accessible results | No private Apps Script project exists; unrelated Smart SRRT source can be reused |
| [Issue #29](https://github.com/9GotStory/thaiphc-data-connector/issues/29) / [PR #30](https://github.com/9GotStory/thaiphc-data-connector/pull/30) | T009A offline-only `sync-plan` preflight exists **in an open PR**, not yet merged into `main` | Any merged integration or destination approval |

This is a **source availability finding**, not a proof of nonexistence. Do not substitute the Apps Script project used by Smart SRRT: it is another system with a different purpose, schema and security boundary.

## 2. Source-to-destination boundary (known versus missing)

The T003 **design proposal** would map source datasets as follows; it is not an observed receiver schema:

| ThaiPHC source | Proposed Sheets tab | Candidate key | Status for transport |
|---|---|---|---|
| `subdistricts` | `Subdistricts` | `code` | **HOLD** — actual destination contract and authorization absent |
| `villages` | `Villages` | `code` | **HOLD** — actual destination contract and authorization absent |
| `health-services` | `HealthServices` | `health_service_code` | **HOLD** — source `village_no` is opaque text; zero coordinates unusable; destination contract absent |
| `volunteer-gender` | `VolunteerGender` | `provinceCode+districtCode+villageCode` | **HOLD** — village-level small-cell/privacy review and destination contract required |
| `assignments`, `volunteer-family`, `resigned-volunteers`, `volunteer-tenure` | Corresponding T003 proposal tabs | Person-related; `volunteer-family` has no verified row key | **DISABLED** — do not move personal rows |

Read-only Live Fetch currently emits **only safe summaries**. It discards source rows in memory; this is an intentional security property and cannot be treated as an already working row-to-Sheets pipeline. A future reference-row transfer requires a **separate** deliberately scoped transient in-memory projection, validation, and approved destination.

### Unverified receiver contract — do not guess any of these

| Required evidence | Current fact | How to verify later without credentials |
|---|---|---|
| Receiver identity and version | **UNKNOWN** | Link to existing Apps Script project source or appropriate GitHub repo and reviewed commit; or explicit declaration that none exists |
| `doPost` / deployment availability | **UNKNOWN** | Review receiver source and documented deployment type; never invent a URL |
| Expected request shape and allowed dataset IDs | **UNKNOWN** | Inspect handler/schema validator and its synthetic example; no real tokens/data |
| Response/error format, status semantics | **UNKNOWN** | Inspect source/tests and accepted/rejected synthetic cases |
| Destination authentication | **UNKNOWN** | Identify actual secure method, who controls it, nonce/replay protection; **never reuse ThaiPHC Bearer** |
| Destination spreadsheet identity, ownership, tabs and column headers | **UNKNOWN** | Read approved destination metadata only after identifying the real Sheet and owner; do not infer from draft |
| Row-grain, key/upsert, empty/null/absent rules | **UNKNOWN** | Compare actual receiver behavior against T003; design alone is not implementation |
| Limits, retries, idempotency, atomicity and rollback | **UNKNOWN** | Review handler implementation and test with fake payloads only |
| Small-cell privacy, field minimization, access and retention | **UNAPPROVED/UNVERIFIED** | Owner/privacy reviewer decides before sharing village counts or person data |
| Separate authorization to transfer or write | **NOT EVIDENCED** | Explicit, traceable decision from responsible owner/operator before real transfer |

**No fixed request JSON can be truthfully called the actual contract at this point.** A conceptual structure mentioned in earlier planning is **not** evidence that a deployed receiver understands it.

## 3. Compatibility review to perform once source is identified

1. Inventory receiver entrypoints and code ownership; document exact version and HTTP semantics without publishing secrets or private deployments.
2. Read source-level request/response validators and authentication/replay handling. Compare to T003 columns **without rewriting the draft to fit assumptions**.
3. Verify whether the real Sheet uses existing tabs, exact case-sensitive headers, leading-zero identifiers, `_field_presence_json`, deterministic nested JSON text, and formula-safe plain-text writes.
4. Confirm whether batches are idempotent and full snapshots are validated **before** writing, with run-level audit/rollback and no automatic deletions.
5. Confirm data minimization/retention. Keep volunteer gender at **district summary only** unless granular transfer is separately approved; all 4 person-level sources remain excluded.
6. Add synthetic request/response tests matching the **actual** receiver. Only after a separate user approval, consider an isolated DEV sender/receiver implementation and later real-data write gate.

## 4. T009B decision and next actions

**Decision: HOLD — no destination-compatible sender can be implemented or reviewed yet.**

- **If an existing receiver exists:** provide its **nonsecret source location** (Apps Script project code or GitHub repository) and sanitized contract docs; perform this same T009B verification against the real handler. Do not send web app URL with private query tokens, secret properties, spreadsheet data, or bearer values.
- **If none exists:** treat Apps Script as a *new isolated DEV receiver*, not an already available API. Define the minimum destination schema/auth and mock-only rollback behavior in a separate, explicitly approved task.
- **Independently:** T009A [PR #30](https://github.com/9GotStory/thaiphc-data-connector/pull/30) still requires its own explicit Merge approval before `sync-plan` exists on `main`.

**Not done / not authorized:** ThaiPHC GET, Apps Script HTTP request, spreadsheet read/write, deployment, token collection, transfer of source records, any person-level API use, or merging PR #30 without approval.

This audit documents the current source-evidence gap; **it does not pass the actual receiver-compatibility gate**.
