# Design System Master File — ThaiPHC Data Connector

> **LOGIC:** When building a specific page, first check `thaiphc-data-connector/design-system/thaiphc-data-connector/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

- **Project:** ThaiPHC Data Connector (React + Google Apps Script Repeatable Sync Web Application)
- **Domain Context:** Single-Operator Public Health Data Operations Console — อสม. / ThaiPHC จ.แพร่ (`54`), อ.สอง (`5406`)
- **Source of Truth:** Derived from the approved `react-gas-sync-webapp` specification, [GLOSSARY.md](../../GLOSSARY.md), and ADRs `0001`–`0004`
- **Design Dials:** Variance `2/10` (Minimal & Swiss Operational) | Density `8/10` (Dense Data Operations) | Motion `Subtle CSS-only` (Zero GSAP)
- **Stack:** React + Vite (`vite-plugin-singlefile`) + TypeScript + **Tailwind CSS v4 (CSS-first `@theme`)** + TanStack Query + **`shadcn/ui`** + **`lucide-react`**
- **Runtime:** Google Apps Script `HtmlService` (`IFRAME` sandbox, `Execute as: Me`, `Who has access: Only myself`) communicating exclusively over `google.script.run`
- **Primary Mode:** Light Mode Only (high-clarity clinical & operational legibility, WCAG 2.1 AA ≥ `4.5:1` text / ≥ `3:1` non-text)

---

## 1. Visual Direction & Operational Tone

### Aesthetic Principles
- **Calm, Clinical, Unambiguous:** Public health data synchronization carries legal, privacy, and data-integrity responsibilities. Every surface must prioritize **scan speed, exact status legibility, and zero accidental writes** over decorative flair.
- **Minimalism & Swiss Operational Grid:** Flat elevated cards (`#FFFFFF`) over a calm cool-slate canvas (`#F8FAFC`), crisp `1px` borders, disciplined `4px`/`8px` spacing rhythm, tabular numbers, and sharp semantic color discipline.
- **Zero Color-Only Meaning (WCAG 1.4.1):** Every environment, write guard, diff classification, and stop condition MUST combine **four redundant cues**:
  1. Semantic surface/border/text color token (verified ≥ `4.5:1`)
  2. Dedicated `lucide-react` outline icon
  3. Standardized English status code in monospace (`INSERT`, `REVIEW`, `STOP`, `PREVIEW_STALE`, etc.)
  4. Plain Thai operational label or explanation
- **Honest Safety Aesthetics:** Non-ACID Google Sheets constraints, read-only Write Guards, ephemeral Bearer Token memory, and PII minimization boundaries must be visually self-evident — never disguised as casual consumer UI patterns.

### Domain Language Alignment (`GLOSSARY.md`)
UI copy is written in **clear, concise Thai** paired with **standardized English domain terms and status codes**. Always follow `GLOSSARY.md` terminology:

| Canonical Term (Use) | Thai UI Pairing | Avoid (Do Not Use in Copy) |
|---|---|---|
| `ThaiPHC` | ระบบ ThaiPHC | Source portal, upstream database, MOPH scraper |
| `Geographic Scope (54 / 5406)` | ขอบเขตพื้นที่ จ.แพร่ (`54`) / อ.สอง (`5406`) | Area filter, region config |
| `Reference Dataset` | ชุดข้อมูลอ้างอิงพื้นฐาน (3 APIs) | Lookup table, master data, static list |
| `Extended Report Dataset` | ชุดข้อมูลรายงานขยาย (5 APIs) | Personal report, F010 export, volunteer dump |
| `Historical Acceptance Baseline` | ฐานข้อมูลอ้างอิงที่ตรวจรับแล้ว (111 แถว) | Immutable rows, frozen baseline |
| `Repeatable Sync` | การซิงก์ข้อมูลซ้ำตามรอบ | One-time import, bulk load, automated sync |
| `Keyed Upsert` | `Keyed Upsert` (อัปเดตตามคีย์) | Overwrite, blind replace, full reload |
| `Complete Snapshot` | `Complete Snapshot` (แท็บข้อมูลทั้งชุดตามรอบ) | Partial snapshot, incremental sheet, guessed-key merge |
| `Diff Classification` | การจำแนกผลต่าง (`INSERT` / `UPDATE` / `UNCHANGED` / `REVIEW`) | Change delta, sync status |
| `Missing in Source` | `MISSING_IN_SOURCE` (ไม่พบในต้นทาง — ไม่ลบอัตโนมัติ) | Deleted row, orphaned record, stale deletion |
| `Legacy Snapshot` | แท็บ `Legacy Snapshot` เดิม (F010) | Old sheet, obsolete backup |
| `Minimized Projection` | การลดทอนข้อมูลส่วนบุคคล (`Minimized Projection`) | Redacted dump, anonymized export |
| `Pseudonymous Key` | รหัสแฝง (`h1_...`) | Citizen hash, person ID, raw key |
| `Complementary Small-Cell Suppression` | การปิดบังกลุ่มจำนวนน้อย (`SMALL_CELL_SUPPRESSED`) | Low-count hiding, value masking |
| `Preserve Source Locality` | คงรหัสพื้นที่ต้นทาง (`LOCALITY_MISMATCH`) | Auto-correct locality, silent normalization |
| `Preview Fingerprint` | ลายนิ้วมือผล Preview (`Preview Fingerprint`) | Preview cache, session lock |
| `Hidden Staging Tab` | แท็บพักข้อมูลชั่วคราว (`_Stage_*`) | Draft table, temp sheet |
| `Publication Pointer` | ตัวชี้แท็บที่เผยแพร่ (`_ThaiPHCReportCurrent`) | Latest tab, active flag |
| `Unresolved Previous Run` | รอบซิงก์ก่อนหน้ายังไม่ปิดสมบูรณ์ (`UNRESOLVED_PREVIOUS_RUN`) | Failed job, retryable run |
| `Destination Readback` | การอ่านตรวจซ้ำปลายทาง (`Destination Readback`) | Write receipt, optimistic success |

---

## 2. Color System & WCAG 2.1 AA Contrast Matrix

All color pairs below have been mathematically verified against WCAG 2.1 contrast thresholds (`≥ 4.5:1` for normal text, `≥ 3:1` for non-text interactive boundaries and focus indicators).

### 2.1 Base Neutral & Brand Tokens

| Role | Hex | CSS Variable (`:root`) | Tailwind v4 Utility | Verified Contrast | Usage |
|---|---|---|---|---:|---|
| **Canvas Background** | `#F8FAFC` | `--background` | `bg-background` | — | Page canvas inside GAS iframe |
| **Primary Text** | `#0F172A` | `--foreground` | `text-foreground` | `17.06:1` on canvas / `17.85:1` on card | Headings, primary data, table values |
| **Card Surface** | `#FFFFFF` | `--card` | `bg-card` | — | Cards, tables, inspector panels, dialogs |
| **Card Foreground** | `#0F172A` | `--card-foreground` | `text-card-foreground` | `17.85:1` on card | Text inside cards and tables |
| **Muted Surface** | `#F1F5F9` | `--muted` | `bg-muted` | — | Table headers, code pills, read-only panels |
| **Muted Foreground** | `#475569` | `--muted-foreground` | `text-muted-foreground` | `7.58:1` on card / `6.92:1` on muted | Secondary captions, timestamps, helper copy |
| **Subtle Border** | `#E2E8F0` | `--border` | `border-border` | Decorative structural separator | Card outlines, table row dividers |
| **Control Input Border** | `#64748B` | `--input` | `border-input` | `4.76:1` on card (passes WCAG 1.4.11 ≥ 3:1) | Inputs, checkboxes, radio borders, outline buttons |
| **Primary Brand (Clinical Teal)** | `#0F766E` | `--primary` | `bg-primary` / `text-primary` | `5.47:1` with `#FFFFFF` / `5.47:1` on card | Primary CTAs (`เริ่ม Preview`, active tabs, links) |
| **Primary Hover** | `#115E59` | `--primary-hover` | `hover:bg-primary-hover` | `7.58:1` with `#FFFFFF` | Hover/active state on primary CTA |
| **Primary Foreground** | `#FFFFFF` | `--primary-foreground` | `text-primary-foreground` | `5.47:1` on primary | Label/icon on primary button |
| **Primary Soft Surface** | `#F0FDFA` | `--primary-soft` | `bg-primary-soft` | `7.27:1` with `#115E59` | Selected dataset card tint, active tab indicator |
| **Secondary Surface** | `#F1F5F9` | `--secondary` | `bg-secondary` | `15.48:1` with `#0F172A` | Secondary buttons, neutral chips |
| **Focus Ring** | `#0F766E` | `--ring` | `ring-ring` | `5.47:1` on white | Keyboard `:focus-visible` ring (`2px`, `2px` offset) |
| **Destructive Action** | `#B91C1C` | `--destructive` | `bg-destructive` | `6.47:1` with `#FFFFFF` | `PRODUCTION` Commit button, destructive alerts |
| **Destructive Foreground** | `#FFFFFF` | `--destructive-foreground` | `text-destructive-foreground` | `6.47:1` on destructive | Text on destructive button |

### 2.2 Operational Semantic Status Tokens

| Domain Status | Surface (`bg-*`) | Border (`border-*`) | Text & Icon (`text-*`) | Solid Badge (`bg` / `fg`) | Verified Text Contrast | `lucide-react` Icon |
|---|---|---|---|---|---:|---|
| **Env: `SANDBOX`** | `#EFF6FF` | `#93C5FD` | `#1E3A8A` | `#1D4ED8` / `#FFFFFF` | `9.52:1` (solid `6.70:1`) | `FlaskConical` |
| **Env: `PRODUCTION`** | `#FEF2F2` | `#FCA5A5` *(top strip `#DC2626`)* | `#991B1B` | `#B91C1C` / `#FFFFFF` | `7.60:1` (solid `6.47:1`) | `ShieldAlert` |
| **Write Guard `ON`** | `#ECFDF5` | `#6EE7B7` | `#065F46` | — | `7.29:1` | `ShieldCheck` |
| **Write Guard `OFF`** | `#F1F5F9` | `#94A3B8` | `#334155` | — | `9.45:1` | `ShieldOff` |
| **Diff: `INSERT` (เพิ่มใหม่)** | `#ECFDF5` | `#A7F3D0` | `#065F46` | — | `7.29:1` | `PlusCircle` |
| **Diff: `UPDATE` (อัปเดต)** | `#EFF6FF` | `#BFDBFE` | `#1E40AF` | — | `8.01:1` | `RefreshCw` |
| **Diff: `UNCHANGED` (ไม่เปลี่ยนแปลง)** | `#F1F5F9` | `#CBD5E1` | `#334155` | — | `9.45:1` | `MinusCircle` |
| **Diff: `REVIEW` (ต้องตรวจสอบ)** | `#FFFBEB` | `#FCD34D` | `#92400E` | — | `6.84:1` | `AlertTriangle` |
| **`STOP` / `STOP/BLOCKED` / `UNRESOLVED_PREVIOUS_RUN` / `UNKNOWN_OUTCOME_STOP` / `FAILED_STOP`** | `#FEF2F2` | `#FCA5A5` | `#991B1B` | `#B91C1C` / `#FFFFFF` | `7.60:1` (solid `6.47:1`) | `OctagonAlert` |
| **`PREVIEW_STALE` / `PREVIEW_STALE_RECONFIRM_REQUIRED`** | `#FFF7ED` | `#FDBA74` | `#9A3412` | — | `6.88:1` | `ClockAlert` |
| **`LEGACY_F010_SNAPSHOT_PRESENT`** | `#EEF2FF` | `#C7D2FE` | `#3730A3` | — | `8.88:1` | `Archive` |
| **`COMMITTED_VERIFIED`** | `#ECFDF5` | `#6EE7B7` | `#065F46` | — | `7.29:1` | `CheckCircle2` |

> **Color Discipline Note:** Because Clinical Deep Teal (`#0F766E`) is the sole interactive brand hue, Royal Blue (`#1D4ED8`) remains unambiguously dedicated to `SANDBOX` and `UPDATE`, Emerald (`#065F46`) to `INSERT`/`Guard ON`/`COMMITTED_VERIFIED`, Amber (`#92400E`) to `REVIEW`, Deep Orange (`#9A3412`) to `PREVIEW_STALE`, Indigo (`#3730A3`) to `LEGACY_F010_SNAPSHOT_PRESENT`, and Crimson (`#991B1B`/`#B91C1C`) to `PRODUCTION` and `STOP` states.

---

## 3. Tailwind CSS v4 CSS-First Token Configuration (`src/index.css`)

**Mandatory Rule:** Configure ALL design tokens in CSS using Tailwind CSS v4 `@import "tailwindcss";`, `:root`, and `@theme inline`. **Never create or use a Tailwind v3 `tailwind.config.js` / `tailwind.config.ts` file.** Do not bundle GSAP or heavy animation libraries (`tw-animate-css` is omitted in favor of lightweight CSS micro-transitions to keep the `vite-plugin-singlefile` GAS bundle small).

```css
/* src/index.css — Tailwind CSS v4 CSS-First Design Tokens (shadcn/ui v4 compatible) */
@import "tailwindcss";

:root {
  /* Base & Surfaces (Light Mode Primary) */
  --background: #f8fafc;
  --foreground: #0f172a;
  --card: #ffffff;
  --card-foreground: #0f172a;
  --popover: #ffffff;
  --popover-foreground: #0f172a;

  /* Brand Primary — Public Health Clinical Teal */
  --primary: #0f766e;
  --primary-hover: #115e59;
  --primary-foreground: #ffffff;
  --primary-soft: #f0fdfa;
  --primary-soft-foreground: #115e59;
  --primary-soft-border: #99f6e4;

  /* Neutrals & Interactive Borders */
  --secondary: #f1f5f9;
  --secondary-foreground: #0f172a;
  --muted: #f1f5f9;
  --muted-foreground: #475569;
  --accent: #f0fdfa;
  --accent-foreground: #115e59;
  --border: #e2e8f0;
  --input: #64748b; /* 4.76:1 on #FFFFFF — WCAG 1.4.11 Non-Text Contrast */
  --ring: #0f766e;

  /* Destructive */
  --destructive: #b91c1c;
  --destructive-hover: #991b1b;
  --destructive-foreground: #ffffff;

  /* Environment Semantics */
  --env-sandbox-bg: #eff6ff;
  --env-sandbox-border: #93c5fd;
  --env-sandbox-fg: #1e3a8a;
  --env-sandbox-solid: #1d4ed8;
  --env-sandbox-solid-fg: #ffffff;

  --env-prod-strip: #dc2626;
  --env-prod-bg: #fef2f2;
  --env-prod-border: #fca5a5;
  --env-prod-fg: #991b1b;
  --env-prod-solid: #b91c1c;
  --env-prod-solid-fg: #ffffff;

  /* Write Guard Semantics (Read-Only) */
  --guard-on-bg: #ecfdf5;
  --guard-on-border: #6ee7b7;
  --guard-on-fg: #065f46;

  --guard-off-bg: #f1f5f9;
  --guard-off-border: #94a3b8;
  --guard-off-fg: #334155;

  /* Diff Classification Semantics */
  --diff-insert-bg: #ecfdf5;
  --diff-insert-border: #a7f3d0;
  --diff-insert-fg: #065f46;

  --diff-update-bg: #eff6ff;
  --diff-update-border: #bfdbfe;
  --diff-update-fg: #1e40af;

  --diff-unchanged-bg: #f1f5f9;
  --diff-unchanged-border: #cbd5e1;
  --diff-unchanged-fg: #334155;

  --diff-review-bg: #fffbeb;
  --diff-review-border: #fcd34d;
  --diff-review-fg: #92400e;

  /* Safety, Blocker & Lifecycle Semantics */
  --status-stop-bg: #fef2f2;
  --status-stop-border: #fca5a5;
  --status-stop-fg: #991b1b;

  --status-stale-bg: #fff7ed;
  --status-stale-border: #fdba74;
  --status-stale-fg: #9a3412;

  --status-legacy-bg: #eef2ff;
  --status-legacy-border: #c7d2fe;
  --status-legacy-fg: #3730a3;

  --status-verified-bg: #ecfdf5;
  --status-verified-border: #6ee7b7;
  --status-verified-fg: #065f46;

  /* Radius & Dense Operational Spacing */
  --radius: 0.5rem; /* 8px — crisp operational cards/inputs */
  --space-xs: 0.25rem;  /* 4px */
  --space-sm: 0.5rem;   /* 8px */
  --space-md: 0.75rem;  /* 12px */
  --space-lg: 1rem;     /* 16px */
  --space-xl: 1.25rem;  /* 20px */
  --space-2xl: 1.5rem;  /* 24px */
  --space-3xl: 2rem;    /* 32px */

  /* Layout & Sticky Offset for WCAG 2.2 Focus Not Obscured */
  --header-height: 4rem; /* 64px */
  --sticky-scroll-offset: calc(var(--header-height) + 1rem);

  /* Subtle Shadows (Minimalism & Swiss Operational) */
  --shadow-xs: 0 1px 2px 0 rgb(15 23 42 / 0.04);
  --shadow-sm: 0 1px 3px 0 rgb(15 23 42 / 0.08), 0 1px 2px -1px rgb(15 23 42 / 0.06);
  --shadow-md: 0 4px 12px -2px rgb(15 23 42 / 0.10), 0 2px 4px -2px rgb(15 23 42 / 0.06);

  /* Motion Tokens (CSS-only, lightweight) */
  --duration-fast: 150ms;
  --duration-base: 200ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}

@theme inline {
  /* Typography */
  --font-sans: "IBM Plex Sans Thai", "Noto Sans Thai", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "IBM Plex Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Core shadcn/ui v4 Color Mappings */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-hover: var(--primary-hover);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary-soft: var(--primary-soft);
  --color-primary-soft-foreground: var(--primary-soft-foreground);
  --color-primary-soft-border: var(--primary-soft-border);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-hover: var(--destructive-hover);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  /* Environment Colors */
  --color-env-sandbox-bg: var(--env-sandbox-bg);
  --color-env-sandbox-border: var(--env-sandbox-border);
  --color-env-sandbox-fg: var(--env-sandbox-fg);
  --color-env-sandbox-solid: var(--env-sandbox-solid);
  --color-env-sandbox-solid-fg: var(--env-sandbox-solid-fg);

  --color-env-prod-strip: var(--env-prod-strip);
  --color-env-prod-bg: var(--env-prod-bg);
  --color-env-prod-border: var(--env-prod-border);
  --color-env-prod-fg: var(--env-prod-fg);
  --color-env-prod-solid: var(--env-prod-solid);
  --color-env-prod-solid-fg: var(--env-prod-solid-fg);

  /* Write Guard Colors */
  --color-guard-on-bg: var(--guard-on-bg);
  --color-guard-on-border: var(--guard-on-border);
  --color-guard-on-fg: var(--guard-on-fg);
  --color-guard-off-bg: var(--guard-off-bg);
  --color-guard-off-border: var(--guard-off-border);
  --color-guard-off-fg: var(--guard-off-fg);

  /* Diff Colors */
  --color-diff-insert-bg: var(--diff-insert-bg);
  --color-diff-insert-border: var(--diff-insert-border);
  --color-diff-insert-fg: var(--diff-insert-fg);
  --color-diff-update-bg: var(--diff-update-bg);
  --color-diff-update-border: var(--diff-update-border);
  --color-diff-update-fg: var(--diff-update-fg);
  --color-diff-unchanged-bg: var(--diff-unchanged-bg);
  --color-diff-unchanged-border: var(--diff-unchanged-border);
  --color-diff-unchanged-fg: var(--diff-unchanged-fg);
  --color-diff-review-bg: var(--diff-review-bg);
  --color-diff-review-border: var(--diff-review-border);
  --color-diff-review-fg: var(--diff-review-fg);

  /* Status & Safety Colors */
  --color-status-stop-bg: var(--status-stop-bg);
  --color-status-stop-border: var(--status-stop-border);
  --color-status-stop-fg: var(--status-stop-fg);
  --color-status-stale-bg: var(--status-stale-bg);
  --color-status-stale-border: var(--status-stale-border);
  --color-status-stale-fg: var(--status-stale-fg);
  --color-status-legacy-bg: var(--status-legacy-bg);
  --color-status-legacy-border: var(--status-legacy-border);
  --color-status-legacy-fg: var(--status-legacy-fg);
  --color-status-verified-bg: var(--status-verified-bg);
  --color-status-verified-border: var(--status-verified-border);
  --color-status-verified-fg: var(--status-verified-fg);

  /* Radius Scale */
  --radius-sm: calc(var(--radius) - 0.125rem); /* 6px */
  --radius-md: var(--radius);                 /* 8px */
  --radius-lg: calc(var(--radius) + 0.25rem); /* 12px */
  --radius-xl: calc(var(--radius) + 0.5rem);  /* 16px */
}

@layer base {
  html {
    font-family: var(--font-sans);
    scroll-padding-top: var(--sticky-scroll-offset);
    -webkit-font-smoothing: antialiased;
  }

  body {
    @apply bg-background text-foreground;
    line-height: 1.6;
  }

  * {
    @apply border-border;
  }

  :focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
}

/* Reduced Motion Compliance (WCAG 2.1 / 2.2) */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 4. Typography System (Thai UI + Monospace Technical Data)

### Font Pairing
- **Primary Thai & UI Sans:** `IBM Plex Sans Thai` (weights `400`, `500`, `600`, `700`) — designed with clean geometric legibility for Thai tone marks and dense administrative tables; graceful fallback to `Noto Sans Thai` and OS system sans when Google Fonts is offline or blocked inside GAS `HtmlService`.
- **Technical & Code Monospace:** `IBM Plex Mono` (weights `400`, `500`, `600`) — shares optical x-height and stroke metrics with `IBM Plex Sans Thai` so inline Thai sentences mixed with English status codes (`INSERT`, `PREVIEW_STALE`, `h1_...`) stay baseline-aligned without awkward size jumps.

**HTML `<head>` Font Import (external stylesheet link — keeps `vite-plugin-singlefile` payload minimal):**
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap"
  rel="stylesheet"
/>
```

### Type Scale (Tuned for Thai Ascenders / Descenders)

| Role | Font Family | Size | Weight | Line Height | Tailwind Classes | Usage |
|---|---|---:|---:|---:|---|---|
| **Page Title (`h1`)** | `IBM Plex Sans Thai` | `22px` (`1.375rem`) | `600` | `1.35` | `text-[1.375rem] font-semibold leading-[1.35] tracking-tight text-balance` | Dashboard / Sync Workspace main title |
| **Section Heading (`h2`)** | `IBM Plex Sans Thai` | `17px` (`1.0625rem`) | `600` | `1.4` | `text-[1.0625rem] font-semibold leading-[1.4]` | Group headers (`Reference Datasets`, `Extended Report Datasets`), Step titles |
| **Card / Panel Title (`h3`)** | `IBM Plex Sans Thai` | `15px` (`0.9375rem`) | `600` | `1.45` | `text-[0.9375rem] font-semibold leading-[1.45]` | Write Guard cards, Diff Inspector cards, Dialog titles |
| **Body Primary** | `IBM Plex Sans Thai` | `14px` (`0.875rem`) | `400` | `1.6` | `text-sm leading-relaxed` | Operational explanations, alert descriptions, recovery steps |
| **Table Cell & Control** | `IBM Plex Sans Thai` | `13.5px` (`0.84375rem`) | `400`/`500` | `1.5` | `text-[0.84375rem] leading-normal` | Data table rows, form labels, buttons |
| **Helper / Meta Caption** | `IBM Plex Sans Thai` | `12.5px` (`0.78125rem`) | `400` | `1.5` | `text-[0.78125rem] text-muted-foreground` | Read-only guard captions, privacy explanations, timestamps |
| **Monospace Identifier** | `IBM Plex Mono` | `12.5px` (`0.78125rem`) | `500` | `1.45` | `font-mono text-[0.78125rem] font-medium tabular-nums` | `run_id`, `_source_key`, `h1_...`, `Preview Fingerprint`, endpoint slugs, tab names |
| **Status Code Badge** | `IBM Plex Mono` | `12px` (`0.75rem`) | `600` | `1.25` | `font-mono text-xs font-semibold tracking-[0.01em] whitespace-nowrap` | `INSERT`, `UPDATE`, `UNCHANGED`, `REVIEW`, `STOP`, `PREVIEW_STALE`, `SANDBOX`, `PRODUCTION` |
| **KPI / Diff Counter** | `IBM Plex Mono` | `24px` (`1.5rem`) | `600` | `1.2` | `font-mono text-2xl font-semibold tabular-nums` | Diff summary counts, row counts |

> **Thai Line-Height Rule:** Never use `leading-none` (`1.0`) or `leading-tight` (`1.25`) on multi-line Thai paragraphs or Thai table rows, as upper tone marks (`ไม้โท`, `ไม้ตรี`) and lower vowels (`สระอุ`, `สระอู`) will clip or collide. Reserve tight line-heights (`1.2`–`1.25`) strictly for single-line monospace codes and numbers.

---

## 5. Iconography (`lucide-react` Exclusive)

**Mandatory Override:** Use **`lucide-react`** exclusively across the entire application. Do **NOT** import `@phosphor-icons/react` (skill default) and do **NOT** use emojis (`✅`, `⚠️`, `🚨`, `🔒`) as structural or status icons. Import each icon individually for Vite tree-shaking.

### Size, Stroke & Accessibility Rules
- **Standard Sizes:**
  - `size-4` (`16px`, `strokeWidth={1.75}`): Badges, buttons, table inline status, metadata labels
  - `size-5` (`20px`, `strokeWidth={1.75}`): Card headers, alerts, tab navigation, input adornments
  - `size-6` (`24px`, `strokeWidth={1.75}`): Major error/recovery banners, empty states
- **Contextual ARIA (WCAG 1.1.1 / 4.1.2):**
  - Icon paired with visible text label → MUST set `aria-hidden="true"` and `className="shrink-0"`
  - Standalone icon-only button (e.g., Show/Hide Token, Copy Fingerprint, Expand Hash) → parent `<Button>` MUST provide descriptive Thai `aria-label` (plus `aria-pressed` or `aria-expanded` when stateful) and icon sets `aria-hidden="true"`

### Semantic Icon Mapping Registry

| Operational Concept | `lucide-react` Icon | Usage Context |
|---|---|---|
| `SANDBOX` Environment | `FlaskConical` | App header banner, Dashboard header, Confirmation gate |
| `PRODUCTION` Environment | `ShieldAlert` | App header hazard banner, Danger confirmation gate |
| Write Guard `ON` | `ShieldCheck` | Dashboard guard card, Sync Workspace readiness chip |
| Write Guard `OFF` | `ShieldOff` | Dashboard guard card, Commit locked alert |
| Read-Only / Script Property Lock | `Lock` | Read-only Write Guard cards, Privacy boundary banner |
| Diff: `INSERT` | `PlusCircle` | Diff counter card, preview row badge, readback summary |
| Diff: `UPDATE` | `RefreshCw` | Diff counter card, preview row badge, readback summary |
| Diff: `UNCHANGED` | `MinusCircle` | Diff counter card, preview row badge |
| Diff: `REVIEW` | `AlertTriangle` | Diff counter card, review sub-category chips |
| `STOP/BLOCKED` / `UNRESOLVED_PREVIOUS_RUN` / `UNKNOWN_OUTCOME_STOP` | `OctagonAlert` | Focusable Error Summary, Dashboard priority banner, Stop panel |
| `PREVIEW_STALE_RECONFIRM_REQUIRED` | `ClockAlert` | Stale preview stop card, re-preview CTA banner |
| `LEGACY_F010_SNAPSHOT_PRESENT` | `Archive` | Non-blocking migration notice banner |
| `COMMITTED_VERIFIED` / Readback Pass | `CheckCircle2` | Verified readback report, checklist pass items |
| Bearer Token Input | `KeyRound` | Persistent Bearer Token bar |
| Show / Hide Token | `Eye` / `EyeOff` | Token visibility toggle (`aria-pressed`) |
| Clear Token | `Trash2` | One-click "ล้าง Token" button |
| Copy Identifier (`run_id`, `h1_...`, Fingerprint) | `Copy` → `Check` | Accessible copy button with feedback status |
| Reference Dataset (`Keyed Upsert`) | `Database` | Group A header & dataset selector |
| Extended Report Dataset (`Minimized Projection`) | `FileSpreadsheet` | Group B header & dataset selector |
| `Complete Snapshot` (`volunteer-family`) | `Layers` | Sync Mode badge distinguishing snapshot vs upsert |
| Start Preview / Run | `Play` | Primary Preview CTA |
| Cancel Preview | `XCircle` | Cancel batch loop CTA |
| Manual Refresh | `RotateCw` | Dashboard manual reload button |
| Open Sync Workspace | `ArrowRight` | Dashboard row CTA |
| Expand Long Value / Details | `ChevronDown` | Accessible disclosure toggle |
| Informational / Privacy Notice | `Info` | Helper callouts, Historical Acceptance Baseline note |

---

## 6. Global App Shell, Navigation & Responsive Layout

### 6.1 GAS `HtmlService` Iframe-Safe App Shell
- **Zero `BrowserRouter`:** Navigation between `Dashboard` (`ภาพรวม`) and `Sync Workspace` (`พื้นที่ซิงก์ข้อมูล`) is driven strictly by in-memory React state (`activeView: 'dashboard' | 'sync-workspace'`, plus optional `selectedEndpoint` handoff).
- **Sticky Top Header (`h-16` / `64px`, `z-30`, `bg-card border-b border-border`):**
  - **`PRODUCTION` Top Hazard Strip:** When `env === "PRODUCTION"`, render a full-width `h-1` (`4px`) solid `bg-env-prod-strip` (`#DC2626`) bar pinned at `top-0` above the header content.
  - **Left Zone:** App Brand (`ThaiPHC Data Connector`) + Compact Scope Chip (`จ.แพร่ 54 · อ.สอง 5406`, `font-mono`).
  - **Center/Right Zone:**
    - Primary View Navigation (`<nav aria-label="เมนูหลัก">`) with 2 semantic tab/view buttons: `ภาพรวม (Dashboard)` and `พื้นที่ซิงก์ข้อมูล (Sync Workspace)` using `aria-current="page"` on the active button, `min-h-10`, visible active bottom border `border-primary` + `bg-primary-soft`.
    - Persistent **Environment Pill** (`SANDBOX` solid blue badge with `FlaskConical` OR `PRODUCTION` solid red badge with `ShieldAlert`).
- **Focus Not Obscured (WCAG 2.2 AA):** All scrollable containers and `html` inherit `scroll-padding-top: var(--sticky-scroll-offset)` so keyboard tabbing or error-summary anchor jumps never place focused controls behind the sticky header or sticky Token bar.

### 6.2 Responsive Breakpoints & Density Grid

| Breakpoint | Width | Container Max-Width | Horizontal Gutter | Layout Pattern |
|---|---:|---:|---:|---|
| **Mobile / Narrow Iframe** | `375px` | `100%` | `12px` (`px-3`) | Single-column stack; tables transform to stacked status cards or `overflow-x-auto` with clear scroll cue; full-width primary CTAs; zero page-level horizontal scroll |
| **Tablet** | `768px` | `100%` | `20px` (`px-5`) | 2-column cards (Write Guards, Diff Counters, Dataset Selector); compact scrollable tables inside `overflow-x-auto` |
| **Laptop** | `1024px` | `1024px`–`1280px` | `24px` (`px-6`) | Full semantic `<Table>` on Dashboard; 2–3 column selector grids; side-by-side summary metrics |
| **Desktop** | `1440px` | `1280px` (Sync) / `1440px` (Dashboard) | `32px` (`px-8`) | Full 12-column operational console with generous whitespace around dense data tables |

### 6.3 Z-Index Layer Scale

| Layer | Z-Index | Usage |
|---|---:|---|
| Base content | `z-0` | Cards, tables, forms |
| Sticky Table Header | `z-10` | Inside scrollable preview table wrapper |
| Sticky Workspace Token Bar | `z-20` | Sync Workspace persistent token bar |
| Sticky Global App Header | `z-30` | Top app shell + Environment strip |
| Popover / Disclosure Menu | `z-40` | Full-value hash/key disclosure popover |
| Modal / `AlertDialog` Scrim & Content | `z-50` | Confirmation Gate modal (`bg-slate-950/50` scrim) |

---

## 7. `shadcn/ui` Component Specifications & Accessibility Contracts

Import every `shadcn/ui` primitive individually (`import { Button } from "@/components/ui/button"`) to keep the single-file GAS bundle minimal. Never use bare clickable `<div>` elements for interactive actions.

### 7.1 Component Inventory & Rules

| `shadcn/ui` Primitive | ThaiPHC Operational Spec | Accessibility & Overflow Rules |
|---|---|---|
| **`Button`** | Variants: `primary` (`bg-primary hover:bg-primary-hover text-primary-foreground`), `secondary` (`bg-secondary hover:bg-slate-200`), `outline` (`border-input bg-card hover:bg-muted`), `destructive` (`bg-destructive hover:bg-destructive-hover text-destructive-foreground`), `ghost`. Min height `40px` (`h-10`) on desktop, `44px` (`min-h-11`) on mobile/touch. `cursor-pointer` on enabled, `cursor-not-allowed opacity-55` on disabled. Transition colors only (`150ms`). **No `translateY` hover jump.** | Native `<button type="button" \| "submit">`; `disabled` attribute (not fake CSS); icon-only buttons require Thai `aria-label` |
| **`Badge`** | Static state indicator (`<span>`) — never clickable unless rendered as a `<button>` filter chip. Always pairs **Icon (`size-3.5`) + Monospace Code / Thai Text**. `inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap`. | Never wrap a single compact status badge across 2 lines; container collections use `flex flex-wrap gap-2` (never fixed-height `overflow-hidden`) |
| **`Card`** | Compound structure (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`). `bg-card border border-border rounded-lg shadow-[var(--shadow-xs)]`. Dense padding `p-4` (`16px`) on mobile, `p-5` (`20px`) on desktop. | Sequential heading hierarchy (`h2` → `h3`); never use `Card` as a clickable `<div>` (use native `<button>` or `<label>` + `<input type="radio">` inside) |
| **`Table`** | Semantic `<Table><TableHeader><TableRow><TableHead>...</TableHeader><TableBody>...` wrapped in `<div className="w-full overflow-x-auto rounded-lg border border-border">`. Header `bg-muted/80 text-muted-foreground text-xs font-semibold`. Row hover `hover:bg-slate-50/90`. Numeric cells use `text-right font-mono tabular-nums`. | Every column has `<th scope="col">`; include `<caption>` (visible or `sr-only`) describing the dataset table |
| **`Alert`** | Static callouts (`role="status"` for informational/legacy notices; `role="alert"` for `STOP/BLOCKED`, `UNRESOLVED_PREVIOUS_RUN`, `HTTP_401`, `UNKNOWN_OUTCOME_STOP`). Crisp `1px` semantic border + `4px` left accent border (`border-l-4`) for immediate scannability. | Focusable Error Summary uses `role="alert" tabIndex={-1}` with `aria-labelledby` and programmatic focus upon blocked preview/validation |
| **`AlertDialog`** | **Mandatory** for Confirmation Gate (`SANDBOX` and `PRODUCTION` Commit confirmation). Never use a plain `Dialog` or inline `Alert` as a destructive confirmation modal. Uses `<AlertDialogCancel>` and `<AlertDialogAction>` with controlled `open` / `onOpenChange`. | Scrim `bg-slate-950/55` preserves high foreground isolation; Escape closes dialog when not actively committing; focus returns to trigger on cancel |
| **`Input` & `Label`** | Always pair visible `<Label htmlFor="...">` above input (never placeholder-only). Border uses `--input` (`#64748B`, `4.76:1`), height `h-10` (`40px`) / `min-h-11` mobile, `rounded-md`. Invalid state sets `aria-invalid="true"` + `aria-describedby="<id>-error"` pointing to inline error text below input. | **Accessible Authentication (WCAG 2.2 AA):** Token input MUST allow paste and password managers — **never** call `e.preventDefault()` on `onPaste` |
| **`Progress`** | Used for Batched Preview and Commit progress. Track `bg-muted h-2.5 rounded-full`, indicator `bg-primary` with smooth `transition-[width] duration-200`. | Paired with a single contextual `<p role="status" aria-atomic="true">` announcing human-readable progress (never raw bare numbers) |
| **`Skeleton`** | Content-shaped placeholders matching Dashboard cards and table rows during initial `getDashboardStatus` fetch. | Respects `prefers-reduced-motion` (static muted surface under reduced motion); avoid full-screen blocking spinners |
| **`Collapsible` / Disclosure** | Used for inspecting long monospace values (`run_id`, `_source_key`, `h1_...`, `Preview Fingerprint`) and diagnostic details on click/keyboard/touch. | Never rely on hover-only `title` tooltips; support keyboard Enter/Space + Copy button with status feedback |

### 7.2 Compact Label, Long Identifier & Live Region Rules
- **Long Token Resilience (`h1_...`, `Preview Fingerprint`, `run_id`):**
  - In table cells / summary strips: wrap inside a `flex items-center gap-1.5 min-w-0` container with `<code className="min-w-0 truncate font-mono text-xs">` paired with a `shrink-0` Copy button and/or operable Disclosure button showing the complete value inside a `wrap-anywhere` (`overflow-wrap: anywhere`) panel.
- **Contextual Live Updates:**
  - Use **one** consolidated `<div role="status" aria-atomic="true">` per async progress region (e.g., `"กำลัง Preview ข้อมูล assignments: หน้า 20 จาก 158 (200 จาก 1,571 แถว)"`). Never attach `aria-live` to every individual counter badge or tick every second on idle timers.
- **No Auto-Retry UI Contract:**
  - Global TanStack Query config enforces `refetchOnWindowFocus: false` and `retry: false` on all preview-batch, commit, and staging mutations. Accordingly, the UI must **never** render an automatic retry countdown or "Retry Commit" button after `UNKNOWN_OUTCOME_STOP` or `PREVIEW_STALE_RECONFIRM_REQUIRED`.

---

## 8. Eight ThaiPHC Datasets Reference Matrix

Both Dashboard and Sync Workspace must group all eight APIs consistently into **Reference Datasets (3)** and **Extended Report Datasets (5)**:

| Group | Endpoint Slug (Mono) | Thai Display Name | Sync Mode | Destination Tab(s) | Pagination Protocol | Privacy & Locality Rules |
|---|---|---|---|---|---|---|
| **Reference (1/3)** | `subdistricts` | ตำบล (อ.สอง) | `Keyed Upsert` | `Subdistricts` | `none` | Public lookup · Baseline `8` · Out-of-scope = `STOP` |
| **Reference (2/3)** | `villages` | หมู่บ้าน (อ.สอง) | `Keyed Upsert` | `Villages` | `none` | Public lookup · Baseline `85` · Out-of-scope = `STOP` |
| **Reference (3/3)** | `health-services` | หน่วยบริการสาธารณสุข | `Keyed Upsert` | `HealthServices` | `offset` | Public lookup · Baseline `18` · `(0,0)` coords = `REVIEW` (`PLACEHOLDER_COORDS`) · Out-of-scope = `STOP` |
| **Extended Report (1/5)** | `volunteer-gender` | สรุปเพศ อสม. รายหมู่บ้าน | `Keyed Upsert` | `VolunteerGender` | `report` | `Complementary Small-Cell Suppression` (`1..4` → `null`, `REVIEW`: `SMALL_CELL_SUPPRESSED`) · Out-of-scope = `STOP` |
| **Extended Report (2/5)** | `assignments` | การมอบหมายงาน อสม. | `Keyed Upsert` | `Assignments` | `assignment` | `Minimized Projection` + `h1_` Pseudonymous Key · Out-of-scope = `STOP` |
| **Extended Report (3/5)** | `volunteer-family` | ความสัมพันธ์ครอบครัว อสม. | `Complete Snapshot` | `RFamily_<runId>` + `_ThaiPHCReportCurrent` | `report` | `Minimized Projection` · `Preserve Source Locality` (`LOCALITY_MISMATCH` = `REVIEW`, province `54`/district `5406` = hard `STOP`) |
| **Extended Report (4/5)** | `resigned-volunteers` | อสม. ที่ลาออก | `Keyed Upsert` | `ResignedVolunteers` | `report` | `Minimized Projection` + `h1_` Pseudonymous Key · `Preserve Source Locality` (`LOCALITY_MISMATCH` = `REVIEW`, province `54`/district `5406` = hard `STOP`) |
| **Extended Report (5/5)** | `volunteer-tenure` | อายุงาน อสม. | `Keyed Upsert` | `VolunteerTenure` | `report` | `Minimized Projection` + `h1_` Pseudonymous Key · Out-of-scope = `STOP` |

---

## 9. Anti-Patterns (Strictly Forbidden)

- ❌ **Tailwind CSS v3 config (`tailwind.config.js`)** — All tokens MUST live in `src/index.css` via `@theme inline` and `:root`.
- ❌ **Phosphor icons (`@phosphor-icons/react`) or Emoji as structural icons** — Use `lucide-react` exclusively.
- ❌ **GSAP or heavy motion libraries** — Keep CSS transitions minimal (`150ms–200ms`) for single-file GAS bundle size and `prefers-reduced-motion`.
- ❌ **`BrowserRouter` / URL-mutating routing** — Breaks inside GAS `HtmlService` `IFRAME` sandbox; use state/tab navigation only.
- ❌ **Color-only status signaling** — Always pair color + icon + English status code + Thai text.
- ❌ **Interactive switches on Write Guards** — Write Guards are strictly read-only from GAS Script Properties; never imply the web UI can toggle them.
- ❌ **Implying Bearer Token persistence or blocking paste** — Never store tokens in `localStorage`/`sessionStorage`/cookies/URL; never block paste (`onPaste`); never echo token values in errors or logs.
- ❌ **Displaying raw PII (`citizenId`, personal names, addresses, `osmCode`, raw person IDs)** — Extended Report previews display only server-minimized projections and `h1_...` Pseudonymous Keys.
- ❌ **"Retry Commit" button on `UNKNOWN_OUTCOME_STOP` or `UNRESOLVED_PREVIOUS_RUN`** — Non-ACID Sheets recovery is always: Inspect Destination Sheet → Fresh Preview → Diff → Explicit Confirm.
- ❌ **Hover-only tooltips for truncated hashes/keys** — Always provide keyboard- and touch-accessible Copy or Disclosure controls.

---

## 10. Pre-Delivery QA Checklist

Before accepting any UI implementation built from this Design System, verify via Vitest + Playwright (against `MockGasTransport`):

- [ ] `src/index.css` uses Tailwind CSS v4 `@import "tailwindcss";` + `@theme inline` + `:root` (zero `tailwind.config.js`)
- [ ] All icons imported individually from `lucide-react` (zero Phosphor, zero emojis as icons)
- [ ] Zero GSAP imports; `@media (prefers-reduced-motion: reduce)` verified
- [ ] Text contrast ≥ `4.5:1` and interactive control border/focus contrast ≥ `3:1` across all Light Mode surfaces
- [ ] Environment (`SANDBOX` vs `PRODUCTION`), Write Guards (`ON`/`OFF`), Diff (`INSERT`/`UPDATE`/`UNCHANGED`/`REVIEW`), `STOP/BLOCKED`, `PREVIEW_STALE`, `UNRESOLVED_PREVIOUS_RUN`, and `LEGACY_F010_SNAPSHOT_PRESENT` all use color + icon + code + Thai label
- [ ] Keyboard navigation works end-to-end with visible `:focus-visible` rings and zero obscured focus behind sticky bars
- [ ] Focusable Error Summary (`role="alert" tabindex="-1"`) receives focus when Preview returns `STOP/BLOCKED`
- [ ] Bearer Token field allows paste, masks input, has temporary show/hide + clear + 15m idle clear + `HTTP_401` clear, and performs zero `localStorage`/`sessionStorage` writes
- [ ] Zero horizontal page overflow at `375px`, `768px`, `1024px`, and `1440px`
- [ ] Zero raw PII rendered anywhere on Dashboard or Extended Report previews
