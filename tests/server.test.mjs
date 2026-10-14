import { beforeEach, afterEach, test, expect } from '@jest/globals';
import { request as httpRequest } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server.mjs';
import { createStore } from '../src/store.mjs';

let dir, server, base;
const rawText = '# diff all\n# Betaflight / TEST 4.5.1 / MSP API: 1.46\nset test = 1\nsave\n';
const request = (path, method = 'GET', body, headers = {}) => fetch(base + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'fpvbench-api-')); server = await createServer({ dataDir: dir }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
afterEach(async () => { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });

test('aircraft/import/baseline/session/edit/compare/download journey', async () => {
  const made = await request('/api/aircraft', 'POST', { name: 'Quad' });
  expect(made.status).toBe(201);
  const aircraft = await made.json();
  const madeSnapshot = await request('/api/snapshots', 'POST', { aircraftId: aircraft.id, label: 'Setup', filename: 'test.txt', rawText });
  expect(madeSnapshot.status).toBe(201);
  const snapshot = await madeSnapshot.json();
  expect((await request(`/api/aircraft/${aircraft.id}`, 'PATCH', { baselineSnapshotId: snapshot.id })).status).toBe(200);
  const session = await (await request('/api/sessions', 'POST', { aircraftId: aircraft.id, snapshotId: snapshot.id, title: 'Test', flownAt: '2026-10-13T12:00:00Z' })).json();
  expect((await request(`/api/sessions/${session.id}`, 'PATCH', { outcome: 'better' })).status).toBe(200);
  const raw = await request(`/api/snapshots/${snapshot.id}/raw`);
  expect(await raw.text()).toBe(rawText);
  expect(raw.headers.get('content-disposition')).toMatch(/attachment/);
  expect((await (await request(`/api/compare?from=${snapshot.id}&to=${snapshot.id}`)).json()).counts.unchanged).toBe(1);
  expect((await (await request('/api/export')).json()).version).toBe(1);
  expect((await (await request('/api/state')).json()).sessions[0].outcome).toBe('better');
});
test('validates content types, body, absent records, host, origin and traversal', async () => {
  expect((await request('/api/aircraft', 'POST', {}, { 'Content-Type': 'text/plain' })).status).toBe(415);
  expect((await request('/api/aircraft', 'POST', {})).status).toBe(400);
  expect((await request('/api/snapshots/missing')).status).toBe(404);
  // Fetch replaces Host; exercise the actual HTTP header using node:http.
  const hostStatus = await new Promise((resolve, reject) => {
    const req = httpRequest(base + '/api/state', { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); });
    req.on('error', reject); req.end();
  });
  expect(hostStatus).toBe(403);
  expect((await request('/api/state', 'GET', undefined, { Origin: 'https://evil.example' })).status).toBe(403);
  expect((await request('/api/state', 'GET', undefined, { Origin: base })).status).toBe(200);
  expect((await request('/%2e%2e%2fpackage.json')).status).toBe(403);
  expect((await request('/api/aircraft', 'POST', { name: 'q', notes: 'x'.repeat(2 * 1024 * 1024) })).status).toBe(413);
  const state = await request('/api/state');
  expect(state.headers.get('content-security-policy')).toMatch(/connect-src 'self'/);
});

test('examples are served and closing a server releases its workspace ownership', async () => {
  const example = await request('/examples/baseline-dump.txt');
  expect(example.status).toBe(200);
  expect(await example.text()).toMatch(/Betaflight/);
  await new Promise(resolve => server.close(resolve));
  const reopened = await createStore(dir);
  expect(reopened.getState().aircraft).toEqual([]);
  await reopened.close();
});

test('listen failure releases ownership and can be closed safely', async () => {
  const otherDir = await mkdtemp(join(tmpdir(), 'fpvbench-listen-'));
  const failed = await createServer({ dataDir: otherDir });
  try {
    const failure = new Promise(resolve => failed.once('error', resolve));
    failed.listen(server.address().port, '127.0.0.1');
    expect((await failure).code).toBe('EADDRINUSE');
    await new Promise(resolve => failed.close(resolve));
    const reopened = await createStore(otherDir);
    await reopened.close();
  } finally { await rm(otherDir, { recursive: true, force: true }); }
});
