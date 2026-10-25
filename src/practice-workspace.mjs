import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from './server.mjs';
import { createStore } from './store.mjs';
import { createMemoryRepository } from './memory-repository.mjs';
import { createPracticeData } from './practice-data.mjs';
import { AppError } from './errors.mjs';

const practiceReason = 'Practice workspace: optional AI and external connections are unavailable. Use synthetic records only.';
const unavailable = () => { throw new AppError(practiceReason, 409); };
const aiSettings = () => ({
  provider: 'openai', model: null, enabled: false, keyConfigured: false, monthlyBudgetUSD: 0,
  spentUSD: 0, remainingUSD: 0, automaticReview: false, available: false, reason: practiceReason,
  verifiedAt: null, billingState: 'disabled', priceCheckedAt: null,
});

/** Provider factories contain no configuration reads, credentials, network calls or folder traversal. */
export function practiceAiFactory() {
  return {
    getSettings: aiSettings, updateSettings: unavailable, checkConnection: unavailable,
    run: unavailable, getReport: unavailable, saveReport: unavailable, close: async () => {},
  };
}
export function practiceAssistantFactory() {
  return {
    getSettings: aiSettings, updateSettings: unavailable, checkConnection: unavailable,
    reviewSnapshot: unavailable, getSnapshotReview: unavailable, recapFlights: unavailable, close: async () => {},
  };
}
export function practiceFilingFactory() {
  return {
    getSettings: () => ({ folder: '', includeSubfolders: false, locked: true, busy: false, reason: practiceReason }),
    getScan: () => null, updateSettings: unavailable, scanFolder: unavailable, importFiles: unavailable,
    close: async () => {},
  };
}

/** Create a synthetic memory-only server in a new private temporary directory. The caller owns close(). */
export async function createPracticeServer({ serverFactory = createServer } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'fpvbench-practice-'));
  let server, closePromise;
  const stores = new Set();
  const close = () => {
    if (!closePromise) closePromise = (async () => {
      try {
        if (server) await new Promise((resolveClose, rejectClose) => server.close(error => {
          if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') rejectClose(error);
          else resolveClose();
        }));
        await Promise.all([...stores].map(store => store.close()));
      } finally {
        await rm(dataDir, { recursive: true, force: true });
      }
    })();
    return closePromise;
  };
  try {
    const seed = await createPracticeData();
    server = await serverFactory({
      dataDir, workspaceMode: 'practice',
      storeFactory: async directory => {
        const store = await createStore(directory, {
          repositoryFactory: () => createMemoryRepository(seed),
          decodeFlight: unavailable,
        });
        stores.add(store);
        const getState = store.getState;
        return { ...store, getState: () => ({ ...getState(), storage: 'memory' }), importLog: unavailable, importFlightLog: unavailable };
      },
      aiFactory: practiceAiFactory,
      assistantFactory: practiceAssistantFactory,
      filingFactory: practiceFilingFactory,
    });
    return { server, dataDir, close };
  } catch (error) {
    await close();
    throw error;
  }
}

/** Listen only on loopback. Ignore the personal-workspace and normal-server environment variables. */
export async function startPracticeWorkspace({ port = 4174, serverFactory = createServer } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Practice port must be a whole number from 0 to 65535.');
  const practice = await createPracticeServer({ serverFactory });
  try {
    await new Promise((resolveListen, rejectListen) => {
      practice.server.once('error', rejectListen);
      practice.server.listen(port, '127.0.0.1', () => {
        practice.server.removeListener('error', rejectListen);
        resolveListen();
      });
    });
    return { ...practice, url: 'http://127.0.0.1:' + practice.server.address().port };
  } catch (error) {
    await practice.close();
    if (error.code === 'EADDRINUSE') throw new Error('The practice port is already in use. Stop the other practice session or choose --port=NUMBER.', { cause: error });
    throw error;
  }
}

export async function runPracticeWorkspace(args = process.argv.slice(2)) {
  if (args.length > 1 || (args.length && !/^--port=\d+$/.test(args[0]))) throw new Error('Usage: npm run practice -- [--port=4174]');
  const practice = await startPracticeWorkspace({ port: args.length ? Number(args[0].slice(7)) : 4174 });
  const stop = () => { void practice.close().catch(error => { console.error(error.message); process.exitCode = 1; }); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  practice.server.once('close', () => { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); });
  console.log('FPVBench practice workspace: ' + practice.url + '\nSynthetic records only. Practice records are forgotten when stopped.\nYour personal workspace and optional credentials are not opened. Press Ctrl+C to stop.');
  return practice;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runPracticeWorkspace().catch(error => { console.error(error.message); process.exitCode = 1; });
}
