import { beforeEach, afterEach, test, expect } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.mjs';
import { normalizeDecodedFlight } from '../src/dji-import.mjs';
import { validateCompleteBackup } from '../src/restore.mjs';
import { createMemoryRepository } from './helpers/memory-repository.mjs';

let directory, store, repository;
let decoderFormat = 'dji-json', decoderVersion;
const decodeFlight = async bytes => { const decoded = normalizeDecodedFlight(JSON.parse(bytes.toString()), decoderFormat); if (decoderVersion !== undefined) decoded.logVersion = decoderVersion; return decoded; };
const open = () => createStore(directory, { repositoryFactory: () => repository, decodeFlight });
const payload = (serial, extra = {}) => ({ filename: 'synthetic.json', sourceDevice: 'Same remote for all aircraft', contentBase64: Buffer.from(JSON.stringify({ version: 14, details: { aircraftSn: serial, rcSn: 'SHARED-REMOTE', aircraftName: 'Generic quad', startTime: '2026-10-14T12:00:00Z', totalTime: 60, ...extra }, frames: [] })).toString('base64') });
beforeEach(async () => { decoderFormat = 'dji-json'; decoderVersion = undefined; directory = await mkdtemp(join(tmpdir(), 'fpvbench-fleet-')); repository = createMemoryRepository(); store = await open(); });
afterEach(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });

test('mixed records route by aircraft serial rather than the shared remote or aircraft names', async () => {
  const a = await store.createAircraft({ name: 'Generic quad', serialNumber: 'SN-A' });
  const b = await store.createAircraft({ name: 'Generic quad', serialNumber: 'sn-b' });
  const first = await store.importFlightLog(payload('sn-a'));
  const second = await store.importFlightLog(payload('SN-B'));
  expect(first.flightLog.aircraftId).toBe(a.id);
  expect(second.flightLog.aircraftId).toBe(b.id);
  expect(first.session.aircraftId).toBe(a.id);
  expect(second.session.aircraftId).toBe(b.id);
  expect(first.routing).toBe('serial-match');
  expect(first.flightLog.summary.aircraftSerial).toBe('sn-a');
  expect(JSON.stringify(first)).not.toContain('SHARED-REMOTE');
});

test('unknown and missing aircraft serials remain unassigned even if a generic name matches', async () => {
  await store.createAircraft({ name: 'Generic quad', serialNumber: 'OTHER' });
  for (const serial of ['UNKNOWN', '', '00000000000000']) {
    const result = await store.importFlightLog(payload(serial));
    expect(result.flightLog.aircraftId).toBeNull();
    expect(result.session).toBeNull();
    expect(result.routing).toBe('unassigned');
  }
  expect(store.getState().sessions).toHaveLength(0);
});

test('ambiguous aircraft serial stays in the inbox', async () => {
  await store.createAircraft({ name: 'First', serialNumber: 'SAME' });
  await store.createAircraft({ name: 'Second', serialNumber: 'same' });
  expect((await store.importFlightLog(payload('SAME'))).flightLog.aircraftId).toBeNull();
});

test('retired aircraft still owns its archived imported logs and AirData history', async () => {
  const old = await store.createAircraft({ name: 'Old quad', serialNumber: 'OLD-SERIAL' });
  await store.createAircraft({ name: 'Current quad', serialNumber: 'NEW-SERIAL' });
  const first = await store.importFlightLog(payload('OLD-SERIAL'));
  await store.updateFlightLog(first.flightLog.id, { airdataStatus: 'uploaded' });
  await store.updateAircraft(old.id, { status: 'retired' });
  const later = await store.importFlightLog(payload('OLD-SERIAL', { startTime: '2026-10-14T13:00:00Z' }));
  expect(later.flightLog.aircraftId).toBe(old.id);
  expect(store.getFlightLog(first.flightLog.id).airdataStatus).toBe('uploaded');
  expect((await store.exportWorkspace()).originals).toHaveLength(2);
});

test('modern TXT 16-character aircraft serial uniquely matches the full 20-character DJI serial', async () => {
  decoderFormat = 'dji-txt';
  const short = '1581F12345678ABC';
  const aircraft = await store.createAircraft({ name: 'Synthetic DJI', serialNumber: short + 'DEFG' });
  const imported = await store.importFlightLog(payload(short));
  expect(imported.flightLog.aircraftId).toBe(aircraft.id);
  expect(imported.flightLog.summary.aircraftSerial).toBe(short);
  expect(store.getState().aircraft[0].serialNumber).toBe(short + 'DEFG');
});

test('truncated TXT prefix collisions remain unassigned and explicit aliases take precedence', async () => {
  decoderFormat = 'dji-txt';
  const short = '1581F12345678ABC';
  await store.createAircraft({ name: 'First', serialNumber: short + 'AAAA' });
  const second = await store.createAircraft({ name: 'Second', serialNumber: short + 'BBBB' });
  const imported = await store.importFlightLog(payload(short));
  expect(imported.flightLog.aircraftId).toBeNull();
  expect(await store.matchUnassignedFlightLogs()).toEqual({ matched: 0, unassigned: 1 });
  await store.updateAircraft(second.id, { flightRecordSerials: [short] });
  expect(await store.matchUnassignedFlightLogs()).toEqual({ matched: 1, unassigned: 0 });
  expect(store.getFlightLog(imported.flightLog.id).aircraftId).toBe(second.id);
});

test.each([['dji-json', 14, '1581F12345678ABC'], ['dji-txt', 5, '1581F12345678ABC'], ['dji-txt', 14, 'OTHER123456789ABC'], ['dji-txt', 14, '1581F123456789A']])('partial matching is limited to the documented modern TXT serial field: %s %s %s', async (format, version, short) => {
  decoderFormat = format; decoderVersion = version;
  await store.createAircraft({ name: 'Must not guess', serialNumber: short + 'X'.repeat(20 - short.length) });
  expect((await store.importFlightLog(payload(short))).flightLog.aircraftId).toBeNull();
});

test('serial aliases entered while creating an aircraft are retained and route imports', async () => {
  const aircraft = await store.createAircraft({ name: 'Custom quad', serialNumber: 'FRAME', flightRecordSerials: ['RADIO-IDENTITY'] });
  expect((await store.importFlightLog(payload('radio-identity'))).flightLog.aircraftId).toBe(aircraft.id);
  await expect(store.createAircraft({ name: 'Invalid aliases', flightRecordSerials: null })).rejects.toThrow();
  await expect(store.createAircraft({ name: 'Duplicate aliases', flightRecordSerials: ['SAME', 'same'] })).rejects.toThrow();
});

test('inbox supports assignment later, explicit remembered serials, dedupe, export and reopening', async () => {
  const imported = await store.importFlightLog(payload('O4-SYNTHETIC'));
  expect(imported.flightLog.aircraftId).toBeNull();
  const aircraft = await store.createAircraft({ name: 'Custom O4 quad', serialNumber: 'FRAME-SERIAL' });
  await store.updateFlightLog(imported.flightLog.id, { airdataStatus: 'uploaded' });
  await store.updateFlightLog(imported.flightLog.id, { aircraftId: aircraft.id, rememberAircraft: true });
  expect(store.getState().sessions).toHaveLength(1);
  expect(store.getState().aircraft[0]).toMatchObject({ serialNumber: 'FRAME-SERIAL', flightRecordSerials: ['O4-SYNTHETIC'] });
  const later = await store.importFlightLog(payload('O4-SYNTHETIC', { startTime: '2026-10-14T13:00:00Z' }));
  expect(later.flightLog.aircraftId).toBe(aircraft.id);
  const duplicate = await store.importFlightLog(payload('O4-SYNTHETIC'));
  expect(duplicate.duplicate).toBe(true);
  expect(duplicate.flightLog.airdataStatus).toBe('uploaded');
  expect(store.getState().sessions).toHaveLength(2);
  expect(await store.getFlightOriginal(imported.flightLog.id)).toEqual(Buffer.from(payload('O4-SYNTHETIC').contentBase64, 'base64'));
  const backup = await store.exportWorkspace();
  expect(validateCompleteBackup(backup).catalog.version).toBe(3);
  await store.close(); store = await open();
  expect(await store.exportWorkspace()).toEqual(backup);
});

test('unassigned imports and complete backups work with an empty fleet', async () => {
  await store.importFlightLog(payload('NOT-IN-FLEET'));
  const backup = await store.exportWorkspace();
  expect(validateCompleteBackup(backup).catalog.flightLogs[0].aircraftId).toBeNull();
  expect(backup.originals).toHaveLength(1);
  expect(backup.telemetry).toHaveLength(1);
  const duplicate = await store.importFlightLog(payload('NOT-IN-FLEET'));
  expect(duplicate.duplicate).toBe(true);
  expect(duplicate.session).toBeNull();
});

test('reassignment preserves observations and AirData but clears setup from the previous aircraft', async () => {
  const a = await store.createAircraft({ name: 'A', serialNumber: 'SN-A' });
  const b = await store.createAircraft({ name: 'B' });
  const imported = await store.importFlightLog(payload('SN-A'));
  const snapshot = await store.importSnapshot({ aircraftId: a.id, label: 'Synthetic', filename: 'synthetic.txt', rawText: '# dump all\n# Betaflight / TEST 4.5.1 / MSP API: 1.46\nset p_roll = 45\nsave\n' });
  await store.updateSession(imported.session.id, { notes: 'Keep my observations', snapshotId: snapshot.id, confirmedSetup: true });
  await store.updateFlightLog(imported.flightLog.id, { airdataStatus: 'uploaded' });
  await store.updateFlightLog(imported.flightLog.id, { aircraftId: b.id });
  expect(store.getState().sessions[0]).toMatchObject({ id: imported.session.id, aircraftId: b.id, notes: 'Keep my observations', snapshotId: null, confirmedSetup: false });
  const duplicate = await store.importFlightLog(payload('SN-A'));
  expect(duplicate.flightLog.aircraftId).toBe(b.id);
  expect(duplicate.flightLog.airdataStatus).toBe('uploaded');
});

test('remembering a conflicting serial or assigning a missing aircraft is atomic', async () => {
  const a = await store.createAircraft({ name: 'A', serialNumber: 'SN-A' });
  const b = await store.createAircraft({ name: 'B' });
  const imported = await store.importFlightLog(payload('SN-A'));
  const before = store.getState();
  await expect(store.updateFlightLog(imported.flightLog.id, { aircraftId: b.id, rememberAircraft: true })).rejects.toThrow(/serial/i);
  await expect(store.updateFlightLog(imported.flightLog.id, { aircraftId: 'missing' })).rejects.toThrow();
  expect(store.getState()).toEqual(before);
  expect(imported.flightLog.aircraftId).toBe(a.id);
});


test('explicit batch matching attaches older inbox files after adding aircraft without moving assigned flights', async () => {
  const first = await store.importFlightLog(payload('LATER'));
  const second = await store.importFlightLog(payload('LATER', { startTime: '2026-10-14T13:00:00Z' }));
  await store.importFlightLog(payload('UNKNOWN'));
  const aircraft = await store.createAircraft({ name: 'Later installed', serialNumber: 'LATER' });
  expect(await store.matchUnassignedFlightLogs()).toEqual({ matched: 2, unassigned: 1 });
  expect(store.getFlightLog(first.flightLog.id).aircraftId).toBe(aircraft.id);
  expect(store.getFlightLog(second.flightLog.id).aircraftId).toBe(aircraft.id);
  expect(store.getState().sessions).toHaveLength(2);
  expect(await store.matchUnassignedFlightLogs()).toEqual({ matched: 0, unassigned: 1 });
  expect(store.getState().sessions).toHaveLength(2);
});

test('batch rematching uses the documented TXT prefix after adding the full aircraft serial', async () => {
  decoderFormat = 'dji-txt';
  const short = '1581F12345678ABC';
  const imported = await store.importFlightLog(payload(short));
  expect(imported.flightLog.aircraftId).toBeNull();
  const aircraft = await store.createAircraft({ name: 'Added later', serialNumber: short + 'DEFG' });
  expect(await store.matchUnassignedFlightLogs()).toEqual({ matched: 1, unassigned: 0 });
  expect(store.getFlightLog(imported.flightLog.id).aircraftId).toBe(aircraft.id);
});
