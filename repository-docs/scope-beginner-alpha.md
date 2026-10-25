# Beginner workflow and public-alpha preparation

## Approved scope

Implement the accepted beginner recommendations and prepare a reviewable public alpha. Keep the GitHub repository private; publication, release announcements and license adoption remain separate decisions on concrete results. Preserve original exports, conservative comparison gates and existing observations. No controller writes or automatic physical verification.

## Construction plan

- Guided per-control check: three steps (identify channel, record observed positions, confirm/save), existing snapshot-specific mapping endpoint, explicit operator acknowledgment, bounded validation and no guessed switch direction. Leave unfinished checks unsaved; retain existing advanced editor.
- Unknown guidance: plain next steps for sparse backups, unsupported firmware, differing firmware/board and unidentified mappings. No evidence promotion and no weakening of confirmed-change rules.
- Reference shortcuts: previous import, preferred setup, most recent explicitly confirmed flown setup for this aircraft before the selected backup; label actual reference and absence. No session inference from telemetry/import order.
- Portable control card: local standalone downloadable HTML with print styles and mobile layout, setup/aircraft/date, per-control confidence and recorded positions, escaping all source text. No locations, serials, source exports or hidden notes.
- Start-here/demo: read-only synthetic Controller 3 example, no catalog mutations, separate from real aircraft; import instructions and entry points. No motor/flight operating sequence.
- Recovery: novice-facing backup/export and guided recovery information using the existing validated stopped-server restore command; no hot database replacement or new destructive restore endpoint.
- Public preparation: full reachable-history/current-source privacy scan with redacted results in a private report, dependency/license inventory, CI for lint/unit/browser checks on synthetic data, accurate installation/compatibility docs, draft license recommendation. Commit reviewed software locally. Do not publish or change visibility.

## Tests

Use Jest for pure reference selection, position input validation, card escaping/confidence and unknown guidance; use the existing memory-repository Playwright harness for wizard saves/cancel, demo isolation, reference shortcuts, downloadable card and recovery entry points. Existing controller/storage validation covers server persistence. Run lint/unit and full browser journey once integrated. Automated tests never open databases. Manual novice testing remains a human follow-up; provide task script, do not claim it occurred.

## Documentation

Update README (human-first quickstart/feature/compatibility), repository-docs/controller-map.md (both audiences, workflow and evidence limits), storage-and-backups.md (human recovery procedure), architecture.md (new presentation-only surfaces), validation.md/browser-validation.md (actual test evidence), and repository-docs/README.md (index). Add repository-docs/public-alpha.md for compatibility, release decisions and novice evaluation tasks. CI workflow and third-party notices document their own narrow behavior. Keep privacy scan findings and draft license payload outside tracked source.

## Integration refinements

During visual review, the mobile Add/Edit aircraft buttons were found to share one grid cell; place them on separate rows. Supply two complete synthetic controller text downloads matching the read-only demo, instead of leading beginners to the older intentionally tiny parser fixture. These remain read-only examples, never configuration recommendations.
