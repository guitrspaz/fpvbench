import { test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAirdataService } from '../src/airdata.mjs';

let dir, service, fetchImpl, logs;
const appKey = 'TESTKEY1', userToken = 'HDTEST0001';
const reply = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'fpvbench-airdata-test-'));
  logs = [{ id: 'log-a', format: 'dji-txt', filename: 'synthetic.txt', sha256: 'a'.repeat(64), airdataStatus: 'unknown' }];
  const store = { getFlightLog: id => { const log = logs.find(log => log.id === id); if (!log) throw new Error('Missing'); return structuredClone(log); }, getFlightOriginal: async () => Buffer.from('synthetic original'), getState: () => ({ flightLogs: structuredClone(logs) }), recordAirdataTransfer: async (id, receipt) => { logs.find(log => log.id === id).airdataTransfer = structuredClone(receipt); } };
  fetchImpl = jest.fn(async url => url.includes('flight_upload_auth') ? reply({ status: 'success' }) : url.includes('get_upload_destination') ? reply({ upload_url: 'https://api-us-ext.airdata.com/flight_upload' }) : url.includes('/flight_job/') ? reply({ data: { status: 'Success' } }) : reply({ status: 'success', job_id: 'job_SYNTHETIC' }));
  service = await createAirdataService(dir, { store, fetchImpl });
});
afterEach(async () => { await service.close(); await rm(dir, { recursive: true, force: true }); });
async function ready() { await service.updateSettings({ appKey, userToken }); await service.checkConnection(); }

test('credentials are write-only and saving settings makes no network call', async () => {
  expect((await service.getSettings()).available).toBe(false);
  const settings = await service.updateSettings({ appKey, userToken });
  expect(settings).toMatchObject({ appKeyConfigured: true, userTokenConfigured: true, available: false });
  expect(JSON.stringify(settings)).not.toContain(appKey);
  expect(JSON.stringify(settings)).not.toContain(userToken);
  expect(fetchImpl).not.toHaveBeenCalled();
  await service.checkConnection(); expect((await service.getSettings()).available).toBe(true);
  await service.updateSettings({ appKey: null }); expect((await service.getSettings()).available).toBe(false);
});

test('upload saves submitting before transmission, retains processing receipt, refreshes success, and skips repeat sends', async () => {
  await ready();
  const original = fetchImpl.getMockImplementation();
  fetchImpl.mockImplementation(async (url, options) => {
    if (url.endsWith('/flight_upload')) expect(logs[0].airdataTransfer.status).toBe('submitting');
    expect(options.redirect).toBe('error');
    return original(url, options);
  });
  await service.sendLogs(['log-a']);
  expect(logs[0].airdataTransfer).toMatchObject({ status: 'pending', jobId: 'job_SYNTHETIC' });
  await service.refreshJobs(['log-a']);
  expect(logs[0].airdataTransfer.status).toBe('success');
  expect(logs[0].airdataStatus).toBe('unknown');
  const calls = fetchImpl.mock.calls.length;
  expect((await service.sendLogs(['log-a', 'log-a'])).results[0].skipped).toBe(true);
  expect(fetchImpl).toHaveBeenCalledTimes(calls);
});

test('manual sent marks and unsupported archives are skipped without provider calls', async () => {
  await ready(); logs[0].airdataStatus = 'uploaded';
  const count = fetchImpl.mock.calls.length;
  await service.sendLogs(['log-a']); expect(fetchImpl).toHaveBeenCalledTimes(count);
  logs[0].airdataStatus = 'unknown'; logs[0].format = 'unknown-log';
  await service.sendLogs(['log-a']); expect(fetchImpl).toHaveBeenCalledTimes(count);
});

test('ambiguous submission is outcome-unknown and is not resubmitted', async () => {
  await ready();
  const original = fetchImpl.getMockImplementation();
  fetchImpl.mockImplementation(async (url, options) => { if (url.endsWith('/flight_upload')) throw new Error(userToken); return original(url, options); });
  const result = await service.sendLogs(['log-a']);
  expect(logs[0].airdataTransfer.status).toBe('unknown');
  expect(JSON.stringify(result)).not.toContain(userToken);
  const calls = fetchImpl.mock.calls.length;
  await service.sendLogs(['log-a']); expect(fetchImpl).toHaveBeenCalledTimes(calls);
});

test.each(['http://api.airdata.com/flight_upload','https://airdata.com.evil.example/flight_upload','https://user:password@api.airdata.com/flight_upload','https://api.airdata.com/private'])('untrusted destination %s never receives a file or credentials', async destination => {
  await ready(); fetchImpl.mockResolvedValueOnce(reply({ upload_url: destination }));
  await service.sendLogs(['log-a']);
  expect(logs[0].airdataTransfer.status).toBe('error');
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test('changed token isolates historical receipts and clears verification', async () => {
  await ready(); const first = (await service.getSettings()).accountId;
  await service.sendLogs(['log-a']);
  await service.updateSettings({ userToken: 'HDTEST0002' });
  expect((await service.getSettings()).accountId).not.toBe(first);
  expect((await service.getSettings()).available).toBe(false);
  await service.checkConnection(); await service.sendLogs(['log-a']);
  expect(logs[0].airdataTransfer.accountId).not.toBe(first);
});

test('pending and running jobs retain processing states; provider errors never echo credentials', async () => {
  await ready(); await service.sendLogs(['log-a']);
  for (const [provider, expected] of [['Pending','pending'],['Running','running'],['Error','error']]) {
    fetchImpl.mockResolvedValueOnce(reply({ data: { status: provider, reason: userToken } }));
    await service.refreshJobs(['log-a']);
    expect(logs[0].airdataTransfer.status).toBe(expected);
    expect(JSON.stringify(logs)).not.toContain(userToken);
  }
});

test('poll failure preserves the receipt and parallel send requests cannot submit twice', async () => {
  await ready(); await Promise.all([service.sendLogs(['log-a']), service.sendLogs(['log-a'])]);
  expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith('/flight_upload'))).toHaveLength(1);
  const before = structuredClone(logs[0].airdataTransfer);
  fetchImpl.mockRejectedValueOnce(new Error(userToken));
  await service.refreshJobs(['log-a']); expect(logs[0].airdataTransfer).toEqual(before);
});

test('invalid settings, IDs, failed verification and oversized responses do not expose tokens', async () => {
  await expect(service.updateSettings({ userToken: 'wrong' })).rejects.toMatchObject({ status: 400 });
  await expect(service.updateSettings({ enabled: true })).rejects.toMatchObject({ status: 400 });
  await service.updateSettings({ appKey, userToken });
  fetchImpl.mockResolvedValueOnce(reply({ status: 'error', message: userToken }));
  await expect(service.checkConnection()).rejects.toMatchObject({ status: 502 });
  expect((await service.getSettings()).available).toBe(false);
  await service.checkConnection();
  for (const ids of [[], null, [''], Array(21).fill('log-a')]) await expect(service.sendLogs(ids)).rejects.toMatchObject({ status: 400 });
  fetchImpl.mockResolvedValueOnce(reply({ upload_url: 'x'.repeat(70000) }));
  const result = await service.sendLogs(['log-a']);
  expect(logs[0].airdataTransfer.status).toBe('error');
  expect(JSON.stringify(result)).not.toContain(userToken);
});

test('an unreadable private config is preserved and cannot silently become a new account', async () => {
  await service.close();
  const path = join(dir, '.airdata-config.json');
  await writeFile(path, '{broken private config', { mode: 0o600 });
  service = await createAirdataService(dir, { store: {}, fetchImpl });
  expect((await service.getSettings()).available).toBe(false);
  await expect(service.updateSettings({ appKey, userToken })).rejects.toMatchObject({ status: 409 });
  expect(await readFile(path, 'utf8')).toBe('{broken private config');
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('a bounded timeout disables failed verification without forwarding provider error details', async () => {
  await service.close(); fetchImpl = jest.fn(() => new Promise(() => {}));
  service = await createAirdataService(dir, { store: {}, fetchImpl, timeoutMs: 10 });
  await service.updateSettings({ appKey, userToken });
  await expect(service.checkConnection()).rejects.toMatchObject({ status: 502 });
  expect((await service.getSettings()).available).toBe(false);
});

test('incoherent private credentials are preserved and cannot bypass verification', async () => {
  await service.close();
  const path = join(dir, '.airdata-config.json');
  const invalid = { version: 1, appKey, userToken, accountId: null, verifiedAt: new Date().toISOString() };
  await writeFile(path, JSON.stringify(invalid), { mode: 0o600 });
  service = await createAirdataService(dir, { store: {}, fetchImpl });
  expect((await service.getSettings()).available).toBe(false);
  await expect(service.checkConnection()).rejects.toMatchObject({ status: 409 });
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(invalid);
  expect(fetchImpl).not.toHaveBeenCalled();
});
