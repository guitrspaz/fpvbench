# Validation

## Reproduce

Requires Node.js 22.13+ and npm.

```sh
npm ci
npm run check
npm audit
```

For the browser journey:

```sh
npx playwright install chromium
npm run test:browser
```

The browser runner may use an existing compatible Chromium through `FPVBENCH_CHROMIUM`. All automated checks use synthetic exports and disposable local data directories. They never connect to a flight controller or an external data service.

## Results

Validated October 13, 2026:

- **25 Jest tests passed** across parser/comparison, storage, and HTTP suites.
- **ESLint passed** for application, configuration, and tests.
- **npm audit: zero reported vulnerabilities**, including development dependencies.
- **Staged source secret scan passed** with no detected leaks.
- **All 13 browser smoke checks passed**, including file/paste imports, exact BOM/CRLF preservation, baseline/comparison, session create/edit/reload, mobile overflow and no captured browser errors. Detailed evidence is recorded separately in [browser validation](browser-validation.md).

Parser coverage includes profile namespaces, sparse omissions, explicit selected profiles, commented defaults, metadata/version differences, command identities, malformed imports, and exact source preservation. Storage/API checks cover restart persistence, aircraft relationships, validation, single-owner locking and stale-owner recovery, atomic serialized writes, corruption protection, downloads, body/content-type limits, origin/host restrictions and static traversal.

## Evidence limits

Inputs are synthetic fixtures modeled on documented Betaflight CLI exports. No real flight-controller export, live hardware connection, restoration, firmware migration, or flight-performance validation has been performed. Import warnings and unknown values remain part of the evidence when a real export is introduced.

This is local single-workstation software. The tests do not establish internet-hosting security, multi-user support, or flightworthiness.
