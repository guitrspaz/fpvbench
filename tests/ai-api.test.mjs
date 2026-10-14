import { beforeEach, afterEach, test, expect, jest } from '@jest/globals';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server.mjs';
import { createStore } from '../src/store.mjs';
import { createAiService } from '../src/ai-service.mjs';
import { createMemoryRepository } from './helpers/memory-repository.mjs';

const credential = 'synthetic-api-credential-only';
const explanation = { summary: 'Rates and PID response describe different evidence.', observations: ['Only explicit values are known.'], questions: ['What firmware-specific limits apply?'], limitations: ['Hardware evidence is incomplete.'] };
const reply = () => new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 }, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(explanation) }] }] }), { status: 200 });
const rawText = '# dump all\n# Betaflight / TEST 4.5.1 / MSP API: 1.46\nset p_roll = 45\nset roll_rc_rate = 100\nsave\n';
let directory, server, base, fetchImpl;
const storeFactory = dataDir => createStore(dataDir, { repositoryFactory: createMemoryRepository });
const request = (path, body, method = body === undefined ? 'GET' : 'POST', headers = {}) => fetch(base + path, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
async function start(options = {}) {
  server = await createServer({ dataDir: directory, storeFactory, aiFactory: dir => createAiService(dir, { fetchImpl }), ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}
async function seed() {
  const aircraft = await (await request('/api/aircraft', { name: 'Synthetic quad', notes: 'PRIVATE NOTES' })).json();
  const snapshot = await (await request('/api/snapshots', { aircraftId: aircraft.id, label: 'Private label', filename: 'private-export.txt', rawText, notes: 'PRIVATE SNAPSHOT NOTES' })).json();
  return { aircraft, snapshot };
}
async function enable(extra = {}) {
  expect((await request('/api/ai/settings', { apiKey: credential, enabled: true, monthlyBudgetUSD: 1, ...extra }, 'PATCH')).status).toBe(200);
  expect((await request('/api/ai/check', {})).status).toBe(200);
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'fpvbench-ai-api-'));
  fetchImpl = jest.fn(async () => reply());
  await start();
});
afterEach(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });

test('settings remain readable while offline; server rejects bypass attempts without making calls', async () => {
  const { aircraft, snapshot } = await seed();
  const settings = await (await request('/api/ai/settings')).json();
  expect(settings).toMatchObject({ enabled: false, keyConfigured: false, automaticReview: false, monthlyBudgetUSD: 0, available: false });
  for (const response of [await request('/api/ai/review', { snapshotId: snapshot.id }), await request(`/api/ai/review/${snapshot.id}`), await request('/api/ai/recap', { aircraftId: aircraft.id })])
    expect([403, 409]).toContain(response.status);
  expect((await request('/api/ai/check', {})).status).toBe(403);
  expect(fetchImpl).not.toHaveBeenCalled();
  const saved = await (await request('/api/ai/settings', { apiKey: credential, enabled: true }, 'PATCH')).json();
  expect(saved.keyConfigured).toBe(true);
  expect(saved.available).toBe(false);
  expect(JSON.stringify(saved)).not.toContain(credential);
  expect(saved).not.toHaveProperty('apiKey');
  expect(fetchImpl).not.toHaveBeenCalled();
  expect((await request('/api/ai/review', { snapshotId: snapshot.id })).status).toBe(409);
});

test('explicit paid check enables grounded setup reports and cache reads do not charge', async () => {
  const { snapshot } = await seed();
  await enable();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const question = 'How do these rates affect stick response?';
  const made = await request('/api/ai/review', { snapshotId: snapshot.id, question });
  expect(made.status).toBe(200);
  const review = await made.json();
  expect(review.result).toEqual(explanation);
  expect(review.context.snapshotId).toBe(snapshot.id);
  expect(review.sources[0].url).toMatch(/^https:\/\/betaflight.com\//);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  const cached = await (await request(`/api/ai/review/${snapshot.id}`)).json();
  expect(cached.cached).toBe(true);
  expect(cached.fingerprint).toBe(review.fingerprint);
  expect(cached.context.question).toBe(question);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  await request('/api/ai/review', { snapshotId: snapshot.id, question });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  const body = fetchImpl.mock.calls[1][1].body;
  for (const privateText of [credential, 'PRIVATE NOTES', 'PRIVATE SNAPSHOT NOTES', 'private-export.txt', rawText]) expect(body).not.toContain(privateText);
  for (const path of ['/api/ai/settings', '/api/state', '/api/export', `/api/ai/review/${snapshot.id}`]) expect(await (await request(path)).text()).not.toContain(credential);
  await request('/api/ai/settings', { apiKey: null }, 'PATCH');
  expect((await (await request('/api/ai/settings')).json()).keyConfigured).toBe(false);
  expect((await request(`/api/ai/review/${snapshot.id}`)).status).toBe(409);
});

test('flight recap returns computed facts and respects origin and input boundaries', async () => {
  const { aircraft, snapshot } = await seed();
  await request('/api/sessions', { aircraftId: aircraft.id, title: 'Synthetic flight', flownAt: '2026-10-14T12:00:00Z', durationMinutes: 2, notes: 'PRIVATE SESSION NOTES', location: 'PRIVATE LOCATION' });
  await enable();
  const other = await (await request('/api/aircraft', { name: 'Other private aircraft' })).json();
  await request('/api/sessions', { aircraftId: other.id, title: 'Other flight', flownAt: '2026-10-14T13:00:00Z', durationMinutes: 100 });
  const recap = await request('/api/ai/recap', { aircraftId: aircraft.id });
  expect(recap.status).toBe(200);
  const report = await recap.json();
  expect(report.context.aircraftId).toBe(aircraft.id);
  expect(report.facts.flightCount).toBe(1);
  expect(report.facts.durationSeconds.value).toBe(120);
  const providerBody = fetchImpl.mock.calls[1][1].body;
  expect(providerBody).not.toContain(aircraft.id);
  expect(providerBody).not.toContain('Other private aircraft');
  expect(providerBody).not.toContain('PRIVATE LOCATION');
  expect(providerBody).not.toContain('PRIVATE SESSION NOTES');
  expect((await request('/api/ai/check', {}, 'POST', { Origin: 'https://other.example' })).status).toBe(403);
  expect((await request('/api/ai/review', { snapshotId: snapshot.id, question: 'x'.repeat(1001) })).status).toBe(400);
  expect((await request('/api/ai/review', { snapshotId: snapshot.id, rawText })).status).toBe(400);
  for (const input of [{}, null, [], { aircraftId: '' }, { aircraftId: 42 }, { aircraftId: aircraft.id, apiKey: credential }])
    expect((await request('/api/ai/recap', input)).status).toBe(400);
  expect((await request('/api/ai/recap', { aircraftId: 'missing' })).status).toBe(404);
  expect((await request('/api/ai/settings', { provider: 'other' }, 'PATCH')).status).toBe(400);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test('billing rejection hides availability, sanitizes errors, and leaves offline imports working', async () => {
  const { aircraft, snapshot } = await seed();
  await enable();
  fetchImpl.mockImplementationOnce(async () => new Response(JSON.stringify({ error: { code: 'insufficient_quota', message: credential } }), { status: 429 }));
  const failed = await request('/api/ai/review', { snapshotId: snapshot.id, question: 'New analysis' });
  expect(failed.status).toBe(409);
  expect(await failed.text()).not.toContain(credential);
  const settings = await (await request('/api/ai/settings')).json();
  expect(settings).toMatchObject({ available: false, billingState: 'blocked' });
  const imported = await request('/api/snapshots', { aircraftId: aircraft.id, label: 'Offline still works', filename: 'export.txt', rawText });
  expect(imported.status).toBe(201);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect((await request(`/api/ai/review/${snapshot.id}`)).status).toBe(409);
});

test('automatic review requires explicit opt-in and never fails the snapshot import', async () => {
  const { aircraft } = await seed();
  await enable({ automaticReview: true });
  const imported = await request('/api/snapshots', { aircraftId: aircraft.id, label: 'Automatic review', filename: 'export.txt', rawText });
  expect(imported.status).toBe(201);
  const snapshot = await imported.json();
  let cached;
  for (let attempt = 0; attempt < 30; attempt++) {
    cached = await (await request(`/api/ai/review/${snapshot.id}`)).json();
    if (cached?.result) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  expect(cached?.result).toEqual(explanation);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  fetchImpl.mockImplementationOnce(async () => { throw new Error(credential); });
  const next = await request('/api/snapshots', { aircraftId: aircraft.id, label: 'Provider unavailable', filename: 'second.txt', rawText });
  expect(next.status).toBe(201);
  const retained = await next.json();
  for (let attempt = 0; attempt < 30; attempt++) {
    const cachedFailure = await (await request(`/api/ai/review/${retained.id}`)).json();
    if (cachedFailure?.status === 'failed') break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  expect((await request(`/api/snapshots/${retained.id}`)).status).toBe(200);
  expect(fetchImpl).toHaveBeenCalledTimes(3);
});

test('damaged AI settings preserve files and core availability without resetting optional state', async () => {
  await new Promise(resolve => server.close(resolve));
  const path = join(directory, '.ai-state.json');
  const damaged = '{damaged-private-state';
  await writeFile(path, damaged);
  await start();
  expect(await readFile(path, 'utf8')).toBe(damaged);
  const settings = await (await request('/api/ai/settings')).json();
  expect(settings.available).toBe(false);
  expect(settings.reason).toBe('AI configuration unavailable; preserve local files before repair');
  expect((await request('/api/aircraft', { name: 'Offline aircraft' })).status).toBe(201);
  expect((await request('/api/state')).status).toBe(200);
  expect((await request('/api/ai/settings', { enabled: true }, 'PATCH')).status).toBe(409);
  expect(fetchImpl).not.toHaveBeenCalled();
});
