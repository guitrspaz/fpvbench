# FPVBench

**Remember your setups. Organize your flights. See what changed.**

FPVBench brings Betaflight setup history, copied flight records, and your own flight observations together in one local drone workbench. Keep a reference setup, compare changes, and give every aircraft a history you can return to.

Built for FPV pilots with a growing fleet, with a place for DJI photography-drone records too.

## What you can do

| Between flights | In FPVBench |
| --- | --- |
| Remember a setup you liked | Save named Betaflight snapshots and choose a preferred baseline for each aircraft. |
| Understand what changed | Compare settings across snapshots, including PID/rate profiles, with readable changes and missing values marked as unknown. |
| Sort a pile of flight records | Bulk import copied DJI files, match unique aircraft serials, and keep unknown records in an assignable inbox. |
| Send originals to AirData | Select supported logs, submit them with an optional configured connection, and keep processing receipts alongside manual upload marks. |
| Connect setups with observations | Record equipment, conditions, notes, results, and footage references in flight sessions; link the setup you used. |
| Keep your fleet's history | Store registration IDs and serials; retire an aircraft from the active fleet while keeping its records. |
| Get a quick explanation | Enable optional AI for setup explanations and a flight recap focused on the selected aircraft. |

## Remember the setup behind the flight

Import a Betaflight `dump all` or `diff all` export and give it a name you will recognize later. Your original export stays available alongside its readable settings. Pick a preferred baseline, import the next version, and see what changed.

After flying, add your observations and link the setup you used. Each aircraft builds a record of settings, experiments, and what you noticed in the air.

A saved snapshot does not confirm the aircraft's current settings. Setup confirmation is explicit, and FPVBench does not apply configurations to a controller. [Betaflight import guide →](repository-docs/betaflight-imports.md)

## Organize a mixed fleet's flight records

Copy DJI flight records from your controller or goggles, then import a whole batch. FPVBench uses aircraft serial evidence to route unique matches, even when you share controllers across aircraft. Unknown or ambiguous records wait in the **Unassigned** inbox; assign them later and optionally remember the recorded serial for future imports.

Exact original files are retained. Importing the same bytes again reuses the existing record. Available timestamps create linked sessions once an aircraft is assigned; add your own notes alongside the sourced measurements.

Keep using AirData for comprehensive cloud analysis. Configure the optional connection to send selected supported originals and retain their processing results. Manual upload marks remain separate; files uploaded earlier through another route are not automatically discovered. A user upload token and an AirData-issued developer application key are required. [AirData connection and upload status →](repository-docs/airdata.md)

DJI decoding supports FlightRecord TXT versions 1–14 and compatible decoded JSON exports. Other flight-log files can be retained as archives, including recognized PX4 ULog, ArduPilot DataFlash, MAVLink TLog/JSON-lines, and Betaflight Blackbox. Archive-only files retain exact originals and optional aircraft assignments, but supply no flight measurements or automatic sessions. Newer encrypted TXT records supply their available local summary; supported older records and decoded JSON can also supply browsable telemetry. Compatibility depends on the file format, rather than the controller's name. [DJI imports and measurement details →](repository-docs/dji-flight-imports.md)

## Optional AI, with you in control

Add an OpenAI API key, enable assistance, choose a monthly app allowance, and run an explicit connection check. When the integration is available, you can:

- **Explain a setup:** review explicit settings and changes against your preferred baseline, with an optional flying-goal question.
- **Review new imports automatically:** opt in to an explanation after a Betaflight setup import.
- **Recap one aircraft's flights:** get a short account of its recorded activity, typical durations, and available measurements, with readable highlights and expandable supporting facts.

The core workbench works without AI. Assistance uses separately billed OpenAI API access; the monthly app allowance is a local estimate, not an account-wide spending cap. It does not generate or deploy controller configurations.

Flight recaps send aggregate evidence and the selected aircraft's label. Exact coordinates, locations, original files, serials, registration IDs, session notes, and raw telemetry are excluded. [AI features, privacy, and billing →](repository-docs/optional-ai.md)

## Your records, your preferences

- **Local storage:** keep aircraft, setups, sessions, and imports on the computer running FPVBench. Core features need no cloud account.
- **Complete backups:** export your workspace with original log files, upload receipts, and available telemetry, then restore it when needed.
- **Metric or Imperial:** choose display units for flight details, telemetry, and new recaps. Your browser remembers the choice.
- **Active and retired fleets:** keep an older aircraft's history without keeping it in the active selector.
- **Independent macOS startup:** run in the background, optionally start at login, and open the app from a clickable launcher.

Imported duration is source-reported record/log time and may include time on the ground; it is not independently verified airborne time. Missing or unverified measurements are excluded from recap calculations. [Storage and backups →](repository-docs/storage-and-backups.md)

## Get started

Requires **Node.js 22.13 or newer** and npm. From the repository checkout:

```sh
npm ci
npm start
```

Open **http://127.0.0.1:4173**. In manual mode, leave the terminal running and press **Ctrl+C** to stop. Your records survive a restart.

### Run independently on macOS

Stop the manual server first, then install the background service:

```sh
npm run service:install
npm run service:open
```

Installation creates **FPVBench.app** and **FPVBench Controls** in your home **Applications** folder. The controls provide Start, Stop, Restart, and Status. Closing the terminal or browser leaves the service running; it starts at login by default. Use `npm run service:install -- --no-login` for background operation without login startup. [Startup, updates, and removal →](repository-docs/macos-startup.md)

Add an aircraft, import a setup or a batch of DJI files, and explore its history. AI can be configured later in Settings.

## Guides and development

[All documentation](repository-docs/README.md) · [Betaflight imports](repository-docs/betaflight-imports.md) · [Flight log imports](repository-docs/dji-flight-imports.md) · [AirData](repository-docs/airdata.md) · [Optional AI](repository-docs/optional-ai.md) · [Backups](repository-docs/storage-and-backups.md) · [Architecture](repository-docs/architecture.md)

```sh
npm run check
npx playwright install chromium
npm run test:browser
```

Automated checks use synthetic data and injected memory repositories. Separate disposable operational proofs cover SQLite and decoder behavior. [Validation and how to reproduce it →](repository-docs/validation.md)

## Project status

FPVBench is an early-stage, single-workstation application. The repository is currently private; a public release and license have not been selected. GitHub Release installation packages with background/login setup choices are planned.

Direct controller capture/deployment, encrypted-telemetry keychain support, Blackbox analysis, media uploads, and cloud hosting are future work.
