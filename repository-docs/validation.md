# Validation

## Reproduce

Requires Node.js 22.13+ and npm.

```sh
npm ci
npm run check
npm audit
npx playwright install chromium
npm run test:browser
```

Automated checks use synthetic inputs and injected memory repositories. They never open a database, contact a controller, or use a personal workspace. The browser runner can use an existing compatible Chromium through `FPVBENCH_CHROMIUM`.

Separate local operational proofs use disposable synthetic data:

```sh
node dev/verify-dji.mjs
node dev/verify-sqlite.mjs
node dev/verify-import.mjs
node dev/verify-ai.mjs
node dev/verify-distance.mjs
node dev/verify-log-intake-airdata.mjs
```

These explicit proofs exercise actual SQLite and worker/WASM behavior; their temporary directories are removed.

## Observed v0.5.0 results — 2026-10-14

- 161 Jest tests passed across sixteen suites; ESLint passed. Added coverage includes archive recognition, malformed inputs, exact originals/dedupe, assignment, AI exclusion, receipt validation, write-only credentials, verification, trusted destinations, interrupted submissions, serialized duplicate requests, account separation and retained statuses.
- 83 browser checks passed with synthetic records and a memory repository, including archive intake without sessions, explicit connection gating, selected sending, refresh, persisted receipts and credential-free exports. Four fake AirData and seven fake OpenAI requests; zero unexpected browser errors.
- The separate disposable SQLite proof passed preserved originals/observations, confirmed receipts, restart dedupe, private credential retention and complete restore.
- No personal log was uploaded and no live AirData call was used for validation. A developer application key and explicit connection check are still needed for real operation. Native format recognition is archive intake, not detailed telemetry parsing.

## Historical v0.4.6 results — 2026-10-14

- 142 Jest tests passed across thirteen suites; ESLint passed. New checks cover bounded source conversion, zero/missing measurements, unchanged JSON/other product types, backup-before-save ordering, refusal on mismatched source evidence or failed backup, preservation of notes/status/originals, restart idempotence, unit conversion, per-unit recap cache and API input validation.
- The full synthetic browser journeys passed, including units accessible with AI disabled, preference persistence after reload, imperial flight-detail values and telemetry headers, and unchanged server-side data. Fake provider requests only; no paid AI calls.
- The separate disposable SQLite/worker/WASM proof passed exact private pre-correction backup, preserved originals/history, duplicate import, restart and old complete-catalog restore.
- Independent supplied AirData totals established the kilometre scale only for the retained Mavic 4 Pro TXT v14/product 137 summary family. Unverified v14 TXT families remain withheld from recap distance facts. Duration remains source-reported log time; AirData airborne totals are not substituted into stored records.

## Historical v0.4.5 results — 2026-10-14

- 134 Jest tests passed across twelve suites; ESLint passed. New checks cover plist/XML and launcher quoting, login/on-demand paths, exact manual-server identity, duplicate-owner refusal, lifecycle ordering, and data-free readiness responses.
- A separately scoped isolated operational proof registered a temporary user LaunchAgent on a high loopback port with a disposable synthetic workspace. Plist validation, native launcher compilation, background readiness and matching job/lock PID passed. Crash recovery, stop/restart with retained synthetic SQLite history, and clean shutdown passed. The proof job and temporary artifacts were removed.
- Source tests mock OS/process control; automated tests register no jobs, signal no processes and open no database. No personal records or paid AI requests were used in the isolated proof.
- Installed-service smoke checks passed idempotent start, the generated Stop/Start/Restart commands, native launcher execution without a duplicate server, readiness, and unchanged catalog contents.
- Login configuration was verified; an actual logout/login cycle is outside the proof.

## Historical v0.4.4 results — 2026-10-14

- 128 Jest tests passed across eleven suites; ESLint passed. New checks cover duration distribution, rounding, UTC date grouping, missing/zero measurements, tied busiest days, human-readable units, recap-specific provider instructions, optional questions, and withholding unverified modern TXT distance without mutating source data.
- 72 browser checks passed with synthetic records, memory repositories, and a fake AI provider. Readable highlights, collapsed/expandable facts, omission of empty questions, and mobile recap layout passed alongside previous regression journeys.
- No real paid AI request was used to validate this revision. Fake-provider checks verify the contract and rendering, not the quality of a live model's narrative.
- Source inspection found a discrepancy between the pinned decoder's documented metre field and observed modern TXT distance values. No unverified conversion or catalog mutation was made. Recap distance conclusions are withheld pending independent reference verification.

## Historical v0.4.3 results — 2026-10-14

- 123 Jest tests passed across ten suites; ESLint passed. Recap checks cover selected-aircraft imported/manual history, linked-session deduplication, exclusion of other aircraft and inbox records, empty/invalid selection without provider calls, aggregate privacy, and separate caches even for identical labels and facts.
- 69 browser checks passed with synthetic records, memory repositories, and a fake AI provider. New checks verify the selected recap evidence, clearing the report when switching aircraft, per-aircraft cache reuse, and ignoring a late response after switching. The full run made seven fake provider calls and no real paid requests.
- Existing workspace records and optional AI configuration were not changed.

## Historical v0.4.2 results — 2026-10-14

- 121 Jest tests passed across ten suites; ESLint passed. New checks cover default and legacy status, invalid-input atomicity, retirement/reactivation, preserved setup and flight history, API/export status, and retired-aircraft serial routing.
- 65 browser checks passed using synthetic records, memory repositories, and a fake AI provider. Lifecycle checks cover active-fleet exclusion, retired history access, remembered filters, status labels, reactivation, empty filtered views, and mobile overflow. No unexpected browser errors occurred.
- Disposable SQLite operational verification passed retirement persistence across restart and complete export/restore, reactivation, and unchanged linked history, alongside existing migration and backup checks.
- Personal aircraft statuses were not changed by the update. No real paid AI request or external flight upload was used for validation.

## Historical v0.4.1 results — 2026-10-14

- 116 Jest tests passed, including unique modern TXT serial-prefix routing, collisions, exact alias precedence, inbox rematching and JSON/older-version/length restrictions. ESLint passed.
- Source verification confirmed the pinned decoder’s 16-byte modern aircraft serial field. Serial-prefix examples in tests are synthetic. No personal identifiers or original files are part of the source change.
- Saved full serials and imported source serials remain unchanged. Manual mappings stay explicit, and distinct aircraft histories are not combined by model name.

## Historical v0.4 results — 2026-10-14

- 109 Jest tests passed across ten suites, including mixed-aircraft serial routing, empty-fleet imports, ambiguity, aliases, assignment/reassignment, batch rematching, dedupe and complete backups. ESLint passed.
- 56 browser checks passed using synthetic records, memory repositories and a fake AI provider, including mixed bulk import from one source, unassigned review, learned aliases, batch matching and mobile inventory.
- Disposable SQLite operational verification passed exact v2 backup, preservation of existing records, v3 migration, inbox assignment, idempotent restart and v2/v3 restoration. A malformed pre-upgrade catalog was rejected without changing its bytes.
- One representative existing version 14 TXT was inspected locally and contained an aircraft serial in the readable summary. No source filenames, personal identifiers or content were added to Git. This confirms that file’s identity availability, not every O4/controller/firmware combination.
- No actual paid AI requests or external flight uploads were used to validate this feature.

## Historical v0.3 results — 2026-10-14

- **94 Jest tests passed** across nine suites; application, test, and operational-proof ESLint passed.
- **41 browser checks passed**, covering the previous workflows plus optional AI settings, key privacy, explicit connection checking, setup/goal explanations, cached reads, aggregate recap, automatic reviews, quota shutdown, recovery, zero allowance, and mobile layout. Screenshots were inspected. See [browser validation](browser-validation.md).
- **npm audit reported zero vulnerabilities**. No new runtime package was needed.
- `node dev/verify-ai.mjs
node dev/verify-distance.mjs` passed the combined actual SQLite/server proof with a synthetic provider: owner-private key files, gating, durable allowance/cache across restart, unchanged core export, billing shutdown with offline recordkeeping, and corrupt optional-state fallback.
- Private AI files and local data are excluded from Git. Staged source secret scanning passed.

All provider responses and credentials in the automated and operational AI proofs are synthetic. No real paid request, live account balance check, or model-quality evaluation was performed. The live integration requires a user-entered API key, positive local allowance, and a successful explicit connection check. The local allowance is an estimate rather than an account-wide provider cap.

## Historical v0.2 results — 2026-10-14

- **55 Jest tests passed** across six suites; ESLint passed for application, tests, and operational proof scripts.
- **26 browser checks passed** using repository Playwright 1.64.0 and Chromium 149.0.7827.55. Desktop/mobile screenshots were inspected. See [browser validation](browser-validation.md).
- **npm audit reported zero vulnerabilities**, including development dependencies.
- Real decoder workers passed synthetic binary versions 12, 13, and 14 and decoded JSON.
- Actual SQLite proof passed schema/FK constraints, transaction rollback, exact v1 backup, ID/baseline/note preservation, migration retry/idempotence, restart, originals/telemetry, complete export/restore, AirData status persistence, and corruption rejection.
- Combined HTTP/worker/SQLite proof passed original-byte downloads, sourced sessions, telemetry, restart, and malformed-file rejection.
- Six representative copied DJI TXT records were checked locally with the real decoder, including the largest file in that local collection. All parsed successfully as version 14 summary-only records with start time, duration, and distance available. Source files, names, locations, identifiers, and record content were not copied into this repository.

Parser coverage includes Betaflight profile namespaces, sparse omissions, selected profiles, defaults/comments, metadata differences, command identity, malformed inputs, and exact original preservation. API/store checks cover dedupe, aircraft relationships, immutable evidence, session links and manual notes, AirData status, complete backups, pagination, locking, atomic failure cleanup, body/content limits, origin/host restrictions, and static traversal. The 25 MiB base64 boundary has a regression check.

## Evidence limits

Representative real files establish those records' local summary parsing; their exact originating controller/model/firmware combinations were not independently established. No claim is made for every RC, RC2, or Goggles N3 export variant. Version 14 telemetry remains encrypted and unavailable in this version. DAT remains unsupported; unrecognized accepted originals have archive-only status.

Manual AirData status is separate from the optional provider receipt. A confirmed receipt establishes only the recorded submission processing result, not historical account reconciliation. No external upload, DJI keychain request, live hardware connection, controller restoration/deployment, or flight-performance validation occurred. This is single-workstation software; evidence does not establish authenticated internet hosting or multi-user support.
