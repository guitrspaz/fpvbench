# DJI flight imports

## Copied files

FPVBench reads files you select from your computer. It does not connect to a controller, goggles, or DJI account. Copy the flight records from your device first, use **Import flight logs**. Files are handled individually so one unsupported file does not discard successful imports.

Supported inputs:

- Binary DJI FlightRecord TXT versions 1–14, decoded locally with [dji-log-parser-js](https://github.com/lvauvillier/dji-log-parser).
- Decoded JSON from that parser with `version`, `details`, and `frames`, or compatible `version`, `summary`, and `frames`.

TXT is a binary flight record, despite its extension; it is not pasted text. DAT and media files are unsupported. Other valid JSON can be retained as an archive without DJI decoding. The limit is 25 MiB per file and 100,000 telemetry frames.

The implementation pins decoder version 0.5.7. RC, RC2, and Goggles N3 are source labels, not a blanket guarantee that every firmware/export variant is supported. Compatibility with real user files must be checked with representative local samples.

## Broader original archives in v0.5

**Import flight logs** also accepts TXT, JSON, JSONL/NDJSON, LOG, BIN, TLOG, ULG, BBL/BFL, RIDLOG, CSV, GPX and KML originals. Content recognizers identify PX4 ULog, ArduPilot DataFlash, timestamped MAVLink TLog, a MAVLink JSON-lines profile with message metadata/data, and Betaflight Blackbox. Other accepted files remain unknown archives. A recognized DJI-shaped JSON must pass DJI validation; malformed JSON is rejected.

Recognition is separate from decoding. These broader formats currently retain exact originals and optional aircraft assignments. You can record separate manual sessions for the aircraft. Their measurements stay null, they create no automatic sessions, and they are excluded from AI flight totals. A filename or extension never establishes a flight. There is no universal RIDLOG or MAVLink JSON file schema assumed here, and no native detailed parser or multi-file flight grouping yet.

## Bulk import and aircraft assignment

Automatic matching is the default, including before any aircraft has been added. Each file is matched against a unique aircraft serial from fleet records and saved flight-record serial aliases. The selected aircraft, aircraft name/model, shared controller/goggles, and source-device label never supply an automatic assignment.

For binary TXT versions 6–14, the [pinned decoder details layout](https://github.com/lvauvillier/dji-log-parser/blob/v0.5.7/dji-log-parser/src/layout/details.rs) reads the aircraft serial from a 16-byte field. When that value is exactly 16 alphanumeric characters starting with 1581F, FPVBench can match a unique 20-character fleet serial beginning with the identical 16-character prefix. [DJI documents](https://repair.dji.com/help/content?customId=01700007747&lang=en&paperDocType=ARTICLE&re=US&spaceId=17) its 20-character aircraft serial form. Exact identifiers and explicit aliases take priority; prefix collisions remain unassigned. This fallback does not apply to JSON exports, arbitrary short serials, older TXT layouts, or model/name guesses. Original and stored aircraft serials stay unchanged. Missing or ambiguous serials stay unassigned.

Use **Unassigned** in the library to review these files. Their original bytes, summaries, telemetry and optional manual upload marks or historical receipts are saved; a linked session waits until an aircraft is assigned and a valid flight time exists. Add an aircraft if needed, open the record, choose its aircraft and save. **Remember this record’s aircraft serial for future imports** stores a separate serial alias, useful when a custom aircraft’s physical serial differs from its O4 identity. It does not replace the hardware serial you entered. Saved aliases appear under **Edit aircraft → Additional flight-record serials**; remove a mistaken alias there before learning it for a different aircraft. Conflicting remembered serials are rejected; explicit assignment without remembering remains possible.

Choose **Match unassigned flights** after adding aircraft or learning serial aliases to route other inbox files with unique matches. Assigned records are never moved by this action. You can also choose a specific aircraft in the import dialog, which applies that manual assignment to every selected file.

The library filters all aircraft, the selected aircraft, or unassigned records. Later reassignment retains observations, original bytes and optional manual upload marks or historical receipts, but clears the previous aircraft’s setup selection and confirmation.

## Summaries and telemetry

DJI record versions 13 and newer encrypt detailed telemetry. Their available summary can be read locally; FPVBench marks these imports **summary only**. The maintained parser documents the required DJI keychains for detailed decoding. FPVBench does not request them or ask for API credentials in this version.

Older binary records and supported decoded JSON can provide telemetry. A local frame-decoding failure retains a valid summary with a warning. Missing values stay unavailable rather than becoming guessed measurements.

The summary may supply flight time, duration, distance, maximum height/speed, aircraft serial, name/model, and location. For an assigned aircraft, a valid timestamp creates a flight session automatically. If it is missing, the imported record is retained with a warning. Battery, props, weather, notes, results, and setup confirmation remain yours to enter. DJI telemetry does not establish a Betaflight setup.

Decoded frames appear in a paginated table with available time, position, altitude, battery percentage, and horizontal speed. No remote map tiles are fetched.

## Units and recorded duration

**Settings → Display units** chooses Metric (m/km, m/s) or Imperial (ft/mi, mph) for details and telemetry. The choice is saved in this browser; normalized storage and exports remain SI. Durations are source-reported record/log time, not independently established airborne time.

The TXT v14/product type 137 summary family has an independently verified kilometre distance field. A same-aircraft AirData comparison of 21 retained records established the scale: a source longest path around 6.42 corresponds to approximately 6.42 km, and the combined source distance around 31.63 corresponds to roughly 20 miles. FPVBench converts that specific field to metres and retains the raw value/unit/basis. Explicit `distanceMeters`, decoded JSON, older TXT and other product types are unchanged. This evidence does not establish the distance unit for every DJI model or firmware variant. Other unverified v14 TXT distances remain excluded from AI recap calculations.

Existing applicable summaries receive a backed-up, verified correction on startup; see [storage and backups](storage-and-backups.md). Original bytes are never rewritten. Path length remains distinct from farthest distance from home or the pilot.

## History and originals

Imported measurements are read-only in the interface. The documented, verified distance correction can update a normalized summary with retained provenance; original bytes are immutable. The separate AirData status is editable. Editing a session changes your observations, not the imported measurements. Each session retains its imported-flight link.

SHA-256 identifies the original bytes. Automatic reimporting of identical bytes returns the existing record across the fleet or inbox, even under another filename. It never changes an existing assignment or upload status. An explicit import request for a different aircraft is rejected; use the record’s assignment controls to make a deliberate correction.

**Download original** returns the exact imported bytes after checking their fingerprint. The complete workspace export includes original files and telemetry as well as the ordinary setup/session data.

## AirData tracking

The library tracks uploads you perform in AirData using a manual status: **Not recorded**, **Not uploaded**, or **Uploaded**. New records start at Not recorded because the app cannot know whether you already uploaded them. Change the status from the detail view and filter the library by status. This status survives reimports, reloads, and complete backup/restore.

An optional connection can send selected supported originals and retain processing receipts; see [AirData uploads](airdata.md). FPVBench does not read account-wide historical uploads. A local import identifies files present in the workbench; it cannot detect flight files still on a controller. Copy files first, then import multiple records from your local folder. Identical files are recognized automatically.

## Local handling

Decoding runs in a bounded worker with a 10-second timeout. Imported filenames are metadata, never storage paths. Original bytes are kept in the owner-private workspace outside the source repository. No file is uploaded to a remote decoder or DJI API.

Flight files and complete backups may contain coordinates and component identifiers and retained aircraft serials. Controller, camera and battery serials are excluded from the normalized summary; the exact original file may still contain them. Use synthetic examples for code contributions and public demonstrations.

Primary references: [maintained decoder](https://github.com/lvauvillier/dji-log-parser) and [DJI FlightRecordParsingLib](https://github.com/dji-sdk/FlightRecordParsingLib).
