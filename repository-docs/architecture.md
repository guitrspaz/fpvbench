# Architecture

## Local application

FPVBench v0.7 is a single-workstation application. A Node.js HTTP server binds to loopback and serves local HTML, CSS, and browser ES modules. No build step, remote assets, account, or cloud service is required. Runtime dependencies are Node built-ins and the pinned DJI decoder's embedded WebAssembly. Optional OpenAI and AirData requests use server-side fetch.

The interface calls JSON endpoints for aircraft, setup imports/comparison, sessions, and flight-log records. Browser local storage remembers aircraft/fleet selection and display units; the server owns the data.

## Modules

| Module | Responsibility |
| --- | --- |
| `src/parser.mjs` | Parse inert Betaflight text into profile-aware settings and metadata. |
| `src/compare.mjs` | Summarize and compare supplied evidence without inventing omitted defaults. |
| `src/journal.mjs` | Calculate the aircraft-scoped next-session brief from recorded evidence without provider calls. |
| `src/store.mjs` | Validate relationships, serialize mutations, migrate legacy data, and retain originals. |
| `src/workspace-validation.mjs` | Validate catalog, sourced summaries, and normalized frames. |
| `src/workspace-lock.mjs` | Own/recover the data-directory lock. |
| `src/restore.mjs` | Validate complete backups, stage a database, and preserve the previous workspace. |
| `src/sqlite-repository.mjs` | Prepared SQLite persistence and telemetry pagination. |
| `src/log-import.mjs` | Recognize content and retain broader originals without inventing flight evidence. |
| `src/import-filing.mjs` | Scan local source folders, classify exact originals against the catalog, and recheck selected files before import. |
| `src/airdata.mjs` | Hold private credentials, verify the connection, send selected originals and poll recorded jobs. |
| `src/airdata-transfer.mjs` | Validate receipts and identify upload-eligible formats. |
| `src/dji-import.mjs` | Bound decoding requests and validate/normalize DJI evidence. |
| `src/dji-worker.mjs` | Isolate file decoding from the HTTP event loop. |
| `src/ai-service.mjs` | Gate optional OpenAI requests, reserve local allowance, validate output, and cache reports. |
| `src/ai-private-files.mjs` | Read/write owner-private credentials and AI state without following symlinks. |
| `src/macos-service.mjs` | Generate and manage per-user macOS launch artifacts, clickable controls, readiness and verified manual-server handoff. |
| `src/assistant.mjs` | Assemble actual setup/baseline context, cache explanations, and provide flight recaps. |
| `src/assistant-evidence.mjs` | Filter explicit tuning fields and calculate aggregate flight facts. |
| `src/assistant-glossary.mjs` | Supply fixed source-attributed Betaflight guidance. |
| `src/server.mjs` | Loopback entry point, APIs, bounded input, downloads, and static assets. |
| `src/errors.mjs` | Application errors and unsafe-object validation. |
| `public/app.js` | Aircraft/history/comparison views, imports, and session forms. |

## SQLite and originals

`workspace.sqlite` has tables for aircraft, snapshots, sessions, flight logs, telemetry frames, and metadata. Objects retain JSON payloads alongside indexed identifiers and relationships. Foreign keys and transactions support the store's validation; mutations write changed records. Telemetry is stored separately so the ordinary state response stays small.

An aircraft's baseline and a session's setup snapshot must belong to that aircraft. A session can link to an imported flight only for its aircraft. Each imported flight can create at most one linked session. Snapshot source and imported flight evidence are immutable; observations remain editable.

The data directory has one live owner. Writes are serialized, and new state is published after repository persistence succeeds. The original log bytes are stored under `imports/<sha256>.bin`. Original filenames are metadata rather than filesystem paths. Downloads check the original fingerprint.

First open validates legacy v1 JSON, creates an unchanged timestamped backup, and migrates IDs, relationships, and notes transactionally. SQLite becomes authoritative; legacy JSON is retained. Corrupt data fails without replacement. Complete v3 exports include catalog, original files, and telemetry. Restore runs locally while the server is stopped and preserves the prior workspace. See [storage and backups](storage-and-backups.md).

## Evidence

Setting keys include scope/profile. Sparse Betaflight omissions stay unknown; the app has no guessed firmware-default table. Explicit selected-profile metadata and firmware/board differences remain visible. Literal setting differences do not establish performance or firmware compatibility.

DJI imports supply locally available summary measurements and, where supported, telemetry. Binary records are processed in a bounded worker with a timeout. Modern encrypted records retain summary-only status; no remote keychain request occurs. Decoding and imported session creation do not establish the aircraft's Betaflight setup. See [DJI flight imports](dji-flight-imports.md).

## Local boundary

The server validates loopback Host headers, rejects foreign origins and cross-site requests, requires JSON for mutations, bounds file/request size, and restricts static paths. CSP limits the browser to local assets. User text renders as text, and original downloads are attachments.

The app has no controller connection, serial-write implementation, imported-content shell execution, remote decoding, or media-fetch function. This local configuration has no authenticated multi-user internet-hosting layer.

## Optional AI

AI is disabled by default with no key and zero allowance. Settings exposes a write-only credential field and an explicitly billed connection check. Feature availability requires opt-in, a saved key, verified API access, and room for a conservative local spending reservation. Account balance is not queried. Provider billing/auth failures block AI until an explicit successful check; core features continue. Corrupt optional AI state disables only the assistant and is preserved for repair.

Credentials, ledger, and bounded report cache live in `.ai-config.json`, `.ai-state.json`, and `.ai-reports.json` under the private data directory. They are excluded from the ordinary catalog export. The service serializes operations, persists a reservation before transmission, and reconciles known usage. Uncertain charges keep the reservation; no automatic retry occurs.

Setup input contains only allowlisted explicit values and filtered baseline context. Flight summaries are calculated locally before being explained. Reports are advisory and never apply controller settings. Server calls the fixed OpenAI Responses endpoint with store:false, no tools, and bounded structured output. The browser calls only local APIs. See [optional AI](optional-ai.md).

## Optional AirData

Credentials live in owner-private `.airdata-config.json` and are excluded from exports. Saving settings makes no network call. Explicit connection verification gates selected uploads. Returned upload destinations must match bounded HTTPS AirData hosts; redirects are refused and responses/timeouts are bounded. Uploading uses each immutable original.

A submitting receipt is persisted before transmitting the file. An interrupted submission stays uncertain and is skipped by subsequent send requests. Known job polling updates the receipt without resending. Manual upload marks and provider processing results are distinct. Token changes isolate current receipts; only the latest attempt is retained. Archive records provide no decoded flight measurements, automatic sessions or AI flight totals. See [AirData uploads](airdata.md).

## Validation seams

Jest and browser checks inject a synthetic memory repository through store/server factories. They never open a database. Synthetic decoder seams exercise contracts, malformed input, and error handling.

A separately invoked operational proof uses actual SQLite in a disposable temporary workspace to check migration, restart, rollback, complete backup/restore, and raw bytes. Actual WASM decoding uses a synthetic flight record. Real device samples remain a separate compatibility check.

Jest, Playwright, and ESLint are development dependencies. The `@istanbuljs/load-nyc-config` override selects `js-yaml` 4.3.2 or later in the 4.x line, avoiding a vulnerable legacy dependency in the test chain.

## Fleet routing and inbox

Imported flight records can have a null aircraft relationship in catalog/SQLite version 3. Aircraft and sessions still require actual fleet identities. Serial matching uses only aircraft serials and explicit aliases; controller identity, labels and selection do not route mixed imports. Unassigned records retain original/telemetry evidence without a session until assignment. Assignment, alias learning and session creation/update commit together. Explicit batch rematching only changes unassigned records. Reassignment clears the old aircraft’s setup link and confirmation while retaining session observations. Exact-byte dedupe spans all aircraft and the inbox. Existing v2 SQLite is backed up before its transactional nullable-flight relationship migration; complete v2 JSON exports remain restorable.

## Bulk manual AirData marks

`POST /api/flight-logs/mark-uploaded` accepts only explicit record IDs, with a 64 KiB request body and up to 1,000 IDs. The store deduplicates and resolves every ID before changing manual upload status, validates the records, and saves one serialized transaction per batch. Invalid IDs or a save failure leave the entire batch unchanged. Provider receipts and all other evidence remain intact; no provider service is called.

The library selects records using its aircraft and AirData filters and clears selection when either changes. Manual marking works without credentials. Larger selections use sequential batches of 1,000 and retain successful earlier batches after a later failure. The existing send/refresh limit remains twenty. Folder review derives its queue from the updated catalog without a new filesystem scan.

## Import filing

The filing service saves a folder preference in owner-private `.filing-config.json`; the latest bounded scan remains in memory. Explicit scans hash eligible files without decoding or importing. SHA-256 links renamed copies to existing originals. Reports derive current assignment and account-scoped upload evidence from the catalog without provider requests.

`GET/PATCH /api/filing/settings` reads or saves the location. `GET /api/filing/scan` reads the latest report; `POST` starts a scan. `POST /api/filing/import` accepts one scan ID and up to twenty opaque file IDs, never client-supplied file paths. A scan expires after thirty minutes, on restart, or on a settings change. Concurrent filing mutations are rejected while an operation is active; close waits for it to finish.

Source reads reject symlinks and workspace paths, bound traversal and bytes, and compare file identity and metadata around streaming reads. Import also checks the scanned fingerprint and SHA-256 before using the normal import store. Sources remain unchanged, successful imports survive per-file failures, and selected new originals use existing serial routing and dedupe. No catalog migration is required. See [import filing](import-filing.md).

A metadata-only ctime change during a scan permits one bounded second read with the same content hash; selected imports keep strict freshness checks. The macOS service sets the documented `MaterializeDatalessFiles` policy so reads can retrieve cloud-backed file contents. Operating-system downloads can add latency; traversal and read loops check the processing budget between filesystem calls.

## Aircraft journal and next-session brief

Aircraft JSON payloads optionally contain up to 500 journal entries; absence means empty. The catalog and SQLite schema remain version 3. Dedicated journal APIs own creation and editing, while ordinary aircraft updates cannot replace the journal. Validation checks entry fields, global ID uniqueness, timestamps, lifecycle states and same-aircraft setup/session links. Serialized writes preserve atomicity.

`GET/POST /api/aircraft/:id/journal` reads/creates entries; `PATCH /api/aircraft/:id/journal/:entryId` edits an entry or changes next-step status. The server owns IDs, creation/update/close timestamps and captured session titles. Session reassignment detaches old-aircraft journal links while retaining captured titles and user text. No entry is moved or automatically generated.

`GET /api/aircraft/:id/brief` computes up to three oldest open next steps, three newest changes/observations, and references to the latest recorded session, latest saved setup and preferred baseline. Ties use entry IDs. Snapshot confirmation derives only from explicitly confirmed session links. The browser guards delayed brief responses against aircraft/view changes. Journal content is excluded from existing AI inputs and needs no provider access. See [the user guide](change-journal.md).
