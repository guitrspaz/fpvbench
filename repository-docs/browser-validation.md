# Browser validation

## Reproduce

From the repository root:

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

The runner creates an isolated local temporary workspace, injects a synthetic in-memory repository without opening SQLite, starts the real application on an ephemeral `127.0.0.1` port, and launches one headless Chromium browser. Its `finally` block closes the browser and server and removes the workspace. It never uses the normal personal data directory or connects to a controller.

The repository provides Playwright as a development dependency. For a machine that already has a suitable browser executable, set `FPVBENCH_CHROMIUM` to its absolute path. `FPVBENCH_PLAYWRIGHT_DIR` optionally points to an existing Playwright package directory; leave it unset to use the repository installation. No package is downloaded by the runner itself.

Optional screenshots can be saved to an existing local directory:

```sh
FPVBENCH_SCREENSHOT_DIR=/absolute/local/screenshot-directory npm run test:browser
```

The runner also accepts --screenshot-dir=/absolute/local/directory as a command-line argument. Screenshots contain synthetic test data and are not added to the repository automatically.

## Observed result — v0.2, 2026-10-14

The existing setup/session workflow and DJI journey passed: 13 existing checks plus 13 DJI/AirData checks. The run used Node.js 26.5.0, repository-installed Playwright 1.64.0, and cached Chromium 149.0.7827.55. Browser test ESLint passed. Desktop was 1440 × 1000; mobile was 390 × 844.

The browser runner injects createMemoryRepository through storeFactory and repositoryFactory. No automated browser check opens SQLite; the catalog/telemetry are synthetic in-memory data. Original-file I/O uses the disposable local workspace. The injected JSON decoder runs real normalization without WASM or a worker; binary decoding belongs to the separate operational proof. The runner also asserts no workspace.sqlite file was created.

| DJI check | Observed result |
|---|---|
| Multi-file upload | Two valid synthetic decoded JSON files imported through one file chooser |
| Partial batch | Malformed JSON between the valid files returned 422; both successful imports remained |
| Import status | A 101-frame file displayed DECODED; a no-frame file displayed SUMMARY ONLY |
| Sourced details | Duration, distance, version, and source-device metadata appeared in detail |
| Original files | Both raw downloads matched uploaded bytes exactly, including trailing line endings |
| Pagination | 1–100 of 101 and 101–101 of 101; controls disabled at boundaries |
| Dedupe | Reimporting both files under new names created no additional log or session |
| Generated session | Date and two-minute duration populated; no setup snapshot or confirmation was invented |
| Edit and reload | Manual observations/outcome saved; original log link remained unchanged |
| AirData tracking | Manual uploaded status and list filter worked; status survived dedupe, session edit, and reload |
| Mobile | All five views and decoded detail had no document-level horizontal overflow |
| Browser diagnostics | No page exceptions or unexpected error-level console messages; one expected 422 network diagnostic from the malformed file |
| Network | No attempted external requests during the DJI journey |

Page reload preserved the live in-memory store; this does not prove process-restart persistence, real SQLite behavior, or real-controller compatibility. See [validation.md](validation.md) for separately invoked operational evidence and [scope-v0.2.md](scope-v0.2.md) for the current boundary.

MCP_DOCKER was attempted first but could not reach the loopback target (ERR_CONNECTION_REFUSED). The server stayed loopback-only and local Chromium completed the journey. Synthetic desktop/mobile DJI viewport screenshots were produced outside the tracked tree. AirData is manual tracking only. No AirData login, API, verification, or upload was used. Desktop/mobile screenshots were inspected; controls remained legible and contained within the viewport.

## Historical result — v0.1, 2026-10-13

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
