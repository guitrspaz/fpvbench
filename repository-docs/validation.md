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
```

These explicit proofs exercise actual SQLite and worker/WASM behavior; their temporary directories are removed.

## Observed results — 2026-10-14

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
