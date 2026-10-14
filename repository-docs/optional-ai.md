# Optional OpenAI assistant

## Enable it

Open **Settings** in FPVBench. Core aircraft, imports, comparisons, and flight records work with AI disabled.

1. Enter your OpenAI API key in the password field.
2. Enable optional AI and set a positive monthly FPVBench allowance.
3. Save the settings. Saving makes no API call.
4. Use **Test connection**. This makes a small billed API request and verifies that the key can currently complete a request.
5. Optionally enable automatic setup review after imports. Automatic work is bounded; an import arriving while another automatic review is running may need a manual review.

This key-based integration uses OpenAI API billing. A successful test records availability at that time; it does not read your account balance or guarantee that billing remains available. Authentication or billing failures disable AI features until you repair the account/key and explicitly check again. No recurring billing probes run.

Missing key, disabled AI, insufficient local allowance, or an unverified/blocked connection hides the AI feature controls. Settings remains accessible so you can configure or disable the integration.

## Features

The **setup assistant** explains explicit tuning settings and differences from the selected aircraft's preferred baseline. You can supply a short flying-goal question. Automatic review is separately opt-in and runs only after a successful setup import; a failed analysis never undoes the import.

The **flight recap** on the overview uses only the **currently selected aircraft**: its imported logs and manual sessions. Ordinary application code computes counts and available durations/distances/heights, avoiding double-counting sessions linked to imported logs. Other aircraft and unassigned records are excluded. Coverage counts show missing measurements. Distance means distance flown, not distance from the pilot. An aircraft with no records cannot generate a recap. This remains a light summary alongside AirData.

The panel names its aircraft. Switching aircraft clears the displayed recap and does not make a billed request; choose **Create AI flight recap** to generate or retrieve one for the new selection. Retired aircraft can still be selected through the fleet filter and recapped. Requests require the selected aircraft ID (`POST /api/ai/recap` with `{ aircraftId }`); the local ID is not sent to OpenAI.

Advice does not establish flightworthiness or generate/apply a controller configuration. Betaflight baseline preferences are user selections, not independently validated tunes. Sparse exports and unfamiliar firmware remain limitations. DJI flight logs do not supply Betaflight-style configuration evidence.

## Spending

The monthly allowance is **FPVBench's local estimate**, not your OpenAI account balance or an account-wide hard limit. It covers this workspace's AI requests and resets on the UTC calendar month.

Before sending a request, FPVBench saves a conservative reservation. Successful requests reconcile against reported input/output tokens. Uncertain failures retain the reservation because the provider may have processed a billable request. Restarting, changing the key, or toggling AI does not erase spending. The app makes no automatic retries.

The fixed model is `gpt-5.4-mini-2026-03-17`. Published standard prices checked October 14, 2026 are $0.75 per million input tokens and $4.50 per million output tokens. Local estimates omit cache discounts conservatively. Price changes or usage elsewhere on your account can make actual billing differ. Use your OpenAI project/organization spending controls for the provider-side limit.

Primary references: [model and pricing](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [OpenAI spend limits](https://developers.openai.com/api/docs/guides/spend-limits).

## What is sent

Setup review sends a bounded selection of explicit tuning/rates/filter/protocol fields, firmware/profile context, a similarly filtered baseline comparison, your optional question, and a small source glossary. It excludes the original configuration text and unrelated configuration fields.

Flight recap sends only the selected aircraft's aggregate measurements and label. User-entered labels and your question are included, so choose what you want to share. Exact coordinates, locations, original files, component identifiers, session notes, footage references, and raw telemetry are excluded.

Requests go from the local server to the fixed OpenAI Responses endpoint, with `store: false`. No web-search tool, remote decoding, controller operation, or AirData submission is involved. Setting `store: false` controls response storage; it is not a promise of zero provider retention. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).

## Key and local history

The key is stored only by the local server in `.ai-config.json`, an owner-private file outside the repository. The ledger and cache use `.ai-state.json` and `.ai-reports.json`. Keep any custom data directory outside the source checkout; the default workspace is already outside it. The settings response provides only whether a key exists; the field is never populated with a saved key. The app does not put credentials in browser storage, workspace exports, model inputs, or diagnostic logs.

Local AI configuration, spending ledger, and cached reports are separate from the flight/setup catalog and excluded from its JSON export. To preserve those local files, copy the complete data directory while FPVBench is stopped and keep that copy private. The ordinary export remains complete for aircraft, setups, sessions, DJI originals, and telemetry.

Flight recap caches are separate for each aircraft and its computed facts. Unchanged facts reuse that aircraft's report; changes elsewhere in the fleet do not invalidate it. Older whole-workspace recaps are not reused.

Repeated reviews of unchanged evidence and the same question reuse the cached report. Opening a setup retrieves its latest matching saved goal-specific review; changing the baseline or source evidence invalidates that match. Opening a saved report does not make an API request; AI content remains hidden when availability is disabled.

## Evidence

Automated tests use synthetic credentials and mocked provider responses. They cover gating, spending reservations, billing/auth failures, malformed responses, cached results, privacy filters, and UI behavior. No real paid request is made during development verification. A live connection requires the key you enter and a successful connection check.

Betaflight references used by the assistant: [PID/rates/filter documentation](https://betaflight.com/docs/wiki/app/pid-tuning-tab) and [presets documentation](https://betaflight.com/docs/wiki/app/presets-tab).
