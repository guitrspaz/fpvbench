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
```

These explicit proofs exercise actual SQLite and worker/WASM behavior; their temporary directories are removed.

## Observed v0.4.2 results — 2026-10-14

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
- `node dev/verify-ai.mjs` passed the combined actual SQLite/server proof with a synthetic provider: owner-private key files, gating, durable allowance/cache across restart, unchanged core export, billing shutdown with offline recordkeeping, and corrupt optional-state fallback.
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

Representative real files establish those records' local summary parsing; their exact originating controller/model/firmware combinations were not independently established. No claim is made for every RC, RC2, or Goggles N3 export variant. Version 14 telemetry remains encrypted and unavailable in this version. DAT and raw-record JSON are unsupported.

AirData status is a manual record, not verification against AirData. No external upload, DJI keychain request, live hardware connection, controller restoration/deployment, or flight-performance validation occurred. This is single-workstation software; evidence does not establish authenticated internet hosting or multi-user support.
