import { test, expect, afterEach } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeDecodedFlight } from '../src/dji-import.mjs';
import { createStore } from '../src/store.mjs';
import { createMemoryRepository } from './helpers/memory-repository.mjs';
import { validateCompleteBackup } from '../src/restore.mjs';
import { formatRecapDistance, formatRecapHeight, formatRecapSpeed, displayUnits } from '../public/recap-format.js';

const normalized = (distance, version = 14, productType = 137, format = 'dji-txt', extra = {}) => normalizeDecodedFlight({ version, details: { aircraftName: 'Synthetic', productType, startTime: '2026-10-14T12:00:00Z', totalTime: 120, totalDistance: distance, ...extra }, frames: [] }, format);
const resources = [];
afterEach(async () => { for (const { dir, store } of resources.splice(0)) { await store?.close(); await rm(dir, { recursive: true, force: true }); } });

test('only the verified TXT version/product family converts kilometres, retaining source evidence', () => {
  expect(normalized(6.419383525848389).summary).toMatchObject({ distanceMeters: 6419.383525848389, distanceSourceValue: 6.419383525848389, distanceSourceUnit: 'km' });
  expect(normalized(0).summary.distanceMeters).toBe(0);
  expect(normalized(null).summary.distanceMeters).toBeNull();
  expect(normalized(100001).summary.distanceMeters).toBeNull();
  for (const args of [[2, 13, 137], [2, 14, 120], [2, 14, 137, 'dji-json'], [2, 14, 137, 'dji-txt', { distanceMeters: 20 }]]) {
    const result = normalized(...args).summary;
    expect(result.distanceMeters).toBe(args[4] ? 20 : 2);
    expect(result.distanceUnitBasis).toBeUndefined();
  }
});

async function seedLegacy() {
  const dir = await mkdtemp(join(tmpdir(), 'fpvbench-unit-test-'));
  const repository = createMemoryRepository();
  const decoded = normalized(1.25);
  const legacy = structuredClone(decoded);
  legacy.summary.distanceMeters = 1.25;
  for (const key of ['distanceSourceValue', 'distanceSourceUnit', 'distanceUnitBasis']) delete legacy.summary[key];
  const resource = { dir }; resources.push(resource);
  resource.store = await createStore(dir, { repositoryFactory: () => repository, decodeFlight: async () => legacy });
  const aircraft = await resource.store.createAircraft({ name: 'Synthetic', serialNumber: 'synthetic' });
  const { flightLog: log } = await resource.store.importFlightLog({ aircraftId: aircraft.id, filename: 'synthetic.txt', sourceDevice: 'synthetic', contentBase64: Buffer.from('synthetic original').toString('base64') });
  await resource.store.updateFlightLog(log.id, { aircraftId: aircraft.id, airdataStatus: 'uploaded' });
  const session = resource.store.getState().sessions[0];
  await resource.store.updateSession(session.id, { notes: 'Keep my notes' });
  const before = await resource.store.exportWorkspace();
  await resource.store.close();
  return { dir, repository, decoded, before, resource };
}

test('legacy repair backs up before one save and preserves identities, notes, upload status, telemetry and originals', async () => {
  const { dir, repository, decoded, before, resource } = await seedLegacy();
  const events = [], save = repository.save;
  repository.backup = async () => { events.push('backup'); expect(repository.load()).toEqual(validateCompleteBackup(before).catalog); };
  repository.save = (...args) => { events.push('save'); return save(...args); };
  resource.store = await createStore(dir, { repositoryFactory: () => repository, decodeFlight: async () => decoded });
  const after = await resource.store.exportWorkspace();
  expect(events).toEqual(['backup', 'save']);
  expect(after.flightLogs[0].summary.distanceMeters).toBe(1250);
  const expected = structuredClone(before); expected.flightLogs[0].summary = decoded.summary;
  expect(after).toEqual(expected);
  expect(validateCompleteBackup(after).catalog.flightLogs[0].summary.distanceMeters).toBe(1250);
  await resource.store.close();
  resource.store = await createStore(dir, { repositoryFactory: () => repository, decodeFlight: () => { throw new Error('Must not decode twice'); } });
  expect(events).toEqual(['backup', 'save']);
  expect(resource.store.getState().flightLogs[0].summary.distanceMeters).toBe(1250);
});

test.each(['backup', 'metadata', 'distance', 'original'])('repair failure at %s preserves the entire previous catalog', async kind => {
  const { dir, repository, decoded, before } = await seedLegacy();
  let backups = 0;
  repository.backup = async () => { backups++; if (kind === 'backup') throw new Error('No backup'); };
  if (kind === 'metadata') decoded.summary.durationSeconds++;
  if (kind === 'distance') decoded.summary.distanceMeters += 1000;
  if (kind === 'original') await writeFile(join(dir, 'imports', before.flightLogs[0].sha256 + '.bin'), 'changed');
  await expect(createStore(dir, { repositoryFactory: () => repository, decodeFlight: async () => decoded })).rejects.toThrow(/Cannot open workspace/);
  expect(repository.load()).toEqual(validateCompleteBackup(before).catalog);
  expect(backups).toBe(kind === 'backup' ? 1 : 0);
});

test('imperial formatters use exact conversion factors and preserve unknown and zero', () => {
  expect(formatRecapDistance(1609.344, 'imperial')).toBe('1 mi');
  expect(formatRecapDistance(250, 'imperial')).toBe('820.21 ft');
  expect(formatRecapHeight(30, 'imperial')).toBe('98.43 ft');
  expect(formatRecapSpeed(5, 'imperial')).toBe('11.18 mph');
  expect(formatRecapSpeed(null, 'imperial')).toBe('Unknown');
  expect(formatRecapHeight(0, 'imperial')).toBe('0 ft');
  expect(formatRecapHeight(-1, 'metric')).toBe('-1 m');
  expect(displayUnits('invalid')).toBe('metric');
});
