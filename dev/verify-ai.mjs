import assert from 'node:assert/strict';
import { mkdtemp, rm, lstat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server.mjs';
import { createAiService } from '../src/ai-service.mjs';

// Explicit operational proof: disposable SQLite/local AI files; synthetic provider only.
const dataDir = await mkdtemp(join(tmpdir(), 'fpvbench-ai-proof-'));
const credential = 'synthetic-operational-credential-only';
const explanation = { summary: 'Synthetic evidence explanation.', observations: ['Values remain explicit.'], questions: [], limitations: ['Firmware applicability needs verification.'] };
let calls = 0, blocked = false, server;
const provider = async (_url, options) => {
  calls++;
  assert.equal(options.headers.Authorization, `Bearer ${credential}`);
  assert.equal(options.body.includes(credential), false);
  if (blocked) return new Response(JSON.stringify({ error: { code: 'credit_balance_exhausted' } }), { status: 429 });
  const body = JSON.parse(options.body);
  const output = body.max_output_tokens === 64 ? 32 : 90;
  return new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 100, output_tokens: output, total_tokens: 100 + output }, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(explanation) }] }] }), { status: 200 });
};
async function start() {
  server = await createServer({ dataDir, aiFactory: dir => createAiService(dir, { fetchImpl: provider }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function stop() {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  server = null;
}
try {
  let base = await start();
  const request = async (path, input, method = 'POST') => {
    const response = await fetch(base + path, input === undefined ? {} : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await request('/api/ai/settings')).body.available, false);
  assert.equal(calls, 0);
  const aircraft = (await request('/api/aircraft', { name: 'Synthetic proof aircraft' })).body;
  const snapshot = (await request('/api/snapshots', { aircraftId: aircraft.id, label: 'Synthetic setup', filename: 'synthetic.txt', rawText: '# dump all\n# Betaflight / TEST 4.5.1 / MSP API: 1.46\nprofile 0\nset p_roll = 40\nsave\n' })).body;
  assert.equal((await request('/api/ai/review', { snapshotId: snapshot.id })).status, 409);
  await request('/api/ai/settings', { apiKey: credential, enabled: true, monthlyBudgetUSD: 1 }, 'PATCH');
  assert.equal(calls, 0);
  assert.equal((await request('/api/ai/check', {})).body.available, true);
  const report = await request('/api/ai/review', { snapshotId: snapshot.id });
  assert.equal(report.status, 200);
  assert.equal(report.body.result.summary, explanation.summary);
  const beforeCalls = calls;
  const spent = (await request('/api/ai/settings')).body.spentUSD;
  const exported = (await request('/api/export')).body;
  assert.equal(JSON.stringify(exported).includes(credential), false);
  assert.equal(Object.hasOwn(exported, 'aiReports'), false);
  assert.equal((await lstat(join(dataDir, '.ai-config.json'))).mode & 0o777, 0o600);
  await stop(); base = await start();
  assert.equal((await request('/api/ai/settings')).body.spentUSD, spent);
  assert.equal((await request('/api/ai/review/' + snapshot.id)).body.cached, true);
  assert.equal(calls, beforeCalls);
  assert.deepEqual((await request('/api/export')).body, exported);
  blocked = true;
  assert.equal((await request('/api/ai/review', { snapshotId: snapshot.id, question: 'A different goal' })).status, 409);
  assert.equal((await request('/api/ai/settings')).body.available, false);
  assert.equal((await request('/api/aircraft', { name: 'Offline still works' })).status, 201);
  assert.equal(JSON.stringify((await request('/api/ai/settings')).body).includes(credential), false);
  await stop();
  await rm(join(dataDir, '.ai-state.json'));
  // Leave a malformed optional file: core catalog must remain available without resetting it.
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(dataDir, '.ai-state.json'), '{invalid', { mode: 0o600 });
  base = await start();
  assert.equal((await request('/api/state')).status, 200);
  assert.equal((await request('/api/ai/settings')).body.available, false);
  assert.equal(await readFile(join(dataDir, '.ai-state.json'), 'utf8'), '{invalid');
  console.log('AI operational proof passed: real SQLite/server, private key storage, gated mocked provider, durable usage/cache, preserved export, billing shutdown, and corrupt-AI fallback. No paid API requests.');
} finally {
  await stop();
  await rm(dataDir, { recursive: true, force: true });
}
