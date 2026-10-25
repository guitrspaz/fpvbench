# Mac installer preview and novice testing

## Approved scope and closed design

The owner requested testing and an easier installer, with Mac first and Windows later. Build a reviewable local Apple Silicon installer preview and an isolated novice-test workflow. No public binary upload, signing-identity purchase, Gatekeeper bypass, participant outreach or claim of human research is included. Existing personal installation and workspace stay untouched.

### Installer

- Native Cocoa Install FPVBench app with Install and Cancel, plus an Open existing installation path. Bundle a pinned official Node24 arm64 runtime, app source/static files and runtime dependency. Users need no Git/npm/terminal commands. First preview supports fresh per-user installation only; detect an existing managed install and reuse it without replacing it. Refuse unknown conflicting launcher/support files.
- Build allowlist excludes git metadata, development dependencies, tests, personal data/config and raw private files. Download runtime from nodejs.org, verify SHA256 against the pinned official checksum, retain Node LICENSE and decoder plus Rust transitive notices. Package archive locally with checksum and explicit unsigned/non-notarized metadata. Do not claim smooth downloaded Gatekeeper installation.
- Installer source module validates the full bounded payload manifest, rejects path traversal/symlinks/hash mismatches, stages a versioned owner-private payload under Application Support, then invokes the existing service installer with the bundled runtime. Installation is explicit. Failure before activation cleans only newly created installer-owned files; retain bounded recovery information on activation failure. No destructive cleanup of arbitrary directories, forced kill or live-workspace repair.
- Native wrapper never uses shell interpolation. Its error UI must give a readable next step, and cancel must mutate nothing. Existing service source and working lifecycle remain unchanged.

### Testing

- Practice server uses synthetic example aircraft, setups and explicit sessions in an injected memory repository; personal data directories and credentials never open. Use a disposable temp directory for originals, close/clean it deterministically, and bind a separate loopback port. AI/provider/folder settings must be unavailable. Provide a visible practice banner on every view and truthful in-memory storage label. Main personal workspace remains the default for ordinary launch.
- Unit/contract tests cover installer payload boundaries, manifest/checksum failures, occupied target, previous installation reuse, cancellation/preflight, service invocation argument boundaries, and practice reference data/isolation. All automated storage is mocked or memory-only; no SQLite in automated tests.
- Extend the existing Playwright memory harness for practice banner, no real provider/folder access, usable focus/error feedback and core novice tasks. Check desktop/mobile and keyboard. Actual beginner sessions need humans; produce task sheet, observation CSV/template and scoring criteria without inventing results.
- Operational verification separately compiles and ad-hoc signs the native wrapper, verifies app/bundle/payload integrity and bundled Node version, and stages a disposable fresh install with OS service operations injected. No real LaunchAgent registration, user launcher replacement or personal workspace mutation during proof.

## Documentation plan

Update README, repository-docs/macos-startup.md, public-alpha.md, architecture.md, storage-and-backups.md if necessary and index in place. Add repository-docs/usability-testing.md (human tasks, observable outcomes, no clinical/persona claims), packaging README (maintainer build/signing/provenance boundary) and a synthetic observations CSV. Update validation/browser-validation only with observed results. No new workspace policy/instructions.

## Ownership

Installer worker owns src/macos-installer.mjs, packaging/** and installer unit tests; usability worker owns src/practice-workspace.mjs and practice-data.mjs, new memory helper and practice tests/journey, proposed integration patch only. Root owns server/app integration, test-runner/package/CI wiring, full validation and final source rollout. Documentation writer owns planned human docs after source contracts are available. Nobody publishes binaries or edits other owners’ files.

## Integration findings

The focused practice journey found the fixed desktop sidebar could put its export link below the viewport without a scroll container. Add vertical sidebar scrolling and cover reachability. Installer review also requires a port-in-use preflight before activation and validation of the complete payload tree before reading listed file contents; retain/refuse safely on activation errors without leaving a newly owned failed service running.

The build uses its explicit private cache for npm as well as runtime/crate inputs. For MPL-2.0 entries in the conservative decoder inventory, retain the verified unmodified source archive with its full license notice inside the payload, so recipients have the exact source form. The native UI must also refuse Dock Quit while activation runs, then permit normal termination after the helper finishes.

The reproducible manual proof is dev/verify-macos-installer.mjs. It uses the real built runtime/payload in a disposable canonicalized synthetic home with both OS lifecycle functions injected. It imports the bundled decoder and verifies retained source checksums without opening a database or registering a user service.
