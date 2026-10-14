import { open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export async function acquireLock(dataDir) {
  const filename = join(dataDir, ".workspace.lock");
  const owner = { pid: process.pid, token: randomUUID() };
  const ownerText = JSON.stringify(owner);
  const alive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error.code !== "ESRCH";
    }
  };
  const create = async () => {
    const handle = await open(filename, "wx", 0o600);
    try {
      await handle.writeFile(ownerText);
    } finally {
      await handle.close();
    }
  };
  try {
    await create();
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    // Serialize recovery so only one process may remove a stale lock.
    const recovery = join(dataDir, ".workspace-recovery.lock");
    let handle;
    try {
      handle = await open(recovery, "wx", 0o600);
      let previous;
      try {
        previous = JSON.parse(await readFile(filename, "utf8"));
      } catch (readError) {
        throw new Error(
          "Workspace lock is unreadable or recovery is in progress. Stop other servers before inspecting the lock.",
          { cause: readError },
        );
      }
      if (
        !Number.isSafeInteger(previous.pid) ||
        previous.pid < 1 ||
        typeof previous.token !== "string"
      )
        throw new Error(
          "Workspace lock is invalid. Preserve and inspect it while servers are stopped.",
          { cause: error },
        );
      if (alive(previous.pid))
        throw new Error(
          "Workspace is already open in another server. Use a different data directory or stop that server.",
          { cause: error },
        );
      await unlink(filename);
      await create();
    } catch (recoveryError) {
      if (recoveryError.code === "EEXIST")
        throw new Error(
          "Workspace is already open or lock recovery is in progress.",
          { cause: recoveryError },
        );
      throw recoveryError;
    } finally {
      if (handle) {
        await handle.close();
        await unlink(recovery).catch(() => {});
      }
    }
  }
  return async () => {
    try {
      if ((await readFile(filename, "utf8")) === ownerText)
        await unlink(filename);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  };
}

