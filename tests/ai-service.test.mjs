import { beforeEach, afterEach, test, expect, jest } from '@jest/globals';
import { mkdtemp, rm, readFile, lstat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAiService, MODEL } from '../src/ai-service.mjs';

let directory, ai, fetchImpl, time;
const credential = 'synthetic-test-credential-only';
const result = { summary: 'Synthetic explanation', observations: ['Explicit evidence only.'], questions: [], limitations: ['Verify in Betaflight.'] };
const response = (overrides = {}) => new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 }, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(result) }] }], ...overrides }), { status: 200 });
const setup = async () => { await ai.updateSettings({ apiKey: credential, enabled: true, monthlyBudgetUSD: 1 }); await ai.checkConnection(); };
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'fpvbench-ai-')); time = new Date('2026-10-14T12:00:00Z'); fetchImpl = jest.fn(async () => response()); ai = await createAiService(directory, { fetchImpl, now: () => time }); });
afterEach(async () => { await ai.close(); await rm(directory, { recursive: true, force: true }); });

test('defaults offline; key write-only, owner-private and never tests on settings reads/save', async () => {
  expect(ai.getSettings()).toMatchObject({ enabled: false, keyConfigured: false, monthlyBudgetUSD: 0, available: false, billingState: 'unverified' });
  expect(fetchImpl).not.toHaveBeenCalled();
  const settings = await ai.updateSettings({ apiKey: credential });
  expect(settings.keyConfigured).toBe(true);
  expect(JSON.stringify(settings)).not.toContain(credential);
  expect((await lstat(join(directory, '.ai-config.json'))).mode & 0o777).toBe(0o600);
  expect(fetchImpl).not.toHaveBeenCalled();
  await expect(ai.run('snapshot-review', { evidence: [] })).rejects.toMatchObject({ status: 403 });
  await ai.updateSettings({ apiKey: null });
  expect(ai.getSettings().keyConfigured).toBe(false);
});
test('paid check enables feature, request contract fixed and usage estimated conservatively', async () => {
  await setup();
  expect(ai.getSettings()).toMatchObject({ available: true, billingState: 'ready', verifiedAt: time.toISOString(), model: MODEL });
  const answer = await ai.run('snapshot-review', { evidence: [{ value: '40' }] });
  expect(answer.result).toEqual(result);
  expect(answer.usage).toMatchObject({ inputTokens: 100, outputTokens: 50, estimatedCostUSD: 0.0003 });
  const [url, options] = fetchImpl.mock.calls[1];
  const body = JSON.parse(options.body);
  expect(url).toBe('https://api.openai.com/v1/responses');
  expect(options.redirect).toBe('error');
  expect(body).toMatchObject({ model: MODEL, store: false, reasoning: { effort: 'none' }, max_output_tokens: 2048, text: { format: { type: 'json_schema', strict: true } } });
  expect(options.headers.Authorization).toBe(`Bearer ${credential}`);
  expect(options.body).not.toContain(credential);
});
test('durable reservation precedes transmission; uncertain failure retains spend and never retries', async () => {
  await setup();
  const before = ai.getSettings().spentUSD;
  fetchImpl.mockImplementationOnce(async () => {
    const state = JSON.parse(await readFile(join(directory, '.ai-state.json'), 'utf8'));
    expect(state.months['2026-10']).toBeGreaterThan(Math.round(before * 1000000));
    throw new Error(credential);
  });
  await expect(ai.run('snapshot-review', {})).rejects.toThrow(/request|network/i);
  expect(ai.getSettings().spentUSD).toBeGreaterThan(before);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  const spent = ai.getSettings().spentUSD;
  await ai.close(); ai = await createAiService(directory, { fetchImpl, now: () => time });
  expect(ai.getSettings().spentUSD).toBe(spent);
  await ai.updateSettings({ apiKey: 'replacement-test-credential', enabled: false, monthlyBudgetUSD: 2 });
  expect(ai.getSettings().spentUSD).toBe(spent);
  expect(ai.getSettings().available).toBe(false);
});
test.each(['insufficient_quota', 'credit_balance_exhausted', 'organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded'])('known billing error %s blocks until explicit repaired check', async code => {
  await setup(); const before = ai.getSettings().spentUSD;
  fetchImpl.mockImplementationOnce(async () => new Response(JSON.stringify({ error: { code, message: credential } }), { status: 429 }));
  await expect(ai.run('flight-recap', {})).rejects.toThrow(/billing|account/i);
  expect(ai.getSettings()).toMatchObject({ billingState: 'blocked', available: false, spentUSD: before });
  time = new Date('2026-11-01T12:00:00Z');
  expect(ai.getSettings().billingState).toBe('blocked');
  await expect(ai.run('flight-recap', {})).rejects.toThrow();
  await ai.checkConnection(); expect(ai.getSettings().available).toBe(true);
});
test('transient rate limits retain readiness and rollback a known rejected request', async () => {
  await setup(); const before = ai.getSettings().spentUSD;
  fetchImpl.mockImplementationOnce(async () => new Response(JSON.stringify({ error: { code: 'rate_limit_exceeded' } }), { status: 429 }));
  await expect(ai.run('flight-recap', {})).rejects.toThrow(/rate/i);
  expect(ai.getSettings()).toMatchObject({ billingState: 'ready', spentUSD: before });
});
test.each([{ status: 'incomplete' }, { usage: null }, { output: [{ type: 'message', content: [{ type: 'refusal', refusal: credential }] }] }, { output: [{ type: 'message', content: [{ type: 'output_text', text: '{invalid' }] }] }])('malformed/refused/incomplete output retains reservation', async overrides => {
  await setup(); const before = ai.getSettings().spentUSD;
  fetchImpl.mockImplementationOnce(async () => response(overrides));
  await expect(ai.run('flight-recap', {})).rejects.toThrow();
  expect(ai.getSettings().spentUSD).toBeGreaterThan(before);
});
test('provider output and cached report redact credentials; cache requires budget and readiness', async () => {
  await setup();
  fetchImpl.mockImplementationOnce(async () => response({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ ...result, summary: credential }) }] }] }));
  const answer = await ai.run('snapshot-review', { question: credential });
  expect(JSON.stringify(answer)).not.toContain(credential);
  const key = 'a'.repeat(64);
  await ai.saveReport(key, { summary: credential, generatedAt: time.toISOString() });
  expect(JSON.stringify(await ai.getReport(key))).not.toContain(credential);
  const calls = fetchImpl.mock.calls.length;
  await ai.getReport(key); expect(fetchImpl).toHaveBeenCalledTimes(calls);
  await ai.updateSettings({ monthlyBudgetUSD: 0 });
  await expect(ai.getReport(key)).rejects.toMatchObject({ status: 403 });
});
test('settings/usage validation, oversize and single-flight budget exhaustion', async () => {
  await expect(ai.updateSettings({ monthlyBudgetUSD: 1.001 })).rejects.toThrow();
  await expect(ai.updateSettings({ enabled: 'true' })).rejects.toThrow();
  await expect(ai.updateSettings({ provider: 'other' })).rejects.toThrow();
  await setup();
  await expect(ai.run('flight-recap', { text: 'x'.repeat(49153) })).rejects.toMatchObject({ status: 413 });
  const before = fetchImpl.mock.calls.length;
  await ai.updateSettings({ monthlyBudgetUSD: 0.02 });
  fetchImpl.mockImplementation(async () => { throw new Error('network'); });
  const settled = await Promise.allSettled([ai.run('flight-recap', {}), ai.run('flight-recap', {})]);
  expect(settled.every(item => item.status === 'rejected')).toBe(true);
  expect(fetchImpl.mock.calls.length - before).toBe(1);
});
test('UTC month rollover preserves prior spend and key changes invalidate verification', async () => {
  await setup(); const previous = ai.getSettings().spentUSD;
  time = new Date('2026-11-01T00:00:00Z'); expect(ai.getSettings().spentUSD).toBe(0);
  time = new Date('2026-10-31T23:59:00Z'); expect(ai.getSettings().spentUSD).toBe(previous);
  await ai.updateSettings({ apiKey: 'different-test-credential' });
  expect(ai.getSettings()).toMatchObject({ billingState: 'unverified', verifiedAt: null, available: false });
});
test('credential symlinks and corrupted state are rejected without reset', async () => {
  await ai.close();
  const outside = join(directory, 'untouched'); await writeFile(outside, 'untouched');
  await rm(join(directory, '.ai-config.json')); await symlink(outside, join(directory, '.ai-config.json'));
  await expect(createAiService(directory, { fetchImpl })).rejects.toThrow(/AI|private|credential/i);
  expect(await readFile(outside, 'utf8')).toBe('untouched');
});

test('malformed auth rejection still blocks and never reflects provider text', async () => {
  await setup(); const before = ai.getSettings().spentUSD;
  fetchImpl.mockImplementationOnce(async () => new Response(credential, { status: 401 }));
  await expect(ai.run('flight-recap', {})).rejects.toThrow(/authorization/);
  expect(ai.getSettings()).toMatchObject({ billingState: 'blocked', available: false, spentUSD: before });
});
test('completed known usage is charged before invalid output is rejected', async () => {
  await setup(); const before = ai.getSettings().spentUSD;
  fetchImpl.mockImplementationOnce(async () => response({ output: [] }));
  await expect(ai.run('flight-recap', {})).rejects.toThrow();
  expect(ai.getSettings().spentUSD - before).toBeCloseTo(0.0003, 8);
});
test('usage above reservation blocks accounting and 5xx holds its full reservation', async () => {
  await setup(); const before = ai.getSettings().spentUSD;
  fetchImpl.mockImplementationOnce(async () => new Response('{}', { status: 503 }));
  await expect(ai.run('flight-recap', {})).rejects.toThrow();
  expect(ai.getSettings().spentUSD - before).toBeGreaterThan(0.01);
  expect(ai.getSettings().billingState).toBe('ready');
  fetchImpl.mockImplementationOnce(async () => response({ usage: { input_tokens: 1000000, output_tokens: 1, total_tokens: 1000001 } }));
  await expect(ai.run('flight-recap', {})).rejects.toThrow(/bound/);
  expect(ai.getSettings().billingState).toBe('blocked');
});
test('oversize provider response holds reservation without retry', async () => {
  await setup(); const before = ai.getSettings().spentUSD;
  fetchImpl.mockImplementationOnce(async () => new Response('x'.repeat(128 * 1024 + 1), { status: 200 }));
  await expect(ai.run('flight-recap', {})).rejects.toThrow(/limit/);
  expect(ai.getSettings().spentUSD).toBeGreaterThan(before);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});
test('configured ledger loss and null corruption never reset spending', async () => {
  await setup(); await ai.close();
  await writeFile(join(directory, '.ai-state.json'), 'null\n', { mode: 0o600 });
  await expect(createAiService(directory, { fetchImpl })).rejects.toThrow(/AI/);
  expect(await readFile(join(directory, '.ai-state.json'), 'utf8')).toBe('null\n');
  await rm(join(directory, '.ai-state.json'));
  await expect(createAiService(directory, { fetchImpl })).rejects.toThrow(/AI/);
});

test('twenty-second timeout retains reservation and makes no retry', async () => {
  await setup(); const before = ai.getSettings().spentUSD;
  let started;
  const sent = new Promise(resolve => { started = resolve; });
  fetchImpl.mockImplementationOnce(async () => { started(); return new Promise(() => {}); });
  jest.useFakeTimers();
  try {
    const failed = expect(ai.run('flight-recap', {})).rejects.toMatchObject({ status: 504 });
    await sent;
    await jest.advanceTimersByTimeAsync(20000);
    await failed;
    expect(ai.getSettings().spentUSD).toBeGreaterThan(before);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  } finally { jest.useRealTimers(); }
});
test('private report cache survives restart and can retrieve the latest matching evidence', async () => {
  await setup();
  await ai.saveReport('a'.repeat(64), { kind: 'snapshot-review', context: { snapshotId: 'example' }, generatedAt: '2026-10-14T12:00:00Z', result });
  await ai.saveReport('b'.repeat(64), { kind: 'snapshot-review', context: { snapshotId: 'example' }, generatedAt: '2026-10-14T12:01:00Z', result });
  await ai.close(); ai = await createAiService(directory, { fetchImpl, now: () => time });
  expect((await ai.findReport(report => report.context.snapshotId === 'example')).generatedAt).toBe('2026-10-14T12:01:00Z');
  expect((await ai.getReport('a'.repeat(64))).result).toEqual(result);
});

test('recap has its own trusted synthesis instructions and allows no follow-up questions', async () => {
  await setup();
  const answer = await ai.run('flight-recap', { facts: { flightCount: 3, averageDurationSeconds: { value: 90 }, medianDurationSeconds: { value: 60 } } });
  const body = JSON.parse(fetchImpl.mock.calls[1][1].body);
  expect(body.instructions).toMatch(/average.*median/i);
  expect(body.instructions).toMatch(/human-readable/i);
  expect(body.instructions).toMatch(/generic.*questions/i);
  expect(body.instructions).not.toContain('preferred baseline');
  expect(answer.result.questions).toEqual([]);
});
