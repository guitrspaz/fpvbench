# Architecture

## Local application

FPVBench v0.1 is a single-workstation application. A Node.js HTTP server binds to loopback and serves local HTML, CSS, and browser ES modules. No build step, remote assets, account, or cloud service is required. Runtime modules use Node built-ins.

The interface calls JSON endpoints for aircraft, imports, comparison, and flight sessions. Browser local storage remembers only the selected aircraft; the server owns the workspace data.

## Modules

| Module | Responsibility |
| --- | --- |
| `src/parser.mjs` | Treat a Betaflight export as inert text; extract version, export scope, profile-aware settings and supported configuration commands. |
| `src/compare.mjs` | Build history summaries and comparisons without inventing omitted defaults. |
| `src/store.mjs` | Validate relationships and fields; preserve snapshots; serialize atomic local-file writes. |
| `src/server.mjs` | Loopback HTTP entry point, API routing, bounded input, downloads and static assets. |
| `src/errors.mjs` | Application errors and unsafe-object validation. |
| `public/app.js` | Aircraft selection, history/details, comparisons, imports and session forms. |

## Workspace schema

`workspace.json` has `version: 1` and three collections: `aircraft`, `snapshots`, and `sessions`. UUIDs link a snapshot or session to an aircraft. An aircraft's optional baseline must reference its own snapshot; a session's optional snapshot must belong to its aircraft.

Snapshots are immutable records containing the source text, SHA-256 fingerprint, filename, import time, notes and parsed evidence. Session records can be edited. The schema and HTTP response fields are defined in [v0.1 scope](scope-v0.1.md).

A write clones the current state, validates the operation, writes a temporary local file, and renames it into place before publishing the new in-memory state. Mutations are serialized. The workspace has one live owner per data directory to prevent competing servers from overwriting history. Files are created with owner-only permissions.

Opening a workspace validates its schema, relationships, checksums and parsed evidence. Invalid data is rejected without replacement. Restore a complete export while the server is stopped; preserve the old file before replacing it.

## Evidence and comparisons

Setting keys include scope and profile, so PID profile 0 and PID profile 1 cannot overwrite each other. Supported indexed configuration commands use stable identities such as serial-port number or resource name/index.

A `diff` export is sparse. Missing values are unknown unless the relevant side is a sufficiently complete `dump all` export. Neither the parser nor comparison loads a guessed firmware-default table. Explicit selected-profile metadata appears in comparisons when the export captures it. Firmware and board differences remain visible warnings.

Literal differences are not a firmware migration or an assessment of flight performance. The flight-session record supplies observations, conditions, equipment notes and an explicit setup-confirmation field.

## Local boundary

The server validates loopback Host headers, rejects foreign origins and cross-site requests, requires JSON for mutations, bounds source/request size, and restricts static paths. A content security policy limits the browser to local assets. User text is rendered as text rather than executable markup. Raw export downloads are attachments.

The server has no controller connection, serial-write implementation, shell execution of imported content, or media-fetch function. This is a local configuration, not an authenticated internet service.

## Future device integration

A later USB/MSP reader can supply captured evidence to the same snapshot workflow. Controller deployment would be a separate operation with a verified target/version, a fresh backup, a readable preview and an explicit write decision. v0.1 implements neither connection nor deployment.

## Development dependencies

Jest covers parser, comparison, store and HTTP behavior. Playwright covers the browser workflow. ESLint checks source and test code.

The npm override for `@istanbuljs/load-nyc-config` selects `js-yaml` 4.3.2 or later in the 4.x line. Its consumer uses the supported `load` API; this avoids a vulnerable legacy formatting dependency in the test-tool chain. Tests and dependency audit validate the resulting installation.
