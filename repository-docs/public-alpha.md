# Alpha scope and compatibility

**Last Updated:** October 25, 2026

FPVBench is a source-only alpha centered on understanding saved FPV controls and remembering setups. This guide describes the current starting path, supported evidence, and work still needed before broader use.

## Start with one aircraft

1. For the public source alpha, install Node.js 22.13 or newer and follow the [quickstart](../README.md#get-started). A [native Apple Silicon installer preview](macos-startup.md#native-apple-silicon-installer-preview) can be built locally with its runtime included; it is not a signed, notarized public download.
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
| Startup | Public source uses Node/npm, with optional macOS background/login service and clickable controls. A local Apple Silicon installer preview bundles the runtime for fresh per-user installs; existing managed installations are reused without replacement. Public signing/notarization and broader platform validation remain pending. |
| Recovery | Complete workspace export and validated restore command while the server is stopped. Optional AI files and folder preferences are separate from the portable backup. |
| Practice | Separate loopback server with fictional records in memory, a visible practice banner, and no AI or copied-folder access. Practice exports are samples, not personal-workspace backups. |
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

The [usability session kit](usability-testing.md) provides a separate practice-workspace procedure, participant tasks, observer criteria and a blank recording template. It also separates installer testing from the ordinary app tasks. Human sessions have not been established by automated checks.

Start with fictional records and leave physical-check confirmations unfinished during screen-only sessions. Actual receiver observations, real aircraft checks and downloaded-installer behavior require their own evidence.

## Release status and remaining work

- Reachable-history and source scans found no secrets in the material checked; automated scans cannot establish the absence of all private information. Examples and automated checks use synthetic records.
- The owner selected MIT on October 25, 2026. The root license and package metadata use MIT; third-party notices remain separate.
- Hosted Node 22/24 and synthetic browser checks passed for the beginner implementation. Keep checks green on the intended public release commit and review any later changes.
- Confirm the documented installation path and compatibility claims with representative users and devices; record limitations rather than implying universal support.
- Public distribution remains source-only. The local installer preview still needs Developer ID signing, Apple notarization, downloaded-package checks and reviewed bundled-component notices before public binary distribution. Intel Mac and Windows installer support remain future work.

Passing software checks does not establish flight readiness or replace physical controller checks and novice usability testing.
