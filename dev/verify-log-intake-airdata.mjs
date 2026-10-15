/** Explicit disposable SQLite operational proof. AirData HTTP is fake; no credentials or flights leave the computer. */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.mjs';
import { createAirdataService } from '../src/airdata.mjs';
import { restoreBackup, validateCompleteBackup } from '../src/restore.mjs';

const dir = await mkdtemp(join(tmpdir(), 'fpvbench-log-operational-'));
const restored = await mkdtemp(join(tmpdir(), 'fpvbench-log-restored-'));
let store, airdata, other;
let calls = 0;
const fetchImpl = async url => {
  calls++;
  return new Response(JSON.stringify(url.includes('flight_upload_auth') ? { status: 'success' } : url.includes('get_upload_destination') ? { upload_url: 'https://api.airdata.com/flight_upload' } : url.includes('/flight_job/') ? { data: { status: 'Success' } } : { status: 'success', job_id: 'job_SYNTHETIC_PROOF' }), { status: 200 });
};
try {
  store = await createStore(dir);
  const aircraft = await store.createAircraft({ name: 'Synthetic proof quad' });
  await store.createSession({ aircraftId: aircraft.id, title: 'Keep these observations', flownAt: '2026-10-14T12:00:00Z', notes: 'Synthetic preserved notes' });
  const bytes = Buffer.concat([Buffer.from([0x55,0x4c,0x6f,0x67,1,0x12,0x35,1]), Buffer.alloc(8)]);
  const input = { aircraftId: aircraft.id, filename: 'synthetic.ulg', contentBase64: bytes.toString('base64') };
  const { flightLog } = await store.importLog(input);
  const before = await store.exportWorkspace();
  airdata = await createAirdataService(dir, { store, fetchImpl });
  await airdata.updateSettings({ appKey: 'TESTKEY1', userToken: 'HDTEST0001' });
  await airdata.checkConnection(); await airdata.sendLogs([flightLog.id]); await airdata.refreshJobs([flightLog.id]);
  const backup = await store.exportWorkspace(); validateCompleteBackup(backup);
  assert.deepEqual(backup.aircraft, before.aircraft); assert.deepEqual(backup.sessions, before.sessions);
  assert.deepEqual(backup.originals, before.originals); assert.deepEqual(backup.telemetry, before.telemetry);
  assert.equal(backup.flightLogs[0].airdataTransfer.status, 'success');
  assert.ok(!JSON.stringify(backup).includes('HDTEST0001'));
  await airdata.close(); await store.close(); store = await createStore(dir);
  assert.deepEqual(await store.exportWorkspace(), backup);
  airdata = await createAirdataService(dir, { store, fetchImpl });
  assert.equal((await airdata.getSettings()).available, true);
  const previous = calls; assert.equal((await airdata.sendLogs([flightLog.id])).results[0].skipped, true); assert.equal(calls, previous);
  assert.equal((await store.importLog(input)).duplicate, true);
  await restoreBackup(restored, backup); other = await createStore(restored);
  assert.deepEqual(await other.exportWorkspace(), backup);
  console.log('Archive and AirData proof passed: SQLite persistence, original bytes, notes, confirmed receipt, private credentials, restart dedupe and complete restore.');
} finally { await airdata?.close(); await other?.close(); await store?.close(); await rm(dir, { recursive: true, force: true }); await rm(restored, { recursive: true, force: true }); }
