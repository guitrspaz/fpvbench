import { afterEach, describe, expect, test } from '@jest/globals';
import { access, readdir } from 'node:fs/promises';
import { createPracticeData, PRACTICE_IDS } from '../src/practice-data.mjs';
import { createPracticeServer, startPracticeWorkspace, practiceAiFactory, practiceFilingFactory } from '../src/practice-workspace.mjs';
import { createServer } from '../src/server.mjs';
import { validateWorkspace } from '../src/workspace-validation.mjs';
import { compareControllers, controllerView } from '../src/controller.mjs';
import { createMemoryRepository } from '../src/memory-repository.mjs';

const running = [];
afterEach(async () => { await Promise.all(running.splice(0).map(practice => practice.close())); });
const start = async options => { const result = await startPracticeWorkspace({ port: 0, ...options }); running.push(result); return result; };
const json = async (practice, path, data, method = 'POST') => {
  const response = await fetch(practice.url + path, data === undefined ? {} : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return { status: response.status, data: await response.json() };
};

describe('synthetic practice workspace', () => {
  test('has complete reproducible examples, explicit fictional sessions and separate software unknowns', async () => {
    const seed = await createPracticeData();
    expect(() => validateWorkspace(seed)).not.toThrow();
    const get = id => seed.snapshots.find(s => s.id === id);
    expect(compareControllers(get(PRACTICE_IDS.original), get(PRACTICE_IDS.revised)).counts).toMatchObject({ changed: 4, unknown: 0 });
    expect(compareControllers(get(PRACTICE_IDS.softwareOriginal), get(PRACTICE_IDS.softwareChanged)).counts.unknown).toBe(14);
    expect(seed.snapshots.every(s => controllerView(s).controls.every(c => !c.verified))).toBe(true);
    expect(seed.sessions.filter(s => s.confirmedSetup).map(s => s.snapshotId)).toEqual([PRACTICE_IDS.original]);
    expect(seed.aircraft.every(a => a.serialNumber === '' && a.registrationId === '')).toBe(true);
  });

  test('memory repositories copy their input and do not share state', async () => {
    const seed = await createPracticeData(), a = createMemoryRepository(seed), b = createMemoryRepository(seed);
    const copy = a.load(); copy.aircraft[0].name = 'Changed only in A'; a.save(copy);
    expect(b.load().aircraft[0].name).not.toBe('Changed only in A');
    expect(seed.aircraft[0].name).not.toBe('Changed only in A');
  });

  test('ignores personal workspace environment, serves memory state and cleans its private temp directory', async () => {
    const previous = process.env.FPVBENCH_DATA_DIR;
    process.env.FPVBENCH_DATA_DIR = '/unopened-personal-workspace-sentinel';
    let practice;
    try { practice = await start(); }
    finally { if (previous === undefined) delete process.env.FPVBENCH_DATA_DIR; else process.env.FPVBENCH_DATA_DIR = previous; }
    expect(practice.dataDir).toContain('fpvbench-practice-');
    const state = await json(practice, '/api/state');
    expect(state.data).toMatchObject({ workspaceMode: 'practice', storage: 'memory' });
    expect(state.data.aircraft).toHaveLength(2);
    expect(await json(practice, '/api/health')).toMatchObject({ status: 200, data: { workspaceMode: 'practice' } });
    expect((await readdir(practice.dataDir)).some(name => /sqlite|ai-config|filing-config/.test(name))).toBe(false);
    await practice.close(); await practice.close();
    await expect(access(practice.dataDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('practice edits are confined to the instance and do not survive a new session', async () => {
    const first = await start();
    expect(await json(first, '/api/aircraft', { name: 'Disposable participant aircraft' })).toMatchObject({ status: 201 });
    expect((await json(first, '/api/state')).data.aircraft).toHaveLength(3);
    await first.close();
    const second = await start();
    expect((await json(second, '/api/state')).data.aircraft).toHaveLength(2);
  });

  test('provider, credential and folder actions are unavailable while synthetic source remains downloadable', async () => {
    const practice = await start();
    expect((await json(practice, '/api/ai/settings')).data).toMatchObject({ enabled: false, keyConfigured: false, available: false });
    for (const [path, data, method] of [
      ['/api/ai/settings', { apiKey: 'SYNTHETIC_DO_NOT_SAVE', enabled: true }, 'PATCH'],
      ['/api/ai/check', {}, 'POST'],
      ['/api/filing/settings', { folder: '/unopened-folder-sentinel' }, 'PATCH'],
      ['/api/filing/scan', {}, 'POST'],
      ['/api/log-imports', { filename: 'unopened.ulg', contentBase64: 'U1lOVEhFVElD' }, 'POST'],
    ]) {
      const result = await json(practice, path, data, method);
      expect(result.status).toBe(409); expect(result.data.error).toMatch(/Practice|practice|optional AI/);
    }
    const original = await fetch(practice.url + '/api/snapshots/' + PRACTICE_IDS.original + '/raw');
    expect(await original.text()).toMatch(/SYNTHETIC EXAMPLE ONLY/);
    const exported = await fetch(practice.url + '/api/export');
    expect(exported.headers.get('content-disposition')).toMatch(/practice/);
    const backup = await exported.json();
    expect(backup.aircraft).toHaveLength(2);
    expect(backup.originals).toEqual([]);
    expect((await readdir(practice.dataDir)).some(name => /sqlite|ai-config|filing-config/.test(name))).toBe(false);
  });

  test('factories cannot be activated directly and a creation failure cleans acquired resources', async () => {
    expect(() => practiceAiFactory().updateSettings({ enabled: true })).toThrow(/Practice/);
    expect(() => practiceFilingFactory().scanFolder()).toThrow(/Practice/);
    let directory;
    await expect(createPracticeServer({ serverFactory: async options => {
      directory = options.dataDir;
      expect(options.workspaceMode).toBe('practice');
      await options.storeFactory(options.dataDir);
      throw new Error('Synthetic construction failure');
    } })).rejects.toThrow('Synthetic construction failure');
    await expect(access(directory)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('an occupied port fails without reusing a server and cleans the second workspace', async () => {
    const first = await start(), directories = [];
    await expect(startPracticeWorkspace({ port: first.server.address().port, serverFactory: options => {
      directories.push(options.dataDir); return createServer(options);
    } })).rejects.toThrow(/already in use/);
    for (const directory of directories) await expect(access(directory)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await json(first, '/api/state')).status).toBe(200);
    for (const port of [-1, 65536, '4174', 1.5]) await expect(startPracticeWorkspace({ port })).rejects.toThrow(/Practice port/);
  });
});
