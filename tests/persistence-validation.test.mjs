import { test, expect } from '@jest/globals';
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStore } from '../src/store.mjs';
import { validateCompleteBackup } from '../src/restore.mjs';
import { validateWorkspace } from '../src/workspace-validation.mjs';
import { createMemoryRepository } from './helpers/memory-repository.mjs';

test('missing complete-backup members, invalid schema and null are rejected without a database', () => {
  const empty = { version: 2, aircraft: [], snapshots: [], sessions: [], flightLogs: [], originals: [], telemetry: [] };
  expect(validateCompleteBackup(empty).catalog.version).toBe(2);
  expect(() => validateCompleteBackup({ ...empty, originals: undefined })).toThrow();
  expect(() => validateCompleteBackup({ ...empty, telemetry: [{}] })).toThrow();
  expect(() => validateWorkspace(null)).toThrow(/workspace/i);
  expect(() => validateWorkspace({ version: 99, aircraft: [], snapshots: [], sessions: [], flightLogs: [] })).toThrow();
});

test('invalid UTF-8 legacy bytes remain untouched and are never copied as a successful migration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fpvbench-utf8-proof-'));
  const bytes = Buffer.from([0xff, 0xfe, 0x7b]);
  try {
    await writeFile(join(directory, 'workspace.json'), bytes);
    await expect(createStore(directory, { repositoryFactory: createMemoryRepository })).rejects.toThrow(/Cannot open workspace/);
    expect(await readFile(join(directory, 'workspace.json'))).toEqual(bytes);
    expect((await readdir(directory)).filter(filename => filename.endsWith('.bak'))).toEqual([]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
