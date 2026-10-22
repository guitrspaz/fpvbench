import { test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createServer } from '../src/server.mjs';
import { createStore } from '../src/store.mjs';
import { createMemoryRepository } from './helpers/memory-repository.mjs';
import { validateCompleteBackup } from '../src/restore.mjs';
import { decodedDjiFixture } from './helpers/dji-fixtures.mjs';

let dir, server, base, airdataFactory, store;
const credentials = JSON.stringify({ version: 1, appKey: 'SYNTHETIC-APP-KEY', userToken: 'SYNTHETIC-USER-TOKEN', verifiedAt: '2026-10-01T00:00:00.000Z' });
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'fpvbench-airdata-api-'));
  await writeFile(join(dir, '.airdata-config.json'), credentials, { mode: 0o600 });
  airdataFactory = jest.fn(() => { throw new Error('Deferred upload service must not be constructed.'); });
  server = await createServer({ dataDir: dir, storeFactory: async directory => {
    store = await createStore(directory, { repositoryFactory: createMemoryRepository }); return store;
  }, airdataFactory });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = 'http://127.0.0.1:' + server.address().port;
});
afterEach(async () => { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
const request = (path, body, method = 'POST', extra = {}) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

test('all AirData routes stay deferred even with old credentials and a supplied factory', async () => {
  for (const [method, path] of [
    ['GET','/api/airdata/settings'], ['PATCH','/api/airdata/settings'],
    ['POST','/api/airdata/check'], ['POST','/api/airdata/send'], ['POST','/api/airdata/refresh'],
    ['POST','/api/airdata'], ['DELETE','/api/airdata/settings'], ['POST','/api/airdata/future-route'],
  ]) {
    const response = await request(path, method === 'GET' ? undefined : {}, method);
    expect(response.status).toBe(410);
    expect((await response.json()).error).toMatch(/integration is deferred/);
  }
  expect(airdataFactory).not.toHaveBeenCalled();
  expect(await readFile(join(dir, '.airdata-config.json'), 'utf8')).toBe(credentials);
  expect((await request('/api/airdata/check', {}, 'POST', { Origin: 'https://foreign.example' })).status).toBe(403);
});

test('local imports, manual marks, assignment, telemetry and complete restore data preserve historical receipts', async () => {
  const original = Buffer.from(JSON.stringify(decodedDjiFixture()));
  const imported = await request('/api/log-imports', { filename: 'synthetic.json', contentBase64: original.toString('base64') });
  expect(imported.status).toBe(201);
  const log = (await imported.json()).flightLog;
  const receipt = { accountId: randomUUID(), attemptId: randomUUID(), jobId: 'job_SYNTHETIC_OLD', status: 'success', startedAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:01:00.000Z', message: 'Historical synthetic result' };
  await store.recordAirdataTransfer(log.id, receipt);
  const aircraft = await (await request('/api/aircraft', { name: 'Synthetic local quad' })).json();
  expect((await request('/api/flight-logs/' + log.id, { aircraftId: aircraft.id, rememberAircraft: false }, 'PATCH')).status).toBe(200);
  const before = await (await fetch(base + '/api/export')).json();
  expect(before.sessions).toHaveLength(1);
  expect(before.telemetry[0].frames.length).toBeGreaterThan(0);
  expect((await request('/api/flight-logs/mark-uploaded', { ids: [log.id] })).status).toBe(200);
  const duplicate = await request('/api/log-imports', { filename: 'renamed.json', contentBase64: original.toString('base64') });
  expect(duplicate.status).toBe(200);
  expect((await duplicate.json()).duplicate).toBe(true);
  const exported = await (await fetch(base + '/api/export')).json();
  const expected = structuredClone(before); expected.flightLogs[0].airdataStatus = 'uploaded';
  expect(exported).toEqual(expected);
  const restored = validateCompleteBackup(exported);
  expect(restored.catalog.flightLogs[0].airdataTransfer).toEqual(receipt);
  expect(restored.decodedOriginals[0].bytes).toEqual(original);
  expect(await (await fetch(base + '/api/flight-logs/' + log.id + '/raw')).arrayBuffer()).toEqual(original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength));
  for (const status of ['not-uploaded', 'unknown']) {
    const response = await request('/api/flight-logs/' + log.id, { airdataStatus: status }, 'PATCH');
    expect((await response.json()).airdataStatus).toBe(status);
  }
  for (const path of ['/api/state','/api/export']) {
    const text = await (await fetch(base + path)).text();
    expect(text).not.toContain('SYNTHETIC-APP-KEY'); expect(text).not.toContain('SYNTHETIC-USER-TOKEN');
  }
  expect(airdataFactory).not.toHaveBeenCalled();
});
