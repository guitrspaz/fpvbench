import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server.mjs';
import { decodedDjiFixture, syntheticDjiBinary } from '../tests/helpers/dji-fixtures.mjs';

// Explicit local operational proof: real worker, SQLite and HTTP, disposable synthetic data.
const dataDir = await mkdtemp(join(tmpdir(), 'fpvbench-import-proof-'));
let server;
async function start() {
  server = await createServer({ dataDir });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function stop() {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  server = null;
}
try {
  let base = await start();
  const post = async (path, input) => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    assert.equal(response.status, 201);
    return response.json();
  };
  const aircraft = await post('/api/aircraft', { name: 'Synthetic operational proof' });
  const inputs = [
    ['synthetic.json', Buffer.from(JSON.stringify(decodedDjiFixture())), 'decoded'],
    ['synthetic.txt', Buffer.from(syntheticDjiBinary(13)), 'summary-only'],
  ];
  for (const [filename, original, status] of inputs) {
    const result = await post('/api/flight-logs', { aircraftId: aircraft.id, filename, sourceDevice: 'Synthetic fixture', contentBase64: original.toString('base64') });
    assert.equal(result.flightLog.status, status);
    assert.equal(result.session.flightLogId, result.flightLog.id);
    assert.equal(result.session.confirmedSetup, false);
    const downloaded = await fetch(`${base}/api/flight-logs/${result.flightLog.id}/raw`);
    assert.equal(downloaded.status, 200);
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), original);
    const frames = await (await fetch(`${base}/api/flight-logs/${result.flightLog.id}/frames`)).json();
    assert.equal(frames.total, result.flightLog.frameCount);
    assert.equal(frames.frames.length, result.flightLog.frameCount);
  }
  const invalid = await fetch(base + '/api/flight-logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aircraftId: aircraft.id, filename: 'invalid.txt', contentBase64: Buffer.from('not a DJI record').toString('base64') }) });
  assert.equal(invalid.status, 422);
  await stop();
  base = await start();
  const state = await (await fetch(base + '/api/state')).json();
  assert.equal(state.storage, 'sqlite');
  assert.equal(state.flightLogs.length, 2);
  assert.equal(state.sessions.length, 2);
  console.log('Import operational proof passed: real HTTP, workers/WASM, exact originals, SQLite restart, and rejected malformed input.');
} finally {
  await stop();
  await rm(dataDir, { recursive: true, force: true });
}
