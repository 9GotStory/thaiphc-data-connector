# Use Keyed Upsert for Seven Stable-Key Datasets and Complete Snapshot Only for Volunteer Family

Status: accepted

The legacy F010 CLI wrote all five extended reports as versioned complete snapshot tabs (`<prefix><runId>`), which accumulates new tabs on every run and does not fit repeatable synchronization. Because four of those five reports (`volunteer-gender`, `assignments`, `resigned-volunteers`, `volunteer-tenure`) have verified stable unique keys (`villageCode` or `h1_` pseudonym) alongside the three reference datasets, we decided to use **Keyed Upsert** with a uniform 8-column metadata schema for those seven datasets and reserve **Complete Versioned Snapshot** (`RFamily_<runId>` + `_ThaiPHCReportCurrent`) exclusively for `volunteer-family`, which lacks a verified stable relation key. Existing F010 legacy snapshot tabs are never deleted automatically; previews surface `LEGACY_F010_SNAPSHOT_PRESENT` during transition.

## Considered Options

- **7 Keyed Upsert + 1 Complete Snapshot (Chosen):** Supports repeatable `INSERT`/`UPDATE`/`UNCHANGED`/`REVIEW` diffs without unbounded tab growth while respecting `volunteer-family`'s lack of a stable key.
- **3 Keyed Upsert + 5 Complete Snapshots (Legacy F010 layout):** Preserves legacy tab conventions, but creates a new full tab on every repeatable sync run and approaches Google Sheets cell/tab limits over time.

## Consequences

- All seven upserted tabs share one validation, `_row_digest` diffing, and post-sync readback engine.
- Records absent from a newer ThaiPHC pull (`MISSING_IN_SOURCE`) are reported as `REVIEW` only and left unmodified in Google Sheets (no automatic deletion).
- `LOCALITY_MISMATCH` remains `REVIEW` strictly for `volunteer-family` and `resigned-volunteers` (matching F010 PR #71); subdistrict/village mismatches on the other six datasets remain hard `STOP/BLOCKED`.
