# Storage and backups

## Data directory

FPVBench defaults to `~/.fpvbench/` on the computer running the server. Browser storage remembers the selected aircraft, fleet status filter and Metric/Imperial display preference. Display units do not change measurements in SQLite or exports. Set `FPVBENCH_DATA_DIR` to use another local directory.

`workspace.sqlite` contains the catalog and decoded telemetry. Exact original log bytes live in `imports/` under their SHA-256 fingerprints. Keep the whole data directory together when moving it while the server is stopped.

The app creates its directory and files with owner-only permissions. One live server owns each directory; a second process is rejected. Shut a manual server down with Ctrl+C, or use **Stop FPVBench** / `npm run service:stop` for the macOS background service, before a restore or filesystem copy.

## Migration from v0.1

At the first v0.2 start, existing `workspace.json` is validated, copied to a timestamped backup without changing its bytes, and migrated transactionally into SQLite. Aircraft, setups, IDs, baseline selections, sessions, and notes are preserved. Sessions receive a nullable imported-flight link.

The old JSON file remains in place. Subsequent opens use SQLite, so editing the legacy JSON no longer changes the active workspace. Unsupported or corrupt data is rejected without reset. Preserve existing files before investigating a startup failure.

## Upgrade to the fleet-aware catalog

v0.4 uses SQLite/catalog version 3 so flight records can wait in an inbox without an aircraft. On first opening an existing version 2 database, the app validates its schema, catalog, relationships and telemetry, saves an exact owner-private SQLite backup named workspace-before-v3, then upgrades the flight-log relationship transactionally. IDs, notes, setups, upload status, original files and optional AI settings stay intact. Later opens do not repeat the migration or backup. Invalid data is rejected without resetting it.

The exact SQLite backup preserves the pre-upgrade database. Retain the matching imports directory with it. For ordinary restoration, use the complete JSON export and restore command below; older version 2 exports are validated and converted into the current catalog.

## Active and retired aircraft

v0.4.2 stores an optional aircraft status in its existing SQLite payload. Existing aircraft and older backups without a status are treated as active; no database schema migration is needed. Retiring or reactivating an aircraft preserves its ID, setups, baseline, flight links, serial matching, and AirData status. The status is included in complete exports and preserved on restore. The sidebar filter affects visibility only.

## Verified distance correction in v0.4.6

The correction applies only to DJI TXT version 14/product type 137 (the independently checked Mavic 4 Pro summary family). On opening an older catalog, the app checks original fingerprints and stored telemetry, re-decodes the applicable originals, and requires all unrelated summary values to match. It prepares and validates the whole correction before saving an exact owner-private SQLite backup named `workspace-before-distance-v046-<timestamp>-<uuid>.sqlite.bak`, then saves once transactionally. Verification or backup failure refuses the correction without changing the catalog.

IDs, assignments, sessions, notes, AirData status, other flight records, and original bytes remain unchanged. Corrected summaries retain their exact raw distance, kilometre source unit, and bounded verification basis. Reopening or reimporting does not multiply an already corrected value again. Restored older complete backups receive the same verification on their next open. Keep the matching imports directory with the pre-correction SQLite backup.

## Broader archives and receipts in v0.5

Catalog/SQLite version 3 now accepts archive-only formats and an optional AirData transfer payload on each log. No table migration is required. Existing records, identifiers, measurements, notes, original bytes and manual statuses are unchanged. Older complete backups remain valid; older app versions reject new formats/receipt fields rather than silently interpreting them.

## Aircraft journals in v0.6

An optional `journalEntries` array is retained inside each aircraft's existing SQLite JSON payload. No table migration or opening-time rewrite is needed. Complete exports include all entry text, links, lifecycle state and audit timestamps; older backups without entries remain valid. Older app versions reject the new aircraft field, so preserve the pre-update workspace and matching originals before downgrading.

Journal saves do not alter setup exports, imported measurements, original files, session observations or upload receipts. A session reassignment removes old journal session links while retaining their captured titles. The full workspace backup includes journal notes and should remain private.

## Folder preferences in v0.7

`.filing-config.json` holds the local source-folder path and subfolder preference with owner-only permissions. A current scan is memory-only and clears on restart, expiry or a folder-setting change. Neither is included in the portable catalog export. Restoring into a fresh directory uses the default folder until another is selected. A corrupt preference file disables folder filing while preserving the file and the rest of the app.

Folder scanning does not change the catalog or source files. Explicit imports retain originals and relationships through the existing store, with no schema migration. `node dev/verify-import-filing.mjs` checks scanning, selected import, preserved history and receipts, unchanged source bytes, restart and complete restore in disposable SQLite workspaces.

## Complete export

Use **Export workspace** in the interface. Version 3 JSON contains:

- Aircraft, full Betaflight snapshots, and editable flight sessions.
- Imported flight summaries and metadata, including unassigned inbox entries and aircraft serial evidence.
- Aircraft serial aliases explicitly remembered for future routing.
- Exact original log files encoded as base64, including archive-only records.
- Optional AirData processing receipts, separate from manual upload marks.
- All stored normalized telemetry frames.

This is a complete portable backup rather than just a list of summaries. Keep it private; source files can contain flight locations and device identifiers.

## Restore

Stop FPVBench, then run from the repository directory with a complete version 2 or 3 export:

```sh
node src/restore.mjs /absolute/path/fpvbench-workspace.json
```

For a custom data directory, use the same value as your server:

```sh
FPVBENCH_DATA_DIR=/absolute/path/fpvbench-data node src/restore.mjs /absolute/path/fpvbench-workspace.json
```

The restore validates relationships, original fingerprints, and telemetry before replacing the active workspace. It preserves a backup of the previous workspace and refuses to run while its directory has a live owner. Start the server again with the same directory.

If the current workspace is corrupt, retain the entire existing directory and restore into a new empty directory using `FPVBENCH_DATA_DIR`. The command refuses to replace an existing workspace it cannot validate.

Do not replace `workspace.sqlite` with the downloaded JSON or overwrite the legacy `workspace.json` expecting SQLite to reread it. The restore command performs the conversion and keeps originals with their records.

## macOS background service

The optional [macOS startup service](macos-startup.md) uses the same workspace and does not relocate or reset it. Its manifest, launch definition and logs live separately under the user’s Library folders. Uninstalling the service preserves workspace data and optional AI files.

## Optional AI files

`.ai-config.json` contains the optional server-held API key and preferences; `.ai-state.json` retains the local allowance ledger and verification state; `.ai-reports.json` caches explanations. These owner-private files are excluded from the catalog JSON export. Changing the key or restoring the catalog in the same directory does not clear the ledger. A fresh directory starts with AI disabled and no key or allowance.

To preserve local AI history and settings, copy the whole data directory while the server is stopped and keep that copy private. A corrupt optional AI file leaves the core workspace usable; preserve the optional files before repairing them. See [optional AI](optional-ai.md).

## Optional AirData file

`.airdata-config.json` contains the server-held upload token, developer application key, opaque connection identity and verification timestamp. It is owner-private and excluded from complete catalog exports. Receipts are included, but a fresh restored directory needs connection configuration. Copy the whole stopped data directory to preserve credentials and their receipt identity together. A corrupt connection file disables uploads while preserving the file and core workspace.

## Local proof

`node dev/verify-sqlite.mjs` runs an operational proof against disposable temporary data. It checks actual SQLite persistence/migration and backup/restore separately from automated checks, which use a memory repository. It does not operate on the normal personal workspace.

`node dev/verify-log-intake-airdata.mjs` separately verifies archive and receipt persistence, original bytes, observations, restart dedupe and complete restore using disposable SQLite and a fake AirData transport.

`node dev/verify-journal.mjs` separately verifies actual disposable SQLite journal persistence, lifecycle, restart, complete restore, older-backup compatibility and unchanged original/setup/session/upload evidence.
