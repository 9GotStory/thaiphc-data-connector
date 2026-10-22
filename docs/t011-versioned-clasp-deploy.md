# T011 — Versioned clasp install and existing target IDs

Status: **SOURCE-ONLY / NOT PUSHED / NOT DEPLOYED**. Tracked under [Issue #39](https://github.com/9GotStory/thaiphc-data-connector/issues/39).

## All three IDs in versioned configuration

The **existing user-owned** destination identifiers are stored in `config/thaiphc-targets.json` with keys `scriptId`, `deploymentId` and `spreadsheetId`. The Sheet is the read-only verified **ThaiPHC Data** workbook, currently containing only `ชีต1`. IDs are project locators, **not credentials**, but can identify a deployed endpoint: review GitHub repository visibility and Google sharing permissions. NEVER commit OAuth credentials, the HMAC shared secret, ThaiPHC Bearer, `.clasprc.json` or source records.

The exact Spreadsheet ID is **not** hardcoded into `Code.gs`: it must be supplied via private Script Property `THAIPHC_SPREADSHEET_ID` if/when writes are separately authorized.

## Safe scope

- `scripts/deploy-existing-apps-script.ps1` stages ONLY `apps-script/Code.gs` and `apps-script/appsscript.json` in a temporary directory outside the Git repository, using `scriptId` from the tracked config. The older `apps-script/dev-receiver.gs` **must not be pushed** because it also declares `doPost`.
- The script pins the original T010 reviewed **Git blob SHA** for Code.gs and manifest, verifies clean `main` and reruns `npm.cmd test`. A later intentional receiver change needs fresh review and updating those pins.
- It checks the exact existing deployment ID through `clasp list-deployments`, pulls and backs up existing remote source, and **stops if any unexpected remote code exists**. This prevents blind overwrites by `clasp push --force`, which otherwise replaces full online project contents.
- Every mutation is operator-confirmed: `OFF` acknowledges private Script Properties (receiver and write flags both `false` or absent), `PUSH` pushes the exact two source files, and `UPDATE` updates only the supplied existing Deployment ID. `-PushOnly` skips deployment version update.
- No OAuth session is available to ChatGPT here. This is an operator-run Windows PowerShell workflow, never unattended CI. The source stays disabled by default; no real ThaiPHC data or Google Sheets values are read or written by the installer.

## Windows PowerShell commands (after reviewed PR is merged)

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

The proposed real receiver is not deployed by this PR. The existing Node CLI still does **not** POST full live source rows; completing actual Manual Sync requires a separate authorized sender and validation of source-data transfer permissions. No data persistence, public endpoint enablement, or real Google Sheets write is performed in these tests. Neither `volunteer-gender` village-level aggregates nor four person-level endpoints are enabled.
