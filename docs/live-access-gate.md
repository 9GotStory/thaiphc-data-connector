# T004B — Live Access Authorization & Privacy Gate (design only)

**State: HOLD / NOT AUTHORIZED FOR LIVE REQUESTS**  
**Date:** 2026-10-20 · **Tracking:** [Issue #9](https://github.com/9GotStory/thaiphc-data-connector/issues/9)  
**Baseline:** T004 Phase A at \`cb9cb612bc9c1ae093869605cb1148ca10335579\` (offline-only CLI); see [API Inventory](api-inventory.md), [T002 data quality](schema-review.md), [T003 Sheets design](sheet-schema.md), [T004 offline CLI](cli-offline.md).

> This document is a **proposal and review checklist**, not a ThaiPHC access grant, legal finding, functioning authentication implementation, production plan, or authorization to export personal data. No connection to ThaiPHC, Google Apps Script or Google Sheets is attempted here. User approval to **merge this documentation** is separate from permission to **implement** or **execute** live requests.

## 1. Decision summary and current unknowns

**Decision: HOLD** until *both* (A) the accountable ThaiPHC/API data owner or officially delegated approver confirms the permitted programmatic usage and (B) the project Product Owner explicitly approves a **separate, limited implementation and pilot**. A login to the ThaiPHC website or possession of a browser Bearer token **does not by itself establish** permission to reuse the token for bulk/programmatic retrieval.

| Gate / authority evidence | Current status | Required evidence (store only nonsecret reference) |
|---|---|---|
| ThaiPHC API data owner / approver identity and delegated authority | **UNKNOWN** | Organization/contact role or approved ticket reference, not invented sign-off |
| Terms/permission for programmatic API GET and reuse of session credentials | **UNKNOWN** | Explicit permitted method, token scope and any automation/bulk restrictions |
| Permitted endpoint list and geographic scope | **PROPOSED only** | Written endpoint-specific approval covering Phrae \`54\`, Song \`5406\` |
| Rate limit, pagination, page-size and volume limits | **UNKNOWN** | API provider guidance and operational limits |
| Permitted personal data categories, purpose, access role, retention | **UNAPPROVED** | Designated data-controller / privacy officer decision; exclude by default |
| Small-cell privacy review for gender-by-village aggregates | **PENDING** | Disclosure/suppression criteria agreed before retrieval or retention |
| Safe short-lived credential issuance / revocation and incident contacts | **UNKNOWN** | Provider-supported method and owner, plus nonsecret approval reference |
| User approval to implement limited live transport | **NOT GRANTED** | Separate explicit approval tied to a future issue, endpoints and scope |
| User approval to *run* a pilot live GET | **NOT GRANTED** | Distinct operator confirmation after implementation and security review |
| Permission to send results to Apps Script / write Google Sheets | **NOT GRANTED** | Separate stage, separate trust boundary and explicit authorization |

No source owner, DPO/PDPA approval, endpoint policy, rate limit, credential expiry or legal basis is verified by this repository. Record them as unknown rather than inferring them from successful browser access.

## 2. Proposed endpoint access policy (all live requests remain disabled)

| Source API / path | Data class | Candidate for *future* pilot | Live now |
|---|---|---|---|
| \`/api/v1/lookups/subdistricts\` | Administrative reference | **Candidate 1**, district \`5406\`; no person fields observed | **DENY** |
| \`/api/v1/lookups/villages\` | Administrative/village lookup | **Candidate 2**, province \`54\`, district \`5406\`; reference only | **DENY** |
| \`/api/v1/geo-management/health-services\` | Service facility and nested areas | **Candidate 3** only after scope/permissions review; source row can contain metadata not fully reviewed | **DENY** |
| \`/api/v1/reports/volunteer-gender\` | Village-level counts | **Conditional**: small-cell/aggregation and disclosure review first | **DENY** |
| \`/api/v1/dashboard/assignments\` | Person/volunteer assignments, names/IDs | **EXCLUDED** by default | **DENY** |
| \`/api/v1/reports/volunteer-family\` | Person/family relationship, address and IDs | **EXCLUDED**; also lacks a verified relation-row key | **DENY** |
| \`/api/v1/reports/resigned-volunteers\` | Person/historical volunteer details | **EXCLUDED** by default | **DENY** |
| \`/api/v1/reports/volunteer-tenure\` | Person/tenure identity and service history | **EXCLUDED** by default | **DENY** |

**Proposed first live pilot, only after separate authorization:** one **read-only** subdistrict lookup request, and only if the data owner explicitly permits programmatic access. Subsequent lookups and health-service/gender requests need endpoint-specific documented scope. Do not enable all four reference/aggregate endpoints automatically; treat the table as a **candidate list**, not an approved allowlist.

No status here authorizes copying, publishing, serializing, exporting, indexing or persisting any personally identifiable record. Volunteer-family and other person-level datasets remain disabled even if the provider issues a token.

## 3. Future manual operator flow (specification, not implemented)

1. **Preflight** — Confirm provider authorization reference, operator role, purpose, target endpoint, allowed geographic scope, volume, rate limits, retention and current source data classification. If any mandatory approval is missing, output \`STOP_AUTHORIZATION_UNVERIFIED\`; **zero requests**.
2. **Preview** — Show only the human-readable endpoint name, approved path, exact geographic scope, maximum page count, request timeout, safe aggregate output policy, and dry-run result; do **not** print URL query secrets or token values. No default blanket "all" live mode.
3. **Operator confirmation** — Separate, affirmative, single-endpoint confirmation in an interactive terminal; never interpret \`npm test\`, \`dry-run\`, a GitHub Merge, or a saved configuration as approval for a live request.
4. **Credential handoff** — Prefer official provider-supported delegated/scoped API credential issuance. If a session-based credential is the only mechanism, data owner must explicitly authorize that method; do **not** implement browser token harvesting, authentication bypass, credential scraping, or automated login. Credential input must be secret-aware, transient and non-echoing, and no token may appear in shell arguments, history, environment dump, repository files, CI, telemetry or error output.
5. **Read-only single request** — Use the approved TLS origin, exact fixed path, strict query allowlist and scope. Reject extra user-supplied host, path, redirect, query key or missing parameters; fail closed on unexpected source behavior.
6. **Validate in bounded memory** — Check response content type, size, shape, declared scope and known pagination format. Strip or refuse unapproved fields **before** output/serialization; do not write raw responses, crash dumps, traces or persistent caches. On any uncertainty abort and discard in-memory data.
7. **Aggregate-only report** — Emit \`endpoint\`, \`scope\`, \`run_id\` (non-person opaque ID), attempted/completed page counts, record count, error/quality **codes only**, completion status and no raw server error text. Avoid per-person keys, names, national IDs, addresses, token substrings, unsalted person hashes, and exact small-cell counts unless separately approved.
8. **End of manual run** — Revoke/expire the ephemeral credential according to the provider's method. No hidden retries beyond agreed limits; no background scheduler or exports. Distinguish "validated read" from "authorized downstream storage".

Conceptual states: \`HOLD\` → \`APPROVED_FOR_DESIGN\` → \`IMPLEMENTATION_REVIEWED\` → \`EXPLICIT_PILOT_CONFIRMATION\` → \`READ_ONLY_EXECUTED\`. Transitions require external evidence; this document records only \`HOLD\`.

## 4. Transport/security requirements for any future implementation

- Origin allowlist: exactly \`https://api-thaiphc.hss.moph.go.th\` as documented in observed URLs, **subject to provider confirmation**. Allow **GET only**, approved paths only, and no arbitrary URL/host input. TLS certificate verification is mandatory; no \`rejectUnauthorized=false\`.
- Use redirect mode **error**, not implicit follow, to prevent credential forwarding to another origin. Reject cross-origin redirects and unusual schemes outright.
- Query parameters must preserve each endpoint's observed spelling, including duplicate \`health_service_type_ids_exclude\` values on health services; aliases are *observations*, not proof of server filtering. Validate the returned \`province\`/\`district\` scope and do not trust query params alone.
- Enforce both **per-request timeout** and **whole-run budget**; cap response bytes, page count, row count and concurrent requests. Proposed conservative defaults for review: one in-flight request, 10 s per request, 60 s per single-endpoint pilot, max 10 pages and max 100 records. **These are design proposals, not confirmed provider limits**; a first pilot should request one page at most unless explicit approval covers more. If any cap would prevent completeness, status must be \`PARTIAL\` or \`BLOCKED\`, never \`COMPLETE\`.
- Retry only provider-approved transient GET errors (candidate 429/502/503/504), with bounded exponential backoff plus jitter and \`Retry-After\` handling when appropriate; **no retry on 401/403**. Never log response bodies/headers or sensitive error strings.
- Credential lifetime, refresh and revocation must use an approved provider mechanism. If a credential cannot be safely delivered to the process without recording or exposing it, **do not run**; implement no fallback to saving it in a plaintext file.
- No proxies, alternate hosts, direct IP URLs, unrestricted redirects, CI secrets exposure, persistent local JSON, automated schedules, or transmission to Apps Script/Sheets under this approval gate.
- The current CLI's \`createMockTransport\` branding is a **simulation guard**, not a security boundary against untrusted code, an authorization mechanism or proof that a future live transport would be safe.

## 5. Read-quality, pagination and privacy rules

- Lookups: observed \`items[]\` without pagination; no invented page or full-dataset completeness guarantee outside the supplied geography.
- Assignments: request \`page/pageSize\`, response \`pagination.page/limit/total/pages\`; **person feed disabled**.
- Health services: \`limit/offset/total\`, nested \`service_areas[]\`; only **10 of 18** observed. A future authorized read of the remaining 8 is a **separate operation**, not needed to authorize document design.
- Reports: \`page/pageSize/total\`; both \`province\`/\`district\` and \`provinceCode\`/\`districtCode\` occur on some endpoints; the server-side filtering behavior is not independently verified.
- Fail closed on response-scope mismatch, duplicate stable keys, null/absent handling surprises, total drift, page gaps, unexpected data types, truncation or incomplete pagination. Do not infer success from HTTP 200 alone.
- Geographic conflicts remain **unaltered**. T002 found a volunteer-family subdistrict mismatch and two village codes outside Song's lookup on sample page 1; the family relation key is **unverified**. Never join person rows by \`villageCode\` alone or silently repair names/codes.
- \`BA0000588\` is unresolved against the **displayed 10/18** health services, not proven invalid. In the supplied village lookup, **75/85** \`health_service_code\` values are \`null\`; service coordinates observed were \`(0,0)\`. Do not advertise geolocation or strict FK integrity.
- An aggregate such as \`volunteer-gender\` can still be sensitive for small village/count combinations; approve an output threshold or suppression method before exporting detailed village rows.
- National IDs, person names, addresses, family relationships and the token are forbidden in report summaries, test fixtures, automated issue comments or logs. No person-level data processing without later documented purpose, necessity, access and retention decisions.

## 6. Risk register / STOP rules

| ID | Risk | Severity | Mandatory mitigation / STOP trigger |
|---|---|---|---|
| R01 | Browser access mistaken for API extraction rights | **Critical** | STOP until authorized API owner confirms programmatic usage and scope |
| R02 | Bearer token leaks via shell history, output, logs or redirects | **Critical** | STOP unless approved transient credential flow, TLS, strict origin and redirect blocking are reviewed |
| R03 | Personal/family data extracted beyond purpose | **Critical** | Deny four person-level endpoints; approve purpose and minimization separately |
| R04 | Request scopes ignored or server filter ineffective | **High** | Validate payload geography; abort on mismatch; use only provider-approved filters |
| R05 | Partial pages, changing totals or duplicate keys accepted as complete | **High** | Per-page envelope checks, exact completeness proof, safe status \`PARTIAL\`/\`BLOCKED\` |
| R06 | Ambiguous \`health-services.service_areas[]\` or missing 8 rows | **High** | Treat semantics unresolved; do not auto-join or create authoritative coverage |
| R07 | Volunteer-family location mismatch / missing relationship ID | **High** | Preserve source anomaly, deny family upsert; require owner reconciliation |
| R08 | Unanticipated person fields in nominal lookup/aggregate response | **High** | Allowlist approved output fields, fail closed on unexpected sensitive fields |
| R09 | Very small gender aggregates indirectly reveal individuals | **High** | Privacy officer review of thresholds and aggregation/suppression before use |
| R10 | HTTP rate-limit or ToS breach / service overload | **High** | Obtain provider limits, single-thread/manual/limited pilot, bounded retries |
| R11 | Dataset retained in temporary files, exceptions or telemetry | **High** | No raw disk/cache/process dumps; aggregate-only sanitized reporting; retention policy |
| R12 | A PR Merge mistakenly treated as permission to execute | **Critical** | Keep separate owner authorization, implementation approval and live-execution confirmation |
| R13 | Implicit Sheets/Apps Script transfer after a read | **Critical** | Explicit separate data transfer and write authorization; no downstream client in live-read pilot |

**STOP conditions** include missing ownership/permission evidence, unapproved endpoint, unknown credential issuance path, scope mismatch, auth failure, privacy leak, unwanted redirect, TLS failure, size/time/rate-limit exceedance, unexpected rows, incomplete pagination, or a request to persist/transfer data. Capture only safe failure **codes and counts**.

## 7. Approval record template (no sign-off asserted)

Document the final decision **outside Git history if it contains identifying or sensitive details**; record only a safe ticket/reference, date, role and exact scope in a separate approved decision artifact. A future gate record should contain:

| Field | Current value |
|---|---|
| Decision ID / official approval reference | \`PENDING\` |
| Accountable ThaiPHC data owner or delegate (role) | \`UNKNOWN\` |
| Data privacy / controller reviewer (role) | \`UNKNOWN\` |
| Authorized endpoint(s), exact method and purpose | \`NONE\` |
| Permitted province/district | \`PROPOSED 54 / 5406\` |
| Record/volume/rate/retention limits | \`UNVERIFIED\` |
| Approved credential issuance and expiry method | \`UNVERIFIED\` |
| Product Owner approval for separate implementation | \`NOT GIVEN\` |
| Operator approval for a particular pilot run | \`NOT GIVEN\` |
| Google Sheets or Apps Script write authorization | \`NOT GIVEN\` |
| **Current decision** | **HOLD — ZERO LIVE REQUESTS** |

No username, password, session token, real citizen ID or personal contact detail belongs in this template.

## 8. T004C follow-on proposal — must be independently approved

**Do not implement T004C under Issue #9.** After the source owner and Product Owner resolve the gate, consider an independent issue:

1. Review a minimal **read-only** transport for **one approved reference endpoint only** (prefer \`subdistricts\`), with official credential issuance and expiry path.
2. Keep \`OFFLINE_ONLY\` tests, existing 8 observed descriptors and no-live defaults unchanged; add a separate opt-in operator workflow with fail-closed isolation and no open network by default.
3. Add synthetic security tests: TLS-origin and redirect refusal, timeout, response-size cap, scope mismatch, auth/429 handling, credential non-disclosure, pagination and negative tests. Review exact code/CI and operator UX.
4. Require **explicit new approval** for implementation, then a **distinct approval** before the first live GET. A successful authorized GET is **not** approval to persist its results.
5. Only after additional permission and a separate design/test PR, consider Apps Script ingress and Google Sheets schema provisioning. Never couple these stages implicitly.

### Exit criterion for Issue #9

This **documentation gate** may be accepted with all authorization details marked **UNKNOWN/PENDING** if the proposed restrictions are complete and reviewed; it must remain **HOLD** for **actual live access**. The next action is to obtain the external authorization evidence and a separately scoped user decision, **not** to request browser tokens or invoke an API now.
