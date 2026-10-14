# Storage and backups

## Data directory

FPVBench defaults to `~/.fpvbench/` on the computer running the server. Browser storage remembers the selected aircraft and fleet status filter. Set `FPVBENCH_DATA_DIR` to use another local directory.

`workspace.sqlite` contains the catalog and decoded telemetry. Exact original DJI bytes live in `imports/` under their SHA-256 fingerprints. Keep the whole data directory together when moving it while the server is stopped.

The app creates its directory and files with owner-only permissions. One live server owns each directory; a second process is rejected. Shut the server down with Ctrl+C before a restore or filesystem copy.

## Migration from v0.1

At the first v0.2 start, existing `workspace.json` is validated, copied to a timestamped backup without changing its bytes, and migrated transactionally into SQLite. Aircraft, setups, IDs, baseline selections, sessions, and notes are preserved. Sessions receive a nullable imported-flight link.

The old JSON file remains in place. Subsequent opens use SQLite, so editing the legacy JSON no longer changes the active workspace. Unsupported or corrupt data is rejected without reset. Preserve existing files before investigating a startup failure.

## Upgrade to the fleet-aware catalog

v0.4 uses SQLite/catalog version 3 so flight records can wait in an inbox without an aircraft. On first opening an existing version 2 database, the app validates its schema, catalog, relationships and telemetry, saves an exact owner-private SQLite backup named workspace-before-v3, then upgrades the flight-log relationship transactionally. IDs, notes, setups, upload status, original files and optional AI settings stay intact. Later opens do not repeat the migration or backup. Invalid data is rejected without resetting it.

The exact SQLite backup preserves the pre-upgrade database. Retain the matching imports directory with it. For ordinary restoration, use the complete JSON export and restore command below; older version 2 exports are validated and converted into the current catalog.

## Active and retired aircraft

v0.4.2 stores an optional aircraft status in its existing SQLite payload. Existing aircraft and older backups without a status are treated as active; no database schema migration is needed. Retiring or reactivating an aircraft preserves its ID, setups, baseline, flight links, serial matching, and AirData status. The status is included in complete exports and preserved on restore. The sidebar filter affects visibility only.

## Complete export

Use **Export workspace** in the interface. Version 3 JSON contains:

- Aircraft, full Betaflight snapshots, and editable flight sessions.
- Imported flight summaries and metadata, including unassigned inbox entries and aircraft serial evidence.
- Aircraft serial aliases explicitly remembered for future routing.
- Exact original DJI files encoded as base64.
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

## Optional AI files

`.ai-config.json` contains the optional server-held API key and preferences; `.ai-state.json` retains the local allowance ledger and verification state; `.ai-reports.json` caches explanations. These owner-private files are excluded from the catalog JSON export. Changing the key or restoring the catalog in the same directory does not clear the ledger. A fresh directory starts with AI disabled and no key or allowance.

To preserve local AI history and settings, copy the whole data directory while the server is stopped and keep that copy private. A corrupt optional AI file leaves the core workspace usable; preserve the optional files before repairing them. See [optional AI](optional-ai.md).

## Local proof

`node dev/verify-sqlite.mjs` runs an operational proof against disposable temporary data. It checks actual SQLite persistence/migration and backup/restore separately from automated checks, which use a memory repository. It does not operate on the normal personal workspace.
