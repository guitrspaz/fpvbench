# Review a flight-record folder

Copy your records from the controller or goggles to a local folder. In **Flight log library**, choose **Review flight-record folder**. The default location is `~/Documents/FlightRecords`; you can choose another absolute path and whether to include subfolders.

Choose **Scan folder** to compare file contents with the originals already in FPVBench. Scanning reads files without importing, uploading, moving, or deleting them. It does not contact AI or AirData. Opening the screen, saving a location, or starting the app does not start a scan.

## What the review shows

| Status | Meaning |
| --- | --- |
| New originals | Unique file contents that are not in the library yet. The format is validated when imported. |
| Already imported | Files whose exact bytes match a saved original, even if the filename changed. |
| Extra copies | Additional files with the same bytes as an earlier file in this scan. Only the first new copy can be selected. |
| Unassigned imports | Imported originals in this folder that still need an aircraft assignment. New files are routed when imported. |
| Blocked files | Files that could not be safely read, including empty or oversized files. |

Counts describe this folder snapshot and overlap. A duplicate can also be unassigned. Unassigned counts count unique imported records; the file list can contain several copies of one record.

Use the filter to focus on a category. **Refresh saved statuses** rereads aircraft assignments and import states from the library without rescanning the folder. Choose **Scan folder** again to discover files copied there since the last scan.

## Import what you choose

Select individual new files, or filter to **New originals** and choose **Select matching new files**. Add an optional source-device label, then choose **Import selected files**. Larger selections run in batches of twenty. A failure is reported per file; successful imports remain saved.

FPVBench checks that each source still matches the scan before importing it. If a file changed or disappeared, scan again. Existing originals are reused without replacing their assignment, observations, or upload status.

Aircraft serials and remembered aliases route unique matches automatically. Shared controllers and goggles do not determine the aircraft. Unknown or ambiguous identities remain unassigned. Use **Open imported record** or return to **Flight log library** for assignment and optional manual upload tracking. Archive-only records retain their originals without creating flight measurements or sessions.

## Optional manual upload tracking

Folder review focuses on local originals, duplicates, assignments and blocked files. It has no upload queue. To record uploads made elsewhere, enable **Show manual upload tracking** in **Flight log library**. These marks do not affect folder-review counts. See [manual tracking](airdata.md#mark-uploads-made-elsewhere).

## Local preferences and scan limits

The folder preference is saved privately on the server computer. The current scan lives in memory for thirty minutes; restart or a folder-setting change clears it. Neither the folder preference nor the scan is included in the portable workspace export. Imported records retain the usual [backup coverage](storage-and-backups.md).

Scans skip hidden entries, unrelated file extensions, symbolic links, and the FPVBench workspace itself. Each file must be nonempty and no larger than 25 MiB. A scan is bounded to 5,000 directory entries, 2,000 candidate files, eight nested folder levels, 2 GiB of hashed content, and a thirty-second processing budget. Unreadable folders or reached limits produce a partial-scan warning. Narrow the folder or scan smaller groups to continue.

On macOS, a cloud-backed Documents folder can contain files whose contents have not been downloaded yet. The v0.7 background-service definition allows macOS to make those files available when explicitly read. After upgrading an older service, rerun `npm run service:install`, keeping your existing login choice and any custom port/data-directory options. A first scan may take longer while macOS downloads file contents; scan again after a partial result. You can also use Finder's **Keep Downloaded** for the source folder. See [Apple's file-download guide](https://support.apple.com/guide/mac-help/mchl1a02d711/mac) and [macOS startup](macos-startup.md).

A folder review cannot establish whether every record has been copied from a controller. It describes only the local files that were reviewed.
