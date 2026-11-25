# Use Stateless Batched Preview Fingerprints, One-Row Sync Log, and Destination Readback for Non-ACID Sheets

Status: accepted

Large ThaiPHC datasets (~158–181 pages at `pageSize=10`) risk hitting GAS's 6-minute per-execution limit, `google.script.run` is stateless across calls, `CacheService` is capped at 100 KB per entry, and Google Sheets provides no ACID transactions or rollback. We decided to separate Preview (client-orchestrated read-only batches returning a `Preview Fingerprint` with zero writes) from Commit (re-verifying source digest and destination revision under `LockService`, using a temporary Hidden Staging Tab for large multi-batch commits, recording one row per run in `_ThaiPHCSyncLog`, and running mandatory Destination Readback). Only ephemeral `_Stage_*` tabs are removed after verified readback; failed or unknown staging tabs, data rows, and legacy snapshots are never auto-deleted, and writes are never auto-retried.

## Considered Options

- **Batched Preview + Fingerprint-Verified Commit + `_ThaiPHCSyncLog` + Readback (Chosen):** Zero writes or PII caching before confirmation, detects stale previews and partial/unknown outcomes (`UNRESOLVED_PREVIOUS_RUN`), and avoids building a heavy transaction framework.
- **Stage to Hidden Sheet During Preview:** Fetches ThaiPHC once, but mutates Google Sheets before the operator confirms.
- **Cache Minimized Rows in Chunked `CacheService`:** Fetches once without touching Sheets, but persists person-derived rows in shared cache subject to 100 KB chunk limits and LRU eviction.

## Consequences

- Each full sync fetches ThaiPHC twice (Preview + Commit), well within Personal Gmail's 20,000 `UrlFetchApp` calls/day quota (actual batch sizes tuned from Gate 0 measurements).
- Fixed-tab upserts explicitly do not claim 100% atomic rollback; recovery from `UNRESOLVED_PREVIOUS_RUN` is operator inspection followed by a fresh Preview → Diff → Confirm cycle.
