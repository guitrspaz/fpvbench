# AirData uploads

FPVBench organizes local originals and setup history alongside AirData's cloud analysis. Uploads are optional and start only when you select records and choose **Send selected logs to AirData**.

## Configure the connection

In **Settings → AirData connection**, save your AirData user upload token and developer application key, then choose **Check AirData connection**. Saving settings makes no provider request. Both credentials and a successful check are required before sending.

Your user token comes from [My Account → Auto Upload Token](https://app.airdata.com/main?a=account&apage_id=auto_upload_token). AirData's [Flight Upload API documentation](https://app.airdata.com/docs/api/) directs developers to request the separate application key from dev@airdata.com with an explanation of the app and audience. This upload key differs from the Enterprise account API key.

Credentials remain in an owner-private server file, not in browser storage or complete workspace exports. Settings fields are write-only. **Remove AirData credentials** disables the connection. Changing a token clears verification and separates receipts from the previous token.

## Send and check

1. Open **Flight log library** and select up to 20 records.
2. Choose **Send selected logs to AirData**. Exact retained originals are sent, including any coordinates and device identifiers inside them.
3. Choose **Refresh selected AirData status** to check processing. A successful job becomes **Confirmed by AirData**.

This version sends recognized DJI TXT, timestamped MAVLink TLog, ArduPilot DataFlash, and PX4 ULog originals. Recognition permits a submission attempt; AirData still determines whether it can process the particular file. Decoded DJI JSON, arbitrary JSON/RID captures, Blackbox, CSV, GPX and KML are retained locally and skipped by the uploader.

## Mark uploads made elsewhere

Use manual marks for records you have already uploaded through AirData or another app. No AirData connection or API key is needed.

1. Open **Flight log library** and choose the aircraft scope and AirData status filter you want. Leave **All aircraft** and **All AirData statuses** to include the full library.
2. Choose **Select all matching**, or check individual records. The selected count shows how many will be marked. Changing either filter clears the selection; **Clear selection** also lets you start over.
3. Choose **Mark selected as uploaded**. This records your manual upload status without sending files or asking AirData to verify them.

Manual marking supports selections larger than twenty; selections over 1,000 are saved in batches. Each batch saves together. If a later batch fails, earlier successful batches remain marked and the result reports the saved count. Sending and refreshing AirData submissions still require a configured connection and are limited to twenty selected records at a time.

Aircraft assignments, notes, originals, measurements and existing AirData receipts are preserved. You can change a manual mark in an individual record's **AirData upload tracking** section. In folder review, choose **Refresh saved statuses** to remove manually uploaded records from **AirData to review** without rescanning.

## Interpret the status

| State | Meaning |
| --- | --- |
| Confirmed by AirData | AirData reported successful processing of this submission. |
| Processing | The recorded job is pending or running. |
| Submission outcome unknown | Submission started but completion could not be established. Check AirData before considering another upload. |
| Upload failed | Preparation failed or AirData reported a processing error. |
| Manually marked sent | Your own record of an upload performed elsewhere. |
| Marked needs sending | Your own record that the file still needs uploading. |
| Not confirmed | There is no current-token receipt or manual sent mark. |

Manual statuses remain separate from provider receipts. Reimporting identical bytes preserves both. Repeated sends skip manual sent marks and current-token pending, confirmed or uncertain submissions. An explicit retry is available after a reported error; uploads are serialized.

Each record retains the latest submission's job, status and timestamps; the detail view shows its status and last update. Complete backups include that receipt, but exclude credentials. Restoring into a fresh directory requires configuring the connection again.

A receipt establishes a submitted job's processing result, not permanent retention in AirData. The upload token does not query your account's historical flight list, so FPVBench cannot automatically discover files uploaded earlier through another route. There is no automatic folder watcher or background upload.

## Validation

Synthetic provider responses cover settings, sending, processing, interruption, retries and preserved receipts. A separate disposable SQLite proof covers restart and complete restore. Live account verification and actual uploads remain untested until a developer application key is supplied. See [validation](validation.md).
