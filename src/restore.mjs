import { readFile, writeFile, mkdir, rename, unlink, rm, stat, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { acquireLock } from './workspace-lock.mjs';
import { validateWorkspace, objectInput } from './workspace-validation.mjs';
import { decodeOriginalBase64, validateTelemetry, safeOriginal } from './store.mjs';

/** Validate a complete v2/v3 catalog, telemetry and exact original bytes before restoring. */
export function validateCompleteBackup(backup) {
  objectInput(backup, ['version', 'aircraft', 'snapshots', 'sessions', 'flightLogs', 'originals', 'telemetry']);
  const { originals, telemetry, ...catalog } = structuredClone(backup);
  if (![2, 3].includes(catalog.version)) throw new Error('A complete version 2 or 3 backup is required.');
  validateWorkspace(catalog); catalog.version = 3; validateTelemetry(catalog, telemetry);
  if (!Array.isArray(originals) || originals.length !== catalog.flightLogs.length) throw new Error('The backup is missing original flight bytes.');
  const seen = new Set(), decodedOriginals = [];
  for (const item of originals) {
    objectInput(item, ['flightLogId', 'contentBase64']);
    const log = catalog.flightLogs.find(log => log.id === item.flightLogId);
    if (!log || seen.has(log.id)) throw new Error('Invalid or duplicate backup original.');
    seen.add(log.id);
    const bytes = decodeOriginalBase64(item.contentBase64);
    if (bytes.length !== log.byteLength || createHash('sha256').update(bytes).digest('hex') !== log.sha256) throw new Error('Backup original checksum or size does not match.');
    decodedOriginals.push({ log, bytes });
  }
  return { catalog, telemetry, decodedOriginals };
}

/** Explicit local restore: validate, retain a complete backup, stage, then replace SQLite atomically. */
export async function restoreBackup(dataDir, backup) {
  const { catalog, telemetry, decodedOriginals } = validateCompleteBackup(backup);
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const release = await acquireLock(dataDir);
  const staging = join(dataDir, `.restore-${randomUUID()}`), newlyCreated = [];
  let current, staged, backupPath = null;
  try {
    const { createSqliteRepository } = await import('./sqlite-repository.mjs');
    let hasDatabase = false;
    try { await stat(join(dataDir, 'workspace.sqlite')); hasDatabase = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (hasDatabase) {
      current = await createSqliteRepository(dataDir);
      const previous = await current.load();
      if (previous === null) throw new Error('The existing database is not initialized; preserve it before restoring into an empty directory.');
      validateWorkspace(previous);
      const previousTelemetry = await current.exportTelemetry(); validateTelemetry(previous, previousTelemetry);
      const originals = [];
      for (const log of previous.flightLogs) originals.push({ flightLogId: log.id, contentBase64: (await safeOriginal(dataDir, log)).toString('base64') });
      const complete = { ...previous, originals, telemetry: previousTelemetry }; validateCompleteBackup(complete);
      backupPath = join(dataDir, `workspace-before-restore-${Date.now()}-${randomUUID()}.json`);
      await writeFile(backupPath, JSON.stringify(complete, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      await current.close(); current = null;
    } else {
      try {
        const legacyRaw = await readFile(join(dataDir, 'workspace.json'));
        validateWorkspace(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(legacyRaw)));
        backupPath = join(dataDir, `workspace-before-restore-v1-${Date.now()}-${randomUUID()}.json.bak`);
        await writeFile(backupPath, legacyRaw, { flag: 'wx', mode: 0o600 });
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    await mkdir(staging, { mode: 0o700 });
    staged = await createSqliteRepository(staging);
    await staged.save(catalog, null);
    for (const item of telemetry) await staged.save(catalog, catalog, { telemetry: item });
    if (!isDeepStrictEqual(await staged.load(), catalog)) throw new Error('Staged restoration failed catalog verification.');
    validateTelemetry(catalog, await staged.exportTelemetry());
    await staged.close(); staged = null;
    await mkdir(join(dataDir, 'imports'), { recursive: true, mode: 0o700 });
    const importsInfo = await lstat(join(dataDir, 'imports'));
    if (!importsInfo.isDirectory() || importsInfo.isSymbolicLink()) throw new Error('Unsafe original imports directory.');
    for (const { log, bytes } of decodedOriginals) {
      const path = join(dataDir, 'imports', `${log.sha256}.bin`);
      try { await writeFile(path, bytes, { flag: 'wx', mode: 0o600 }); newlyCreated.push(path); }
      catch (error) { if (error.code !== 'EEXIST') throw error; await safeOriginal(dataDir, log); }
    }
    await rename(join(staging, 'workspace.sqlite'), join(dataDir, 'workspace.sqlite'));
    return { backupPath, aircraft: catalog.aircraft.length, snapshots: catalog.snapshots.length, sessions: catalog.sessions.length, flightLogs: catalog.flightLogs.length };
  } catch (error) {
    for (const path of newlyCreated) await unlink(path).catch(() => {});
    throw error;
  } finally {
    await current?.close(); await staged?.close();
    await rm(staging, { recursive: true, force: true }); await release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node src/restore.mjs /absolute/path/to/complete-backup.json');
    const backup = JSON.parse(await readFile(resolve(process.argv[2]), 'utf8'));
    const result = await restoreBackup(process.env.FPVBENCH_DATA_DIR || join(homedir(), '.fpvbench'), backup);
    console.log(`Restored ${result.aircraft} aircraft, ${result.snapshots} snapshots, ${result.sessions} sessions and ${result.flightLogs} flight logs.`);
    if (result.backupPath) console.log(`Previous workspace retained at ${result.backupPath}`);
  } catch (error) {
    console.error(`Restore stopped: ${error.message}`); process.exitCode = 1;
  }
}
