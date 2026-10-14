import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../../src/server.mjs';
import { createBrowserStore } from './test-store.mjs';

// Interactive browser-tool target, always loopback with an ephemeral data directory.
const dataDir = await mkdtemp(join(tmpdir(), 'fpvbench-interactive-browser-'));
const server = await createServer({ dataDir, storeFactory: createBrowserStore });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
console.log(`http://127.0.0.1:${server.address().port}`);
let closing = false;
async function cleanup() {
  if (closing) return;
  closing = true;
  await new Promise((resolve) => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
