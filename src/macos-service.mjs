import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, chmod, lstat, rm, rmdir, realpath, access } from 'node:fs/promises';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const execFile = promisify(execFileCallback);
const LABEL = 'local.fpvbench.server';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const cleanPath = value => {
  if (typeof value !== 'string' || !isAbsolute(value) || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new Error('Use an absolute path without control characters.');
  return value;
};
export const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

/** One user-owned local service. Install-specific paths are generated, never committed. */
export function serviceSpec({ home, root, node, uid, port = 4173, dataDir = join(home, '.fpvbench'), login = true }) {
  for (const value of [home, root, node, dataDir]) cleanPath(value);
  if (!Number.isSafeInteger(uid) || uid < 1 || !Number.isInteger(port) || port < 1 || port > 65535 || typeof login !== 'boolean') throw new Error('Invalid service user, port or login choice.');
  const support = join(home, 'Library', 'Application Support', 'FPVBench');
  const logs = join(home, 'Library', 'Logs', 'FPVBench');
  return { home, root, node, uid, port, dataDir, login, support, logs, label: LABEL, domain: 'gui/' + uid,
    target: 'gui/' + uid + '/' + LABEL, plist: join(login ? join(home, 'Library', 'LaunchAgents') : support, LABEL + '.plist'),
    manifest: join(support, 'launch-config.json'), app: join(home, 'Applications', 'FPVBench.app'), controls: join(home, 'Applications', 'FPVBench Controls'),
    cli: join(root, 'src', 'macos-service.mjs'), entry: join(root, 'src', 'server.mjs'), url: 'http://127.0.0.1:' + port };
}

export function renderPlist(config) {
  const string = value => '<string>' + xml(value) + '</string>';
  return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>' +
    '<key>Label</key>' + string(config.label) + '<key>ProgramArguments</key><array>' + [config.node, config.entry].map(string).join('') + '</array>' +
    '<key>WorkingDirectory</key>' + string(config.root) + '<key>EnvironmentVariables</key><dict><key>FPVBENCH_DATA_DIR</key>' + string(config.dataDir) +
    '<key>PORT</key>' + string(config.port) + '</dict>' +
    '<key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>ThrottleInterval</key><integer>10</integer>' +
    '<key>ExitTimeOut</key><integer>30</integer><key>Umask</key><integer>63</integer>' +
    '<key>StandardOutPath</key>' + string(join(config.logs, 'server.log')) + '<key>StandardErrorPath</key>' + string(join(config.logs, 'server-error.log')) +
    '</dict></plist>\n';
}

export function launcherSource(config) {
  const command = [config.node, config.cli].map(shellQuote).join(' ') + ' open';
  return ['try', 'do shell script ' + JSON.stringify(command), 'on error messageText',
    'display alert "FPVBench" message messageText as critical', 'end try', ''].join('\n');
}

export function isManualServer(config, { cwd, command }) {
  const entries = ['src/server.mjs', config.entry];
  return cwd === config.root && ['node', config.node].some(node => entries.some(entry => command === node + ' ' + entry));
}

/** Lifecycle ordering with injectable OS operations; tests never signal or register jobs. */
export function createServiceController(config, io) {
  const stop = async () => {
    if (!await io.loaded()) return;
    const owner = await io.owner();
    const managedPid = await io.pid();
    await io.launch('bootout');
    await io.waitStopped(owner?.pid === managedPid ? owner : managedPid ? { pid: managedPid } : null);
  };
  const start = async () => {
    const loaded = await io.loaded();
    if (loaded && await io.ready()) return;
    const owner = await io.owner();
    if (owner && (!loaded || owner.pid !== await io.pid())) throw new Error('The workspace is open in a manual or another server. Stop that server before starting the background service.');
    await io.launch(loaded ? 'kickstart' : 'bootstrap');
    await io.waitReady();
  };
  return { start, stop, restart: async () => { await stop(); await start(); } };
}

async function privateDirectory(path) {
  try { if ((await lstat(path)).isSymbolicLink()) throw new Error('A managed directory must not be a symbolic link.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
}
async function privateWrite(path, text, mode = 0o600) {
  try { if ((await lstat(path)).isSymbolicLink()) throw new Error('A managed file must not be a symbolic link.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(path, text, { mode }); await chmod(path, mode);
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; } };
async function liveOwner(config) {
  let owner;
  try { owner = JSON.parse(await readFile(join(config.dataDir, '.workspace.lock'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw new Error('The workspace lock cannot be inspected. Preserve it before repairing.', { cause: error }); }
  if (!Number.isSafeInteger(owner.pid) || owner.pid < 1 || typeof owner.token !== 'string') throw new Error('The workspace lock is invalid. Preserve it before repairing.');
  return alive(owner.pid) ? owner : null;
}
async function waitFor(check, message) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) { if (await check()) return; await sleep(200); }
  throw new Error(message);
}
function hostOperations(config) {
  const print = async () => {
    try { return (await execFile('/bin/launchctl', ['print', config.target])).stdout; }
    catch (error) {
      if (/Could not find service|Could not find specified service|service not found/i.test(error.stderr ?? '')) return null;
      throw new Error('Cannot inspect the FPVBench user service: ' + (error.stderr || error.message), { cause: error });
    }
  };
  const ready = async () => {
    const output = await print();
    const pid = Number(/^\s*pid = (\d+)/m.exec(output ?? '')?.[1]);
    if (!pid || (await liveOwner(config))?.pid !== pid) return false;
    try {
      const response = await fetch(config.url + '/api/health', { signal: AbortSignal.timeout(1500), redirect: 'error' });
      return response.ok && (await response.json()).application === 'FPVBench';
    } catch { return false; }
  };
  return {
    print, ready, owner: () => liveOwner(config), loaded: async () => await print() !== null,
    pid: async () => Number(/^\s*pid = (\d+)/m.exec(await print() ?? '')?.[1]) || null,
    launch: async action => {
      const args = action === 'bootstrap' ? [action, config.domain, config.plist] : [action, config.target];
      await execFile('/bin/launchctl', args);
    },
    waitStopped: owner => waitFor(async () => !owner || !alive(owner.pid), 'FPVBench did not stop within 20 seconds. No forced kill was made.'),
    waitReady: () => waitFor(ready, 'FPVBench did not become ready. Inspect ' + join(config.logs, 'server-error.log')),
  };
}
async function loadInstalled(home) {
  const path = join(home, 'Library', 'Application Support', 'FPVBench', 'launch-config.json');
  let value;
  try { value = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw new Error('Cannot read the installed service configuration. Preserve it before repair.', { cause: error }); }
  if (value.managedVersion !== 1 || typeof value.root !== 'string' || typeof value.node !== 'string' || typeof value.dataDir !== 'string' || !Number.isInteger(value.port) || typeof value.login !== 'boolean')
    throw new Error('Unsupported installed service configuration.');
  return serviceSpec({ home, uid: process.getuid(), root: value.root, node: value.node, port: value.port, dataDir: value.dataDir, login: value.login });
}
async function takeOver(config) {
  const owner = await liveOwner(config);
  if (!owner) return;
  const [processInfo, directoryInfo] = await Promise.all([
    execFile('/bin/ps', ['-p', String(owner.pid), '-o', 'args=']),
    execFile('/usr/sbin/lsof', ['-a', '-p', String(owner.pid), '-d', 'cwd', '-Fn']),
  ]);
  const identity = { command: processInfo.stdout.trim(), cwd: directoryInfo.stdout.split('\n').find(line => line.startsWith('n'))?.slice(1) };
  if (!isManualServer(config, identity)) throw new Error('The live workspace owner is not the verified FPVBench server in this repository. Stop it manually.');
  const latest = await liveOwner(config);
  if (latest?.pid !== owner.pid || latest?.token !== owner.token) throw new Error('Workspace ownership changed; takeover stopped.');
  process.kill(owner.pid, 'SIGTERM');
  await waitFor(async () => !alive(owner.pid), 'The manual server did not stop. No forced kill was made.');
}

async function install(home, args) {
  const previous = await loadInstalled(home);
  const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  const config = serviceSpec({ home, root, node: process.execPath, uid: process.getuid(), port: Number(process.env.PORT ?? 4173), dataDir: resolve(process.env.FPVBENCH_DATA_DIR || join(home, '.fpvbench')), login: !args.includes('--no-login') });
  await access(config.entry); await access(join(root, 'node_modules', 'dji-log-parser-js'));
  if (!previous) {
    for (const path of [config.app, config.plist, config.controls]) {
      try { await lstat(path); throw new Error('An unowned FPVBench installation already exists at ' + path); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  if (!previous && await liveOwner(config) && !args.includes('--take-over')) throw new Error('Stop the manual FPVBench server first, or use install --take-over for a verified handoff.');
  if (previous) {
    if ((await lstat(config.app)).isSymbolicLink() || (await readFile(join(config.app, 'Contents', '.fpvbench-managed'), 'utf8')).trim() !== 'FPVBench launcher version 1')
      throw new Error('Existing launcher ownership cannot be verified.');
  }
  for (const path of [config.support, config.logs, config.controls]) await privateDirectory(path);
  await mkdir(dirname(config.plist), { recursive: true });
  for (const name of ['server.log', 'server-error.log']) {
    const path = join(config.logs, name);
    try { if ((await lstat(path)).isSymbolicLink()) throw new Error('Log files must not be symbolic links.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await writeFile(path, '', { flag: 'a', mode: 0o600 }); await chmod(path, 0o600);
  }
  await privateWrite(config.plist, renderPlist(config));
  await execFile('/usr/bin/plutil', ['-lint', config.plist]);
  const source = join(config.support, 'launcher.applescript');
  await privateWrite(source, launcherSource(config));
  await execFile('/usr/bin/osacompile', ['-o', config.app, source]);
  await privateWrite(join(config.app, 'Contents', '.fpvbench-managed'), 'FPVBench launcher version 1\n');
  for (const [name, action] of [['Start FPVBench', 'start'], ['Stop FPVBench', 'stop'], ['Restart FPVBench', 'restart'], ['FPVBench Status', 'status']]) {
    const command = [config.node, config.cli].map(shellQuote).join(' ') + ' ' + action;
    await privateWrite(join(config.controls, name + '.command'), '#!/bin/bash\nset -euo pipefail\n' + command + '\nprintf "\\nYou can close this window. The background service is independent.\\n"\n', 0o700);
  }
  const manifest = { managedVersion: 1, root: config.root, node: config.node, port: config.port, dataDir: config.dataDir, login: config.login };
  await privateWrite(config.manifest, JSON.stringify(manifest, null, 2) + '\n');
  // All launch artifacts are compiled and checked before handing off a live server.
  if (previous) await createServiceController(previous, hostOperations(previous)).stop();
  if (await liveOwner(config)) {
    if (!args.includes('--take-over')) throw new Error('A manual server owns this workspace. Stop it before starting the installed service.');
    await takeOver(config);
  }
  if (previous && previous.plist !== config.plist) await rm(previous.plist);
  await createServiceController(config, hostOperations(config)).start();
  console.log('FPVBench is running in the background at ' + config.url + '\nStart at login: ' + (config.login ? 'enabled' : 'disabled') + '\nLauncher: ' + config.app + '\nControls: ' + config.controls);
}

export async function runMacosService(args = process.argv.slice(2)) {
  if (process.platform !== 'darwin') throw new Error('These service controls require macOS.');
  const [action, ...options] = args;
  if (!['install', 'start', 'stop', 'restart', 'status', 'open', 'uninstall'].includes(action) || options.some(option => action !== 'install' || !['--take-over', '--no-login'].includes(option))) throw new Error('Use install [--take-over] [--no-login], start, stop, restart, status, open or uninstall.');
  const home = homedir();
  if (action === 'install') return install(home, options);
  const config = await loadInstalled(home);
  if (!config) throw new Error('Install the macOS service first: npm run service:install');
  const io = hostOperations(config), controller = createServiceController(config, io);
  if (action === 'status') {
    const loaded = await io.loaded(), ready = loaded && await io.ready();
    console.log('FPVBench: ' + (ready ? 'running' : loaded ? 'loaded, not ready' : 'stopped') + '\nStart at login: ' + (config.login ? 'enabled' : 'disabled') + '\nURL: ' + config.url + '\nLogs: ' + config.logs);
    return;
  }
  if (action === 'uninstall') {
    await controller.stop();
    if ((await readFile(join(config.app, 'Contents', '.fpvbench-managed'), 'utf8')).trim() !== 'FPVBench launcher version 1') throw new Error('Launcher ownership cannot be verified; preserve it before removing it manually.');
    await rm(config.plist);
    await rm(config.app, { recursive: true });
    for (const name of ['Start FPVBench', 'Stop FPVBench', 'Restart FPVBench', 'FPVBench Status']) await rm(join(config.controls, name + '.command'));
    await rmdir(config.controls).catch(error => { if (!['ENOTEMPTY', 'ENOENT'].includes(error.code)) throw error; });
    await rm(config.manifest); await rm(join(config.support, 'launcher.applescript'));
    console.log('Login service and launcher removed. Workspace data and logs preserved.');
    return;
  }
  if (action === 'open') { await controller.start(); await execFile('/usr/bin/open', [config.url]); }
  else await controller[action]();
  console.log(action === 'stop' ? 'FPVBench stopped for this login session. It will start at your next login if enabled.' : 'FPVBench is ready at ' + config.url);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runMacosService().catch(error => { console.error(error.message); process.exitCode = 1; });
}
