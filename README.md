# FPVBench

A local workbench for remembering FPV setups and learning from flight sessions.

Import Betaflight configuration exports, preserve setup history, compare changes, and connect flight observations to the setup used. Import copied DJI flight records to fill in session details. v0.2 stores your workspace in SQLite.

## Start and stop

Requires Node.js **22.13 or newer** and npm.

```sh
npm ci
npm start
```

Open **http://127.0.0.1:4173**. Leave the terminal running; press **Ctrl+C** in that terminal to stop the server. Start it again with `npm start`. Stored data survives a restart.

The application and its assets run locally. No account or cloud service is required. The DJI decoder is a pinned runtime dependency with embedded WebAssembly.

## Setup workflow

1. Create an aircraft.
2. In Betaflight's CLI, export `dump all` and save the output to a text file. `diff all` exports are also accepted.
3. Import the file and give the setup a meaningful label. The original text is preserved.
4. Mark a setup you prefer as the aircraft's baseline.
5. Import your next setup and compare it with the baseline or another snapshot.
6. Record a flight session, select the snapshot used, and add equipment, conditions, results, notes, and footage references.

A session's setup confirmation is explicit. A stored snapshot records an import; it does not establish the aircraft's current configuration. The two Betaflight examples are synthetic parser fixtures, not aircraft configurations.

Each setting retains its scope and PID/rate profile. A missing value in a sparse `diff all` export is shown as **unknown**, because the underlying firmware default is not included. Firmware or board differences are flagged. See the [Betaflight import guide](repository-docs/betaflight-imports.md).

## DJI flight imports

Select an aircraft and choose **Import DJI flights**. Select one or multiple copied DJI flight-record TXT files or supported decoded JSON exports. You can label the source device, such as DJI RC, DJI RC2, or DJI Goggles N3.

Each successful import retains the exact original file and creates a session when a valid flight timestamp is available. Imported measurements remain separate from editable observations and setup confirmation. Reimporting identical bytes for the same aircraft reuses the existing record.

Newer DJI records encrypt detailed telemetry. FPVBench imports the available unencrypted summary and labels the result **summary only**. It makes no external keychain request. Older records and decoded JSON may supply local telemetry. Device names alone do not establish format compatibility; DAT files and arbitrary JSON are unsupported.

Each record also has a manual **AirData status**: not recorded, not uploaded, or uploaded. Change it after uploads you perform in AirData and filter the library by status. Existing upload history is not guessed.

See [DJI flight imports](repository-docs/dji-flight-imports.md) for formats, measurements, and limits.

## Your data

The default workspace lives at `~/.fpvbench/`, outside this repository:

- `workspace.sqlite`: aircraft, setup snapshots, sessions, flight summaries, and decoded telemetry.
- `imports/`: exact original DJI files, addressed by their SHA-256 fingerprint.
- Legacy `workspace.json` and a timestamped backup: preserved during the first migration from v0.1.

Migration validates the existing JSON and backs it up before writing SQLite. Existing IDs, notes, baselines, and setup links are preserved. Invalid data is rejected without reset.

Set `FPVBENCH_DATA_DIR` to use a different local directory. Set `PORT` to choose another loopback port.

```sh
FPVBENCH_DATA_DIR=/path/to/local/fpvbench-data PORT=4174 npm start
```

Use **Export workspace** to download a complete version 2 JSON backup, including original DJI bytes and decoded telemetry. Restore instructions are in [storage and backups](repository-docs/storage-and-backups.md). Keep backups private: flight files can contain locations and device identifiers.

Media references are text notes, paths, or URLs; media files are not uploaded. The server is intended for one workstation.

## Development

```sh
npm run check
npx playwright install chromium
npm run test:browser
```

Automated checks use synthetic inputs and an injected memory repository. A separate local operational proof checks actual SQLite persistence and migration in a disposable directory. See [validation](repository-docs/validation.md).

[Documentation index](repository-docs/README.md) · [Architecture](repository-docs/architecture.md) · [v0.2 scope](repository-docs/scope-v0.2.md)

## Future work

Direct USB/MSP capture, reviewed controller deployment, encrypted DJI telemetry with user-supplied keys, Blackbox analysis, media uploads, and cloud hosting remain future work.

The repository remains private. No public release or open-source license has been selected.
