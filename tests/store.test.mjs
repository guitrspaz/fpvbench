import { beforeEach, afterEach, test, expect } from '@jest/globals';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.mjs';

let dir, store, aircraft;
const rawText = '# dump all\n# Betaflight / TEST 4.5.1 / MSP API: 1.46\nset test = 1\nsave\n';
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'fpvbench-test-')); store = await createStore(dir); aircraft = await store.createAircraft({ name: 'Test quad' }); });
afterEach(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });

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
  const restarted = await createStore(dir);
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
  const restarted = await createStore(dir);
  expect(restarted.getState().aircraft).toHaveLength(13);
  await restarted.close();
});
test.each(['{bad', '{"version":99,"aircraft":[],"snapshots":[],"sessions":[]}', '{"version":1,"aircraft":[{}],"snapshots":[],"sessions":[]}'])('corruption is rejected without replacing file', async content => {
  await writeFile(join(dir, 'workspace.json'), content);
  await store.close();
  await expect(createStore(dir)).rejects.toThrow(/workspace/i);
  expect(await readFile(join(dir, 'workspace.json'), 'utf8')).toBe(content);
});

test('single owner refused, stale owner recovered, closed store rejects writes', async () => {
  await expect(createStore(dir)).rejects.toThrow(/already open/i);
  await store.close();
  await expect(store.createAircraft({ name: 'Too late' })).rejects.toThrow(/closed/i);
  await writeFile(join(dir, '.workspace.lock'), JSON.stringify({ pid: 2147483647, token: 'synthetic-dead-owner' }));
  const recovered = await createStore(dir);
  expect(recovered.getState().aircraft).toHaveLength(1);
  await recovered.close();
});
