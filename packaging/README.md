# macOS installer preview

The JavaScript build produces `Install FPVBench.app` with `Contents/Resources/payload/{app,node/bin/node,manifest.json,licenses}`.

## Native helper contract

The native Cocoa source is `packaging/installer-main.m`. It is compiled by the builder to `Contents/MacOS/InstallFPVBench`. It shows Install and Open / Cancel for a fresh installation, or Open FPVBench / Cancel for an existing one, and runs the embedded Node executable directly (NSTask, no shell):

- Check: `node payload/app/src/macos-installer.mjs --payload PATH --check`
- Install after explicit user action: same command with `--install`
- Optional `--no-login` preserves an explicit user choice.

The native helper removes NODE_OPTIONS and NODE_PATH from its NSTask environment before launching the bundled runtime. Window close and Dock Quit are refused while installation is running, then normal termination is restored.

The command writes one JSON object to stdout. A successful response has `status: "ready" | "installed" | "already-installed"`, `launcher`, and `version`. An error response has `status: "error"` and a readable `message`, with nonzero exit status. An already-installed result must offer to open the existing launcher and make no installation changes.

This preview supports fresh per-user installs only. Existing installations, workspaces and launchers are preserved. It does not download or run updates automatically.

## Maintainer build

Use `node packaging/build-macos.mjs --out /absolute/output/folder [--cache /absolute/cache/folder]` on an Apple Silicon Mac with the command-line SDK. Output and cache directories must be outside the source root, including through symlink aliases. The build creates an ad-hoc-signed local preview, not a Developer-ID-signed or notarized public download. Never remove quarantine attributes or disable Gatekeeper to distribute it.

The build downloads only pinned Node/runtime and Rust crate inputs, validates SHA256 checksums, installs the pinned production npm tree without lifecycle scripts, copies an explicit application allowlist and retains bundled notices. A successful build includes an inventory, source/runtime provenance and SHA256 for the zip. Public release/signing is a separate action.

No signing identity is selected automatically. A public installer needs Developer ID signing, hardened-runtime entitlements appropriate to Node/Wasm, notarization, Gatekeeper testing of a browser-downloaded artifact, and a tested update path. The current existing-install path deliberately reuses the installed launcher instead of upgrading it.

Automated installer tests use disposable files and mocked activation; they do not register a service or open a database.

The notice inventory covers 147 registry entries in the decoder’s pinned workspace lockfile, conservatively including unused build/dev/target crates. Missing workspace licenses are pinned from the crate-recorded upstream Git revisions, and two BSD notices are preserved from their source headers. Node’s full upstream LICENSE is retained separately. No copyright holder or attribution is invented.

For isolated custom-home operational proofs, inject both activation and deactivation operations. The default lifecycle helper uses the real macOS user home, so custom-home installs without both injections are rejected before mutation. Read-only inspect checks may use a custom home.

The payload also includes verified unmodified source archives for MPL-2.0 inventory components under licenses/sources/, with their original license notices. This is a conservative superset of the decoder workspace dependencies.

## Local verification

The preview requires macOS 14 or newer. After building, run the compiled helper with --verify-payload for a read-only native check. Run the isolated file/runtime proof with:

    node dev/verify-macos-installer.mjs "/absolute/output/Install FPVBench.app/Contents/Resources/payload"

This proof copies the real payload to a disposable synthetic home and runs its bundled Node/decoder. Both service lifecycle operations are injected; no real service is registered and no database is opened. It does not replace native dialog testing, a fresh-user installation test, or Gatekeeper validation.
