# Manual upload tracking and deferred AirData integration

FPVBench keeps your flight records locally. AirData integration is deferred: connection settings, sending, processing refresh and upload queues are unavailable. Local imports, original downloads, assignment, sessions, measurements and backups work without AirData.

## Mark uploads made elsewhere

Manual tracking is optional. It records your own notes about an upload; it does not send files, contact AirData, verify account contents or require credentials.

1. Open **Flight log library** and enable **Show manual upload tracking**. This choice is remembered in the browser and starts off in a new browser.
2. Choose the aircraft and optional **manual upload status** filter. **Not recorded** means no manual status was saved; it does not imply a file is absent from AirData.
3. Select individual records or **Select all matching**, then **Mark selected as uploaded**. Changing either filter clears selection; **Clear selection** also resets it.

Selections over 1,000 records are saved in sequential batches. Each batch is atomic; successful earlier batches remain saved if a later batch fails. The message reports how many were saved. Turning tracking off clears the current selection and hides its controls and badges, while preserving every saved mark.

For an individual record, expand **Manual upload tracking (optional)**. Choose **Manually marked uploaded**, **Manually marked not uploaded**, or **Not recorded**, then **Save manual upload status**. Not recorded clears the mark. This section starts collapsed each time you open a record.

Manual marks do not replace originals, measurements, aircraft assignments, notes, setups or historical provider receipts. Exact-byte duplicate imports reuse the existing record and its marks. Complete exports and restores retain these fields.

## Historical submission receipts

Existing provider receipts remain in the catalog and backups. A record with a receipt offers a collapsed **Historical AirData submission receipt** section, even without a configured connection. Its status and timestamp describe the last recorded result. They are not refreshed and do not establish current account contents. An old pending or uncertain result remains historical evidence rather than an active job.

## Why uploads are deferred

The provider response received on 2026-10-21 requires an Enterprise plan to issue a Flight Upload API application key for this private personal app. A future public release may be reviewed separately; that does not guarantee API access. Upload access is not a dependency for local FPVBench features.

The standalone upload service and receipt validator remain in source for possible future reassessment. The application server does not initialize the upload service, read its private configuration or make AirData requests. Every `/api/airdata` route returns HTTP 410, including settings, checking, sending and refresh, so a stale browser cannot activate it. Restoring uploads requires a deliberate application change, not credentials or a hidden setting.

Existing `.airdata-config.json` files remain untouched, owner-private and excluded from complete workspace exports. No credentials are needed for manual tracking or historical receipts. See [storage and backups](storage-and-backups.md) and [validation](validation.md).
