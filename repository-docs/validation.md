# Validation


## Beginner-first controller view — October 25, 2026

ESLint and all 241 Jest tests passed across 25 suites. Nine new pure presentation tests cover readable action meanings, incomplete/unsupported evidence, arming permission distinct from motor stop, overlapping versus separate arm/rescue ranges, physical-button grouping, range-only changes, equivalent actions moved between channels, independent layout confidence and immutability.

The complete local Chromium journey passed with the existing advanced workflow and 12 added beginner scenarios. A synthetic three-backup sequence exercises four readable role changes, a historical shared motor-arm/GPS-recovery assignment, no guessed physical directions, hidden channel/range/parser jargon by default, unlinked custom actions, the See what changed jump, preserved Advanced editing/comparison controls, keyboard use and phone overflow. Browser reads leave all three new snapshots without saved controller metadata.

Desktop and 390-pixel phone screenshots were inspected. Seven fake AI calls and zero AirData requests were retained. All automated persistence used the injected memory repository; no database or personal aircraft records were used in tests. This validates the software flow and responsive layout, not a study with actual novice users. Personal F5 imports informed read-only diagnosis, not fixture contents or hardware checks.


## Controller preview and mode-warning correction — October 24, 2026

The corrected implementation passed ESLint, all 232 Jest tests across 24 suites, and the complete local Chromium journey. The controller journey now includes 21 named scenarios, starting from untouched full synthetic CLI exports with section headings and feature reset/re-enable warnings. It proves immediate unverified preview, read-only views with no saved mapping, isolated single-control saves, preservation of other unsaved suggestions, explicit template adoption, documented native power, warning-domain isolation, meaningful changes before adoption, sparse comparison gaps, and prior verification/copy/mobile behaviors.

All automated data is independently generated, uses the injected memory repository, and opens no database. Personal exports were inspected read-only for diagnosis and were not copied into fixtures. Original parser output and import warnings are retained unchanged. Native preview functions and expected AUX mappings are derived display data only. The browser run retained seven fake AI calls and zero AirData requests.


## Controller 3 map — October 24, 2026

- ESLint and all 221 Jest tests passed across 24 suites, including normalization, unknown evidence, assignment/verification separation, strict observation validation, concurrency, atomic repository failure, setup isolation, restart, complete backup validation and HTTP contracts.
- The full local Chromium browser journey passed with synthetic data and memory repositories. New controller coverage includes 19 named scenarios: template/copy/reset verification, observed positions, notes rendered inertly, reload, native functions, unassigned channels, failed saves, setup/reference selection, keyboard activation, changed/unknown separation and desktop/mobile overflow.
- Original exports and parsed evidence remain unchanged in observation-save tests. No automated test opened a database or used personal aircraft records.
- The full browser run made seven fake AI calls and zero AirData requests. Controller interpretation itself is deterministic and makes no provider requests.
- MCP_DOCKER could not inspect the loopback-only application through its container hostname. Local Chromium 156.0.8078.47 completed the journey with the existing host/origin protections intact. Synthetic desktop/mobile screenshots were inspected.
- This verifies software interpretation and observation storage. No live receiver mapping, button latch behavior, physical flight control, hardware response, or firmware migration was tested.


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
node dev/verify-journal.mjs
node dev/verify-import-filing.mjs
node dev/verify-bulk-airdata.mjs
```

These explicit proofs exercise actual SQLite and worker/WASM behavior; their temporary directories are removed.

## Observed AirData deferral results — 2026-10-22

- ESLint and all 198 Jest tests passed across 22 suites. HTTP checks reject every deferred AirData route without constructing the service; local imports, dedupe, manual mark/reset, assignment, telemetry, original downloads and complete backup validation preserve historical receipts and exclude credentials.
- The full Chromium journey passed 132 checks with synthetic memory repositories, including optional controls initially off, manual marks and filter selection, hiding tracking without losing marks, reload, historical receipt display without a connection, local folder review and responsive layouts. It recorded zero AirData API requests and seven fake OpenAI requests. No automated check opened a database or used personal records.
- Separate disposable SQLite operational proofs passed via `node dev/verify-import-filing.mjs` and `node dev/verify-bulk-airdata.mjs`: local scans, exact originals, notes, setup/session history, manual marks and historical receipts survive restart and complete restore.
- MCP_DOCKER Chromium confirmed the simplified library, manual tracking initially off and absent upload controls. Its connection closed during the follow-up check; the complete local Chromium runner passed afterward. Local browser reproduction used the existing executable through `FPVBENCH_CHROMIUM` because the package-default executable was absent.
- No schema migration or credentials change is required. The standalone dormant upload service retains synthetic unit coverage. Historical results below describe earlier versions with active upload routes.

## Historical v0.7.2 results — 2026-10-15

- ESLint and all 197 Jest tests passed across twenty-two suites. The full synthetic browser run passed 135 checks.
- The Not uploaded filter now includes unmarked defaults and explicit not-uploaded marks. Browser checks verify default labels, mixed-default/marked bulk selection, exclusion of current processing/confirmed submissions and removal after manual marking. Existing receipt and failure paths remain covered.
- This revision changes interface labels and filtering only. Saved manual fields, receipts, imports and catalog format remain unchanged; no new migration or persistence proof was needed. Automated checks opened no database and used no personal records or real providers. Regression provider totals remained seven fake OpenAI and four fake AirData calls.

## Historical v0.7.1 results — 2026-10-15

- ESLint and all 197 Jest tests passed across twenty-two suites. Added store/API checks cover atomic manual marking, strict bounded inputs, missing IDs, persistence failure, dedupe/idempotence, concurrent assignment, retained evidence/receipts, credential-free operation and folder review updates without rescanning.
- The complete synthetic browser run passed 133 checks. New checks verify filtered selection, count/clear behavior, marking twenty-five logs with no AirData key, preservation of all other exported evidence and receipts, reload, folder queue updates, failure reporting and mobile layout.
- Bulk marking added no provider calls. Existing journeys retained seven fake OpenAI and four fake AirData calls. Automated checks used memory repositories without opening a database.
- The separate disposable SQLite proof passed atomic marks, retained history/originals/receipts, idempotence, restart and complete restore. No personal log statuses were changed for this proof.

## Historical v0.7.0 results — 2026-10-15

- ESLint and all 191 Jest tests passed across twenty suites. Filing checks cover read-only scans, exact-byte duplicates, changed/missing sources, symlink substitution, workspace exclusion, limits, strict API input, stale scans, private preferences, partial success, permission errors, a verified second read after metadata-only changes, and account-specific AirData states. The macOS service check verifies the file-materialization policy.
- The full synthetic browser run passed 123 checks. Added filing evidence covers explicit scanning, new-only selection, renamed copies, partial failures, serial routing, unassigned records, refreshed assignments/upload marks, later-arriving files, blocked-file guidance and a 24-file selection split into batches of twenty and four. Desktop and mobile screenshots were inspected.
- Filing operations added no provider calls. Existing regression journeys retained seven fake OpenAI calls and four fake AirData calls. Automated checks used memory repositories and opened no database.
- The separate disposable SQLite proof passed read-only scanning, selected import, retained history and receipt, unchanged source bytes, private folder preference, restart and complete restore. No personal records or real provider requests were used.

## Historical v0.6.1 results — 2026-10-15

- ESLint and all 175 Jest tests passed; the complete synthetic browser run passed 104 checks with no unexpected browser errors.
- Added browser evidence covers named overview/journal/brief ownership, the overview journal entry point, the read-only aircraft field, and a DJI inspection/battery entry with no linked setup or session. Existing aircraft isolation, lifecycle, delayed-response, mobile and export journeys remain covered.
- This change updates interface/navigation only. Journal APIs and persistence remain unchanged; no migration, provider request or personal-data fixture was introduced.

## Historical v0.6.0 results — 2026-10-15

- 175 Jest tests passed across eighteen suites; ESLint passed. Journal checks cover entry creation/editing, lifecycle, strict fields and references, global IDs, limits, atomic failure, older records, export validation, retirement and session/flight reassignment.
- The complete synthetic browser run passed 100 checks, including all journal types, optional links, inert text, editing without changing event timestamps, the overview brief, completion/set-aside/reopening, filters, reload, aircraft isolation, late-response handling, retired history, mobile layout and complete export.
- Journal operations added no provider requests. Existing regression journeys made seven fake OpenAI calls and four fake AirData calls. Automated tests used memory repositories and opened no database.
- The separate disposable SQLite proof passed retained journal lifecycle, restart, complete restore and older-backup compatibility, with unchanged source setups, session observations, originals, telemetry and upload receipt. No personal records or real provider requests were used.

## Historical v0.5.0 results — 2026-10-14

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

Manual upload status is separate from historical provider receipts. AirData integration is currently deferred; standalone service tests and the intake proof exercise dormant code with a fake transport. A confirmed receipt establishes only the recorded submission processing result, not historical account reconciliation. No external upload, DJI keychain request, live hardware connection, controller restoration/deployment, or flight-performance validation occurred. This is single-workstation software; evidence does not establish authenticated internet hosting or multi-user support.

## Beginner workflow and alpha preparation · October 25, 2026

- Version 0.8.0-alpha.1: ESLint and all 254 Jest tests in 27 suites passed locally.
- Pure presentation tests cover explicit physical-check acknowledgment, measured-position validation, unavailable/dangling/same-setup flight references, source escaping and private-context exclusions in offline control cards, and actionable unknown guidance.
- Synthetic example downloads reproduce the demo’s complete mode evidence. Demo fixtures never record physical verification.
- The complete local Chrome journey passed using the memory repository; no database was opened. It includes guided-check cancellation, explicit final save, single-control isolation, reference shortcuts, card download/print/mobile presentation, and read-only demo/recovery navigation.
- Actionlint passed for the prepared Node 22/24 CI workflow. Hosted results must be established on the pushed commit; local results alone do not establish hosted CI.
- Secret and privacy checks were performed separately; their detailed findings remain private. No public release or license adoption is implied by software validation.
- The documented novice usability task script remains a human follow-up. No human usability sessions were conducted as part of automated validation.

## Practice testing and native installer preview · October 25, 2026

- Version 0.8.0-alpha.2: ESLint and all 282 Jest tests in 30 suites passed. Installer tests cover bounded manifest/tree validation, unsafe path/symlink rejection, changed hashes, occupied port refusal, managed-install reuse, both required lifecycle injections for custom homes, and stopping only a newly owned failed service.
- Practice tests prove synthetic memory-only records, ignored personal data-directory environment, unavailable credentials/providers/folder/log intake, practice-labelled export, instance reset and deterministic cleanup. Automated tests open no databases.
- Packaging input tests use mocked fetch responses and disposable files to check trusted origins, SHA256 failures, size bounds, cache reuse and pinned Cargo registry records; they make no provider requests.
- The full desktop/mobile Chrome journey passed, including the new practice workflow in a separate browser context. Its external-request guard is scoped to the practice origin. Keyboard focus and shorter desktop sidebar export reachability were checked.
- The Apple Silicon installer app and ZIP were built with official Node v24.22.1, verified runtime/checksums, 147 decoder Cargo registry notice entries and no unresolved notice inputs. The MPL-2.0 inventory component includes its verified unmodified source archive. Native Cocoa compilation and local ad-hoc signature validation passed; this is not a Developer-ID-signed/notarized public release.
- The compiled native --verify-payload check recognized an existing managed installation without mutation. API workspace state matched before and after this check.
- Separate disposable operational verification passed 354 payload files, bundled runtime execution, decoder import and corresponding-source checksum verification. Both OS lifecycle operations were injected: no actual service was registered, personal workspace opened or database created.
- Native dialog/Cancel verification was blocked by a locked Mac. Human novice sessions, a real fresh-user install, and browser-downloaded Gatekeeper validation remain unperformed. The usability guide and blank observations template are preparation, not human-study results.
