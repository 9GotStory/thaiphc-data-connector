# T004D — Authorization Evidence & Decision Record (HOLD)

**Prepared:** 2026-10-20 (Asia/Bangkok)  
**Repository:** `9GotStory/thaiphc-data-connector` · **Issue:** [#13](https://github.com/9GotStory/thaiphc-data-connector/issues/13)  
**Stage:** **EVIDENCE COLLECTION ONLY — NO LIVE API REQUESTS**  
**Authoritative state:** [live-pilot-authorization-state.json](live-pilot-authorization-state.json) — all live permissions `false`

## 1. What has been verified — and what has NOT

The following are **public contact leads**, NOT evidence of API ownership, data-controller authority, permission to perform programmatic GETs, or entitlement to reuse a ThaiPHC web-session Bearer Token.

| Public contact lead | Publicly documented channel | Grounding and limits |
|---|---|---|
| กองสนับสนุนสุขภาพภาคประชาชน | กรมสนับสนุนบริการสุขภาพ, โทร. **02-193-7000 ต่อ 18716** | [PHC Division contact page](https://www.thaiphc-innovation.com/ติดต่อเรา/) and [HSS Q&A](https://prgroup.hss.moph.go.th/qahss/index.php?page=home). Administrative/system-help routing only; **API authorization authority UNKNOWN** |
| กรมสนับสนุนบริการสุขภาพ (central service desk) | **ict@hss.mail.go.th**, โทร. **02-193-7000** | [Official department contact](https://hss.moph.go.th/HssDepartment/contact.php). May route the request; no API-specific authority established |
| ศูนย์สนับสนุนบริการสุขภาพที่ 1 | **saraban-hss1@hss.mail.go.th** | [Regional center contact](https://hss1.hss.moph.go.th/contact-us-2/). Regional coordination candidate; not verified as data owner |
| Data Gateway Center (department-wide) | [data.hss.moph.go.th](https://data.hss.moph.go.th/) | Public catalog/request portal exists. No evidence that the eight ThaiPHC endpoints are listed there or that this portal grants access to them |

**Source review conclusion:** No provider-written policy or authorization for **programmatically sending `Authorization: Bearer` copied from a logged-in browser** to `api-thaiphc.hss.moph.go.th` was verified. A website login and a bearer string are not substitutes for programmatic-access authorization. Do not claim this contact list proves permissions.

These public materials were reviewed **2026-10-20**. Links and telephone extensions may change; verify before formal correspondence.

## 2. Exact request we are preparing (NOT sending)

| Requirement | Value |
|---|---|
| Proposed purpose | Verify *reference data* for health-service administrative planning in Song District, Phrae; no person-level records |
| Single pilot endpoint | `GET /api/v1/lookups/subdistricts?district_code=5406` |
| Proposed origin | `https://api-thaiphc.hss.moph.go.th` — only after provider confirms |
| Geography | จังหวัดแพร่ `54`, อำเภอสอง `5406` |
| Requested access mechanism | Operator manually signs into the ThaiPHC website and copies a session Bearer Token **only if the provider explicitly permits that usage** |
| Alternative | Provider-issued API token/access method if direct browser-session token reuse is not permitted |
| Proposed volume | **One authorized GET, one endpoint, no follow-up pagination** in initial read-only pilot |
| Output | Sanitized endpoint / request status, item count, non-person error codes only; no raw JSON stored or uploaded |
| Local handling | In-memory validation only; no personal-data fields, no credential storage, no screenshots of tokens |
| Current production/run access | **DENIED** |

**No response data, personally identifiable information, token or confidential approval document is stored in this repository.**

## 3. Questions requiring answers from the competent API owner

1. Who owns/operates the **current** `api-thaiphc.hss.moph.go.th` API and who is delegated to authorize *programmatic* access on behalf of a district public-health office?
2. Is a user authenticated to the web application **allowed to reuse their manually copied browser Bearer Token** for a scripted, operator-triggered GET? Does this violate any session/account terms or access controls?
3. If not permitted, is there a provider-issued, scoped, revocable API credential or an officially documented integration process? Do not bypass login or scrape credentials.
4. Is the exact **single endpoint / method / district** above authorized; are the current query field names, scope rules, result fields and allowed use confirmed?
5. What request frequency, size, timeouts, rate limits, retry behavior, concurrent request limit and maintenance windows apply? May the initial pilot issue exactly one request?
6. What does the token's expiry/revocation look like, and which delivery method is allowed for temporary CLI use?
7. What data fields (if any) must be excluded even from district/subdistrict lookups; may the operator read/count the results with no persistence?
8. What approval reference, responsible office/role, validity period and restrictions should the office retain as proof of permission?
9. Which contact should receive incident/security reports and token revocation requests?
10. Is the proposed internal-use/manual read compatible with the department's applicable data-protection and records-retention requirements?

**Answers required before further work:** at minimum (1), (2) or (3), (4), (5), (6), (7), (8). No source of these approvals is present at the time of this review.

## 4. Evidence status matrix

| Evidence item | Status | Why it cannot yet pass |
|---|---|---|
| Public official contact route | **FOUND — contact only** | Named candidate contacts do not prove authorization |
| Authoritative ThaiPHC API/data owner or formally delegated approver | **UNKNOWN** | No operator or provider sign-off |
| Explicit permission for manual browser Bearer Token reuse | **MISSING** | No documented programmatic-use terms |
| Single endpoint/scope/volume permission | **MISSING** | No endpoint-specific response from owner |
| Request rate limits and token expiry/revocation | **UNKNOWN** | No provider integration specifications |
| Privacy/data minimization and local retention approval | **PENDING** | No evidence of approved use conditions |
| Product Owner approval to build **real** transport | **NOT GIVEN** | Separate approval required after external evidence |
| Operator approval for first **actual** live GET | **NOT GIVEN** | Separate approval required after implementation review |
| Apps Script / Google Sheets writes | **NOT GIVEN** | Distinct future stage, not included in T004D |

The mock-only T004C CLI and its **61/61** offline tests are a *software baseline*, not evidence of entitlement or live functionality.

## 5. Explicit stop conditions and controls

- **HOLD** until a competent provider/data-owner role confirms permitted programmatic access and either approved browser-token reuse or a provider-issued integration credential.
- **HOLD** on unapproved endpoint, token transport, scope, rate limit, or unexplained data category.
- **HOLD** if the source can include person-level records that cannot be safely excluded.
- **HOLD** on any proposed token in GitHub, source, test fixtures, command arguments, shell history, telemetry, log or issue comment.
- **HOLD** on attempts to create Apps Script receivers, export data, provision Sheets, or run the real API before their respective approvals.
- Do not access any live endpoint as a "connectivity test" or "checking if a token works" under Issue #13.
- Do not approve a real HTTPS transport implementation simply by approving *this document*. The user must authorize that future implementation explicitly.

## 6. How to record future responses safely

- Log a **nonsecret** decision ticket/reference, answer date, approving **role/organization**, approved endpoint/method/scope/volume, expiry and conditions. Do not post names of private individuals, account identifiers, token content or internal access details in GitHub.
- If the response is an email or letter containing private contacts/other sensitive information, retain it **outside Git history** in an authorized official record system; link only a safe non-sensitive reference.
- Independently review the documented decision and update `live-pilot-authorization-state.json` only after receiving actual approval evidence. Never set `owner_authorized=true` based on user login alone.
- If permission is denied or remains unclear, **record HOLD and end the live-pilot branch**. Continue safe offline simulation if useful.

## 7. Deliverables and next user action

- [Authorization request draft in Thai](live-pilot-request-draft.md): a non-personal, nonsecret request the office may send through normal official channels **after local review and signature**.
- [Machine-readable HOLD decision](live-pilot-authorization-state.json): checked by offline Node.js tests to prevent accidental promotion to authorized status.
- **Not performed:** emailing, contacting ThaiPHC, submitting an official request, using a browser token, invoking a ThaiPHC API, writing Sheets or changing Apps Script.

**Issue #13 can have an evidence-preparation PR while its authorization dependency remains unresolved. Keep the live gate HOLD until the competent authority responds; document-merge does not override it.**
