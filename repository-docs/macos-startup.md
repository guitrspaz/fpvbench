# macOS startup and controls

**Last Updated:** October 25, 2026

Use the existing source installation or the local Apple Silicon installer preview. Both use the same per-user background service and everyday launcher.

## Native Apple Silicon installer preview

The preview is a native **Install FPVBench.app** with Node.js and the runtime application included. It is intended for fresh, per-user installation on Apple Silicon Macs running macOS 14 or newer; it does not require Git, npm, terminal commands or an administrator password from the end user. Maintainers can [build the local preview](../packaging/README.md). There is no signed, notarized public installer download yet.

Open the supplied local preview, review the installation action and choose **Install and Open**, or cancel without installing. A successful installation provides **FPVBench.app** and the usual controls in your home **Applications** folder. Use FPVBench.app to reopen the workbench.

If a managed installation already exists, the preview offers its existing launcher without replacing the app, service or workspace. It is not an updater. Unknown launchers, support files or unmanaged workspace conflicts stop installation rather than being overwritten. Continue using the source update procedure below for an existing installation.

The installer validates its payload before staging a versioned private copy under Application Support and activating the existing service installer. A failure during activation preserves installer-owned recovery information for inspection. Do not repeatedly delete files or remove a live workspace lock to force installation.

The preview is locally ad-hoc signed, not Developer ID signed or notarized. Opening a build produced on the development Mac does not establish how a browser-downloaded copy behaves. Public distribution still needs the [Developer ID signing](https://developer.apple.com/developer-id/) and [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) workflow, bundled-component notices, and downloaded-package checks. Do not disable Gatekeeper or remove quarantine attributes as a substitute.

Intel Mac and Windows installer packages are outside this first preview.

## Source installation

Install dependencies with `npm ci`, then stop any manually started server with Ctrl+C and run:

```sh
npm run service:install
npm run service:open
```

The per-user LaunchAgent runs FPVBench independently of a terminal, starts when you log in, and restarts after an unsuccessful exit. The app remains on the configured loopback port; the default is [http://127.0.0.1:4173](http://127.0.0.1:4173).

For an existing server started from this same checkout, `npm run service:install -- --take-over` verifies the workspace owner’s command and working directory before sending a graceful termination signal, then starts the managed service. Unknown owners are refused. The installer never removes a live workspace lock or performs a forced kill.

To use background operation only when requested:

```sh
npm run service:install -- --no-login
```

This keeps the service definition outside the login LaunchAgents folder. You can change the login choice by rerunning installation. Custom `PORT` and `FPVBENCH_DATA_DIR` values are recorded at installation.

## Clickable controls

Finder → your home folder → **Applications**:

- **FPVBench.app** starts the service if needed and opens FPVBench in your default browser. Drag it into your Dock if convenient.
- **FPVBench Controls/Start FPVBench.command** starts the background service.
- **Stop FPVBench.command** stops it for this login session. An enabled login service starts again at the next login.
- **Restart FPVBench.command** stops, waits for shutdown, then starts it with the latest source.
- **FPVBench Status.command** shows readiness and whether login startup is enabled.

The command controls open a brief Terminal session. You can close it after the command finishes; it does not host the running server. Closing the browser also leaves the server running.

Equivalent terminal commands are `npm run service:start`, `service:stop`, `service:restart`, `service:status` and `service:open`. Avoid starting a second manual `npm start` server against the same workspace.

## Updates, backups and removal

The native preview currently leaves an existing managed installation unchanged. It does not update a packaged payload. Keep a complete workspace backup and use the source procedure for source installations; packaged update support needs separate validation.

Restart the managed service after source updates. If you move the checkout or delete the recorded Node.js version, stop the service, enter the new checkout with a supported Node.js runtime and rerun `npm run service:install`. Installation records an absolute executable path so login startup does not depend on shell profiles.

When upgrading a service installed before v0.7, rerun `npm run service:install` to enable macOS file materialization for cloud-backed source folders. Preserve your installation choices: include `-- --no-login` if login startup was disabled, and reuse any custom `PORT` or `FPVBENCH_DATA_DIR`. This allows macOS to download file contents when FPVBench reads them; it does not start a folder scan or an upload. See [import filing](import-filing.md).

Before restoring or copying workspace files, stop the service. See [storage and backups](storage-and-backups.md).

`npm run service:uninstall` stops the service and removes its managed login definition, launcher and command files. Aircraft, flights, setups, optional AI files and logs remain intact. A preview installation also retains its versioned runtime payload under Application Support; the service uninstaller does not remove that payload.

## Installed files and diagnosis

- Login service: `~/Library/LaunchAgents/local.fpvbench.server.plist`.
- On-demand service definition: `~/Library/Application Support/FPVBench/local.fpvbench.server.plist`.
- Preview runtime payloads: `~/Library/Application Support/FPVBench/releases/<version>-<payload-id>/`.
- Incomplete preview activation: `~/Library/Application Support/FPVBench/INSTALLATION-INCOMPLETE.txt`, retained with the payload for diagnosis.
- Install manifest and launcher source: `~/Library/Application Support/FPVBench/`.
- Owner-private stdout/stderr logs: `~/Library/Logs/FPVBench/server.log` and `server-error.log`.
- Local readiness endpoint: `GET /api/health` returns application name and version only.

Run **FPVBench Status** and inspect the error log if startup fails. A disabled background item in macOS **System Settings → General → Login Items & Extensions** may need to be re-enabled. The app’s existing single-owner lock prevents competing servers from opening the same workspace.

The service uses Apple’s [per-user LaunchAgent mechanism](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html). No system-wide daemon or administrator password is needed.
