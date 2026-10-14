import { test, expect } from '@jest/globals';
import { serviceSpec, renderPlist, shellQuote, launcherSource, isManualServer, createServiceController } from '../src/macos-service.mjs';

const spec = () => serviceSpec({ home: '/Users/Synthetic User', root: '/private/tmp/synthetic app', node: '/private/tmp/Node & Tools/node', uid: 501 });
test('login job renders explicit paths, local workspace, private logs and crash-only recovery with XML escaping', () => {
  const config = spec();
  const plist = renderPlist(config);
  expect(plist).toContain('/private/tmp/Node &amp; Tools/node');
  expect(plist).toContain('<key>SuccessfulExit</key><false/>');
  expect(plist).toContain('<key>RunAtLoad</key><true/>');
  expect(plist).toContain('/Users/Synthetic User/.fpvbench');
  expect(plist).not.toContain('apiKey');
  expect(config.url).toBe('http://127.0.0.1:4173');
  expect(config.target).toBe('gui/501/local.fpvbench.server');
  const onDemand = serviceSpec({ ...config, login: false });
  expect(onDemand.plist).toContain('/Application Support/FPVBench/');
  expect(onDemand.plist).not.toContain('/LaunchAgents/');
  for (const port of [0, 65536, '4173']) expect(() => serviceSpec({ ...config, port })).toThrow();
  expect(() => serviceSpec({ ...config, root: 'relative' })).toThrow();
});

test('clickable launcher quotes paths as data rather than shell or AppleScript instructions', () => {
  expect(shellQuote("a'b $x $(touch bad)")).toBe("'a'\\''b $x $(touch bad)'");
  const source = launcherSource({ ...spec(), node: '/tmp/a "quoted" node' });
  expect(source).toContain('\\"quoted\\"');
  expect(source).toContain('do shell script');
  expect(source).toContain(' open');
});

test('manual takeover accepts only this repository server and exact working directory', () => {
  const config = spec();
  expect(isManualServer(config, { cwd: config.root, command: 'node src/server.mjs' })).toBe(true);
  for (const identity of [
    { cwd: '/somewhere/else', command: 'node src/server.mjs' },
    { cwd: config.root, command: 'node another-server.mjs' },
    { cwd: config.root, command: 'node -e "anything" src/server.mjs' },
    { cwd: config.root, command: 'python src/server.mjs' },
  ]) expect(isManualServer(config, identity)).toBe(false);
});

function harness({ owner = null, loaded = false, ready = false } = {}) {
  const actions = [];
  const io = {
    loaded: async () => loaded,
    pid: async () => loaded ? 100 : null,
    owner: async () => owner,
    ready: async () => ready,
    launch: async action => { actions.push(action); if (action === 'bootout') { loaded = false; owner = null; ready = false; } else { loaded = true; ready = true; } },
    waitStopped: async () => { actions.push('wait-stopped'); },
    waitReady: async () => { actions.push('wait-ready'); },
  };
  return { controller: createServiceController(spec(), io), actions };
}
test('start and open reuse a ready service without spawning a second server', async () => {
  const { controller, actions } = harness({ loaded: true, ready: true });
  await controller.start();
  expect(actions).toEqual([]);
});
test('start refuses a live manual owner and restart waits for shutdown before bootstrapping', async () => {
  const manual = harness({ owner: { pid: 100, token: 'synthetic' } });
  await expect(manual.controller.start()).rejects.toThrow(/manual|another server/i);
  expect(manual.actions).toEqual([]);
  const conflicting = harness({ loaded: true, owner: { pid: 200, token: 'other-owner' } });
  await expect(conflicting.controller.start()).rejects.toThrow(/manual|another server/i);
  expect(conflicting.actions).toEqual([]);
  const managed = harness({ loaded: true, owner: { pid: 100, token: 'synthetic' } });
  await managed.controller.restart();
  expect(managed.actions).toEqual(['bootout', 'wait-stopped', 'bootstrap', 'wait-ready']);
});
