# T008 — Manual Bearer Volunteer Gender Live Fetch (district aggregates only)

**Review state:** candidate branch, not an executed API call. An operator can run this command only after independent review and explicit approval to merge.

## Known source and limits

The observed request is `GET https://api-thaiphc.hss.moph.go.th/api/v1/reports/volunteer-gender?page=1&pageSize=10&province=54&district=5406`. The documented first page contained 10 **village aggregate** rows. Its response reported root `total=85`, which is a count of **village report rows**, not volunteers, and has not been independently verified across all pages. This source's direct API access/authorization has not yet been tested; technical HTTP 200 on other endpoints does not guarantee it.

The documented response envelope is exactly `success,message,items,total,page,pageSize`; each item had `provinceCode,provinceName,districtCode,districtName,subdistrictCode,subdistrictName,villageCode,villageNo,villageName,total,male,female`. The original sample showed `male+female=total` per row. Unknown real schema changes may require reviewed adaptation.

## Local command — only after approved merge

```powershell
git switch main
git pull origin main
npm.cmd test
npm.cmd run cli -- live-fetch --endpoint volunteer-gender --acknowledge-authorized-use
```

First hidden prompt: type **`FETCH VOLUNTEER GENDER 5406`** and press Enter. Second hidden prompt: paste only the **authorized Bearer Token value**, without a `Bearer ` prefix. No other channel accepts the token; source records are never logged.

The runner reads up to **15 pages of 10 rows / at most 150 village aggregate rows**, with a 10-second timeout, a 128-KiB JSON body limit **per GET**, no retries, no redirects and an exact fixed query to province `54`, district `5406`. It checks all observed field names/types; 8 known subdistricts; a 9-digit `villageCode` prefixed by the row's `subdistrictCode`; unique `villageCode` across pages; consistent reported root total and page numbers; nonnegative safe integer metrics and per-row `male+female===total`. VillageNo is bounded source **text**, not used as a numeric foreign key.

**Only if all pages validate**, outputs a **district-level aggregate** like the following. This is synthetic and **not** an observed real `volunteer-gender` result:

```json
{
  "mode": "LIVE_READ_ONLY",
  "endpoint": "volunteer-gender",
  "status": "PASS",
  "success": true,
  "httpStatus": 200,
  "count": 85,
  "totalRows": 85,
  "pagesFetched": 9,
  "volunteerTotal": 1615,
  "maleTotal": 255,
  "femaleTotal": 1360
}
```

`count` and `totalRows` measure **village report rows**; `volunteerTotal`, `maleTotal` and `femaleTotal` are sums of the respective numeric fields, not unique-person totals independently checked against other endpoints. Counts in this example come **entirely from mock fixtures**. The runner does not print village-level values, source names or codes, any person's details or a token.

If a page has bad or unexpected structure, a row violates a safe validator, an API request fails or the pagination totals change, the runner reports a **sanitized non-PASS status and count=0** with no partial aggregate. When a defined field is rejected, it may include a static `invalidField` and numeric `page`/`rowIndex` (no source values). Provider schema differences must be handled by evidence, not by disabling validation.

## Development scope

T008 CI uses synthetic fixtures/fake fetch only. T005/T006/T007 live workflows remain unchanged; person-level `assignments`, `volunteer-family`, `resigned-volunteers` and `volunteer-tenure` stay disabled for Live Fetch. **No actual ThaiPHC GET, Bearer Token, Google Sheets, Apps Script, file export, scheduler or background sync occurs** in engineering.

After independent code/CI review, a *separate user approval* is required before merging. Only then can the operator carry out a locally authorized live test and share its **sanitized output only**. This does not itself establish data-owner permission.
