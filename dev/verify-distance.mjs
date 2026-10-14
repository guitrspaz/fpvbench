/** Explicit disposable SQLite/decoder operational proof, separate from automated database-free tests. */
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createStore } from '../src/store.mjs';
import { createSqliteRepository } from '../src/sqlite-repository.mjs';
import { decodeDjiFlight } from '../src/dji-import.mjs';
import { validateCompleteBackup } from '../src/restore.mjs';
import { syntheticDjiBinary } from '../tests/helpers/dji-fixtures.mjs';

const dir = await mkdtemp(join(tmpdir(), 'fpvbench-distance-proof-'));
let store;
try {
  const bytes = syntheticDjiBinary(14);
  bytes[107 + 271] = 137;
  bytes.writeFloatLE(1.25, 107 + 115);
  const decoded = await decodeDjiFlight(bytes, { filename: 'synthetic.txt' });
  assert.equal(decoded.summary.aircraftModel, 'DJI product type 137');
  assert.equal(decoded.summary.distanceMeters, 1250);
  const legacy = structuredClone(decoded);
  legacy.summary.distanceMeters = 1.25;
  for (const key of ['distanceSourceValue', 'distanceSourceUnit', 'distanceUnitBasis']) delete legacy.summary[key];
  store = await createStore(dir, { decodeFlight: async () => legacy });
  const aircraft = await store.createAircraft({ name: 'Synthetic proof aircraft' });
  const input = { aircraftId: aircraft.id, filename: 'synthetic.txt', contentBase64: bytes.toString('base64') };
  const { flightLog } = await store.importFlightLog(input);
  await store.updateFlightLog(flightLog.id, { airdataStatus: 'uploaded' });
  const before = await store.exportWorkspace();
  await store.close();
  store = await createStore(dir);
  const after = await store.exportWorkspace();
  const expected = structuredClone(before); expected.flightLogs[0].summary = decoded.summary;
  assert.deepEqual(after, expected);
  assert.equal((await store.importFlightLog(input)).duplicate, true);
  const backups = (await readdir(dir)).filter(name => name.startsWith('workspace-before-distance-v046-'));
  assert.equal(backups.length, 1);
  const path = join(dir, backups[0]);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  const db = new DatabaseSync(path, { readOnly: true });
  assert.equal(JSON.parse(db.prepare('SELECT payload FROM flight_logs').get().payload).summary.distanceMeters, 1.25);
  assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok'); db.close();
  await store.close(); store = await createStore(dir);
  assert.deepEqual(await store.exportWorkspace(), expected);
  assert.equal((await readdir(dir)).filter(name => name.startsWith('workspace-before-distance-v046-')).length, 1);
  // Restoring an old complete catalog encounters the same safe, idempotent correction.
  await store.close();
  const repository = await createSqliteRepository(dir);
  repository.save(validateCompleteBackup(before).catalog, repository.load()); await repository.close();
  store = await createStore(dir);
  assert.deepEqual(await store.exportWorkspace(), expected);
  console.log('Distance proof passed: real worker/WASM, exact private SQLite backup, retained originals/history, duplicate import, restart and legacy restore.');
} finally { await store?.close(); await rm(dir, { recursive: true, force: true }); }
