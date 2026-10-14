# Architecture

## Local application

FPVBench v0.2 is a single-workstation application. A Node.js HTTP server binds to loopback and serves local HTML, CSS, and browser ES modules. No build step, remote assets, account, or cloud service is required. Runtime dependencies are Node built-ins and the pinned DJI decoder's embedded WebAssembly.

The interface calls JSON endpoints for aircraft, setup imports/comparison, sessions, and DJI flight records. Browser local storage remembers only the selected aircraft; the server owns the data.

## Modules

| Module | Responsibility |
| --- | --- |
| `src/parser.mjs` | Parse inert Betaflight text into profile-aware settings and metadata. |
| `src/compare.mjs` | Summarize and compare supplied evidence without inventing omitted defaults. |
| `src/store.mjs` | Validate relationships, serialize mutations, migrate legacy data, and retain originals. |
| `src/workspace-validation.mjs` | Validate catalog, sourced summaries, and normalized frames. |
| `src/workspace-lock.mjs` | Own/recover the data-directory lock. |
| `src/restore.mjs` | Validate complete backups, stage a database, and preserve the previous workspace. |
| `src/sqlite-repository.mjs` | Prepared SQLite persistence and telemetry pagination. |
| `src/dji-import.mjs` | Bound decoding requests and validate/normalize DJI evidence. |
| `src/dji-worker.mjs` | Isolate file decoding from the HTTP event loop. |
| `src/server.mjs` | Loopback entry point, APIs, bounded input, downloads, and static assets. |
| `src/errors.mjs` | Application errors and unsafe-object validation. |
| `public/app.js` | Aircraft/history/comparison views, imports, and session forms. |

## SQLite and originals

`workspace.sqlite` has tables for aircraft, snapshots, sessions, flight logs, telemetry frames, and metadata. Objects retain JSON payloads alongside indexed identifiers and relationships. Foreign keys and transactions support the store's validation; mutations write changed records. Telemetry is stored separately so the ordinary state response stays small.

An aircraft's baseline and a session's setup snapshot must belong to that aircraft. A session can link to an imported flight only for its aircraft. Each imported flight can create at most one linked session. Snapshot source and imported flight evidence are immutable; observations remain editable.

The data directory has one live owner. Writes are serialized, and new state is published after repository persistence succeeds. The original DJI bytes are stored under `imports/<sha256>.bin`. Original filenames are metadata rather than filesystem paths. Downloads check the original fingerprint.

First open validates legacy v1 JSON, creates an unchanged timestamped backup, and migrates IDs, relationships, and notes transactionally. SQLite becomes authoritative; legacy JSON is retained. Corrupt data fails without replacement. Complete v2 exports include catalog, original files, and telemetry. Restore runs locally while the server is stopped and preserves the prior workspace. See [storage and backups](storage-and-backups.md).

## Evidence

Setting keys include scope/profile. Sparse Betaflight omissions stay unknown; the app has no guessed firmware-default table. Explicit selected-profile metadata and firmware/board differences remain visible. Literal setting differences do not establish performance or firmware compatibility.

DJI imports supply locally available summary measurements and, where supported, telemetry. Binary records are processed in a bounded worker with a timeout. Modern encrypted records retain summary-only status; no remote keychain request occurs. Decoding and imported session creation do not establish the aircraft's Betaflight setup. See [DJI flight imports](dji-flight-imports.md).

## Local boundary

The server validates loopback Host headers, rejects foreign origins and cross-site requests, requires JSON for mutations, bounds file/request size, and restricts static paths. CSP limits the browser to local assets. User text renders as text, and original downloads are attachments.

The app has no controller connection, serial-write implementation, imported-content shell execution, remote decoding, or media-fetch function. This local configuration has no authenticated multi-user internet-hosting layer.

## Validation seams

Jest and browser checks inject a synthetic memory repository through store/server factories. They never open a database. Synthetic decoder seams exercise contracts, malformed input, and error handling.

A separately invoked operational proof uses actual SQLite in a disposable temporary workspace to check migration, restart, rollback, complete backup/restore, and raw bytes. Actual WASM decoding uses a synthetic flight record. Real device samples remain a separate compatibility check.

Jest, Playwright, and ESLint are development dependencies. The `@istanbuljs/load-nyc-config` override selects `js-yaml` 4.3.2 or later in the 4.x line, avoiding a vulnerable legacy dependency in the test chain.
