# Browser validation

## Reproduce

From the repository root:

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

The runner creates an isolated local temporary workspace, starts the real application on an ephemeral `127.0.0.1` port, and launches one headless Chromium browser. Its `finally` block closes the browser and server and removes the workspace. It never uses the normal personal data directory or connects to a controller.

The repository provides Playwright as a development dependency. For a machine that already has a suitable browser executable, set `FPVBENCH_CHROMIUM` to its absolute path. `FPVBENCH_PLAYWRIGHT_DIR` optionally points to an existing Playwright package directory; leave it unset to use the repository installation. No package is downloaded by the runner itself.

Optional screenshots can be saved to an existing local directory:

```sh
FPVBENCH_SCREENSHOT_DIR=/absolute/local/screenshot-directory npm run test:browser
```

The runner also accepts --screenshot-dir=/absolute/local/directory as a command-line argument. Screenshots contain synthetic test data and are not added to the repository automatically.

## Observed result — 2026-10-13

The complete journey passed against the final v0.1 application files. The observed run used Node.js 26.5.0, both the existing Playwright 1.62.1 installation and the repository-installed Playwright 1.64.0, with cached Chromium 149.0.7827.55. Desktop viewport was 1440 × 1000; mobile viewport was 390 × 844. `npx eslint tests/browser` also passed.

| Check | Observed result |
|---|---|
| Empty workspace | Onboarding rendered; import disabled until an aircraft exists |
| Aircraft | Created through the interface |
| File import | Uploaded synthetic `dump all` text with UTF-8 BOM and CRLF; downloaded raw bytes matched the uploaded bytes exactly |
| Paste import | Imported a second synthetic `diff all` export |
| Setup history and baseline | Opened the first snapshot and selected it as the preferred baseline |
| Comparison | PID 0 `p_roll` showed 45 → 48; omitted `i_roll` showed 80 → “Unknown · not in export” |
| Comparison filter | Unknown filter removed changed rows and retained sparse omissions |
| Imported HTML | An image/event-handler string appeared as literal text; its execution marker remained unset |
| Session creation | Saved time, duration, snapshot link, explicit setup confirmation, battery, props, conditions, outcome, observations, and two media references |
| Session editing | Changed observations and outcome; existing snapshot link and confirmation remained populated |
| Reload persistence | Edited observations, outcome, confirmation, and media reference survived page reload |
| Mobile layout | Overview, history, comparison, and sessions had no document-level horizontal overflow |
| Browser errors | No captured page exceptions or error-level console messages |

The desktop comparison and mobile session screenshots were inspected. The comparison displayed distinct changed rows and explicit unknown values; the mobile session showed the linked snapshot and setup confirmation without clipped document content.

## Evidence limits

- MCP_DOCKER was tried first but could not reach the workstation's loopback server (`ERR_CONNECTION_REFUSED`). The application's loopback restriction stayed enabled. A local browser run completed after allowing Chromium's macOS process startup outside the shell sandbox.
- The repository-installed Playwright 1.64.0 runner passed all 13 checks using the cached Chromium executable. A fresh browser download was not needed or exercised.
- This is one Chromium smoke journey with synthetic exports. It does not establish Firefox/Safari behavior, a full accessibility audit, or compatibility with every Betaflight firmware/export variant.
- No live flight controller, firmware deployment, public hosting, or actual flight was involved. Reload checks persisted application state; storage restart/corruption behavior belongs to the separate store/API tests.

See [validation.md](validation.md) for the broader validation record and [scope-v0.1.md](scope-v0.1.md) for the planned evidence boundary.
