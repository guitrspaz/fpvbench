# Alpha scope and compatibility

**Last Updated:** October 25, 2026

FPVBench is a source-only alpha centered on understanding saved FPV controls and remembering setups. This guide describes the current starting path, supported evidence, and work still needed before broader use.

## Start with one aircraft

1. Install Node.js 22.13 or newer, then follow the [quickstart](../README.md#get-started). Installation currently requires npm and a repository checkout; no packaged installer is available.
2. Open **Start here → Try the example**. The two synthetic Controller 3 setups can be explored without importing data or connecting hardware.
3. Add your aircraft. Save a full Betaflight `dump all` text backup and import it with a name you will recognize.
4. Open **My controller**, choose a control, and read its action. Use **Check this control** to record your own observations for that saved setup.
5. After a change, import another backup and choose a useful comparison reference. Record the setup you actually used when logging a flight.
6. Download a control card for offline viewing and a complete workspace backup for recovery.

The control guide, comparisons, journal, demo, and backups work with AI disabled. Optional OpenAI assistance requires separately billed API access and explicit configuration. See [AI privacy and billing](optional-ai.md).

## What is supported

| Area | Current boundary |
| --- | --- |
| Physical controller guide | DJI FPV Remote Controller 3 schematic and suggested layout. Other controllers do not have their own physical maps. Suggestions remain unchecked until recorded by the operator. |
| Plain mode interpretation | Selected permanent mode IDs from Betaflight 4.5.x. Custom modes do not establish the attached hardware function. |
| Confirmed behavior comparison | Complete supported exports with identical firmware and board metadata. Different versions, sparse exports, unsupported conditions and unresolved mode evidence remain unknown. |
| Saved setup history | Original Betaflight text and parsed settings remain available even when the physical guide cannot fully explain them. Omitted defaults are not reconstructed. |
| DJI flight records | FlightRecord TXT versions 1–14 and compatible decoded JSON. Available decoding depends on format and file contents; newer encrypted TXT files retain locally available summaries without remote keychain requests. |
| Other flight files | Recognized PX4 ULog, ArduPilot DataFlash, MAVLink TLog/JSON-lines and Betaflight Blackbox can be retained as archives. Archives supply no decoded measurements or automatic flight sessions. |
| Startup | Local Node/npm launch; optional macOS background/login service and clickable controls. There is no packaged installer or general desktop-platform certification. |
| Recovery | Complete workspace export and validated restore command while the server is stopped. Optional AI files and folder preferences are separate from the portable backup. |
| Hosting | Single workstation with a loopback server. Internet-hosted or multi-user operation is outside the current application boundary. |

Read [controller interpretation](controller-map.md#interpretation-limits) and [flight-record compatibility](dji-flight-imports.md) before treating a particular export as supported. Software tests do not establish compatibility with every aircraft, receiver, firmware or log variant.

## How confidence is shown

A backup describes settings saved at a point in time. A suggested physical mapping, a recorded observation, and a checked control are different evidence:

- **Expected assignment:** the starting Controller 3 layout is being used, with no saved physical check.
- **Recorded assignment:** the operator has supplied the physical connection for that setup.
- **Checked control:** the operator explicitly recorded a physical check for that setup. It is not a flight-readiness certification.
- **Unknown:** the backup or mapping does not establish the answer. This does not prove that a button is disabled.

Comparison unknowns never enter confirmed change counts. A physical check cannot make different firmware versions comparable, recover an omitted historical setting, or establish live aircraft state. [Controller workflow and next steps →](controller-map.md)

## Novice usability follow-up

Human novice testing has not been established by the automated checks. Try the following with a few newer pilots in a disposable workspace using synthetic data. Observe without explaining where to click; record what they expected, where they paused, and whether they completed the task.

| Task | What to observe |
| --- | --- |
| Open the example and identify the motor-arm control | Can the participant find the control and distinguish a suggested assignment from a checked one? |
| Explain the beeper, GPS recovery and arming-permission actions | Are the short descriptions understood without assuming pause/hover or treating prearm as a motor stop? |
| Compare the original and revised examples | Can the participant explain a before/after button change and distinguish unknown evidence from no change? |
| Import a supplied synthetic full backup | Can the participant choose an aircraft, name the backup, and return to its controller view? |
| Start a guided control check, then leave it unfinished | Do they understand that FPVBench has no live receiver connection and that an unfinished check saves nothing? |
| Choose a flight reference | Can they explain why an unconfirmed or later flight cannot identify the reference for this import? |
| Download a control card and workspace backup | Can they distinguish a readable reference card from the complete recoverable data backup? |
| Find the restore instructions | Do they understand that restore replaces the workspace, requires a stopped server, and currently uses a terminal? |

Do not mark a real control checked as part of a screen-only usability exercise. Actual receiver observations need a separate physical check against the matching saved setup. Keep private logs, identifiers and optional API keys out of demonstration material.

## Release status and remaining work

- Reachable-history and source scans found no secrets in the material checked; automated scans cannot establish the absence of all private information. Examples and automated checks use synthetic records.
- The owner selected MIT on October 25, 2026. The root license and package metadata use MIT; third-party notices remain separate.
- Hosted Node 22/24 and synthetic browser checks passed for the beginner implementation. Keep checks green on the intended public release commit and review any later changes.
- Confirm the documented installation path and compatibility claims with representative users and devices; record limitations rather than implying universal support.
- This alpha is distributed as source. Packaged installers and broader device compatibility need their own validation and dependency notices.

Passing software checks does not establish flight readiness or replace physical controller checks and novice usability testing.
