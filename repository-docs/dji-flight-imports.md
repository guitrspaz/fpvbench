# DJI flight imports

## Copied files

FPVBench reads files you select from your computer. It does not connect to a controller, goggles, or DJI account. Copy the flight records from your device first, create/select the aircraft, then use **Import DJI flights**. Files are handled individually so one unsupported file does not discard successful imports.

Supported inputs:

- Binary DJI FlightRecord TXT versions 1–14, decoded locally with [dji-log-parser-js](https://github.com/lvauvillier/dji-log-parser).
- Decoded JSON from that parser with `version`, `details`, and `frames`, or compatible `version`, `summary`, and `frames`.

TXT is a binary flight record, despite its extension; it is not pasted text. DAT files, raw-record JSON exports, arbitrary JSON, and media files are unsupported. The limit is 25 MiB per file and 100,000 telemetry frames.

The implementation pins decoder version 0.5.7. RC, RC2, and Goggles N3 are source labels, not a blanket guarantee that every firmware/export variant is supported. Compatibility with real user files must be checked with representative local samples.

## Summaries and telemetry

DJI record versions 13 and newer encrypt detailed telemetry. Their available summary can be read locally; FPVBench marks these imports **summary only**. The maintained parser documents the required DJI keychains for detailed decoding. FPVBench does not request them or ask for API credentials in this version.

Older binary records and supported decoded JSON can provide telemetry. A local frame-decoding failure retains a valid summary with a warning. Missing values stay unavailable rather than becoming guessed measurements.

The summary may supply flight time, duration, distance, maximum height/speed, aircraft name/model, and location. A valid timestamp creates a flight session automatically. If it is missing, the imported record is retained with a warning. Battery, props, weather, notes, results, and setup confirmation remain yours to enter. DJI telemetry does not establish a Betaflight setup.

Decoded frames appear in a paginated table with available time, position, altitude, battery percentage, and horizontal speed. No remote map tiles are fetched.

## History and originals

Imported measurements and original bytes are immutable. The separate AirData status is editable. Editing a session changes your observations, not the imported measurements. Each session retains its imported-flight link.

SHA-256 identifies the original bytes. Importing the same bytes for the same aircraft returns the existing record, even under another filename. Assigning identical bytes to a different aircraft is rejected to avoid silently conflicting histories.

**Download original** returns the exact imported bytes after checking their fingerprint. The complete workspace export includes original files and telemetry as well as the ordinary setup/session data.

## AirData tracking

The library tracks uploads you perform in AirData using a manual status: **Not recorded**, **Not uploaded**, or **Uploaded**. New records start at Not recorded because the app cannot know whether you already uploaded them. Change the status from the detail view and filter the library by status. This status survives reimports, reloads, and complete backup/restore.

FPVBench does not submit files to AirData or read its account history. A local import identifies files present in the workbench; it cannot detect flight files still on a controller. Copy files first, then import multiple records from your local folder. Identical files are recognized automatically.

## Local handling

Decoding runs in a bounded worker with a 10-second timeout. Imported filenames are metadata, never storage paths. Original bytes are kept in the owner-private workspace outside the source repository. No file is uploaded to a remote decoder or DJI API.

Flight files and complete backups may contain coordinates and component identifiers even though full serials are not shown in the summary. Use synthetic examples for code contributions and public demonstrations.

Primary references: [maintained decoder](https://github.com/lvauvillier/dji-log-parser) and [DJI FlightRecordParsingLib](https://github.com/dji-sdk/FlightRecordParsingLib).
