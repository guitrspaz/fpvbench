# Betaflight imports

## Export a setup

Connect your Betaflight-equipped flight controller through the Betaflight application and open its CLI. Run `dump all`, then save the text output to a file. This includes values present in the export across PID and rate profiles. `diff all` is accepted too; it includes values that differ from firmware defaults.

Import the text file in FPVBench, choose its aircraft, and supply a setup label. Copy-and-paste import is available if a file is inconvenient. Maximum source size is 1 MiB. Imports require a Betaflight header and recognized settings or configuration commands.

Primary references: [Betaflight CLI](https://betaflight.com/docs/wiki/guides/current/Cli), [profiles and backup exports](https://betaflight.com/docs/wiki/guides/current/Profiles).

## What is retained

FPVBench stores the original text unchanged and records its SHA-256 fingerprint and import time. Parsed values retain global, PID-profile, or rate-profile scope. Common configuration commands have stable comparison keys. Unknown setting names are retained as literal values; unsupported command lines remain in the original export with a warning.

A raw-source download is available for every imported setup. This is source preservation, not an instruction to apply that export to another controller or firmware.

## Sparse and incomplete exports

`diff all` leaves out settings at their defaults. FPVBench does not reconstruct those defaults. If a value exists in one snapshot but is omitted from a sparse or partial snapshot, the comparison shows an unknown value. A missing value does not establish that a feature was disabled or a setting was removed.

Unknown export type, partial export, missing firmware metadata, unsupported lines, duplicate values, and absent terminal markers can generate warnings. Inspect the source when an import warning affects the question you want to answer.

The `all` suffix matters: a single-profile export cannot describe all profiles. Different profiles have separate setting keys. Final profile selection is imported where identifiable, but a snapshot cannot establish which profile was actually active during a later flight.

## Firmware and board differences

Exports keep their version and board metadata. Comparisons flag differences; identical variable names can have different meanings across releases. A comparison reports text/settings differences and does not provide a firmware migration or compatibility assessment.

Betaflight's documentation describes release-specific changes, including changes to D-term parameter meanings. Check documentation for the versions actually involved before interpreting a cross-version result.

## Examples and troubleshooting

[Baseline dump fixture](../examples/baseline-dump.txt) and [experiment diff fixture](../examples/experiment-diff.txt) are deliberately small synthetic examples. Import both into an example aircraft to explore changes and unknown omissions. They are not intended for flight-controller use.

If an import is rejected, check that the file contains Betaflight CLI output rather than another firmware's export, a binary file, or an empty document. If it succeeds with warnings, retain those warnings when interpreting the snapshot. Use original exports, rather than a hand-edited reconstruction, when recording a real setup.

## Scope of a Betaflight snapshot

A controller export does not record every part of a quad's setup. Physical components, repairs, transmitter configuration, and independently configured camera/ESC settings may require separate records. Flight-session fields retain battery, props, conditions, notes, and media references for that wider context.
