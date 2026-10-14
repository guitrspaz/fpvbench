# FPVBench v0.1 scope

Build a personal local browser application in a private GitHub repository. v0.1 includes Betaflight file imports, immutable setup history, readable comparisons, baseline selection, and create/edit flight-session records.

## Architecture
Dependency-free Node.js 22+ HTTP server; plain ES modules in src/; responsive HTML/CSS/JS in public/. Bind loopback, default port 4173. Atomic versioned JSON workspace in FPVBENCH_DATA_DIR, default ~/.fpvbench, outside Git. Jest, ESLint, and Playwright are development dependencies only. No database or live aircraft access.

## Objects
- Aircraft: id, name, kind (free text), notes, baselineSnapshotId (nullable), createdAt.
- Snapshot: id, aircraftId, label, notes, filename, importedAt, sha256, exact rawText, parsed. Immutable. Repeated content imports allowed with warning.
- Parsed: firmware { version, board, mspApi, boardName, manufacturer } (nullable strings), exportKind (dump/diff/unknown), exportScope (all/partial/unknown), activeProfile and activeRateProfile (nullable integers), settings[], commands[], warnings[] strings.
- Setting: key, name, value (literal string), scope (global/pid/rate), profile (nullable integer), category, line (one-based). Key includes scope/profile. Unknown settings preserved.
- Command: key, name, value, category, line. Stable keys for common configuration commands; unfamiliar commands remain in raw source with warning.
- Session: id, aircraftId, snapshotId (nullable), title, flownAt (ISO), location, durationMinutes (nullable number), battery, props, conditions, notes, outcome (unrated/better/same/worse), mediaRefs (string array), confirmedSetup (boolean), createdAt. Snapshot must belong to same aircraft. Media references are text/path/URLs, not uploads.

## Behaviors
1. Create aircraft and view setup/session history. New workspace starts empty, with helpful onboarding.
2. Import dump all or diff all text, label and notes. Maximum raw file 1 MiB. Require Betaflight header and at least one valid setting/configuration command. Reject binary/empty/non-Betaflight content. Support BOM/CRLF, CLI prompts, profile/rateprofile blocks, final selected profile markers, negative feature toggles and indexed commands. Report duplicate keys, unknown commands, missing version, partial/unknown export, and missing save/batch-end marker. Never execute input or invent sparse defaults.
3. Preserve exact source and raw download. Import date is not proof of current controller setup.
4. Select preferred baseline from same aircraft.
5. Compare same-aircraft snapshots by namespaced key. Rows distinguish changed/added/removed/unchanged/unknown. Missing value in diff/partial/unknown export means unknown, never zero/disabled/deleted. Firmware/board mismatch and export completeness warnings. Preserve literal values and unfamiliar original evidence. Include explicitly captured selected PID/rate profile metadata in comparisons; unknown selections remain unknown. Comparisons describe exports; do not certify compatibility or flightworthiness.
6. Create/edit session with setup snapshot, time, duration, conditions, battery/props, result, notes, media references and explicit setup confirmation. Allow session without imported setup.
7. Enforce one live owner per data directory, release its lock on shutdown and recover a demonstrably stale owner; serialize storage mutations, atomic temp-file/rename, reject corruption/schema mismatch without overwrite. Full-workspace JSON download; document manual restore while stopped. Validate relationships, fields and sizes, reject prototype pollution.
8. Loopback host/origin checks, JSON content type and body limits, safe static paths, user-text escaping and local-only CSP. Never send imported commands to hardware.

All behaviors are covered by Aircraft, Snapshot/Parsed, Session. No additional object needed.

## API contract
Responses are direct JSON objects; errors {error: string}.
- GET /api/state -> {aircraft: Aircraft[], snapshots: SnapshotSummary[], sessions: Session[]}. Summary omits rawText; parsed omits settings/commands; top-level settingCount and commandCount.
- POST /api/aircraft {name, kind?, notes?} -> Aircraft (201).
- PATCH /api/aircraft/:id {name?, kind?, notes?, baselineSnapshotId?} -> Aircraft.
- POST /api/snapshots {aircraftId, label, filename, rawText, notes?} -> Snapshot (201).
- GET /api/snapshots/:id -> Snapshot.
- GET /api/snapshots/:id/raw -> exact text attachment.
- GET /api/compare?from=:id&to=:id -> {from: SnapshotSummary, to: SnapshotSummary, rows:[{key,name,category,scope,profile,from:string|null,to:string|null,change,detail}], warnings:string[], counts:{changed,added,removed,unchanged,unknown}}.
- POST /api/sessions -> Session (201); PATCH /api/sessions/:id -> Session.
- GET /api/export -> versioned workspace JSON attachment.
- Statuses: 400 validation, 404 absent, 409 incompatible comparison, 413 oversized, 415 content type, 403 host/origin, 500 sanitized unexpected error.

## Interface
Dark workbench, amber accents, system fonts, accessible labels and keyboard dialogs, responsive mobile layout. Aircraft selector/creation; overview and history; file/paste import; searchable setting detail by category/profile; baseline action; comparison old/new columns with filters and uncertainty; flight-session creation/editing. Errors/loading/empty states. Synthetic example downloads explicitly labeled, never automatically imported.

## Test plan
Jest test-first parser and compare behaviors using synthetic exports: profiles, sparse omissions, features, commands, duplicates, malformed/binary/oversized, metadata/version mismatches, BOM/CRLF/prompts and raw preservation. Store tests with isolated disposable local directories: persistence/restart, relationships, validation, serialized writes and corruption. Ephemeral loopback API tests cover route success/errors, downloads, limits, origin/host and traversal. Playwright smoke journey against synthetic disposable workspace covers aircraft, two imports, baseline, comparison, session create/edit and reload; mobile layout and console. ESLint static checks. No database, shared rows or external systems in tests.

## Documentation plan
README.md: quickstart, requirements, workflow, data location, limits and status for humans/agents. repository-docs/README.md: doc index. repository-docs/architecture.md: modules, JSON schema, uncertainty, security and future adapter seam. repository-docs/betaflight-imports.md: exports, defaults/profiles/version limits, examples and primary links. repository-docs/validation.md: reproducible checks, actual results and evidence limits. JSDoc on exports. These documents single-source application facts and link to each other; no personal workspace policy or employer material.

## Deferred
Controller deployment/restoration, direct USB/MSP capture, firmware migration, Blackbox analysis, media uploads/search, cloud hosting, accounts, deletion and public release. Future device adapter seam only; no writes in v0.1. License decision deferred while private.

## Design clarification before comparison integration
Selected PID/rate profile changes belong in setup comparisons, even when profile setting values are identical. Sparse export comments describing defaults are not explicit active values. These clarify existing setup-evidence behavior rather than extending hardware integration.

## Persistence clarification before final validation
A data directory has one live server owner. This prevents accidental concurrent servers on different ports from losing setup/session history. Tests close the owner before restart checks and clean isolated lock files.
