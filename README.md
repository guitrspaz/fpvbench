# FPVBench

A local workbench for remembering FPV setups and learning from flight sessions.

Import Betaflight configuration exports, preserve setup history, compare changes, and connect flight observations to the setup used. Import copied DJI flight records to fill in session details. v0.4 stores your workspace in SQLite and offers an optional OpenAI assistant.

## Start and stop

Requires Node.js **22.13 or newer** and npm.

```sh
npm ci
npm start
```

Open **http://127.0.0.1:4173**. Leave the terminal running; press **Ctrl+C** in that terminal to stop the server. Start it again with `npm start`. Stored data survives a restart.

Core application features and assets run locally without an account or cloud service. Optional AI uses the OpenAI API when you enable it. The DJI decoder is a pinned runtime dependency with embedded WebAssembly.

## Setup workflow

1. Create an aircraft.
2. In Betaflight's CLI, export `dump all` and save the output to a text file. `diff all` exports are also accepted.
3. Import the file and give the setup a meaningful label. The original text is preserved.
4. Mark a setup you prefer as the aircraft's baseline.
5. Import your next setup and compare it with the baseline or another snapshot.
6. Record a flight session, select the snapshot used, and add equipment, conditions, results, notes, and footage references.

A session's setup confirmation is explicit. A stored snapshot records an import; it does not establish the aircraft's current configuration. The two Betaflight examples are synthetic parser fixtures, not aircraft configurations.

Aircraft default to **Active**. Use **Edit aircraft** to set **Aircraft status** to **Retired** when an aircraft leaves your fleet. The sidebar defaults to **Active aircraft**; choose **All aircraft** or **Retired aircraft** to view its history or reactivate it. Retirement preserves setups, baselines, flights, identifiers, and AirData status. Imported archived logs still match that aircraft's serial. The DJI flight library's **All aircraft** view includes retired aircraft.

Aircraft records include optional **Registration ID** and **Serial number** fields. Select an aircraft and choose **Edit aircraft** to add, update, or clear either identifier, or change its name, type, and notes. Identifiers appear in **Aircraft details** on the overview and are retained in SQLite and workspace exports. Older workspaces and backups without these fields still open. Registration IDs and serial numbers are excluded from AI requests; keep exports containing them private.

Each setting retains its scope and PID/rate profile. A missing value in a sparse `diff all` export is shown as **unknown**, because the underlying firmware default is not included. Firmware or board differences are flagged. See the [Betaflight import guide](repository-docs/betaflight-imports.md).

## DJI flight imports

Choose **Import DJI flights**. Automatic assignment is the default: each file is matched using its aircraft serial, independently of the selected aircraft or shared controller/goggles. Unknown or ambiguous aircraft go into an **Unassigned** inbox. To import a known single-aircraft batch manually, choose its aircraft in the import dialog. Select one or multiple copied DJI flight-record TXT files or supported decoded JSON exports. You can label the source device, such as DJI RC, DJI RC2, or DJI Goggles N3.

Each successful import retains the exact original file. Matched aircraft with valid flight timestamps get linked sessions; inbox records get sessions when you assign them. Imported measurements remain separate from editable observations and setup confirmation. Reimporting identical bytes for the same aircraft reuses the existing record.

Newer DJI records encrypt detailed telemetry. FPVBench imports the available unencrypted summary and labels the result **summary only**. It makes no external keychain request. Older records and decoded JSON may supply local telemetry. Device names alone do not establish format compatibility; DAT files and arbitrary JSON are unsupported.

Each record also has a manual **AirData status**: not recorded, not uploaded, or uploaded. Change it after uploads you perform in AirData and filter the library by status. Existing upload history is not guessed.

Use the library’s **All aircraft**, **Selected aircraft**, and **Unassigned** filters. Open an unassigned record to choose its aircraft and optionally remember the recorded serial for future imports, without overwriting the aircraft’s hardware serial. **Match unassigned flights** applies unique serial matches to the remaining inbox. Changing a flight’s aircraft retains its observations and AirData status and clears setup links from the previous aircraft.

See [DJI flight imports](repository-docs/dji-flight-imports.md) for formats, measurements, and limits.

## Optional AI

Open **Settings** to add a server-held OpenAI API key, enable AI, and set a monthly FPVBench allowance. AI starts disabled with a zero allowance. A small billed connection test must succeed before AI controls appear.

The setup assistant can explain explicit tuning changes relative to your preferred baseline and answer a short flying-goal question. Optional automatic reviews run after setup imports. A light flight recap summarizes the currently selected aircraft's flying activity and duration patterns from its imported records and manual sessions, with readable highlights and expandable evidence. These features do not apply configurations to an aircraft.

Missing key, no available allowance, or a billing/authentication failure disables AI features. Core imports, comparison, and recordkeeping continue to work. The local allowance is an estimate for this app rather than your provider balance. See [optional AI](repository-docs/optional-ai.md) for setup, billing, privacy, and limitations.

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

Use **Export workspace** to download a complete version 3 JSON backup (version 2 backups remain restorable), including original DJI bytes and decoded telemetry. Restore instructions are in [storage and backups](repository-docs/storage-and-backups.md). Keep backups private: flight files can contain locations and device identifiers.

Media references are text notes, paths, or URLs; media files are not uploaded. The server is intended for one workstation.

## Development

```sh
npm run check
npx playwright install chromium
npm run test:browser
```

Automated checks use synthetic inputs and an injected memory repository. A separate local operational proof checks actual SQLite persistence and migration in a disposable directory. See [validation](repository-docs/validation.md).

[Documentation index](repository-docs/README.md) · [Architecture](repository-docs/architecture.md) · [v0.3 scope](repository-docs/scope-v0.3.md)

## Future work

Direct USB/MSP capture, reviewed controller deployment, encrypted DJI telemetry with user-supplied keys, Blackbox analysis, media uploads, and cloud hosting remain future work.

The repository remains private. No public release or open-source license has been selected.
