# Feature 010 — 8-API ThaiPHC connector: remaining five report ingestion

Issue: https://github.com/9GotStory/thaiphc-data-connector/issues/64

## Product Owner target

Support all **8** ThaiPHC topics in the existing Windows Node.js 24 CLI, through existing **Web App V3** into Google Sheets. Develop code and run CI with **synthetic-only** fixtures, then hold **one consolidated Final UAT** rather than repeated operator trials.

**Current production evidence (2026-10-28):** reference datasets `Subdistricts` 8 rows, `Villages` 85, and `HealthServices` 18 all independently accepted in the original Sheet; both GAS flags operator-attested `false`. Never resend or modify those 111 rows to implement this feature. Current `main` carries a three-reference-only receiver; person-level `commit-menu` choices deliberately cannot write.

## Five report ingestion contracts (not ready for live Sheets writes)

| API | Historical root total | Row grain/key | Personal data | Current remaining blocker |
|---|---:|---|---|---|
| `volunteer-gender` | 85 village rows | `provinceCode,districtCode,villageCode` | small-cell gender counts | confirm suppression strategy and destination visibility |
| `assignments` | 1,571 | `id` candidate, not official key | name, ID, code | source-scoped read, privacy-preserving storage policy |
| `volunteer-family` | 1,803 | **NO verified row key**; rows are relations | family/volunteer names, national ID, address | stable record identity/complete-snapshot replacement and geographic conflicts |
| `resigned-volunteers` | 1,150 | `id` candidate | name, national ID, status | approved source fields/storage and restricted access |
| `volunteer-tenure` | 1,571 | `id` candidate | name, national ID, volunteer code | approved field minimization and restricted access |

Counts are prior source observations only. Do not presume current data has exactly those totals. Per-report pagination comes from the original ThaiPHC API: `assignments` uses `pagination.total/pages/page/limit`, the other four use root `total/page/pageSize`. Complete current totals, unchanging pagination, unique identities, scope 54/5406, and exact field types must be validated **before** a single row is sent. No automatic retry/partial write cleanup.

The current `docs/sheets-schema.json` defines eight proposed tabs, but all five are still `DESIGN_ONLY_NO_WRITES`. Its `RESTRICTED_DEFAULT_OMIT` field policy prevents blindly copying names, national IDs, volunteer IDs, addresses and related direct identifiers into an ordinary Sheet. A working Bearer token confirms technical account access, not which individual columns should be retained or which Google accounts may view them.

## Implemented in the first F010 engineering slice

- `src/sync/extended-report-audit.mjs`: deterministic, **offline** page-completeness, declared-field/type, district, subdistrict, candidate key, small-cell and no-raw-person-output checks for the **five** extended APIs. Unsafe/missing relation key remains explicit `WRITE_HOLD`.
- `src/sync/extended-report-source.mjs`: bounded, opt-in, HTTPS GET-only source reader. Up to 250 pages of size 10 per endpoint; no redirects, timeouts enforced, no retries, no external file output, no Apps Script call. All raw people/family rows remain in process memory, then only redacted counts and status codes can leave.
- `npm.cmd run cli -- audit-extended --endpoint <one-of-five> --acknowledge-authorized-use`: new **read-only** terminal path with distinct hidden confirmation and Bearer prompt. It is **not** the final UAT sync and is **not** a permission to store personal rows. Product Owner requested **no manual operator tests during development**, so do not ask to run this command now.
- `src/sync/extended-minimized-projection.mjs`: a **pure in-memory, never-sent** storage-shape prototype. It excludes all `RESTRICTED_DEFAULT_OMIT` source fields, pseudonymizes person keys with dedicated HMAC-SHA256 domain separation, suppresses both male and female counts for small cells to prevent complementary disclosure, and treats family keys as **run-scoped snapshot ordinals that MUST NOT be used for upsert**. The output is still a sensitive internal artifact requiring approved visibility; `writeAuthorized:false` is mandatory.
- `src/sync/extended-batch-plan.mjs`: a stage-only **offline** deterministic chunk planner for one complete minimized snapshot. Caps chunks at 25 rows / 125KB, checks duplicate pseudonymous keys and safe scalar values, computes per-chunk and entire-run SHA-256 digests, and distinguishes Family's complete-snapshot replacement from ordinary staged runs. Synthetic 1,803-row coverage yields **73 chunks**. It contains **no live sender or GAS receiver**, no automatic retries, and `writeAuthorized:false`.
- `tests/extended-report-*.test.mjs`, `tests/extended-minimized-projection.test.mjs`, and `tests/extended-batch-plan.test.mjs`: synthetic in-memory data, mocked HTTPS and fake TTY, negative tests for keys, pagination drift, malicious fields, secret-bearing fields and small-cell privacy; CI performs **zero live requests**.

## Remaining F010 work before calling 8 API writes code-complete

1. **Safe destination data models:** define the precise allowlisted, necessary fields for each of the four person reports (exclude direct identifiers by default); use restricted access, documented retention/deletion, and avoid persisting all observed PII just because a field exists in the source.
2. **Family relation identity:** source schema has no row `id` and observed rows contain cross-district/stale village references. Do not manufacture a compound key from citizen IDs, names, village codes or page ordinal. Prefer a verified source-defined relation key; otherwise implement an explicitly approved, complete-snapshot, isolated staging-and-swap model with safe reconciliation and no upsert of ambiguous relations.
3. **Volume/batching:** 1,150–1,803 person rows will not reliably fit a single original 700KB Apps Script envelope or execution. An offline bounded chunk/digest PLAN exists, but the signed, replay-safe, idempotent **chunk/staging/commit** receiver and sender still need implementation with run counts/digests and fail-closed unknown outcomes. No partial record sets visible as accepted. Preserve old V3 protocol unchanged for 3 reference datasets.
4. **Restricted receiver:** implement separate allowlisted schemas and `THAIPHC_PERSON_DATA_WRITE_ENABLED` defense-in-depth; no PII available via logs, GET endpoints, public Sheet sharing or ordinary run reports; staging data retained only as approved. `VolunteerGender` requires small-cell policy before enabling village-grain materialization.
5. **Integrate CLI commit workflow and regression:** exact entity-specific scopes, time/page/byte bounds, source-owner authority, signed transfer, readback and safe re-sync/rollback, mock end-to-end. CI should validate all eight flows without any real user data.
6. **One final UAT / deploy:** separately authorize the new restricted data sink, inspect existing V3 preimage, back it up and update **same** Web App deployment safely; verify all 8 sets in a restricted destination, preserve 111 reference rows and original tabs, and set both flags false immediately afterward.

### Important boundary

The first engineering slice makes all five reports **auditable**, not yet **writable**. Neither a passing CI run nor a successful `audit-extended` status automatically permits person-data export/storage. Keep `commit-menu` items 4–8 unchanged as `READ_ONLY`/`PERSON_DATA_HOLD` until all listed implementation and review gates pass.
