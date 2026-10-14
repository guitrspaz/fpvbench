import { beforeEach, afterEach, test, expect } from '@jest/globals';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.mjs';
import { createMemoryRepository } from './helpers/memory-repository.mjs';
import { validateCompleteBackup } from '../src/restore.mjs';

let dir, store, aircraft, repository;
const openStore = () => createStore(dir, { repositoryFactory: () => repository });
const rawText = '# dump all\n# Betaflight / TEST 4.5.1 / MSP API: 1.46\nset test = 1\nsave\n';
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'fpvbench-test-')); repository = createMemoryRepository(); store = await openStore(); aircraft = await store.createAircraft({ name: 'Test quad' }); });
afterEach(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });

test('aircraft identifiers survive editing, reopening and backup, and can be cleared', async () => {
  const made = await store.createAircraft({ name: 'Identifier quad', kind: 'FPV', registrationId: 'FA-SYNTHETIC', serialNumber: 'sn-Synthetic-001' });
  await store.updateAircraft(made.id, { name: 'Renamed quad', notes: 'Updated' });
  await store.close();
  store = await openStore();
  const saved = store.getState().aircraft.find(item => item.id === made.id);
  expect(saved).toMatchObject({ name: 'Renamed quad', kind: 'FPV', registrationId: 'FA-SYNTHETIC', serialNumber: 'sn-Synthetic-001' });
  const backup = await store.exportWorkspace();
  expect(validateCompleteBackup(backup).catalog.aircraft.find(item => item.id === made.id)).toEqual(saved);
  await store.updateAircraft(made.id, { registrationId: '', serialNumber: '' });
  expect(store.getState().aircraft.find(item => item.id === made.id)).toMatchObject({ registrationId: '', serialNumber: '' });
});

test('older aircraft without identifiers remain readable, editable and valid in backups', async () => {
  const backup = await store.exportWorkspace();
  delete backup.aircraft[0].registrationId;
  delete backup.aircraft[0].serialNumber;
  const { catalog } = validateCompleteBackup(backup);
  await store.close();
  repository.save(catalog);
  store = await openStore();
  expect(store.getState().aircraft[0].id).toBe(aircraft.id);
  await store.updateAircraft(aircraft.id, { name: 'Older quad renamed' });
  await store.updateAircraft(aircraft.id, { registrationId: 'SYNTHETIC', serialNumber: 'Older-Serial' });
  expect(store.getState().aircraft[0]).toMatchObject({ name: 'Older quad renamed', registrationId: 'SYNTHETIC', serialNumber: 'Older-Serial' });
});

test.each(['registrationId', 'serialNumber'])('invalid %s is rejected without changing aircraft', async field => {
  const before = store.getState();
  for (const value of [null, 42, {}, 'x'.repeat(201), 'bad\u0000identifier']) {
    await expect(store.createAircraft({ name: 'Invalid quad', [field]: value })).rejects.toThrow();
    await expect(store.updateAircraft(aircraft.id, { [field]: value })).rejects.toThrow();
    expect(store.getState()).toEqual(before);
  }
});

test('exact raw preservation, summaries, immutability and restart', async () => {
  const data = { aircraftId: aircraft.id, label: 'Baseline', filename: 'test.txt', rawText };
  const first = await store.importSnapshot(data);
  const second = await store.importSnapshot(data);
  expect(second.parsed.warnings.join(' ')).toMatch(/identical/i);
  expect(first.rawText).toBe(rawText);
  first.rawText = 'changed outside';
  expect(store.getSnapshot(first.id).rawText).toBe(rawText);
  await store.updateAircraft(aircraft.id, { baselineSnapshotId: first.id });
  const session = await store.createSession({ aircraftId: aircraft.id, snapshotId: first.id, title: 'Hover', flownAt: '2026-10-13T12:00:00Z', confirmedSetup: true });
  await store.updateSession(session.id, { notes: 'Better', outcome: 'better' });
  await store.close();
  const restarted = await openStore();
  const summary = restarted.getState().snapshots[0];
  expect(summary.rawText).toBeUndefined();
  expect(summary.parsed.settings).toBeUndefined();
  expect(summary.settingCount).toBe(1);
  expect(restarted.getState().sessions[0].outcome).toBe('better');
  await restarted.close();
});
test('relationships, required fields, invalid date/duration and prototype keys', async () => {
  const other = await store.createAircraft({ name: 'Other' });
  const snap = await store.importSnapshot({ aircraftId: other.id, label: 'Other', filename: 'test.txt', rawText });
  await expect(store.updateAircraft(aircraft.id, { baselineSnapshotId: snap.id })).rejects.toThrow();
  await expect(store.createSession({ aircraftId: aircraft.id, snapshotId: snap.id, title: 'Flight', flownAt: '2026-10-13T12:00:00Z' })).rejects.toThrow();
  await expect(store.createAircraft({ name: ' ' })).rejects.toThrow();
  await expect(store.createSession({ aircraftId: aircraft.id, title: 'Flight', flownAt: 'tomorrow' })).rejects.toThrow();
  await expect(store.createSession({ aircraftId: aircraft.id, title: 'Flight', flownAt: '2026-10-13T12:00:00Z', durationMinutes: -1 })).rejects.toThrow();
  await expect(store.createAircraft(JSON.parse('{"name":"Quad","__proto__":{}}'))).rejects.toThrow();
});
test('serializes parallel mutations without losing records', async () => {
  await Promise.all(Array.from({ length: 12 }, (_, index) => store.createAircraft({ name: `Quad ${index}` })));
  await store.close();
  const restarted = await openStore();
  expect(restarted.getState().aircraft).toHaveLength(13);
  await restarted.close();
});
test.each(['{bad', '{"version":99,"aircraft":[],"snapshots":[],"sessions":[]}', '{"version":1,"aircraft":[{}],"snapshots":[],"sessions":[]}'])('corruption is rejected without replacing file', async content => {
  await writeFile(join(dir, 'workspace.json'), content);
  await store.close();
  repository = createMemoryRepository();
  await expect(openStore()).rejects.toThrow(/workspace/i);
  expect(await readFile(join(dir, 'workspace.json'), 'utf8')).toBe(content);
});

test('single owner refused, stale owner recovered, closed store rejects writes', async () => {
  await expect(openStore()).rejects.toThrow(/already open/i);
  await store.close();
  await expect(store.createAircraft({ name: 'Too late' })).rejects.toThrow(/closed/i);
  await writeFile(join(dir, '.workspace.lock'), JSON.stringify({ pid: 2147483647, token: 'synthetic-dead-owner' }));
  const recovered = await openStore();
  expect(recovered.getState().aircraft).toHaveLength(1);
  await recovered.close();
});
