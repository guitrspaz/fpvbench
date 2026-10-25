# Architecture

**Last Updated:** October 25, 2026

## Local application

FPVBench v0.7 is a single-workstation application. A Node.js HTTP server binds to loopback and serves local HTML, CSS, and browser ES modules. No build step, remote assets, account, or cloud service is required. Runtime dependencies are Node built-ins and the pinned DJI decoder's embedded WebAssembly. Optional OpenAI requests use server-side fetch. AirData integration is deferred; the server never constructs its service.

The interface calls JSON endpoints for aircraft, setup imports/comparison, sessions, and flight-log records. Browser local storage remembers aircraft/fleet selection, display units and the optional manual-upload-tracking preference; the server owns the data.

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
| `src/airdata.mjs` | Dormant upload implementation retained for future reassessment; never initialized by the application server. |
| `src/airdata-transfer.mjs` | Validate preserved receipts; retain dormant upload-format constants. |
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
| `public/app.js` | Aircraft/history/comparison views, imports, session forms, and beginner-page navigation. |
| `public/controller.js` | Controller schematic, reference pickers, guided checks, and Advanced evidence/editor. |
| `public/controller-language.js` | Pure action explanations, confidence, readable changes, and next steps for interpretation limits. |
| `public/controller-check.js` | Pure observation validation and explicit flight/preferred/previous reference selection. |
| `public/controller-guide.js` | Disposable three-step physical-check form. |
| `public/controller-card.js` | Escaped standalone HTML card and local browser download. |
| `public/getting-started.js` | Read-only example entry point, import guidance, and stopped-server recovery instructions. |
| `public/demo-controller.js` | Synthetic controller-comparison fixture with no personal exports. |

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

## Deferred AirData integration

All `/api/airdata` routes return HTTP 410. The application server neither constructs the upload service nor reads its configuration, even when existing credentials are present. The browser has no upload settings, send/refresh actions or AirData API requests. No runtime opt-in restores these routes.

Manual upload fields and historical receipts remain independent catalog evidence, preserved by deduplication, export and restore. Historical receipts display without a current connection identity and are explicitly unrefreshed. Existing credential files stay untouched and excluded from exports. The standalone service remains covered by synthetic unit tests for future reassessment. See [manual tracking and deferral](airdata.md).

## Validation seams

Jest and browser checks inject a synthetic memory repository through store/server factories. They never open a database. Synthetic decoder seams exercise contracts, malformed input, and error handling.

A separately invoked operational proof uses actual SQLite in a disposable temporary workspace to check migration, restart, rollback, complete backup/restore, and raw bytes. Actual WASM decoding uses a synthetic flight record. Real device samples remain a separate compatibility check.

Jest, Playwright, and ESLint are development dependencies. The `@istanbuljs/load-nyc-config` override selects `js-yaml` 4.3.2 or later in the 4.x line, avoiding a vulnerable legacy dependency in the test chain.

## Fleet routing and inbox

Imported flight records can have a null aircraft relationship in catalog/SQLite version 3. Aircraft and sessions still require actual fleet identities. Serial matching uses only aircraft serials and explicit aliases; controller identity, labels and selection do not route mixed imports. Unassigned records retain original/telemetry evidence without a session until assignment. Assignment, alias learning and session creation/update commit together. Explicit batch rematching only changes unassigned records. Reassignment clears the old aircraft’s setup link and confirmation while retaining session observations. Exact-byte dedupe spans all aircraft and the inbox. Existing v2 SQLite is backed up before its transactional nullable-flight relationship migration; complete v2 JSON exports remain restorable.

## Optional manual upload marks

`POST /api/flight-logs/mark-uploaded` accepts only explicit record IDs, with a 64 KiB request body and up to 1,000 IDs. The store deduplicates and resolves every ID before changing manual upload status, validates the records, and saves one serialized transaction per batch. Invalid IDs or a save failure leave the entire batch unchanged. Provider receipts and all other evidence remain intact; no provider service is called.

Manual tracking starts off and is enabled with a browser-local checkbox. Its aircraft and manual-status filters determine selection; changing either clears selection. Turning tracking off hides controls and badges without altering saved marks. Unknown means Not recorded rather than not uploaded. Individual status editing and historical receipts use collapsed sections. Larger selections use sequential batches of 1,000 and retain successful earlier batches after a later failure. Folder review has no upload queue.

## Import filing

The filing service saves a folder preference in owner-private `.filing-config.json`; the latest bounded scan remains in memory. Explicit scans hash eligible files without decoding or importing. SHA-256 links renamed copies to existing originals. Reports derive current assignments and import states from the local catalog, without reading provider settings or deriving upload queues.

`GET/PATCH /api/filing/settings` reads or saves the location. `GET /api/filing/scan` reads the latest report; `POST` starts a scan. `POST /api/filing/import` accepts one scan ID and up to twenty opaque file IDs, never client-supplied file paths. A scan expires after thirty minutes, on restart, or on a settings change. Concurrent filing mutations are rejected while an operation is active; close waits for it to finish.

Source reads reject symlinks and workspace paths, bound traversal and bytes, and compare file identity and metadata around streaming reads. Import also checks the scanned fingerprint and SHA-256 before using the normal import store. Sources remain unchanged, successful imports survive per-file failures, and selected new originals use existing serial routing and dedupe. No catalog migration is required. See [import filing](import-filing.md).

A metadata-only ctime change during a scan permits one bounded second read with the same content hash; selected imports keep strict freshness checks. The macOS service sets the documented `MaterializeDatalessFiles` policy so reads can retrieve cloud-backed file contents. Operating-system downloads can add latency; traversal and read loops check the processing budget between filesystem calls.

## Aircraft journal and next-session brief

Aircraft JSON payloads optionally contain up to 500 journal entries; absence means empty. The catalog and SQLite schema remain version 3. Dedicated journal APIs own creation and editing, while ordinary aircraft updates cannot replace the journal. Validation checks entry fields, global ID uniqueness, timestamps, lifecycle states and same-aircraft setup/session links. Serialized writes preserve atomicity.

`GET/POST /api/aircraft/:id/journal` reads/creates entries; `PATCH /api/aircraft/:id/journal/:entryId` edits an entry or changes next-step status. The server owns IDs, creation/update/close timestamps and captured session titles. Session reassignment detaches old-aircraft journal links while retaining captured titles and user text. No entry is moved or automatically generated.

`GET /api/aircraft/:id/brief` computes up to three oldest open next steps, three newest changes/observations, and references to the latest recorded session, latest saved setup and preferred baseline. Ties use entry IDs. Snapshot confirmation derives only from explicitly confirmed session links. The browser guards delayed brief responses against aircraft/view changes. Journal content is excluded from existing AI inputs and needs no provider access. See [the user guide](change-journal.md).

## Controller 3 interpretation and observations

The pure `src/controller.mjs` interpreter consumes preserved parsed exports and returns physical-control assignment/verification states plus normalized AUX mode comparisons. `public/controller.js` renders the original schematic, accessible control selection, setup/reference pickers, observation editor and comparison evidence. No AI or device access participates.

Snapshots may contain optional `controller` metadata: model, positive optimistic revision, server update time and bounded control observations. Each observation has a kind (AUX/external/unknown), nullable AUX channel, up to five measured positions, note, verification boolean and server verification time. PUT replaces the bounded observation set and rejects stale revisions. The existing serialized mutation and JSON-payload persistence save it atomically without changing raw/parsed evidence, other snapshots or the database schema.

`GET/PUT /api/snapshots/:id/controller` reads the derived view or saves observations (64 KiB input bound). `GET /api/compare` additionally returns a controller comparison restricted to one aircraft. Workspace validation checks optional metadata on load/restore; old snapshots need no migration. Before/after mappings are carried independently, and unknown comparison evidence never enters confirmed mode-change counts. See [Controller map](controller-map.md) for the supported interpretation boundary.


Controller preview corrections: unsaved AUX suggestions and documented native power are derived display data, separate from persisted observations. GET never creates mappings. Single-control edits preserve all other controls' absence; template adoption fills only remaining suggestions; copying includes only recorded observations. Mode completeness may be established despite unrelated parser warnings only after auditing the complete 20-slot AUX domain against immutable raw source. Domain ambiguity, truncation, sparse exports and unsupported conditions retain their blockers. Existing parsed snapshots require no migration.


The beginner presentation layer lives in browser-safe, pure public/controller-language.js: short action explanations, independent layout-confidence copy, and physical-control change grouping. It consumes the existing derived controller view and never mutates it. The renderer in public/controller.js shows the simple map first, with separate collapsed per-button/setup Advanced sections preserving the original editing/evidence controls. Raw comparisons retain their data and filters under a closed Advanced setting comparison disclosure. No schema, parser, device or assistant change is involved.

## Beginner workflow boundaries

The guided check collects an explicitly observed connection and two to five labeled receiver values for AUX controls, or a described external function. It requires confirmation that the selected backup matches the checked aircraft configuration and a separate physical-check acknowledgment. Leaving the guide unfinished saves nothing. Successful saves use the existing controller observation mutation and retain its revision conflict handling; other controls, raw exports and parsed evidence are preserved.

Named reference shortcuts operate on the selected aircraft's existing history and sessions. The last-flight shortcut requires a confirmed snapshot link and a flight date no later than the selected import. Missing or identical references have an explanation rather than an inferred replacement. These choices do not establish the current aircraft configuration.

The control-card builder creates a standalone escaped HTML document in the browser and downloads it through an object URL. Its mobile and print styles require no remote assets. It contains setup identity, visible actions, per-control confidence and recorded positions; it excludes source files, flight locations, serials and hidden notes. It has no script or live connection back to the workspace.

Start here renders a separate synthetic comparison locally through the same controller renderer without save callbacks. The demo makes no catalog mutations or hardware requests. Recovery guidance links the existing complete export and explains the stopped-server restore command; it introduces no browser restore endpoint. No schema or data migration is needed for these presentation changes. See [beginner-alpha scope](scope-beginner-alpha.md) and [public-alpha guide](public-alpha.md).
