# FPVBench

**Understand your controls. Remember your setups. See what changed.**

FPVBench turns saved Betaflight backups into a readable controller guide and setup history. See what each button is assigned to do, record which controls you have checked, and compare the next backup with a useful reference.

Copied flight records and your own observations can live alongside that history in the same local workbench.

Built for FPV pilots with a growing fleet, with a place for DJI photography-drone records too.

## What you can do

| Between flights | In FPVBench |
| --- | --- |
| Remember a setup you liked | Save named Betaflight snapshots and choose a preferred baseline for each aircraft. |
| Understand what changed | Compare settings across snapshots, including PID/rate profiles, with readable changes and missing values marked as unknown. |
| Sort a pile of flight records | Bulk import copied DJI files, match unique aircraft serials, and keep unknown records in an assignable inbox. |
| See what still needs filing | Scan a local record folder for new originals, extra copies, and unassigned imports. |
| Track uploads made elsewhere | Optionally record manual upload marks, including uploads to AirData; no files are sent or verified. |
| Pick up where you left off | Keep an aircraft journal of changes, observations, and next steps; see open items and recent context on Overview. |
| Connect setups with observations | Record equipment, conditions, notes, results, and footage references in flight sessions; link the setup you used. |
| Keep your fleet's history | Store registration IDs and serials; retire an aircraft from the active fleet while keeping its records. |
| Get a quick explanation | Enable optional AI for setup explanations and a flight recap focused on the selected aircraft. |

## Know your Controller 3

Open **My controller** for plain-language button actions and what changed between setups. Select a button to learn what it does, then choose **Check this control** for a guided check: identify the connection, record the positions you observe, and confirm the saved observation. Suggestions never become checked assignments automatically.

Compare against the previous import, your preferred setup, or the last setup explicitly confirmed in a flight before the selected import. Download an offline HTML control card to view on your phone or print. Unknowns have their own next steps and stay separate from confirmed changes; Advanced details retain the original evidence and editor. [Controller map guide →](repository-docs/controller-map.md)

## Remember the setup behind the flight

Import a Betaflight `dump all` or `diff all` export and give it a name you will recognize later. Your original export stays available alongside its readable settings. Pick a preferred baseline, import the next version, and see what changed.

After flying, add your observations and link the setup you used. Each aircraft builds a record of settings, experiments, and what you noticed in the air.

A saved snapshot does not confirm the aircraft's current settings. Setup confirmation is explicit, and FPVBench does not apply configurations to a controller. [Betaflight import guide →](repository-docs/betaflight-imports.md)

## Pick up where you left off

Record a change, an observation, or a next step in each aircraft's journal. Link entries to saved setups or flight sessions when useful. The next-session brief on Overview brings back open next steps, recent entries, and the latest recorded session and saved setup.

Mark a next step done, set it aside, or reopen it without losing its history. The journal and brief work without AI and keep their text local. [Change journal and next-session brief →](repository-docs/change-journal.md)

## Organize a mixed fleet's flight records

Copy DJI flight records from your controller or goggles, then import a whole batch. FPVBench uses aircraft serial evidence to route unique matches, even when you share controllers across aircraft. Unknown or ambiguous records wait in the **Unassigned** inbox; assign them later and optionally remember the recorded serial for future imports.

Exact original files are retained. Importing the same bytes again reuses the existing record. Available timestamps create linked sessions once an aircraft is assigned; add your own notes alongside the sourced measurements.

Review a copied-record folder before importing. See which originals are new, which are duplicates, and which imported records need assignment. Select the new files you want to keep; scanning leaves the source folder unchanged. [Import filing guide →](repository-docs/import-filing.md)

AirData integration is deferred. Local flight records remain usable without it. Enable **Show manual upload tracking** in the library to record uploads made elsewhere. Unmarked records mean **Not recorded** and do not become an upload to-do list. [Manual tracking and historical receipts →](repository-docs/airdata.md)

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

Open **Start here**, then **Try the example** to explore two synthetic Controller 3 setups. This read-only example needs no hardware and adds nothing to your real workspace. When ready, add an aircraft, save a full Betaflight `dump all` text backup, and import it with a recognizable name. Open **My controller** to identify and check its controls.

Start here also includes **Backup and recovery**. Download a complete workspace backup before an update or a move; restoration currently uses the documented stopped-server terminal command. [Backup and restore guide →](repository-docs/storage-and-backups.md)

### Run independently on macOS

Stop the manual server first, then install the background service:

```sh
npm run service:install
npm run service:open
```

Installation creates **FPVBench.app** and **FPVBench Controls** in your home **Applications** folder. The controls provide Start, Stop, Restart, and Status. Closing the terminal or browser leaves the service running; it starts at login by default. Use `npm run service:install -- --no-login` for background operation without login startup. [Startup, updates, and removal →](repository-docs/macos-startup.md)

AI can be configured later in Settings. The controller guide, comparisons, journal, demo, and backups work without it.

## Guides and development

[All documentation](repository-docs/README.md) · [Alpha scope and compatibility](repository-docs/public-alpha.md) · [Betaflight imports](repository-docs/betaflight-imports.md) · [Flight log imports](repository-docs/dji-flight-imports.md) · [Manual upload tracking](repository-docs/airdata.md) · [Optional AI](repository-docs/optional-ai.md) · [Backups](repository-docs/storage-and-backups.md) · [Architecture](repository-docs/architecture.md)

```sh
npm run check
npx playwright install chromium
npm run test:browser
```

Automated checks use synthetic data and injected memory repositories. Separate disposable operational proofs cover SQLite and decoder behavior. [Validation and how to reproduce it →](repository-docs/validation.md)

## Project status

FPVBench is an early-stage, single-workstation application being prepared for a public alpha. The repository remains private and a public release is pending. There is no packaged installer yet; installation requires Node.js, npm, and a repository checkout.

The physical button guide currently covers **DJI FPV Remote Controller 3** and selected **Betaflight 4.5.x** mode assignments. Complete behavior comparisons require matching firmware and board metadata. Other saved setups can retain their history without a fully interpreted controller map. DJI decoding also has format-specific limits. [Compatibility and the proposed first alpha →](repository-docs/public-alpha.md)

Direct controller capture/deployment, encrypted-telemetry keychain support, Blackbox analysis, media uploads, and cloud hosting are future work.

## License

FPVBench is licensed under the [MIT License](LICENSE). Third-party components retain their own [license notices](THIRD_PARTY_NOTICES.md).
