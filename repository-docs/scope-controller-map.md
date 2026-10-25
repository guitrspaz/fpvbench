# Controller 3 interpretation scope

Closed design, October 24, 2026. First release covers Controller 3 physical controls and setup-local observations, interpreting Betaflight 4.5 modes. No device connection or configuration writes.

## Objects and behavior

Snapshots optionally own controller metadata: model, revision, updatedAt, bounded mappings for eight controls. Each maps to AUX1–14, external function, or unknown, with measured positions, note, and explicit verification. Server owns timestamps; optimistic revisions prevent stale edits. Copying resets verification. Raw and parsed export evidence stays immutable. Existing JSON storage needs no schema migration; legacy absence stays valid.

My controller, setup detail and comparison show an original labeled schematic plus keyboard-accessible controls. Suggested AUX assignments appear as unverified previews; adopting them requires an explicit save. No assumed physical switch direction, momentary/latch behavior, or firmware defaults. Position values are entered observations. Include C1, C2, flight-mode switch, Pause/RTH, Start/Stop, dial, shutter, power. Stick axes are deferred.

Normalize mode rules by behavior rather than row slot; retain original lines. Empty ranges are inactive. Preserve condition/dependency evidence. Unsupported firmware, unknown mode IDs, malformed rows, active adjustments, AND/linked conditions, sparse or incomplete exports prevent complete interpretation. Assignment and verification are independent badges. No aircraft mode assigned is narrower than unused.

Compare AUX behaviors only with complete same-version/board evidence. Unknowns never enter confirmed behavior counts. Show physical mapping differences separately; verification-only edits are not behavior changes. Default raw comparison to confirmed changes, with unknowns available separately. Render untrusted text inertly.

## Test plan

Jest units cover reorder/deduplication, moved channels, inactive ranges, exclusive range ends, grouped conditions, malformed/unsupported/sparse data, firmware/board changes, assignments, mapping-only and verification-only changes. Jest store/API checks use the injected memory repository for validation, conflicts, isolation, save failure, restart, backup/restore validation, legacy absence, and HTTP contracts. No databases.

Synthetic browser checks cover setup selection, map controls, template/copy/edit/save, verification, reload, comparison direction, unknown separation, inert notes, keyboard use and mobile overflow. MCP_DOCKER performs UI inspection; existing Playwright journeys provide regression checks. Run ESLint and Jest plus browser journeys in disposable local directories with cleanup.

## Documentation plan

Both human and future-agent audiences: this scope, a controller-map guide indexed in repository-docs/README.md and root README, architecture/storage metadata notes, and actual validation/browser evidence. API contracts live beside source. No new workspace policy or tooling docs.

UI elaboration: observation editors start collapsed, leaving the map and behavior badges visible. Inactive adjustment slots are ignored; active or malformed adjustment rows withhold completeness.

API elaboration: controller replacement requests allow 64 KiB so valid multibyte notes/position labels fit the bounded eight-control model. Larger requests return 413.

Final UI elaboration: setup detail keeps the original setup header and navigation above the map; raw settings/commands are collapsed by default.


## Evidence-driven correction — October 24

Realistic full CLI exports contain benign section-heading warnings and ordered feature disable/enable rows. The controller interpreter must audit the complete AUX domain independently, without changing the immutable parser output or silently dropping its warnings. It may establish mode completeness despite unrelated warnings only when original source accounts for all 20 unique AUX slots, every non-comment AUX/adjustment line matches parsed evidence, and no duplicate/conflicting domain rows or truncation exists. Domain-specific malformed/duplicate/unsupported conditions still withhold completeness. Unrelated warnings remain discoverable outside mode blockers. Existing sparse exports stay unknown.

Unsaved Controller 3 AUX suggestions appear immediately as an explicit preview, separate from recorded mappings and verification. No read creates metadata. Saving one observed control must not save suggestions for the others. Native power is a documented controller function; camera/dial actions remain outside the export evidence. Preview mapping labels and counts must not imply measured wiring. Copying uses only recorded observations, not preview suggestions. Suppress repetitive unknown-to-unknown detail, show source-specific reasons, and distinguish an unavailable comparison from an actual zero-change result.

Additional tests: independently generated full synthetic 20-slot dump with ordinary CLI headings/feature reset warnings; complete mode-domain audit, missing/duplicate/unparsed rows, truncation, sparse data, and legitimate non-domain warnings; preview-versus-persistence separation, no-mutation reads, single-control save, native power and custom actions. Browser proof starts with an untouched full dump and must show expected assignments and meaningful changes without pressing a template button. Unknown boundaries and explicit verification remain covered. Real aircraft exports are read-only diagnostic evidence and must not become tracked fixtures.


## Beginner-first presentation — October 25

Default controller view answers what each physical control does and what changed, in plain language. Use short action names plus brief explanations; keep motor arming, prearm permission, self-leveling, crash-flip, GPS recovery and beeper distinct. No new flight commands, inferred physical directions, simulated device checks, or stored preference/schema changes.

Show the controller before technical controls. One shared layout-confidence message distinguishes expected from checked mappings. A button card has its name, plain action and at most one short state/change badge. Selecting it gives beginner explanations and recorded position labels without numbers. Same-control motor-arm/GPS-recovery overlapping ranges receive an explicit factual notice; ordinary prearm/turtle combinations are described separately without inventing an operating sequence.

Default changes are grouped by physical control, with readable before/after actions; changes in activation ranges must not disappear behind identical action names. Do not double-count both AUX channels for one physical action or present connection/verification-note edits as changed aircraft behavior. Unsupported/sparse comparisons remain incomplete; native/camera functions and unassigned actions remain distinct. No AUX numbers, ranges, numeric mode IDs, parser warnings, or repeated evidence badges appear in the initial visible page. A collapsed Advanced setup details section and per-button Advanced details preserve current channel evidence, edits, template/copy operations, and verification.

Testing: add Jest units for pure beginner-language/action/change presentation using synthetic rules; check known/unknown mode names, incomplete evidence, overlapping and non-overlapping arm/rescue ranges, ordinary prearm/turtle, checked versus expected labels, range-only changes, equivalent assignments moved to another channel, and no mutation. Adapt the existing synthetic Chromium journey to assert jargon is hidden by default, readable meaning and changes appear, advanced editing/copy/verification still work, and mobile/keyboard/XSS checks pass. Add an independently generated before/after example matching the kinds of roles in the F5 imports; never copy personal exports into fixtures. Run lint, targeted units, and the existing complete browser/Jest suites.

Documentation: update controller-map guide and architecture for the presentation layer and Advanced disclosure. Record actual test/browser evidence in existing validation docs. Sources for short mode explanations stay linked in the guide. Presentation work does not change imported exports, parser evidence, saved mappings or aircraft configuration.

Beginner UI elaboration: the physical map leads, with a See what changed jump to the plain-language change cards below. Advanced data is closed by default both for the setup and for the selected button.

Beginner comparison elaboration: Compare setups also starts with the plain control view. Its existing raw settings table, filters and parser warnings stay intact under a closed Advanced setting comparison disclosure.

Final copy elaboration: explain arming in terms of motors running, the beeper in terms of finding the quad, GPS recovery in terms of an attempted return toward the takeoff point, and prearm as permission for a separate motor-arm control. No action instructions or guaranteed hardware outcomes are added.

Live-data elaboration: F5 backups span supported 4.5 patch versions, so preserve the existing cross-version comparison guard. Translate existing comparison reasons into beginner language (software/hardware difference versus a sparse backup); do not present every incomplete comparison as missing fields or relax confirmation rules. Add pure and browser coverage for this distinction.
