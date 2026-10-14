import { beforeEach, afterEach, test, expect } from '@jest/globals';
import { request as httpRequest } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server.mjs';
import { createStore } from '../src/store.mjs';
import { createMemoryRepository } from './helpers/memory-repository.mjs';
import { AppError } from '../src/errors.mjs';

let dir, server, base;
const rawText = '# diff all\n# Betaflight / TEST 4.5.1 / MSP API: 1.46\nset test = 1\nsave\n';
const request = (path, method = 'GET', body, headers = {}) => fetch(base + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const frame = { timestamp: '2026-10-14T12:00:00.000Z', elapsedSeconds: 0, latitude: null, longitude: null, altitudeMeters: 1, batteryPercent: 95, horizontalSpeedMps: 0 };
async function decodeFlight(bytes, { filename }) {
  if (bytes.toString().includes('unsupported')) throw new AppError('Unsupported synthetic flight format.', 422);
  const summaryOnly = filename.includes('summary');
  return { format: 'dji-json', logVersion: summaryOnly ? 13 : 12, status: summaryOnly ? 'summary-only' : 'decoded',
    summary: { startTime: filename.includes('undated') ? null : '2026-10-14T12:00:00.000Z', durationSeconds: 60, distanceMeters: null, maxHeightMeters: 10, maxHorizontalSpeedMps: null, aircraftName: 'Synthetic quad', aircraftModel: null, location: null, startCoordinate: null },
    frames: summaryOnly ? [] : [frame, { ...frame, elapsedSeconds: 1 }], warnings: summaryOnly ? ['Encrypted telemetry unavailable.'] : [] };
}
const storeFactory = dataDir => createStore(dataDir, { repositoryFactory: createMemoryRepository, decodeFlight });
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'fpvbench-api-')); server = await createServer({ dataDir: dir, storeFactory }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
afterEach(async () => { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });

test('aircraft identifiers are editable through the API and retained in state and export', async () => {
  const created = await request('/api/aircraft', 'POST', { name: 'Identifier quad', registrationId: 'SYNTHETIC-REG', serialNumber: 'Synthetic-SN' });
  expect(created.status).toBe(201);
  const aircraft = await created.json();
  const updated = await request(`/api/aircraft/${aircraft.id}`, 'PATCH', { registrationId: 'SYNTHETIC-REG-2' });
  expect(updated.status).toBe(200);
  for (const path of ['/api/state', '/api/export']) {
    const data = await (await request(path)).json();
    expect(data.aircraft[0]).toMatchObject({ registrationId: 'SYNTHETIC-REG-2', serialNumber: 'Synthetic-SN' });
  }
});

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
  expect((await (await request('/api/export')).json()).version).toBe(2);
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
  const reopened = await storeFactory(dir);
  expect(reopened.getState().aircraft).toEqual([]);
  await reopened.close();
});

test('listen failure releases ownership and can be closed safely', async () => {
  const otherDir = await mkdtemp(join(tmpdir(), 'fpvbench-listen-'));
  const failed = await createServer({ dataDir: otherDir, storeFactory });
  try {
    const failure = new Promise(resolve => failed.once('error', resolve));
    failed.listen(server.address().port, '127.0.0.1');
    expect((await failure).code).toBe('EADDRINUSE');
    await new Promise(resolve => failed.close(resolve));
    const reopened = await storeFactory(otherDir);
    await reopened.close();
  } finally { await rm(otherDir, { recursive: true, force: true }); }
});

test('DJI import, dedupe, frames, exact original, session edit and complete export contract', async () => {
  const aircraft = await (await request('/api/aircraft', 'POST', { name: 'DJI quad' })).json();
  const original = Buffer.from('synthetic flight\0\r\nbytes');
  const payload = { aircraftId: aircraft.id, filename: 'flight.json', sourceDevice: 'Synthetic controller', contentBase64: original.toString('base64') };
  const made = await request('/api/flight-logs', 'POST', payload);
  expect(made.status).toBe(201);
  const result = await made.json();
  expect(result.duplicate).toBe(false);
  expect(result.session.flightLogId).toBe(result.flightLog.id);
  expect(result.session.snapshotId).toBeNull();
  expect(result.session.confirmedSetup).toBe(false);
  expect(result.flightLog.frameCount).toBe(2);
  const id = result.flightLog.id;
  expect((await (await request(`/api/flight-logs/${id}`)).json()).filename).toBe('flight.json');
  const page = await (await request(`/api/flight-logs/${id}/frames?offset=1&limit=1`)).json();
  expect(page).toMatchObject({ total: 2, offset: 1, limit: 1 });
  expect(page.frames).toEqual([{ ...frame, elapsedSeconds: 1 }]);
  const raw = await request(`/api/flight-logs/${id}/raw`);
  expect(raw.headers.get('content-disposition')).toMatch(/attachment/);
  expect(Buffer.from(await raw.arrayBuffer())).toEqual(original);
  const edited = await request(`/api/sessions/${result.session.id}`, 'PATCH', { notes: 'Manual observation', outcome: 'better', flightLogId: id });
  expect(edited.status).toBe(200);
  expect((await edited.json()).flightLogId).toBe(id);
  const duplicateResponse = await request('/api/flight-logs', 'POST', { ...payload, filename: 'renamed.json' });
  expect(duplicateResponse.status).toBe(200);
  const duplicate = await duplicateResponse.json();
  expect(duplicate.duplicate).toBe(true);
  expect(duplicate.session.notes).toBe('Manual observation');
  const state = await (await request('/api/state')).json();
  expect(state.storage).toBe('sqlite');
  expect(state.flightLogs).toHaveLength(1);
  expect(state.flightLogs[0]).not.toHaveProperty('frames');
  const exported = await (await request('/api/export')).json();
  expect(exported.version).toBe(2);
  expect(exported.flightLogs).toHaveLength(1);
  expect(exported.originals).toEqual([{ flightLogId: id, contentBase64: original.toString('base64') }]);
  expect(exported.telemetry).toEqual([{ flightLogId: id, frames: [frame, { ...frame, elapsedSeconds: 1 }] }]);
});

test('flight routes validate input, pagination and cross-aircraft relationships', async () => {
  const first = await (await request('/api/aircraft', 'POST', { name: 'First' })).json();
  const second = await (await request('/api/aircraft', 'POST', { name: 'Second' })).json();
  const payload = { aircraftId: first.id, filename: 'summary.json', contentBase64: Buffer.from('summary flight').toString('base64') };
  const result = await (await request('/api/flight-logs', 'POST', payload)).json();
  expect(result.flightLog.status).toBe('summary-only');
  const id = result.flightLog.id;
  expect((await (await request(`/api/flight-logs/${id}/frames`)).json()).frames).toEqual([]);
  expect((await request('/api/flight-logs', 'POST', { ...payload, aircraftId: second.id })).status).toBe(409);
  expect((await request('/api/sessions', 'POST', { aircraftId: second.id, title: 'Mismatch', flownAt: '2026-10-14T12:00:00Z', flightLogId: id })).status).toBe(400);
  expect((await request('/api/flight-logs', 'POST', { ...payload, contentBase64: 'invalid!' })).status).toBe(400);
  expect((await request('/api/flight-logs', 'POST', { ...payload, contentBase64: Buffer.from('unsupported').toString('base64') })).status).toBe(422);
  for (const query of ['offset=-1', 'offset=1.2', 'limit=0', 'limit=1001', 'limit=abc', 'offset=9007199254740992'])
    expect((await request(`/api/flight-logs/${id}/frames?${query}`)).status).toBe(400);
  for (const suffix of ['', '/raw', '/frames']) expect((await request(`/api/flight-logs/missing${suffix}`)).status).toBe(404);
  expect((await request('/api/flight-logs', 'POST', payload, { 'Content-Type': 'text/plain' })).status).toBe(415);
  const limited = await new Promise((resolve, reject) => {
    const req = httpRequest(base + '/api/flight-logs', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': 36 * 1024 * 1024 + 1 } }, response => { response.resume(); resolve(response.statusCode); });
    req.on('error', reject); req.end();
  });
  expect(limited).toBe(413);
});

test('retains an undated imported original without inventing a flight session', async () => {
  const aircraft = await (await request('/api/aircraft', 'POST', { name: 'Quad' })).json();
  const made = await request('/api/flight-logs', 'POST', { aircraftId: aircraft.id, filename: 'undated.json', contentBase64: Buffer.from('synthetic undated flight').toString('base64') });
  expect(made.status).toBe(201);
  const result = await made.json();
  expect(result.session).toBeNull();
  expect(result.flightLog.summary.startTime).toBeNull();
  expect(result.flightLog.warnings.join(' ')).toMatch(/Start time is unavailable/);
  expect((await (await request('/api/state')).json()).sessions).toEqual([]);
});

test('manually tracks AirData status without changing original flight details or session notes', async () => {
  const aircraft = await (await request('/api/aircraft', 'POST', { name: 'Quad' })).json();
  const payload = { aircraftId: aircraft.id, filename: 'flight.json', contentBase64: Buffer.from('synthetic status flight').toString('base64') };
  const result = await (await request('/api/flight-logs', 'POST', payload)).json();
  expect(result.flightLog.airdataStatus).toBe('unknown');
  const id = result.flightLog.id;
  await request(`/api/sessions/${result.session.id}`, 'PATCH', { notes: 'My observations' });
  for (const status of ['not-uploaded', 'uploaded', 'unknown']) {
    const response = await request(`/api/flight-logs/${id}`, 'PATCH', { airdataStatus: status });
    expect(response.status).toBe(200);
    const changed = await response.json();
    expect(changed).toEqual({ ...result.flightLog, airdataStatus: status });
  }
  expect((await request(`/api/flight-logs/${id}`, 'PATCH', { airdataStatus: 'guessed' })).status).toBe(400);
  expect((await request(`/api/flight-logs/${id}`, 'PATCH', { summary: { durationSeconds: 0 } })).status).toBe(400);
  expect((await request('/api/flight-logs/missing', 'PATCH', { airdataStatus: 'uploaded' })).status).toBe(404);
  await request(`/api/flight-logs/${id}`, 'PATCH', { airdataStatus: 'uploaded' });
  const state = await (await request('/api/state')).json();
  expect(state.flightLogs[0].airdataStatus).toBe('uploaded');
  expect(state.sessions[0].notes).toBe('My observations');
  const duplicate = await (await request('/api/flight-logs', 'POST', payload)).json();
  expect(duplicate.flightLog.airdataStatus).toBe('uploaded');
  const exported = await (await request('/api/export')).json();
  expect(exported.flightLogs[0].airdataStatus).toBe('uploaded');
  expect(exported.originals[0].contentBase64).toBe(payload.contentBase64);
});
