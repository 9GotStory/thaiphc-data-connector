# ThaiPHC Data Connector

Domain language for the manual, repeatable synchronization of authorized ThaiPHC public health datasets for Phrae province (`54`), Song district (`5406`) into controlled Google Sheets.

## Language

### Scope & Datasets

**ThaiPHC**:
The authoritative Thai Primary Health Care information system for Village Health Volunteers (อสม.) and local health service lookups from which datasets are manually retrieved.
_Avoid_: Source portal, upstream database, MOPH scraper

**Geographic Scope (`54 / 5406`)**:
The fixed administrative boundary permitted for synchronization: Phrae province (`54`) and Song district (`5406`), covering 8 subdistricts (`540601`–`540608`) and 85 villages.
_Avoid_: Area filter, region config

**Reference Dataset**:
One of the three non-person administrative or facility datasets (`subdistricts`, `villages`, `health-services`) that form the geographic lookup foundation.
_Avoid_: Lookup table, master data, static list

**Extended Report Dataset**:
One of the five volunteer or aggregate report datasets (`volunteer-gender`, `assignments`, `volunteer-family`, `resigned-volunteers`, `volunteer-tenure`) subject to privacy minimization or small-cell disclosure controls.
_Avoid_: Personal report, F010 export, volunteer dump

**Historical Acceptance Baseline**:
The 111 previously accepted reference rows (8 subdistricts, 85 villages, 18 health services) recorded as historical verification context—not a permanent prohibition against future approved updates.
_Avoid_: Immutable rows, frozen baseline

### Synchronization Semantics

**Repeatable Sync**:
An operator-initiated synchronization cycle that retrieves current ThaiPHC records, compares them against existing destination records, and applies only approved inserts and updates on demand.
_Avoid_: One-time import, bulk load, automated sync

**Keyed Upsert**:
A synchronization strategy for datasets with a verified stable unique key, inserting new records, updating changed records in place, and leaving unchanged records untouched.
_Avoid_: Overwrite, blind replace, full reload

**Complete Snapshot**:
A synchronization strategy for datasets without a reliable stable unique key (`volunteer-family`), publishing each verified run as a complete, self-contained versioned sheet rather than merging by key.
_Avoid_: Partial snapshot, incremental sheet, guessed-key merge

**Diff Classification**:
The four mutually exclusive preview outcomes comparing source records against destination records: `INSERT` (new key), `UPDATE` (existing key with changed content), `UNCHANGED` (identical content), and `REVIEW` (non-blocking condition requiring operator attention).
_Avoid_: Change delta, sync status

**Missing in Source**:
A `REVIEW` condition where a record exists in the destination sheet from a prior sync but does not appear in the current ThaiPHC retrieval; it is reported for inspection and never deleted automatically.
_Avoid_: Deleted row, orphaned record, stale deletion

**Legacy Snapshot**:
A versioned report tab previously produced by the F010 CLI workflow; preserved untouched during migration and never deleted automatically.
_Avoid_: Old sheet, obsolete backup

### Privacy & Identity

**Minimized Projection**:
The privacy-reduced representation of an Extended Report Dataset with direct personal identifiers omitted before preview display or storage.
_Avoid_: Redacted dump, anonymized export

**Pseudonymous Key**:
A deterministic, domain-separated keyed identifier (`h1_...`) derived from a source person record ID so repeatable updates match existing records without storing direct personal identifiers.
_Avoid_: Citizen hash, person ID, raw key

**Complementary Small-Cell Suppression**:
The privacy rule for `volunteer-gender` that suppresses both `male` and `female` counts whenever any of `male`, `female`, or `total` falls in `1..4` (and suppresses `total` if below `5`) to prevent disclosure by subtraction.
_Avoid_: Low-count hiding, value masking

**Preserve Source Locality**:
The dataset-specific rule for `volunteer-family` and `resigned-volunteers` where province `54` and district `5406` enforce hard scope boundaries while lower-level subdistrict or village mismatches are retained unaltered and surfaced as `REVIEW`.
_Avoid_: Auto-correct locality, silent normalization

### Safety & Verification

**Preview Fingerprint**:
A deterministic summary of source completeness, source content, and current destination state produced during preview and re-verified before commit so stale previews cannot be written.
_Avoid_: Preview cache, session lock

**Hidden Staging Tab**:
A temporary non-public worksheet used to assemble and verify large multi-batch sync runs before applying updates or publishing a complete snapshot.
_Avoid_: Draft table, temp sheet

**Publication Pointer**:
The index record (`_ThaiPHCReportCurrent`) identifying the single verified Complete Snapshot tab currently active for a snapshot-based dataset.
_Avoid_: Latest tab, active flag

**Unresolved Previous Run**:
A sync run whose tracking record stopped before confirmed completion, requiring destination inspection and a fresh preview before any subsequent sync.
_Avoid_: Failed job, retryable run

**Destination Readback**:
An independent post-write read of the destination sheet verifying row counts, key uniqueness, content digests, and preservation of unrelated tabs before considering a sync verified.
_Avoid_: Write receipt, optimistic success
