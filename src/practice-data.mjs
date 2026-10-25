import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseExport } from './parser.mjs';

const id = suffix => '00000000-0000-4000-8000-' + String(suffix).padStart(12, '0');
export const PRACTICE_IDS = Object.freeze({
  aircraft: id(1), softwareAircraft: id(2), original: id(101), revised: id(102),
  softwareOriginal: id(103), softwareChanged: id(104), confirmedSession: id(201), unconfirmedSession: id(202),
});
const day = value => '2026-10-' + value + 'T12:00:00.000Z';

/** Fixed synthetic evidence for repeatable novice tasks; never read from an owner's exports. */
export async function createPracticeData() {
  const [original, revised] = await Promise.all([
    readFile(new URL('../examples/controller-original.txt', import.meta.url), 'utf8'),
    readFile(new URL('../examples/controller-revised.txt', import.meta.url), 'utf8'),
  ]);
  const aircraft = (aircraftId, name, baselineSnapshotId) => ({
    id: aircraftId, name, kind: 'Synthetic practice aircraft', status: 'active', registrationId: '',
    serialNumber: '', flightRecordSerials: [], notes: 'Practice only. No actual aircraft or physical check.',
    baselineSnapshotId, createdAt: day('01'),
  });
  const snapshot = (snapshotId, aircraftId, label, rawText, date) => ({
    id: snapshotId, aircraftId, label, notes: 'Synthetic example. Never apply this export to an aircraft.',
    filename: 'practice-example.txt', importedAt: day(date), rawText,
    sha256: createHash('sha256').update(rawText).digest('hex'), parsed: parseExport(rawText),
  });
  const session = (sessionId, snapshotId, title, confirmedSetup, time) => ({
    id: sessionId, aircraftId: PRACTICE_IDS.aircraft, snapshotId, flightLogId: null, title,
    flownAt: time, location: '', durationMinutes: 3, battery: '', props: '', conditions: '',
    notes: 'Fictional session for reference-selection practice.', outcome: 'unrated', mediaRefs: [],
    confirmedSetup, createdAt: time,
  });
  return {
    version: 3,
    aircraft: [
      aircraft(PRACTICE_IDS.aircraft, 'Practice quad · Controller 3', PRACTICE_IDS.original),
      aircraft(PRACTICE_IDS.softwareAircraft, 'Software-change example', PRACTICE_IDS.softwareOriginal),
    ],
    snapshots: [
      snapshot(PRACTICE_IDS.original, PRACTICE_IDS.aircraft, 'Original example', original, '01'),
      snapshot(PRACTICE_IDS.revised, PRACTICE_IDS.aircraft, 'Revised example', revised, '03'),
      snapshot(PRACTICE_IDS.softwareOriginal, PRACTICE_IDS.softwareAircraft, 'Before software change', original, '01'),
      snapshot(PRACTICE_IDS.softwareChanged, PRACTICE_IDS.softwareAircraft, 'After software change', revised.replace('4.5.2', '4.5.5'), '03'),
    ],
    sessions: [
      session(PRACTICE_IDS.confirmedSession, PRACTICE_IDS.original, 'Confirmed example flight', true, day('02')),
      session(PRACTICE_IDS.unconfirmedSession, PRACTICE_IDS.revised, 'Unconfirmed example flight', false, '2026-10-02T13:00:00.000Z'),
    ],
    flightLogs: [],
  };
}
