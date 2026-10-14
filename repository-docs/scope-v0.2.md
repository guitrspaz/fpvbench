# FPVBench v0.2: SQLite and DJI flight imports

## Authorized scope
User approved moving local organization to SQLite and importing copied DJI flight-record files. Preserve v0.1 aircraft, snapshots, baselines, notes, sessions, and original source. No controller operation, cloud hosting, external keychain request, API credential entry, or public release.

## Storage contract
Use Node's built-in node:sqlite (Node >=22.13), with prepared statements and foreign-key/transaction constraints. Tables: aircraft, snapshots, sessions, flight_logs, telemetry_frames, metadata. Keep existing object payloads JSON alongside indexed IDs/relationships; write only changed records. Retain one live owner per data directory and serialized mutations. workspace.sqlite is authoritative. Original DJI bytes live in imports/<sha256>.bin with owner-only permissions. Original filenames are metadata, never filesystem paths.

On first open without a migrated database, validate existing workspace.json fully using v0.1 validators, create an owner-private timestamped unchanged backup BEFORE migration, and commit all existing IDs and data in one SQLite transaction. Do not delete or alter legacy JSON. Migration is idempotent; an existing SQLite database is authoritative. Corrupt/unsupported JSON or database must fail without reset/overwrite. Failed migration must permit a safe retry without silently dropping records.

Export must remain a COMPLETE versioned backup: v2 JSON with aircraft/snapshots/sessions/flightLogs plus originals [{flightLogId, contentBase64}] and telemetry [{flightLogId, frames}]. Add a local explicit restore CLI (server stopped, validation and backup before replace) or document/provide an equivalent fully working restore operation. No partial backups labeled complete.

Repository seam for automated tests: createStore(dataDir, {repositoryFactory?, decodeFlight?}) and createServer({..., storeFactory?}). Default repositoryFactory opens SQLite, but Jest and browser automated suites inject a synthetic in-memory repository. The repository exposes load(), save(next, previous, {telemetry?: {flightLogId,frames}} = {}), readFrames(logId,offset,limit), exportTelemetry(), close(); Promise-compatible. load returns v2 catalog or null for new store. All actual SQLite connection/schema/migration/restart/corruption verification runs as a separately invoked local operational proof in dev/verify-sqlite.mjs against a disposable temp directory, not an automated test datasource. Deterministic cleanup; no shared data.

## Objects and importer result
Existing Aircraft and Snapshot retain exact v0.1 API shapes. Session adds flightLogId (nullable); v1 migration defaults it to null. It must belong to same aircraft, and each imported FlightLog can generate at most one session. Manual notes/outcomes/confirmation remain user-owned.

FlightLog: id, aircraftId, filename, sourceDevice (user-provided string, e.g. DJI RC), importedAt, sha256, byteLength, format ('dji-txt'/'dji-json'), logVersion (integer), status ('summary-only'/'decoded'), summary, frameCount, warnings (string[]), airdataStatus (unknown/not-uploaded/uploaded; default unknown).
Summary fields: startTime (ISO|null), durationSeconds (number|null), distanceMeters, maxHeightMeters, maxHorizontalSpeedMps, aircraftName, aircraftModel, location (all nullable), startCoordinate ({latitude,longitude}|null). Values are sourced from decoder fields, bounded/validated; missing stays null, never invented or zero by default. Do not expose full component serials in summaries.
Decoded result from decodeDjiFlight(bytes,{filename}) -> {format,logVersion,status,summary,frames: normalized Frame[],warnings}. Normalized frames: {timestamp:ISO|null,elapsedSeconds:number|null,latitude:number|null,longitude:number|null,altitudeMeters:number|null,batteryPercent:number|null,horizontalSpeedMps:number|null}. Frame count maximum 100000; source max25MiB. Use pinned maintained dji-log-parser-js@0.5.7, MIT license preserved through dependency. Binary TXT uses Uint8Array, never text decoder/paste. Version >=13: locally read unencrypted details only, mark encrypted telemetry unavailable. Versions <13: try local frames; failures retain summary with warning. Do not invoke fetchKeychains, fetch, network or a shell. Structured decoded DJI JSON accepts lvauvillier shape {version,details,frames}, with optional compatible {version,summary,frames}; reject arbitrary JSON, raw-record exports, DAT and invalid files honestly. Unknown versions/metadata are not blanket device compatibility claims.
Run untrusted binary decoding in a bounded worker thread (10s timeout and limits) so malformed inputs do not freeze HTTP service. Parser workers return sanitized errors; no raw bytes/location/serial logging. In tests inject/mock parser and worker seam; test real WASM on synthetic binary/decoded JSON in the manual operational proof, and a real sample only if user supplies a local path.

## Import behavior
User selects aircraft and one or multiple copied files in a separate Import DJI flights dialog. No retyping. POST returns an immutable FlightLog and an automatically populated Session when valid startTime is present; missing startTime -> log retained, session null with actionable warning. Fill title, flownAt, durationMinutes, location from sourced metadata; notes remain blank/manual and confirmedSetup false, snapshotId null. Do not fabricate settings from telemetry or link an arbitrary Betaflight baseline to DJI flights.
SHA-256 dedupe: same bytes + same aircraft returns existing log/session and duplicate true; cross-aircraft duplicate returns409 with explanation. Renaming file must not duplicate a flight. Unsupported/malformed files do not create records. Batch processes sequentially and reports successes/errors per file without discarding successes.
Store original bytes exactly before catalog commit; rollback newly created orphan on commit failure, preserve existing original. Get original verifies checksum/path safety. Immutable summary metadata remains separate from editable session notes. Views show imported origin, summary-only vs decoded, version, summary metrics, warnings, raw download, and paginated local telemetry table when present; no remote map tiles needed.

## API
Existing routes unchanged, except /api/state includes flightLogs and storage:'sqlite'; /api/export v2 is async complete backup. GET /api/state summaries exclude raw source/frames.
POST /api/flight-logs {aircraftId,filename,sourceDevice?,contentBase64} -> {flightLog:FlightLog,session:Session|null,duplicate:boolean},201 new/200 duplicate. Strict base64 validation,25MiB decoded file bound and HTTP JSON body limit36MiB.
GET /api/flight-logs/:id -> FlightLog.
GET /api/flight-logs/:id/raw -> exact original attachment.
GET /api/flight-logs/:id/frames?offset=0&limit=100 -> {frames,total,offset,limit}; maximum limit1000; validate bounds/IDs.
POST/PATCH sessions allow flightLogId and enforce same-aircraft reference; UI editing imports must preserve link.
Injected createServer storeFactory used by automated API/browser tests, no SQLite connection.
Expected statuses400/404/409/413/415/422 unsupported or decode failure,429 decoder busy if needed, sanitized500. Loopback/CSP/origin controls preserved.

## Test and evidence plan
Jest: parser normalization with mocked decoder; binary/json limits and source status, missing/date metadata, malformed frames; store behavior with injected in-memory repository and local file I/O; dedupe/relationships/manual notes preservation/rollback; HTTP import/raw/frames contract with mocked persistence.
Browser: existing workflow plus DJI JSON upload, metadata-created session, duplicate detection, imported link preserved on edit/reload, original download and summary-only label; injected in-memory repository so no automated datasource. Frontend-test specialist owns Playwright checks after integration.
Operational proof: actual SQLite schema/persistence, prepared writes, FK integrity, v1 backup and idempotent migration, rollback, complete export/restore, raw byte checks and local WASM decoding. Disposable local directory removed in finally. The real user workspace migration is a distinct final rollout, backup first, compare counts/IDs/hashes and restart service; never log content or locations.

## User steering: local library and AirData tracking

The user keeps copied flight records locally and still uses AirData for analysis. Retain checksum dedupe to identify files already in FPVBench. Add an independently editable manual airdataStatus (unknown/not-uploaded/uploaded), default unknown so historical uploads are not guessed. PATCH /api/flight-logs/:id accepts only this field; imported source, summaries and frames remain unchanged. Show status and a status filter in the import history; detail permits changing it. Persist status through reload, dedupe and complete backup/restore. No AirData API access, external upload, account login or device inventory claims. A local library cannot detect files still on a controller until they are copied/imported.

## Documentation
Update README quickstart/runtime dependency, data/backup/restore and import workflow; architecture data schema and current seams; add repository-docs/dji-flight-imports.md with exact supported formats, encryption limits, privacy/no network and primary source links. Add scope v0.2 and refresh doc index/validation. Historical v0.1 scope remains historical. No personal workspace policy or employer information in repo.

## Ownership
SQLite/store agent: src/store.mjs, src/sqlite-repository.mjs and related migration/restore modules, tests/store.test.mjs and persistence tests, dev/verify-sqlite.mjs. Decoder agent: src/dji-import.mjs, src/dji-worker.mjs, decoder tests and synthetic fixture builders. Interface/API agent: public/**, src/server.mjs, tests/server.test.mjs. Parent: package/config/docs/examples, shared mock-repository helper if needed, integration/review/final rollout. Coordinate exact module seams; do not revert others.
