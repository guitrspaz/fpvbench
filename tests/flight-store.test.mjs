import { beforeEach, afterEach, test, expect } from '@jest/globals';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore, decodeOriginalBase64, MAX_FLIGHT_BYTES } from '../src/store.mjs';
import { createMemoryRepository } from './helpers/memory-repository.mjs';

let directory, store, aircraft, repository;
const bytes = Buffer.from('synthetic DJI evidence');
const summary = { startTime: '2026-10-14T10:00:00Z', durationSeconds: 120, distanceMeters: 100, maxHeightMeters: 20, maxHorizontalSpeedMps: 5, aircraftName: 'Test quad', aircraftModel: 'Synthetic', location: 'Test location', startCoordinate: { latitude: 1, longitude: 2 } };
const frames = [{ timestamp: null, elapsedSeconds: 0, latitude: 1, longitude: 2, altitudeMeters: 3, batteryPercent: 100, horizontalSpeedMps: 0 }];
const decodeFlight = async () => ({ format: 'dji-json', logVersion: 12, status: 'decoded', summary, frames, warnings: [] });
const input = () => ({ aircraftId: aircraft.id, filename: '../../flight.json', sourceDevice: 'Test remote', contentBase64: bytes.toString('base64') });
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'fpvbench-flight-store-'));
  repository = createMemoryRepository();
  store = await createStore(directory, { repositoryFactory: () => repository, decodeFlight });
  aircraft = await store.createAircraft({ name: 'Test quad' });
});
afterEach(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });

test('imports original bytes, derived session and paginated telemetry; backups are complete', async () => {
  const result = await store.importFlightLog(input());
  expect(result.duplicate).toBe(false);
  expect(result.session).toMatchObject({ aircraftId: aircraft.id, snapshotId: null, flightLogId: result.flightLog.id, durationMinutes: 2, notes: '', confirmedSetup: false });
  expect(await store.getFlightLogRaw(result.flightLog.id)).toEqual(bytes);
  expect(await store.getFlightLogFrames(result.flightLog.id, 0, 100)).toMatchObject({ frames, total: 1 });
  const backup = await store.exportWorkspace();
  expect(backup).toMatchObject({ version: 2, originals: [{ flightLogId: result.flightLog.id, contentBase64: bytes.toString('base64') }], telemetry: [{ flightLogId: result.flightLog.id, frames }] });
  expect(store.getState()).toMatchObject({ storage: 'sqlite', flightLogs: [result.flightLog] });
});
test('dedupe survives rename and preserves editable notes; cross-aircraft duplicates rejected', async () => {
  const first = await store.importFlightLog(input());
  await store.updateSession(first.session.id, { notes: 'Manual notes', outcome: 'better', confirmedSetup: true });
  const duplicate = await store.importFlightLog({ ...input(), filename: 'renamed.json' });
  expect(duplicate.duplicate).toBe(true);
  expect(duplicate.session.notes).toBe('Manual notes');
  const other = await store.createAircraft({ name: 'Other' });
  await expect(store.importFlightLog({ ...input(), aircraftId: other.id })).rejects.toMatchObject({ status: 409 });
  await expect(store.createSession({ aircraftId: aircraft.id, flightLogId: first.flightLog.id, title: 'Duplicate', flownAt: summary.startTime })).rejects.toMatchObject({ status: 409 });
  await expect(store.updateSession(first.session.id, { aircraftId: other.id })).rejects.toThrow(/same aircraft/i);
});
test('missing start time retains log without inventing a flight time', async () => {
  await store.close();
  store = await createStore(directory, { repositoryFactory: () => repository, decodeFlight: async () => ({ ...await decodeFlight(), summary: { ...summary, startTime: null } }) });
  const result = await store.importFlightLog(input());
  expect(result.session).toBeNull();
  expect(result.flightLog.warnings.join(' ')).toMatch(/start time/i);
});
test('invalid base64, unsupported metadata and frame pagination rejected', async () => {
  await expect(store.importFlightLog({ ...input(), contentBase64: 'not base64!' })).rejects.toMatchObject({ status: 400 });
  await expect(store.importFlightLog({ ...input(), contentBase64: '' })).rejects.toThrow();
  const result = await store.importFlightLog(input());
  await expect(store.getFlightLogFrames(result.flightLog.id, -1, 100)).rejects.toThrow();
  await expect(store.getFlightLogFrames(result.flightLog.id, 0, 1001)).rejects.toThrow();
});
test('catalog failure removes only the newly written original and preserves committed state', async () => {
  const save = repository.save.bind(repository);
  repository.save = async () => { throw new Error('Synthetic failed commit'); };
  await expect(store.importFlightLog(input())).rejects.toThrow(/Synthetic/);
  expect(store.getState().flightLogs).toEqual([]);
  expect(await readdir(join(directory, 'imports'))).toEqual([]);
  repository.save = save;
  const result = await store.importFlightLog(input());
  expect(await readFile(join(directory, 'imports', `${result.flightLog.sha256}.bin`))).toEqual(bytes);
});

test('base64 accepts the maximum binary size without regex stack growth and rejects oversize', () => {
  const maximum = Buffer.alloc(MAX_FLIGHT_BYTES, 1);
  expect(decodeOriginalBase64(maximum.toString('base64')).equals(maximum)).toBe(true);
  expect(() => decodeOriginalBase64(Buffer.alloc(MAX_FLIGHT_BYTES + 1).toString('base64'))).toThrow(/25 MiB/);
  expect(() => decodeOriginalBase64('YQ=A')).toThrow(/base64/);
});

test('manual AirData status survives dedupe, complete export and reopening without changing imported evidence', async () => {
  const imported = await store.importFlightLog(input());
  expect(imported.flightLog.airdataStatus).toBe('unknown');
  const updated = await store.updateFlightLog(imported.flightLog.id, { airdataStatus: 'uploaded' });
  const { airdataStatus: _oldStatus, ...before } = imported.flightLog;
  const { airdataStatus: _newStatus, ...after } = updated;
  expect(after).toEqual(before);
  await expect(store.updateFlightLog(updated.id, { airdataStatus: 'guessed' })).rejects.toThrow(/AirData/);
  await expect(store.updateFlightLog(updated.id, { summary: {} })).rejects.toThrow(/Unsupported field/);
  const duplicate = await store.importFlightLog({ ...input(), filename: 'renamed-again.json' });
  expect(duplicate.flightLog.airdataStatus).toBe('uploaded');
  expect((await store.exportWorkspace()).flightLogs[0].airdataStatus).toBe('uploaded');
  await store.close();
  store = await createStore(directory, { repositoryFactory: () => repository, decodeFlight });
  expect(store.getFlightLog(updated.id).airdataStatus).toBe('uploaded');
  expect((await store.updateFlightLog(updated.id, { airdataStatus: 'not-uploaded' })).airdataStatus).toBe('not-uploaded');
});

test('older v2 flight-log backups default missing manual AirData status to unknown', async () => {
  await store.importFlightLog(input());
  const backup = await store.exportWorkspace();
  delete backup.flightLogs[0].airdataStatus;
  const { validateCompleteBackup } = await import('../src/restore.mjs');
  expect(validateCompleteBackup(backup).catalog.flightLogs[0].airdataStatus).toBe('unknown');
  expect(backup.flightLogs[0].airdataStatus).toBeUndefined();
});
