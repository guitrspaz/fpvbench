# macOS startup and controls

## Install once

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

Restart the managed service after source updates. If you move the checkout or delete the recorded Node.js version, stop the service, enter the new checkout with a supported Node.js runtime and rerun `npm run service:install`. Installation records an absolute executable path so login startup does not depend on shell profiles.

When upgrading a service installed before v0.7, rerun `npm run service:install` to enable macOS file materialization for cloud-backed source folders. Preserve your installation choices: include `-- --no-login` if login startup was disabled, and reuse any custom `PORT` or `FPVBENCH_DATA_DIR`. This allows macOS to download file contents when FPVBench reads them; it does not start a folder scan or an upload. See [import filing](import-filing.md).

Before restoring or copying workspace files, stop the service. See [storage and backups](storage-and-backups.md).

`npm run service:uninstall` stops the service and removes its managed login definition, launcher and command files. Aircraft, flights, setups, optional AI files and logs remain intact.

## Installed files and diagnosis

- Login service: `~/Library/LaunchAgents/local.fpvbench.server.plist`.
- On-demand service definition: `~/Library/Application Support/FPVBench/local.fpvbench.server.plist`.
- Install manifest and launcher source: `~/Library/Application Support/FPVBench/`.
- Owner-private stdout/stderr logs: `~/Library/Logs/FPVBench/server.log` and `server-error.log`.
- Local readiness endpoint: `GET /api/health` returns application name and version only.

Run **FPVBench Status** and inspect the error log if startup fails. A disabled background item in macOS **System Settings → General → Login Items & Extensions** may need to be re-enabled. The app’s existing single-owner lock prevents competing servers from opening the same workspace.

The service uses Apple’s [per-user LaunchAgent mechanism](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html). No system-wide daemon or administrator password is needed.
