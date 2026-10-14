# Storage and backups

## Data directory

FPVBench defaults to `~/.fpvbench/` on the computer running the server. Browser storage only remembers the selected aircraft. Set `FPVBENCH_DATA_DIR` to use another local directory.

`workspace.sqlite` contains the catalog and decoded telemetry. Exact original DJI bytes live in `imports/` under their SHA-256 fingerprints. Keep the whole data directory together when moving it while the server is stopped.

The app creates its directory and files with owner-only permissions. One live server owns each directory; a second process is rejected. Shut the server down with Ctrl+C before a restore or filesystem copy.

## Migration from v0.1

At the first v0.2 start, existing `workspace.json` is validated, copied to a timestamped backup without changing its bytes, and migrated transactionally into SQLite. Aircraft, setups, IDs, baseline selections, sessions, and notes are preserved. Sessions receive a nullable imported-flight link.

The old JSON file remains in place. Subsequent opens use SQLite, so editing the legacy JSON no longer changes the active workspace. Unsupported or corrupt data is rejected without reset. Preserve existing files before investigating a startup failure.

## Complete export

Use **Export workspace** in the interface. Version 2 JSON contains:

- Aircraft, full Betaflight snapshots, and editable flight sessions.
- Imported flight summaries and metadata.
- Exact original DJI files encoded as base64.
- All stored normalized telemetry frames.

This is a complete portable backup rather than just a list of summaries. Keep it private; source files can contain flight locations and device identifiers.

## Restore

Stop FPVBench, then run from the repository directory with a complete version 2 export:

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

## Local proof

`node dev/verify-sqlite.mjs` runs an operational proof against disposable temporary data. It checks actual SQLite persistence/migration and backup/restore separately from automated checks, which use a memory repository. It does not operate on the normal personal workspace.
