import { mkdir, lstat, open, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/** Reject linked or permissively accessible AI credential/state locations. */
export async function ensurePrivateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) throw new Error('AI data requires a private directory owned by the current user.');
}

async function inspect(path) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) throw new Error('AI credential/state files must be private regular files.');
    return info;
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/** Read bounded private JSON without following symlinks. Missing files return null. */
export async function readPrivateJson(directory, name, maxBytes = 65536) {
  const path = join(directory, name), info = await inspect(path);
  if (!info) return null;
  if (info.size > maxBytes) throw new Error('AI state file exceeds its size limit.');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (opened.ino !== info.ino || opened.dev !== info.dev) throw new Error('AI state changed while being opened.');
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await handle.readFile()));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid private AI JSON object.');
    return value;
  } finally { await handle.close(); }
}

/** Atomically replace owner-private JSON; never follow a credential-file symlink. */
export async function writePrivateJson(directory, name, value) {
  await ensurePrivateDirectory(directory);
  await inspect(join(directory, name));
  const temporary = join(directory, `.ai-write-${randomUUID()}.tmp`);
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(value) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, join(directory, name));
    const parent = await open(directory, constants.O_RDONLY);
    try { await parent.sync(); } finally { await parent.close(); }
  } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}
