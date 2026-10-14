import { createStore } from '../../src/store.mjs';
import { decodeDjiFlightInProcess } from '../../src/dji-import.mjs';
import { createMemoryRepository } from '../helpers/memory-repository.mjs';

/** Browser tests exercise real JSON normalization without SQLite, WASM, or a worker. */
export function createBrowserStore(dataDir) {
  return createStore(dataDir, {
    repositoryFactory: () => createMemoryRepository(),
    decodeFlight: (bytes, options) => decodeDjiFlightInProcess(bytes, {
      ...options,
      parserFactory() { throw new Error('Binary decoding is outside this JSON browser proof.'); },
    }),
  });
}
