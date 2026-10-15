import { test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from '../src/server.mjs';
import { createStore } from '../src/store.mjs';
import { createMemoryRepository } from './helpers/memory-repository.mjs';
import { createAirdataService } from '../src/airdata.mjs';

let dir, server, base, fetchImpl;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'fpvbench-airdata-api-'));
  fetchImpl = jest.fn(async () => new Response('{"status":"success"}', { status: 200 }));
  server = await createServer({ dataDir: dir, storeFactory: directory => createStore(directory, { repositoryFactory: createMemoryRepository }), airdataFactory: (directory, options) => createAirdataService(directory, { ...options, fetchImpl }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = 'http://127.0.0.1:' + server.address().port;
});
afterEach(async () => { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
const request = (path, body, method = 'POST', extra = {}) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });

test('archive endpoint preserves originals; AirData credentials never enter state or complete exports', async () => {
  const original = Buffer.from('opaque synthetic record');
  const imported = await request('/api/log-imports', { filename: 'synthetic.ridlog', contentBase64: original.toString('base64') });
  expect(imported.status).toBe(201);
  const log = (await imported.json()).flightLog;
  expect(await (await fetch(base + '/api/flight-logs/' + log.id + '/raw')).text()).toBe(original.toString());
  const credentials = { appKey: 'TESTKEY1', userToken: 'HDTEST0001' };
  expect((await request('/api/airdata/settings', credentials, 'PATCH')).status).toBe(200);
  for (const path of ['/api/state','/api/export','/api/airdata/settings']) {
    const text = await (await fetch(base + path)).text();
    for (const value of Object.values(credentials)) expect(text).not.toContain(value);
  }
  expect(fetchImpl).not.toHaveBeenCalled();
  expect((await request('/api/airdata/check', {})).status).toBe(200);
  expect((await request('/api/airdata/send', { ids: [log.id] })).status).toBe(200);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect((await request('/api/airdata/send', { ids: [] })).status).toBe(400);
  expect((await request('/api/airdata/send', { ids: [log.id], force: true })).status).toBe(400);
  expect((await request('/api/airdata/check', {}, 'POST', { Origin: 'https://foreign.example' })).status).toBe(403);
});
