# Controller 3 map and behavior changes

**Last Updated:** October 25, 2026

## Start with the buttons

The default view is written for newer pilots. Select a physical button or switch to read **What this does**. Common actions use short names such as **Arm / disarm motors**, **Self-leveling flight**, **Find the quad**, **Crash-flip mode**, **Arming permission**, and **GPS recovery**, followed by a brief explanation. The power button is separate from aircraft motor control; camera controls that the backup does not describe are not called unused.

One layout note distinguishes expected from checked button assignments. Changed controls have a short marker. **See what changed** jumps to plain before/after cards grouped by physical button, rather than a list of channel rows. A change to when an action is requested remains visible even if its action name is unchanged. Switching an equivalent assignment to a different channel on the same recorded button does not count as a new button action.

GPS recovery is explained as a configured attempt to return toward the takeoff point, not pause-and-hover. Arming permission is explained separately from arming or disarming; turning it off does not stop already-armed motors. When complete simple rules explicitly allow motor arming and GPS recovery together in part of a control's range, the selected-control explanation calls out that shared assignment. No switch directions or button press/latch sequences are invented.

**Advanced details for this button** retains measured positions, original ranges, mode commands, saved observations and the editor. **Advanced setup details** retains template adoption, copying, verification totals, import notices and all AUX assignments. Both start closed. Compare setups likewise keeps its raw table and filters under **Advanced setting comparison**. Reading the simple view never records a mapping or marks hardware checked.

The evidence and editing reference below describes these Advanced controls. Short action explanations are deterministic, version-aware presentation of the saved rules; they do not use AI or establish live aircraft behavior.


Open **My controller**, choose an aircraft's saved setup, and select a physical control on the Controller 3 schematic. The same map appears with setup details and in Compare setups. Setup details retain their name/navigation above the map, with raw settings collapsed. Shoulder controls are arranged left/right as held by the operator; sticks provide orientation, without interpreting their axis configuration.

## Advanced assignment and verification badges

- **Suggested mapping / Mode on expected AUX / No mode on expected AUX:** a preview using the Controller 3 starting layout, not a saved physical observation. Channel rules are known independently of whether that physical wiring has been checked.
- **Assigned:** explicit mode rules were found on the recorded AUX channel. Read the mode evidence for activation ranges and conditions.
- **No aircraft mode assigned:** a complete supported export establishes no mode assignment on that mapped channel. This does not establish that the physical control is unused by the controller, camera, or another system.
- **Controller / camera function:** an operator-recorded function outside Betaflight modes. The native power button instead displays **Controller function** from the documented layout.
- **Mapping unknown / Assignment unknown:** the physical mapping or export evidence is insufficient. Unknown does not mean disabled.
- **Physically verified / Not physically verified:** independent operator observations about this setup's physical mapping. Importing an export never verifies a physical control.

The view covers mode assignments. It does not establish live aircraft state, all transmitter functions, arming permission, hardware response, or flight readiness. Physical button labels such as Pause/RTH do not establish DJI flight behavior on a Betaflight aircraft.

## Check one control at a time

Choose a button on the map, then **Check this control**. The guide uses three steps:

1. **Find the connection.** Confirm that you are checking the configuration in the selected backup. Remove propellers before a powered bench check, then observe which AUX channel changes in Betaflight’s Receiver tab when you move only this control. An AUX channel is an extra receiver connection. FPVBench does not measure it.
2. **Record what you see.** Enter two to five positions or button states using your own names and whole receiver values from 900 to 2100. At least two different values are required. A controller/camera function instead needs a note describing the function you checked.
3. **Confirm this check.** Review the observations, consult the Modes tab for the saved action ranges, explicitly acknowledge your physical check, and choose **Save checked control**.

**Leave unfinished** discards the unsaved check. The guide does not guess switch directions, momentary/latching behavior, or aircraft readiness. If no channel moves and you cannot identify an external function, leave the mapping unfinished. If the aircraft has changed since the selected backup, import a fresh full backup and check that setup instead.

The guided check saves only the selected control through the same revision-checked observation API as the Advanced editor. Other controls and the original backup remain unchanged. A physical check does not remove comparison limits caused by incomplete evidence or different software.

## Advanced mapping editor

Before any mappings are saved, the view previews a clearly labeled suggested AUX layout: flight-mode switch AUX1, C2 AUX2, Pause/RTH AUX3, Start/Stop AUX4, C1 AUX5. These are suggestions, not discovered wiring. Opening the page saves nothing. The power button is shown as a documented controller function; gimbal/shutter actions remain unrecorded because the export does not establish them. No physical positions, press/hold/latch behavior, or verification are supplied. In **Advanced setup details**, **Use suggested AUX mapping (unverified)** explicitly adopts the remaining suggestions without overwriting already recorded controls.

Select a control, open **Advanced details for this button**, then expand **Edit mapping & verification**. An unsaved suggestion is preselected and labeled as such; saving adopts it for that control only. Other suggestions remain unsaved. Choose its observed AUX channel, controller/camera function, or unknown. Optionally enter measured positions one per line, for example:

```text
Top = 1000
Middle = 1500
Bottom = 2000
```

Those numbers are an input-format example, not a claim about your switch direction. Record what the receiver actually reports, plus any button latch or reset observations in the notes. Check the physical-verification box only after checking that mapping for the selected setup, then save. Editing an observation clears the checkbox until explicitly checked again.

Each setup owns independent observations. Choosing **Copy reference mapping (reset verification)** copies them explicitly and clears all verification. It never alters the reference setup. A changed mapping in another open editor causes a conflict; reload to retrieve the saved revision before editing again.

## Compare what changed

Changes run from the chosen reference to the selected setup. My controller initially chooses the previous import as its reference. Named shortcuts also select the preferred setup or **Last confirmed flight before this import**. The flight reference requires an explicit setup confirmation on a recorded flight for the same aircraft, dated no later than the selected backup’s import. It is not inferred from telemetry, filenames, or import order. A reference that is absent or is the selected setup explains why it cannot be used. Import order is not proof of when settings were applied. The simple view says there is not enough information for a full comparison, rather than presenting zero changes as a complete result. Advanced details retain **Behavior comparison incomplete** and gap summaries for channels with recorded rules. Compare setups retains its explicit reference/compared selectors.

Confirmed mode changes compare normalized mode IDs, channels, ranges, and related conditions, rather than configuration-row slots. Reordering equivalent rows or duplicating an OR range does not produce a mode change. Moving an assignment between channels affects both channels. Expand a changed channel to see before/after ranges; expand a physical control's mode evidence to see its original command and line.

The default count describes physical controls with changed saved actions; it is qualified as expected when the layout is not checked. Advanced mode-comparison counts describe AUX channels with different configured mode behavior, not the number of buttons pressed or flight outcomes. Physical attribution uses the mapping recorded separately for each setup; an unverified mapping remains visibly unverified. Physical mapping observations differ in their own section. Adding a previously unknown mapping, changing notes, or recording verification does not count as an aircraft mode change.

Unknown comparisons stay outside confirmed counts. The raw-setting table also defaults to **Confirmed changes**; choose **Unknown** to inspect missing values separately.

## When the answer is unknown

The simple view pairs an interpretation limit with a next step:

- **Different software or board:** inspect each backup’s metadata in Setup history and check the current controls in Receiver and Modes. A software update alone does not prove that a button changed.
- **Sparse backup:** use a full `dump all` export for future imports. Keep the old file; a fresh backup cannot reconstruct settings omitted from a historical export.
- **Unsupported firmware:** retain the original and inspect the controls with a compatible Betaflight app. Do not change aircraft software merely to make this view work.
- **Rules needing review:** inspect Advanced setup details and the Modes tab. Unknown is not proof that a control is unused.

## Take a control card with you

In My controller or a setup’s controller view, choose **Download control card**. The standalone HTML file opens offline in a browser, adapts to a phone screen, and supports the browser’s Print command. It includes aircraft and setup names, the backup import time, card creation time, button actions, each control’s checked status, and recorded positions. Unknown and expected assignments keep their qualifications.

The card excludes flight locations, serials, original exports, and observation notes. Its aircraft/setup names and control observations can still be personal, so review it before sharing. It describes that saved backup, not a live aircraft connection, and may omit actions whose buttons are unidentified. Download a new card when the setup or observations change.

## Explore without importing

**Start here → Try the example** displays two synthetic Betaflight 4.5.2 setups with a suggested, unchecked Controller 3 layout. The example has no save or verification actions and does not add aircraft or change the workspace. See [the alpha guide](public-alpha.md) for the starting workflow and compatibility.

## Interpretation limits

The first interpreter supports selected permanent mode IDs from Betaflight 4.5.x, including arming, Angle, Horizon, beeper, turtle, prearm, GPS Rescue, User1–4, and several recording/video modes. User-defined modes remain labeled as custom actions; a mode ID alone does not identify the attached hardware action.

Complete behavior comparison requires complete dump-all exports with identical firmware and board metadata. Unrelated parser warnings do not automatically block a mode comparison: the interpreter independently checks all 20 unique AUX slots against original source, accounts for each AUX/adjustment command, and rejects domain duplicates or truncation. Other warnings remain in the source/import details and a separate import note. Stored parser output is unchanged. Sparse/partial exports, unresolved mode-domain warnings, unknown mode IDs, unsupported firmware, malformed mode rows, active in-flight adjustments, AND conditions or linked modes leave the comparison unknown. Explicit ranges are still visible as evidence. Inactive zero-width AUX/adjustment slots do not imply an assignment. Position outcomes are withheld when interpretation is incomplete. Supported simple ranges include their lower limit and exclude their upper limit; values are clamped as in Betaflight 4.5.

Original exports and parsed evidence stay unchanged. Optional controller metadata is included in ordinary workspace exports and validated during restore. Older backups without mappings remain valid; older application versions may reject backups containing the new metadata. No database-schema migration is required.

## References

Plain action meanings: [Betaflight modes](https://betaflight.com/docs/wiki/app/auxiliary-tab), [arming and prearm](https://betaflight.com/docs/wiki/guides/current/Arming-Sequence-And-Safety). The version-specific source links below remain the interpretation boundary.

Physical names and orientation: [DJI FPV Remote Controller 3 manual](https://dl.djicdn.com/downloads/DJI_FPV_RC_3/UM/DJI_FPV_Remote_Controller_3_User_Manual_v1.0_EN.pdf). This application's schematic is original.

Permanent IDs: [Betaflight 4.5.2 mode definitions](https://github.com/betaflight/betaflight/blob/4.5.2/src/main/msp/msp_box.c). Range and condition semantics: [4.5.2 mode implementation](https://github.com/betaflight/betaflight/blob/4.5.2/src/main/fc/rc_modes.c), [CLI export fields](https://github.com/betaflight/betaflight/blob/4.5.2/src/main/cli/cli.c). Checked October 24, 2026.

Developer scope and test plan: [Controller map scope](scope-controller-map.md).
