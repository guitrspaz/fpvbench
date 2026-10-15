# Change journal and next-session brief

Use the journal to remember what changed, what you noticed, and what you want to try next. Each aircraft has its own entries, including retired aircraft. The feature works locally without an AI key, allowance, or provider connection.

## Record an entry

Choose an aircraft and open **Overview**. Its named journal panel shows entry and open-next-step counts. Choose **Open journal** to browse the history, or **Add entry** to record something directly.

- **Change:** something you changed, such as props, a repair, or a setup.
- **Observation:** something you noticed during or after a session.
- **Next step:** something to return to later.

The entry form displays a read-only **Aircraft** field. Saving attaches the entry directly to that aircraft; a setup or flight session is not required. This also supports DJI battery checks, aircraft inspections, problems, and repairs.

Give the entry a title, add optional details, and choose its date and time. The form displays local time; stored timestamps include a timezone. You can optionally link a saved setup and a flight session belonging to that aircraft. Neither link confirms what was physically installed or establishes why the aircraft behaved a particular way.

Entries are entered explicitly. Importing a setup or log does not create journal events automatically. Existing flight-session notes remain in their original records.

## Keep track of next steps

A next step begins **Open**. Choose **Mark done** or **Set aside** when appropriate; either removes it from the open brief while keeping it in the journal. **Reopen** brings it back. Use the journal filter to find open next steps, completed/set-aside items, changes, or observations.

You can edit an entry's type, title, details, event time, and links. Its ID and original creation time remain fixed; the last-edit time is updated. Changing its type resets the applicable status. This version retains entries rather than providing permanent deletion, and permits up to 500 entries per aircraft. The last edit is retained; earlier revisions of the entry text are not stored.

## Read the next-session brief

**Overview → Next session** names the selected aircraft and shows:

- Up to three open next steps, oldest event time first, with the total open count.
- Up to three recent changes and observations, newest event time first.
- The most recent recorded flight session and saved setup, plus a preferred baseline if selected.

Use **Add next step** for a quick reminder or the aircraft-named journal link for the complete history. The journal page also names its aircraft and provides **Aircraft overview** navigation. Links open the referenced setup or session.

Setup confirmation means a recorded session explicitly says that setup was checked for that session. It does not establish the current controller configuration, flightworthiness, or a performance conclusion. Missing records remain explicit. The brief uses stored records and ordinary code; it makes no AI call and sends no journal text to OpenAI or AirData.

## Aircraft and session changes

Retirement preserves the journal. Switching aircraft changes both the brief and journal.

If a linked session is reassigned to another aircraft, the journal stays with its original aircraft. Its session link is removed and the captured session title remains as context, labeled as a previously linked session. Reassignment does not move the journal or rewrite your observations. You can choose a different link while editing.

## Backups and versions

Complete workspace exports include journal entries inside aircraft records. They may contain personal notes, so keep backups private. Version 0.6 uses the existing catalog/SQLite version 3 without a table migration. Older backups without journals remain valid and start with no fabricated entries. App versions before 0.6 cannot read journal-bearing exports/catalogs; keep a pre-update backup when considering a downgrade.

See [storage and backups](storage-and-backups.md) and [validation](validation.md).
