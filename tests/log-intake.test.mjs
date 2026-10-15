import { test, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeLog } from '../src/log-import.mjs';
import { createStore } from '../src/store.mjs';
import { createMemoryRepository } from './helpers/memory-repository.mjs';
import { validateCompleteBackup } from '../src/restore.mjs';
import { flightFacts } from '../src/assistant-evidence.mjs';

let dir, store, repository;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'fpvbench-intake-')); repository = createMemoryRepository(); store = await createStore(dir, { repositoryFactory: () => repository }); });
afterEach(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });

test('unfamiliar originals are retained without fabricated flight evidence and survive backups/reopen', async () => {
  const bytes = Buffer.from('unfamiliar log bytes');
  const aircraft = await store.createAircraft({ name: 'Synthetic' });
  const input = { filename: 'flight.ridlog', contentBase64: bytes.toString('base64') };
  const first = await store.importLog(input);
  expect(first.flightLog).toMatchObject({ format: 'unknown-log', status: 'archived', aircraftId: null, logVersion: null, frameCount: 0 });
  expect(Object.values(first.flightLog.summary).every(value => value === null)).toBe(true);
  expect(first.session).toBeNull();
  expect(await store.getFlightOriginal(first.flightLog.id)).toEqual(bytes);
  expect((await store.importLog({ ...input, filename: 'renamed.ridlog' })).duplicate).toBe(true);
  await store.updateFlightLog(first.flightLog.id, { aircraftId: aircraft.id });
  expect(store.getState().sessions).toHaveLength(0);
  const backup = await store.exportWorkspace();
  expect(validateCompleteBackup(backup).catalog.flightLogs[0].format).toBe('unknown-log');
  expect(flightFacts(store.getState()).flightCount).toBe(0);
  await expect(store.createSession({ aircraftId: aircraft.id, flightLogId: first.flightLog.id, title: 'Not sourced', flownAt: '2026-10-14T12:00:00Z' })).rejects.toThrow(/Archive-only/);
  await store.close(); store = await createStore(dir, { repositoryFactory: () => repository });
  expect(store.getFlightLog(first.flightLog.id).aircraftId).toBe(aircraft.id);
});

test('content signatures recognize native families while retaining archive-only status', async () => {
  const ulog = Buffer.concat([Buffer.from([0x55,0x4c,0x6f,0x67,1,0x12,0x35,1]), Buffer.alloc(8)]);
  const dataflash = Buffer.concat([Buffer.from([0xa3,0x95,0x80]), Buffer.alloc(86)]);
  const tlog = Buffer.concat([Buffer.alloc(8), Buffer.from([0xfe,9]), Buffer.alloc(15)]);
  const blackbox = Buffer.from('H Product:Blackbox flight data recorder\nH Data version:2\n');
  for (const [bytes, filename, format] of [[ulog,'file.ulg','px4-ulog'],[dataflash,'file.bin','ardupilot-dataflash'],[tlog,'file.tlog','mavlink-tlog'],[blackbox,'file.bbl','betaflight-blackbox']]) {
    expect(await decodeLog(bytes, { filename })).toMatchObject({ format, status: 'archived', frames: [] });
  }
  expect((await decodeLog(Buffer.from('opaque'), { filename: 'not-really.ulg' })).format).toBe('unknown-log');
});

test('a defined MAVLink JSON-lines schema is recognized without claiming every JSON export is compatible', async () => {
  const bytes = Buffer.from(JSON.stringify({ meta: { type: 'HEARTBEAT', timestamp: 1791980000 }, data: { type: 2 } }) + '\n');
  expect(await decodeLog(bytes, { filename: 'messages.jsonl' })).toMatchObject({ format: 'mavlink-jsonl', status: 'archived' });
  expect((await decodeLog(Buffer.from('{"anything":true}'), { filename: 'other.json' })).format).toBe('unknown-log');
  await expect(decodeLog(Buffer.from('{"version":13,"details":{},"frames":[]}'), { filename: 'bad.json' })).rejects.toThrow();
  await expect(decodeLog(Buffer.alloc(0), { filename: 'empty.log' })).rejects.toThrow();
  await expect(decodeLog(Buffer.from('bytes'), { filename: 'not-a-log.exe' })).rejects.toThrow();
});
