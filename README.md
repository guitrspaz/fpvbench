# FPVBench

A local workbench for remembering FPV setups and learning from flight sessions.

Import a Betaflight configuration export, preserve a setup history, compare changes, and connect flight observations to the setup used. v0.1 runs on your computer; it does not connect to or write to a flight controller.

## Start

Requires Node.js **22.13 or newer** and npm.

```sh
npm ci
npm start
```

Open **http://127.0.0.1:4173**. The application and its assets run locally, without an account or cloud service. Runtime code uses Node built-ins; installed packages are development tools.

## First workflow

1. Create an aircraft.
2. In Betaflight's CLI, export `dump all` and save the output to a text file. `diff all` exports are also accepted.
3. Import the file and give the setup a meaningful label. The original text is preserved.
4. Mark a setup you prefer as the aircraft's baseline.
5. Import your next setup and compare it with the baseline or another snapshot.
6. Record a flight session, select the snapshot used, and add equipment, conditions, results, notes, and footage/log references.

A session's setup confirmation is explicit. A stored snapshot records an import; it does not establish the aircraft's current configuration.

The interface offers two **synthetic examples** for exploring imports and comparison. These are tiny parser fixtures, not configurations for an aircraft.

## What comparisons mean

Each setting retains its scope and PID/rate profile. A missing value in a sparse `diff all` export is shown as **unknown**, because the underlying firmware default is not included. Firmware or board differences are flagged. Comparisons describe the supplied files; they do not certify that settings are compatible, equivalent across firmware versions, or suitable for flight.

See the [import guide](repository-docs/betaflight-imports.md) for export details and limitations.

## Your data

The default workspace lives at `~/.fpvbench/workspace.json`, outside this repository. It contains aircraft, original exports, parsed setup snapshots, and flight-session records. Data is saved on the server computer, rather than in browser storage.

Set `FPVBENCH_DATA_DIR` to use a different local directory. Set `PORT` to choose another loopback port.

```sh
FPVBENCH_DATA_DIR=/path/to/local/fpvbench-data PORT=4174 npm start
```

Use **Export workspace** in the interface to download a complete JSON backup. To restore one, stop FPVBench, keep a copy of the current workspace file, and replace `workspace.json` with the exported file. Restart using the same data directory. Corrupt or unsupported workspace files are rejected rather than reset.

Keep personal exports and footage out of the source repository. Media references are text notes, paths, or URLs; media files are not uploaded by v0.1. The local server is intended for one workstation and is not a public hosting configuration.

## Development

```sh
npm test
npm run lint
npm run check
```

For the isolated browser journey, install the test browser once and run:

```sh
npx playwright install chromium
npm run test:browser
```

The browser runner creates and removes its own temporary workspace. `FPVBENCH_CHROMIUM` can select an existing compatible Chromium executable.

Tests use synthetic inputs and disposable local directories. Browser evidence and reproducible checks are listed in [validation](repository-docs/validation.md).

[Documentation index](repository-docs/README.md) · [Architecture](repository-docs/architecture.md) · [v0.1 scope](repository-docs/scope-v0.1.md)

## Future work

Direct USB/MSP capture and an explicitly reviewed flight-controller deployment workflow are possible later features. They are deferred in v0.1, along with Blackbox analysis, media uploads, and cloud hosting.

The repository remains private. No public release or open-source license has been selected.
