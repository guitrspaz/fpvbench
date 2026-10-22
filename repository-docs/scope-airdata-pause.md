# Local records and deferred AirData uploads

## Authorized scope — 2026-10-22
Preserve local flight imports, exact originals, checksum deduplication, aircraft assignment, sessions, measurements, complete export/restore and all stored manual marks/receipts. Defer the AirData integration without deleting its standalone service or transfer model. No schema migration, credential mutation, live provider requests, release or push.

## Behavior
The application server must never construct the AirData service. All /api/airdata routes return 410 with a concise deferred-feature message, regardless of saved credentials or injected upload factories. Existing private credential files remain untouched and outside exports. Folder scanning/importing uses local catalog evidence only: new originals, duplicates, assignments and blocked files; no upload queue or provider settings reads.

Library manual tracking is off by default and explicitly enabled using a browser-local checkbox. Its status filter and bulk marking controls appear only while enabled; unmarked records mean Not recorded, never Not uploaded. Aircraft filtering/import filing remains available regardless of manual tracking. Individual details offer a collapsed Manual upload tracking section supporting unknown/uploaded/not-uploaded; legacy receipts are retained and shown separately as historical unrefreshed evidence, independent of a connection identity. No credentials, sending, refresh actions, or upload setup prompts remain in the UI.

## Validation plan
- Jest HTTP integration with injected memory repository and isolated local files: all deferred routes (including descendants/methods) reject, saved credentials are neither read nor mutated, no service factory/network call occurs; imports, raw downloads, deduplication, manual mark/reset, assignments, telemetry and full export/restore preserve original and historical metadata.
- Jest filing tests: no provider access; folder scan counts and explicit imports/assignment refresh retain local behavior. Standalone dormant upload-service unit tests remain.
- Playwright synthetic memory-store journeys: no AirData requests, settings controls absent, optional manual controls default hidden, bulk and individual marks/filter/reset/reload work, unknown has no upload-due badge, historical receipt survives, folder review has no upload queue, desktop/mobile layout and existing core journeys work. Use MCP_DOCKER for browser checks.
- ESLint and complete Jest checks; no live user data or database connections.

## Documentation plan
Update README, repository-docs/README.md, airdata.md (canonical current upload/manual workflow), import-filing.md (local filing), architecture.md, storage-and-backups.md, dji-flight-imports.md, validation.md and browser-validation.md in place for human and agent readers. Historical version scopes and historical validation evidence stay explicitly historical. Index this scope from repository-docs/README.md. Record validation actually run and limitations.

## Local rollout elaboration

The installed service was verified to use this checkout, the normal personal workspace and port 4173. After validation, preserve an owner-private complete workspace export outside the repository and a copy of each changed source file. Check every target still matches the original source snapshot before writing. Stop the existing local service, apply only the reviewed files, and start it through its existing control script. Compare the full export for exact data equality and check deferred routes return 410. On startup or verification failure restore the previous source files and restart the previous implementation; preserve the backup and report any data mismatch without automatically restoring user data. No reinstall, login preference change or provider check.
