# Host React UI in GAS HtmlService via google.script.run Instead of External Host or Node BFF

Status: accepted

We are migrating ThaiPHC Data Connector from a Node.js CLI to a repeatable web application without running a production Node.js server or Windows DPAPI, while enforcing strict single-operator access and short-lived ThaiPHC Bearer Token handling. We decided to bundle the React + Vite + TypeScript + Tailwind CSS v4 frontend into Google Apps Script `HtmlService` (single-file build) communicating over `google.script.run`, with GAS calling ThaiPHC directly via `UrlFetchApp`. This gives native Google Account authentication (`Execute as: Me`, `Who has access: Only myself`) with zero CORS or 302 redirect issues, avoiding the `ANYONE_ANONYMOUS` exposure forced by externally hosted SPAs calling GAS `doPost`.

## Considered Options

- **GAS `HtmlService` + `google.script.run` (Chosen):** Native Google auth (`Only myself`), no CORS/302 workarounds, zero external runtime server.
- **External React Host → GAS `doPost` Web App:** Supports standard URL routing (`BrowserRouter`), but GAS lacks CORS `OPTIONS` preflight and Google Sign-In redirects break cross-origin `fetch()`, forcing `ANYONE_ANONYMOUS` plus custom auth.
- **Localhost Node.js BFF + React SPA:** Preserves local Node runtime and DPAPI, but violates the goal of eliminating a local Node.js/terminal production runtime.

## Consequences

- Client routing must work inside the GAS `IFRAME` sandbox (state/tab navigation instead of `BrowserRouter`).
- Local development and offline Playwright QA require a transport abstraction (`MockGasTransport` vs `google.script.run`).
- Requires **Gate 0** (sandbox read-only `UrlFetchApp` connectivity and pagination spike) before full implementation to verify Google Cloud egress IPs are not blocked by ThaiPHC WAF/geo-fencing.
