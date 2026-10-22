# T011 — Versioned clasp install and existing target IDs

Status (updated 2026-10-22): **OWNER-REPORTED SOURCE PUSH PASS / WEB APP V3 GET SMOKE PASS; POST/WRITES NOT TESTED**. This document retains T011–T014 installation history. Original work: [Issue #39](https://github.com/9GotStory/thaiphc-data-connector/issues/39). Active Web App target alignment: [T015 Issue #47](https://github.com/9GotStory/thaiphc-data-connector/issues/47).

## All three IDs in versioned configuration

The **existing user-owned** destination identifiers are stored in `config/thaiphc-targets.json` with keys `scriptId`, `deploymentId` and `spreadsheetId`. As of T015, `deploymentId` targets the owner-created **Web App V3**, not the prior **Library V2**. The Sheet is the previously read-only verified **ThaiPHC Data** workbook; the last confirmed metadata check found only `ชีต1`. IDs are project locators, **not credentials**, but can identify a deployed endpoint: review GitHub repository visibility and Google sharing permissions. NEVER commit OAuth credentials, the HMAC shared secret, ThaiPHC Bearer, `.clasprc.json` or source records.

The exact Spreadsheet ID is **not** hardcoded into `Code.gs`: it must be supplied via private Script Property `THAIPHC_SPREADSHEET_ID` if/when writes are separately authorized.

## T015 — Verified Web App V3 and current operational boundary

Evidence reported by the operator on 2026-10-22:

- Local Windows offline regression: **213/213 PASS** after T014.
- Guarded clasp upload: **2 files pushed** to the existing Script ID (`Code.gs`, `appsscript.json`).
- The original versioned deployment ID `AKfycbwVnsHsWXRP_VliCUmOQ0bpRaHqjlR8YDe_JFUf39hRtBBiTknpXaGDESZTzCfQYLmDlg` was successfully updated to **Library V2**. The owner's Manage deployments UI confirmed a **Library** URL, not an HTTP Web App URL. Preserve this historical deployment; do not target it for POST.
- Owner created **one Web App V3** in the **same Script project**. The active config `deploymentId` now points to `AKfycbw6FbaK1XM2AEVt0vokP2Ssz-UomZMmvX1oTOSVrZCpgxUVqScDjVqc9JJfUVkRUxQFlQ`. The operator-provided Web App URL is `https://script.google.com/macros/s/<deploymentId>/exec` after substituting that exact ID.
- Owner's GET smoke test returned `{"protocol":"THAIPHC_SYNC_V1","status":"METHOD_DISABLED","accepted":false,"sheetsWrites":0}` — consistent with the deployed `doGet()` handler.
- **This GET response does not inspect Script Properties.** Confirm both `THAIPHC_RECEIVER_ENABLED` and `THAIPHC_WRITE_ENABLED` are `false` or absent before any POST test. No signed POST, authentication/redirect test, real-data sync or Sheets write has been performed.

**Do not rerun the initial installer** merely to change the tracked Deployment ID. Its current fail-closed remote-source classifier intentionally refuses a pulled project with non-starter `Code.gs`. Config changes alone do not require `clasp push` or `update-deployment`. Any future authorized source change needs a separately reviewed update workflow that backs up and verifies the existing remote code before mutation.

## Safe scope

- `scripts/deploy-existing-apps-script.ps1` stages ONLY `apps-script/Code.gs` and `apps-script/appsscript.json` in a temporary directory outside the Git repository, using `scriptId` from the tracked config. The older `apps-script/dev-receiver.gs` **must not be pushed** because it also declares `doPost`.
- The script pins the original T010 reviewed **Git blob SHA** for Code.gs and manifest, verifies clean `main` and reruns `npm.cmd test`. A later intentional receiver change needs fresh review and updating those pins.
- It checks the exact existing deployment ID through `clasp list-deployments`, pulls and **backs up existing remote source before inspecting it**. Normally it stops on unexpected code. **T012 exception:** when and only when the complete project contains `appsscript.json` plus exactly one root `รหัส.js` consisting exclusively of an empty `myFunction()` body (whitespace only, at most 128 bytes), it removes that starter **from temporary staging only**; its original bytes remain in the dated backup. Any nonempty body, other file or directory, or unexpected name still blocks deployment. This prevents blind overwrites by `clasp push --force`.
- Every mutation is operator-confirmed: `OFF` acknowledges private Script Properties (receiver and write flags both `false` or absent), `PUSH` pushes the exact two source files, and `UPDATE` updates only the supplied existing Deployment ID. `-PushOnly` skips deployment version update.
- No OAuth session is available to ChatGPT here. This is an operator-run Windows PowerShell workflow, never unattended CI. The source stays disabled by default; no real ThaiPHC data or Google Sheets values are read or written by the installer.

## Historical first-install Windows PowerShell commands (do not rerun after successful source push)

Run from the local repository root, signed in to the Google account authorized to edit the existing Script ID:

```powershell
git switch main
git pull origin main
npm.cmd test
npx.cmd --yes @google/clasp@latest login
```

If necessary, enable the Google Apps Script API in Google Apps Script user settings. Before pushing, open Apps Script Project Settings → Script properties and ensure both `THAIPHC_RECEIVER_ENABLED` and `THAIPHC_WRITE_ENABLED` are `false` (or absent).

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-existing-apps-script.ps1 -RepoPath .
```

Optional **push only** (do not update the versioned Deployment ID):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-existing-apps-script.ps1 -RepoPath . -PushOnly
```

If unexpected online files or the Deployment ID mismatch, the script stops, preserving a remote source backup under the Windows user profile. Do not bypass a stop by manually running `clasp push` inside the `apps-script` folder.

This script uses clasp 3.x syntax `list-deployments`, `pull`, `show-file-status`, `push --force` and `update-deployment`, consistent with the [official google/clasp README](https://github.com/google/clasp).

## What is NOT approved or complete

The owner-reported Web App V3 GET smoke test passed, but signed POST validation and data transfer remain untested. The existing Node CLI still does **not** POST full live source rows; completing actual Manual Sync requires a separate authorized sender and validation of source-data transfer permissions. No data persistence, public endpoint enablement, or real Google Sheets write is performed in these tests. Neither `volunteer-gender` village-level aggregates nor four person-level endpoints are enabled.

## T012 — Existing Thai-language starter gate

On 2026-10-22, the operator's first guarded clasp run found exactly two remote files: `appsscript.json` and `รหัส.js` (29 bytes). They verified that `รหัส.js` matched a whitespace-only `function myFunction() {}` body. The installer **correctly stopped before push** under the original conservative policy. This change accepts that exact harmless starter case, without accepting unknown scripts.

The Node.js offline guard `scripts/verify-pulled-apps-script.mjs` checks the pulled staging directory. Synthetic tests cover the legitimate starter, missing files, extra files/directories, executable code, non-default filenames and oversized sources. No CI job uses `clasp` or modifies Google Apps Script. The previous backup remains intact; each new installer run produces another dated backup before stage cleanup.

After this reviewed fix is **merged**, on the owner’s Windows terminal run `git switch main`, `git pull origin main`, then the same PowerShell installer command above. Confirm Script Properties are both OFF, type `OFF`, inspect the read-only deployment check and backup, then type `PUSH` and optionally `UPDATE` only when ready for those Google operations. A successful default-starter check does **not** authorize real-data Sheets writes or source row transfers.

## T013 — Windows PowerShell 5.1 Thai filename encoding fix

On 2026-10-22, the operator reported **206/206 local tests passing**, `OFF` confirmed, and a successful read-only deployment check and clasp pull. The backup at `C:\\Users\\9GotStory-Swift\\thaiphc-clasp-backup-20261022-143120-415268c9` was created. The Node.js guard correctly accepted the verified empty Thai starter, but Windows PowerShell 5.1 read the UTF-8 `.ps1` Thai string literal using the ANSI codepage, turning the delete target into mojibake. **PowerShell stopped before PUSH or UPDATE**.

The deployment `.ps1` is now strictly **ASCII-only**: it no longer contains a Thai filename literal and uses the actual `FullName` of the one nonmanifest pulled file from `$remoteFiles`, *only after* the Node.js UTF-8 guard classifies the project as `DEFAULT_STARTER`. It fails closed if the count or file path differs. The source backup, source SHA pins, operator confirmations, existing Script/Deployment IDs, and exact two-file upload allowlist remain unchanged. No new permissions are granted by this fix.

**After merge**, the operator should run `git switch main`, `git pull origin main`, and rerun `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\deploy-existing-apps-script.ps1 -RepoPath .`. Recheck both Script Properties flags OFF. Observe the new dated backup; the installer then presents separate `PUSH` and `UPDATE` prompts. Do not run `clasp push --force` manually or bypass a guard.
