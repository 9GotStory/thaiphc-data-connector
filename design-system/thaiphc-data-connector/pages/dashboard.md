# Dashboard Page Overrides — ThaiPHC Data Connector

> **PROJECT:** ThaiPHC Data Connector  
> **PAGE ID:** `dashboard` (`ภาพรวม`)  
> **PAGE TYPE:** Public Health Data Operations Overview Console (Read-Only Metadata & Readiness)  
> **OVERRIDE LOGIC:** Rules in this file **override** [MASTER.md](../MASTER.md) for the Dashboard view. For all unspecified tokens, typography, icons, accessibility, and color contrast rules, follow `MASTER.md` strictly.

---

## 1. Page Purpose & Design Overrides

The Dashboard is the single operator's **pre-flight readiness and audit overview** upon opening the GAS `HtmlService` Web App. It answers four operational questions in under 10 seconds **without fetching ThaiPHC or exposing any raw personal rows**:

1. Which environment (`SANDBOX` or `PRODUCTION`) and Google Sheets workbook am I connected to?
2. Is any dataset blocked by an `UNRESOLVED_PREVIOUS_RUN` that needs destination Sheet inspection first?
3. Are server-side Write Guards (`THAIPHC_WRITE_ENABLED`, `THAIPHC_PERSON_DATA_WRITE_ENABLED`) currently `ON` or `OFF`?
4. What is the latest row count, Sync Mode, last `run_id`, last synced time, and status of each of the **8 ThaiPHC datasets**?

### Overrides from `MASTER.md`
- **Container Max-Width:** `max-w-[1440px] mx-auto` (wider than Sync Workspace's `1280px` so the 8-dataset metadata table breathes cleanly without cramping `run_id` and timestamp columns).
- **Vertical Section Rhythm:** `space-y-5` (`20px`) on mobile/tablet, `space-y-6` (`24px`) on desktop.
- **No Persistent Token Bar on Dashboard:** The Bearer Token Bar is scoped to `Sync Workspace` so the operator can inspect Dashboard readiness, Write Guards, and unresolved runs safely before pasting credentials.
- **Manual Refresh Only:** Consistent with `refetchOnWindowFocus: false`, provide an explicit **"รีเฟรชสถานะ"** button (`RotateCw` icon) with the last-loaded timestamp (`Asia/Bangkok`) — never auto-poll in the background.

---

## 2. Layout Hierarchy & Wireframe Blueprint

### Desktop (`1024px` – `1440px`)
```text
+======================================================================================+
| [4px RED STRIP IF PRODUCTION]                                                        |
| Sticky App Header: ThaiPHC Data Connector [54 / 5406] | [ภาพรวม*] [พื้นที่ซิงก์] | [ENV] |
+======================================================================================+
|                                                                                      |
| [SECTION 1] Environment & Destination Workbook Header Card                           |
|  Left:  [SANDBOX / PRODUCTION Badge] + Target Workbook Name & Masked ID [Copy]       |
|         Policy Chips: [ขอบเขต: จ.แพร่ 54 / อ.สอง 5406] [Same-Workbook Policy]          |
|  Right: อัปเดตล่าสุด: 21 พ.ย. 2569 18:30 น.  [รีเฟรชสถานะ]                            |
|                                                                                      |
| [SECTION 2 — CONDITIONAL] UNRESOLVED_PREVIOUS_RUN Priority Alert Banner (role=alert) |
|  [OctagonAlert] พบรอบซิงก์ที่ยังไม่ปิดสมบูรณ์ (UNRESOLVED_PREVIOUS_RUN)                 |
|  - assignments · run_id: run_20261121_0915 · สถานะ _ThaiPHCSyncLog: STARTED          |
|  คำแนะนำ: ตรวจสอบแท็บปลายทางและแท็บ _Stage_* ใน Google Sheets ก่อนเริ่ม Preview ใหม่     |
|                                                         [ตรวจสอบในพื้นที่ซิงก์ ->]     |
|                                                                                      |
| [SECTION 3] Read-Only Write Guard Status Cards (2-col grid + policy strip)           |
|  +---------------------------------------+  +--------------------------------------+ |
|  | THAIPHC_WRITE_ENABLED      [Guard OFF]|  | THAIPHC_PERSON_DATA_WRITE_ENABLED    | |
|  | [Lock] อ่านอย่างเดียว (GAS Properties) |  | [Lock] อ่านอย่างเดียว   [Guard OFF]  | |
|  | ควบคุมการเขียนชุดข้อมูลทั้งหมดลงชีต     |  | ควบคุมการเขียนชุดข้อมูลรายงานขยาย 5 ชุด | |
|  +---------------------------------------+  +--------------------------------------+ |
|  Policy Strip: [Lock] THAIPHC_SAME_WORKBOOK_APPROVAL · THAIPHC_HMAC_KEY_B64 (พร้อม)   |
|                                                                                      |
| [SECTION 4A] Reference Datasets — ชุดข้อมูลอ้างอิงพื้นฐาน (3 APIs)                     |
|  Subtitle: ฐานข้อมูลอ้างอิงที่ตรวจรับแล้ว (Historical Acceptance Baseline: 111 แถว)      |
|  +--------------------------------------------------------------------------------+  |
|  | ชุดข้อมูล / Endpoint | Sync Mode | แท็บปลายทาง | แถว | Last Run ID | เวลา | สถานะ | การทำงาน |
|  +--------------------------------------------------------------------------------+  |
|  | ตำบล (subdistricts) | Keyed Upsert | Subdistricts | 8 | run_... | ... | VERIFIED | [ซิงก์ ->]|
|  | หมู่บ้าน (villages) | Keyed Upsert | Villages     | 85| run_... | ... | VERIFIED | [ซิงก์ ->]|
|  | หน่วยบริการ (health-services)| Keyed Upsert | HealthServices | 18 | ... | VERIFIED | [ซิงก์ ->]|
|  +--------------------------------------------------------------------------------+  |
|                                                                                      |
| [SECTION 4B] Extended Report Datasets — ชุดข้อมูลรายงานขยาย (5 APIs · Minimized)       |
|  Subtitle: ลดทอนข้อมูลส่วนบุคคล (Minimized Projection) · ไม่แสดงข้อมูลบุคคลบนหน้านี้       |
|  +--------------------------------------------------------------------------------+  |
|  | volunteer-gender    | Keyed Upsert      | VolunteerGender    | ... | [ซิงก์ ->] |  |
|  | assignments         | Keyed Upsert      | Assignments        | ... | [ตรวจ ->]  |  |
|  | volunteer-family    | Complete Snapshot | RFamily_<runId> *  | ... | [ซิงก์ ->] |  |
|  | resigned-volunteers | Keyed Upsert      | ResignedVolunteers | ... | [ซิงก์ ->] |  |
|  | volunteer-tenure    | Keyed Upsert      | VolunteerTenure    | ... | [ซิงก์ ->] |  |
|  +--------------------------------------------------------------------------------+  |
+======================================================================================+
```

### Mobile (`375px`)
```text
+-----------------------------------+
| Sticky Header (Compact 2-row)     |
| ThaiPHC Connector     [SANDBOX]   |
| [ภาพรวม*]      [พื้นที่ซิงก์ข้อมูล]  |
+-----------------------------------+
| [Section 1] Workbook Header Card  |
| (stacked metadata + full-w button)|
+-----------------------------------+
| [Section 2] UNRESOLVED Alert      |
| (if any — full width)             |
+-----------------------------------+
| [Section 3] Guard Card 1 (stacked)|
|             Guard Card 2 (stacked)|
+-----------------------------------+
| [Section 4A] Reference (3 Cards)  |
|  +-----------------------------+  |
|  | ตำบล · subdistricts         |  |
|  | [Keyed Upsert] [VERIFIED]   |  |
|  | แท็บ: Subdistricts · 8 แถว   |  |
|  | Run: run_... · 18:30 น.     |  |
|  | [เปิดในพื้นที่ซิงก์ ->]        |  |
|  +-----------------------------+  |
| [Section 4B] Extended (5 Cards)   |
+-----------------------------------+
```

---

## 3. Section-by-Section Component Specifications

### Section 1: Environment & Destination Workbook Header Card
- **Container:** `Card` with semantic top/left visual framing driven by active `env`:
  - `SANDBOX`: `bg-env-sandbox-bg/50 border-env-sandbox-border border-l-4 border-l-env-sandbox-solid`
  - `PRODUCTION`: `bg-env-prod-bg/60 border-env-prod-border border-l-4 border-l-env-prod-solid`
- **Content Elements:**
  1. **Environment Identity Row:**
     - Solid Environment Badge (`SANDBOX` with `FlaskConical` OR `PRODUCTION` with `ShieldAlert`, `font-mono font-semibold text-xs px-2.5 py-1`).
     - Thai Environment Subtitle:
       - `SANDBOX`: `"สภาพแวดล้อมทดสอบ (Sandbox) — ใช้สำหรับทดสอบและตรวจสอบก่อนใช้งานจริง"`
       - `PRODUCTION`: `"สภาพแวดล้อมใช้งานจริง (Production) — การยืนยันซิงก์จะบันทึกข้อมูลลงชีตจริง"`
  2. **Destination Workbook Metadata Grid (`flex flex-wrap gap-x-6 gap-y-2`):**
     - **Reference Workbook:** Name (e.g., `ThaiPHC Data (Sandbox)`), masked/short Spreadsheet ID in `font-mono` with accessible `Copy` button + full-ID disclosure (`min-w-0 truncate`).
     - **Report Workbook Policy:**
       - If separate workbook configured (`THAIPHC_REPORT_SPREADSHEET_ID`): show Report Workbook name + short ID.
       - If same workbook (`THAIPHC_SAME_WORKBOOK_APPROVAL === "OWNER_ONLY_5406_APPROVED"`): show neutral/indigo badge `ใช้สมุดงานเดียวกัน (OWNER_ONLY_5406_APPROVED)` with `Lock` icon and reminder `"ตรวจสอบสิทธิ์แชร์เฉพาะเจ้าของก่อนซิงก์รายงาน"`.
       - If same workbook without approval: show `STOP` warning chip `"ยังไม่อนุมัติการเขียนรายงานลงสมุดงานเดียวกัน"`.
     - **Geographic Scope Pill:** `จ.แพร่ (54) / อ.สอง (5406)` (static badge, never looks editable).
  3. **Manual Refresh Control (Right-aligned on `≥768px`, full-width bottom on `375px`):**
     - Secondary/Outline `<Button>` (`min-h-10`, `RotateCw` icon spinning only while fetching and respecting `prefers-reduced-motion`): `"รีเฟรชสถานะ"`.
     - Below button: muted caption `"ตรวจสอบล่าสุด: DD MMM YYYY HH:mm น. (Asia/Bangkok)"`.

---

### Section 2: `UNRESOLVED_PREVIOUS_RUN` Priority Alert Banner (Conditional)
- **Trigger:** Displayed **only** when one or more datasets have a latest `_ThaiPHCSyncLog` row remaining in `STARTED` status (indicating an interrupted or unknown prior execution).
- **Position:** Always pinned directly below Section 1 and **above** Write Guards & Dataset Tables so it cannot be missed.
- **Visual Spec:**
  - `Alert` styled with `bg-status-stop-bg border-status-stop-border border-l-4 border-l-destructive text-status-stop-fg` and `role="alert"`.
  - Icon: `OctagonAlert` (`size-5 shrink-0`).
  - Heading (`h2`): `"พบรอบซิงก์ก่อนหน้ายังไม่ปิดสมบูรณ์ — UNRESOLVED_PREVIOUS_RUN"` (English code in `font-mono`).
  - Bullet list of affected dataset(s): Endpoint slug (`font-mono`), `run_id` (`font-mono` + Copy button), started timestamp, and status `STARTED`.
  - Operational Guidance (explicitly honoring non-ACID Sheets & No Auto-Retry):
    > `"Google Sheets ไม่รองรับการย้อนกลับอัตโนมัติ (Non-ACID) กรุณาเปิดสมุดงานปลายทางเพื่อตรวจสอบแท็บข้อมูล, _ThaiPHCSyncLog และแท็บพักข้อมูลที่ซ่อนอยู่ (_Stage_*) ก่อนเริ่มรอบ Preview → Diff → Confirm ใหม่"`
  - Action Button: Outline destructive button (`border-destructive text-status-stop-fg hover:bg-red-100/70`): `"เปิดชุดข้อมูลในพื้นที่ซิงก์"` (navigates to Sync Workspace with that dataset pre-selected; **never** labeled "Retry" or "ลองซ้ำ").

---

### Section 3: Read-Only Write Guard Status Cards
- **Purpose:** Communicate server-side fail-closed permissions configured in GAS Script Properties while making it visually unmistakable that **React cannot modify them**.
- **Layout:** `grid grid-cols-1 md:grid-cols-2 gap-4` (2 columns at `≥768px`, stacked at `375px`), followed by a compact single-row Read-Only Policy Strip (`bg-muted/70 border border-border rounded-lg px-4 py-2.5`).
- **Card Anatomy (for both `THAIPHC_WRITE_ENABLED` and `THAIPHC_PERSON_DATA_WRITE_ENABLED`):**
  - Header Row:
    - Left: Thai Guard Title (`"สิทธิ์เขียนข้อมูลลง Google Sheets"` / `"สิทธิ์เขียนชุดข้อมูลรายงานขยาย (ลดทอนแล้ว)"`) + exact Script Property key below in `font-mono text-xs text-muted-foreground`.
    - Right: High-contrast **Status Badge** (`whitespace-nowrap`):
      - `ON`: `bg-guard-on-bg border-guard-on-border text-guard-on-fg` + `ShieldCheck` + `"ON · อนุญาตเขียน"`
      - `OFF`: `bg-guard-off-bg border-guard-off-border text-guard-off-fg` + `ShieldOff` + `"OFF · ปิดการเขียน (Preview เท่านั้น)"`
  - Body Copy: 1 concise Thai sentence explaining impact (e.g., when `OFF`, Preview still works read-only, while Commit is fail-closed on the GAS server).
  - Read-Only Footer Strip (`border-t border-border/70 pt-2.5 mt-3 flex items-center gap-1.5 text-xs text-muted-foreground`):
    - `Lock` (`size-3.5 shrink-0`) + `"อ่านอย่างเดียว — แก้ไขได้เฉพาะใน Google Apps Script > Script Properties"`
  - **Strict Anti-Pattern:** NEVER render a `<Switch>`, `<Checkbox>`, or hover cursor on these cards. They are pure read-only telemetry cards (`cursor-default`).
- **Compact Policy Strip Below the 2 Cards:**
  - Displays read-only boolean readiness pills (`flex flex-wrap gap-2`):
    - `THAIPHC_HMAC_KEY_B64`: `"กำหนดค่าแล้ว (พร้อมสร้างรหัสแฝง h1_)"` (`ShieldCheck`, green) vs `"ยังไม่กำหนดค่า (บล็อกรายงานบุคคล)"` (`OctagonAlert`, red) — **never display key value or hash prefix**.
    - `THAIPHC_SAME_WORKBOOK_APPROVAL`: `"แยกสมุดงานรายงาน"` or `"อนุมัติสมุดงานเดียวกัน (OWNER_ONLY_5406_APPROVED)"` or `"ยังไม่อนุมัติสมุดงานเดียวกัน"`.

---

### Section 4: 8-Dataset Status Overview (Split into 2 Groups: 3 Reference + 5 Extended Report)

To reinforce privacy boundaries and sync semantics, **do not merge all 8 APIs into one undifferentiated list**. Render two distinct `Card` sections with clear group headers.

#### Group A: Reference Datasets (`ชุดข้อมูลอ้างอิงพื้นฐาน · 3 APIs`)
- **Group Header:**
  - Icon `Database` (`size-5 text-primary`) + `h2`: `"ชุดข้อมูลอ้างอิงพื้นฐาน (Reference Datasets · 3 APIs)"`
  - Subtitle: `"ข้อมูลพื้นที่และหน่วยบริการสาธารณสุข · ใช้โหมด Keyed Upsert ทั้ง 3 ชุด · ฐานข้อมูลอ้างอิงที่ตรวจรับแล้ว (Historical Acceptance Baseline): 111 แถว (8 / 85 / 18)"`
  - Right-side summary badge: `Write Guard: THAIPHC_WRITE_ENABLED` (`ON`/`OFF` mini pill).
- **Datasets Included:** `subdistricts`, `villages`, `health-services`.

#### Group B: Extended Report Datasets (`ชุดข้อมูลรายงานขยาย · 5 APIs`)
- **Group Header:**
  - Icon `FileSpreadsheet` (`size-5 text-primary`) + `h2`: `"ชุดข้อมูลรายงานขยาย (Extended Report Datasets · 5 APIs)"`
  - Subtitle: `"ผ่านการลดทอนข้อมูลส่วนบุคคล (Minimized Projection) ฝั่ง GAS ก่อนแสดงผลและบันทึก · แสดงเฉพาะ Metadata ไม่แสดงแถวข้อมูลบุคคล"`
  - Right-side summary badge: `Write Guard: THAIPHC_PERSON_DATA_WRITE_ENABLED` (`ON`/`OFF` mini pill).
- **Datasets Included:** `volunteer-gender`, `assignments`, `volunteer-family`, `resigned-volunteers`, `volunteer-tenure`.
- **Special Visual Distinction for `volunteer-family`:**
  - Its Sync Mode badge uses `Complete Snapshot` (`Layers` icon, Indigo/Slate tint `bg-status-legacy-bg border-status-legacy-border text-status-legacy-fg`) to contrast unmistakably against the 7 `Keyed Upsert` badges (`Database` icon, neutral/teal soft tint `bg-primary-soft border-primary-soft-border text-primary-soft-foreground`).
  - Its Destination Tab cell shows the active `Publication Pointer` tab (e.g., `RFamily_20261121_1030`) with sub-caption `"ผ่าน _ThaiPHCReportCurrent"`.

#### Table Columns & Data Formatting (`1024px` – `1440px` Semantic `<Table>`, `768px` Horizontal Scroll)

| Column | Header (`th`) | Alignment | Typography & Component Spec |
|---|---|---|---|
| 1 | **ชุดข้อมูล (Dataset)** | Left | Line 1: Thai display name (`font-medium text-foreground`)<br/>Line 2: mono endpoint slug (`font-mono text-xs text-muted-foreground`) + optional compact policy tag (`Small-Cell Suppression` / `Preserve Source Locality`) |
| 2 | **โหมดซิงก์ (Sync Mode)** | Left | Single-line `Badge` (`whitespace-nowrap`): `Keyed Upsert` or `Complete Snapshot` with matching icon |
| 3 | **แท็บปลายทาง (Destination Tab)** | Left | `font-mono text-xs` tab name (`Subdistricts`, `Assignments`, `RFamily_<runId>`). If F010 legacy snapshot is detected and fixed upsert tab is not yet created, show subtle inline chip `LEGACY_F010_SNAPSHOT_PRESENT` (`Archive` icon, indigo) |
| 4 | **จำนวนแถว (Rows)** | Right | `font-mono tabular-nums font-medium` (e.g. `1,571` or `—` when never synced). Never shows raw records |
| 5 | **Last Run ID** | Left | `flex items-center gap-1 min-w-0 max-w-[160px]`: truncated `font-mono text-xs` + `Copy` icon button (`aria-label="คัดลอก Run ID ของ ..."`) + full-value disclosure if truncated |
| 6 | **ซิงก์ล่าสุด (Last Synced)** | Left | `font-mono tabular-nums text-xs text-muted-foreground` formatted in `Asia/Bangkok` (e.g., `21/11/2569 14:22` or `"ยังไม่เคยซิงก์"`) |
| 7 | **สถานะล่าสุด (Last Status)** | Left | Status Badge (Color + Icon + Code + Thai): see matrix below |
| 8 | **การทำงาน (Action)** | Right | Compact `<Button size="sm" variant="outline">` (`min-h-9`, `ArrowRight`): `"เปิดในพื้นที่ซิงก์"` (changes to `"ตรวจสอบ"` with destructive-outline emphasis when status is `UNRESOLVED_PREVIOUS_RUN`) |

#### Dataset Last-Run Status Badge Matrix

| Backend `_ThaiPHCSyncLog` Status | Badge Visual | Icon | Displayed Label |
|---|---|---|---|
| `COMMITTED_VERIFIED` | `bg-status-verified-bg border-status-verified-border text-status-verified-fg` | `CheckCircle2` | `COMMITTED_VERIFIED` · ยืนยันแล้ว |
| `UNRESOLVED_PREVIOUS_RUN` (`STARTED`) | `bg-status-stop-bg border-status-stop-border text-status-stop-fg` | `OctagonAlert` | `UNRESOLVED_PREVIOUS_RUN` · ค้างตรวจ |
| `FAILED_STOP` | `bg-status-stop-bg border-status-stop-border text-status-stop-fg` | `OctagonAlert` | `FAILED_STOP` · หยุดทำงาน |
| `NEVER_SYNCED` (no log yet) | `bg-muted border-border text-muted-foreground` | `MinusCircle` | `NEVER_SYNCED` · ยังไม่เคยซิงก์ |

#### Mobile (`375px`) Stacked Dataset Status Card Override
At `< 768px`, hide the wide `<Table>` (`hidden md:block`) and render a semantic list (`<ul className="space-y-3 md:hidden">`) of **Dataset Status Cards** so the operator never struggles with horizontal table scrolling on small viewports:
- **Row 1:** Thai name + mono slug on left; Last Status badge on right (wraps cleanly via `flex-wrap gap-2`).
- **Row 2:** Sync Mode badge + Destination Tab (`font-mono`).
- **Row 3 (`grid-cols-2 gap-2 bg-muted/60 rounded-md p-2.5 text-xs`):** `จำนวนแถว` (`tabular-nums`) and `ซิงก์ล่าสุด` (`Asia/Bangkok`).
- **Row 4:** `Last Run ID` (`min-w-0 truncate` + Copy button).
- **Row 5:** Full-width `<Button className="w-full min-h-11">` (`"เปิดในพื้นที่ซิงก์"`).

---

## 4. Loading, Empty & RPC Error States

- **Initial Loading (`isPending`):** Render `<Skeleton>` placeholders matching the exact dimensions of Section 1 (1 banner card), Section 3 (2 guard cards), and Section 4 (3 + 5 compact rows) so layout shift (CLS) is zero. Do not use a full-page spinner.
- **RPC Fetch Error (`isError` from `getDashboardStatus`):**
  - Display a single top-level Focusable Error `Alert` (`role="alert" tabindex="-1"`, `OctagonAlert`, safe allowlisted error code only — never raw stack traces) explaining that Dashboard status could not be loaded from GAS, paired with a manual **"ลองโหลดสถานะอีกครั้ง"** button.
- **Privacy Guarantee:** Dashboard state and DOM must contain **zero** personal row samples, citizen IDs, volunteer names, or Bearer Token fields.

---

## 5. Keyboard & Accessibility Order (Dashboard)

1. Skip link (`"ข้ามไปยังเนื้อหาหลัก"`, visually hidden until focused)
2. Global Header Tabs (`ภาพรวม` → `พื้นที่ซิงก์ข้อมูล`)
3. Section 1 Refresh button & Workbook ID copy/disclosure
4. Section 2 `UNRESOLVED_PREVIOUS_RUN` Alert CTA (when present)
5. Section 4A Reference Datasets action buttons (top to bottom: `subdistricts` → `villages` → `health-services`)
6. Section 4B Extended Report Datasets action buttons (top to bottom: `volunteer-gender` → `assignments` → `volunteer-family` → `resigned-volunteers` → `volunteer-tenure`)
