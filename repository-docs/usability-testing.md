# Novice usability sessions

**Last Updated:** October 25, 2026

Use this kit to learn whether newer FPV pilots can understand saved controls, distinguish unknowns from changes, and recover their records. It is a plan and recording template, not a report of completed user testing.

## Prepare an isolated session

From a source checkout with dependencies installed, run:

```sh
npm run practice
```

The default practice address is **http://127.0.0.1:4174**, separate from the ordinary server on port 4173. If that port is occupied, use `npm run practice -- --port=4175`. Open the loopback URL printed in the terminal. The practice server is separate from the ordinary workspace and uses fictional aircraft, complete synthetic backups, and example flight sessions in memory. Check that the **Practice workspace** banner is visible before starting. Its records reset when that server stops; closing a browser tab alone does not stop it.

AI requests and copied-folder settings are unavailable in practice. Do not enter API keys, import personal flight logs, or use real serials or registration IDs for this study. The practice export is named as practice data and cannot back up the participant’s real workspace. Stop the practice server with Ctrl+C after the session.

Copy the [observation CSV template](../examples/usability-observations-template.csv) to a private folder outside the repository. Record participant IDs rather than names. Keep completed observations, quotes and recordings out of commits. Ask before recording a screen, and capture only the practice app.

Start with a few newer pilots to catch obvious blockers, then aim for five to eight participants across a full round. This is a usability study, not a statistical estimate of all pilots. Budget about 20–30 minutes for the app tasks; test installation separately.

## Facilitate without coaching

Say: “We are testing the app. If something is unclear, that is useful feedback. Please say what you expect to happen as you work.”

Read one task at a time. Do not point to the right control or explain vocabulary before the participant tries it. Ask neutral prompts such as “What do you expect that to do?” or “What does that message mean to you?” Record any help you provide. If someone is stuck or wants to stop, move on.

Do not connect an aircraft, arm motors, restore a workspace, or submit a physical-check confirmation during a screen-only session. An interface exercise cannot establish a real control mapping.

## Participant tasks and observer checks

The task wording is intentionally brief. Keep the observer column to yourself.

| ID | Read to the participant | Observe |
| --- | --- | --- |
| U1 | Find out which control is assigned to arm the motors in the newer example setup. | Can they find My controller and the setup choice? Do they understand that a suggested layout still needs checking? |
| U2 | Find the action that helps locate the quad. Explain what you think it does. | Do they recognize the beeper action without assuming the app can make the quad beep? |
| U3 | Tell me what changed between the two example setups. | Can they explain a before/after button change? Do they keep missing evidence separate from “no change”? |
| U4 | Find out how you would check one control on your own aircraft. Begin that process, then leave it unfinished. | Can they find the guide, explain what must be observed elsewhere, and exit without saving? Do the matching-backup and physical-check confirmations make sense? |
| U5 | Compare the newer setup with the one the recorded flight says was used. Explain why you chose that reference. | Do they use an explicit confirmed-flight link rather than assume import order proves use? |
| U6 | Save a reference you could read on a phone at the field. | Can they download the control card and recognize its setup identity and checked/expected status? |
| U7 | Find a backup of the practice records and the instructions for recovering records later. Do not restore anything. | Can they distinguish a control card from a complete workspace backup? Do they notice that recovery replaces a workspace and currently uses a stopped-server command? |
| U8 | Tell me what you would do next if a button’s action could not be confirmed. | Does the next-step guidance help? Do they avoid treating unknown as unused or safe? |

For U8, select **Software-change example** in the practice fleet. Its two backups use different software versions, so the comparison stays unknown and supplies next steps. Record which example was used. Do not alter an original export to imply historical evidence that never existed.

## Test the Mac installer separately

Use the local Apple Silicon installer preview only on a consenting test Mac/user profile with no existing FPVBench installation, or a disposable macOS test environment. This preview is not a signed, notarized public download. Do not disable Gatekeeper or remove quarantine attributes for a study; a blocked download is an installation outcome to record.

| ID | Read to the participant | Observe |
| --- | --- | --- |
| I1 | Open the supplied installer and tell me what it will install. Cancel before installing. | Are the action, destination, bundled runtime and cancellation clear? Cancel should leave the installation untouched. |
| I2 | Install FPVBench and open it. | Does a fresh installation complete without Git, npm or terminal commands? Can the participant find the app afterward? |
| I3 | Close the browser, then open FPVBench again from Applications. | Do they understand how to reopen it and that the background service is independent? |
| I4 | Open the installer on a profile that already has a managed FPVBench installation. | Does it offer the existing launcher without replacing that installation? Unknown conflicting files should produce a readable stop message. |

Only run I2 after the participant agrees to installation. Record the Mac chip, macOS version, package version, whether the app was downloaded or built locally, and its signing/notarization status. A local build opening successfully does not prove that a browser-downloaded installer passes Gatekeeper.

## Score and prioritize

Use these outcomes in the CSV:

- **pass:** completed and explained the result without directional help.
- **help:** completed after a hint or explanation; record the help.
- **fail:** could not complete, abandoned the task, or reached the wrong conclusion.

Record elapsed seconds, but do not rank people by speed. Note the exact confusing label or action, what the participant expected, and the observed result. A completed click sequence with the wrong mental model is a failure of the task.

After each round, group repeated observations by issue. Prioritize misleading control/verification conclusions and data-loss risks first, blocked core tasks second, and minor friction last. Report participant counts and task denominators alongside outcomes; retain counterexamples and do not turn a small sample into a universal claim.

The next report should separate observed participant evidence, automated checks, and proposed fixes. No human results are established until sessions have actually been conducted.
