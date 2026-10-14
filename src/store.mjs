import {
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
  open,
} from "node:fs/promises";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { AppError, assertSafeObject, containsControlText } from "./errors.mjs";
import { parseExport } from "./parser.mjs";
import { summarizeSnapshot } from "./compare.mjs";

const aircraftFields = ["name", "kind", "notes", "baselineSnapshotId"];
const sessionFields = [
  "aircraftId",
  "snapshotId",
  "title",
  "flownAt",
  "location",
  "durationMinutes",
  "battery",
  "props",
  "conditions",
  "notes",
  "outcome",
  "mediaRefs",
  "confirmedSetup",
];
const hash = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const copy = (object) => structuredClone(object);
const timestamp = () => new Date().toISOString();

function objectInput(input, allowed) {
  assertSafeObject(input);
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new AppError("A JSON object is required.");
  for (const key of Object.keys(input))
    if (!allowed.includes(key))
      throw new AppError(`Unsupported field: ${key}.`);
}
function textField(value, field, { required = false, max = 10000 } = {}) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    containsControlText(value)
  )
    throw new AppError(`${field} must be text of at most ${max} characters.`);
  if (required && !value.trim()) throw new AppError(`${field} is required.`);
  return value;
}
function isoDate(value, field) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new AppError(
      `${field} must be an ISO date and time with a timezone.`,
    );
  // Date.parse normalizes February 30: reject invalid calendar days explicitly.
  const [, year, month, day] = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (
    Number(month) < 1 ||
    Number(month) > 12 ||
    Number(day) < 1 ||
    Number(day) >
      new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()
  )
    throw new AppError(`${field} contains an invalid date.`);
  return value;
}
function identifier(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
function getRecord(state, collection, id) {
  const found = state[collection].find((record) => record.id === id);
  if (!found) throw new AppError("The requested record was not found.", 404);
  return found;
}
function snapshotRelationship(state, aircraftId, snapshotId) {
  getRecord(state, "aircraft", aircraftId);
  if (snapshotId !== null) {
    if (typeof snapshotId !== "string")
      throw new AppError("snapshotId must be an ID or null.");
    const snapshot = getRecord(state, "snapshots", snapshotId);
    if (snapshot.aircraftId !== aircraftId)
      throw new AppError("The snapshot must belong to the same aircraft.");
  }
}
function validateAircraft(state, record) {
  textField(record.name, "name", { required: true, max: 200 });
  textField(record.kind, "kind", { max: 200 });
  textField(record.notes, "notes");
  snapshotRelationship(state, record.id, record.baselineSnapshotId);
}
function validateSession(state, record) {
  snapshotRelationship(state, record.aircraftId, record.snapshotId);
  textField(record.title, "title", { required: true, max: 200 });
  isoDate(record.flownAt, "flownAt");
  for (const field of ["location", "battery", "props", "conditions"])
    textField(record[field], field, { max: 1000 });
  textField(record.notes, "notes");
  if (
    record.durationMinutes !== null &&
    (typeof record.durationMinutes !== "number" ||
      !Number.isFinite(record.durationMinutes) ||
      record.durationMinutes < 0 ||
      record.durationMinutes > 1440)
  )
    throw new AppError(
      "durationMinutes must be null or a number from 0 to 1440.",
    );
  if (!["unrated", "better", "same", "worse"].includes(record.outcome))
    throw new AppError("Choose a valid outcome.");
  if (typeof record.confirmedSetup !== "boolean")
    throw new AppError("confirmedSetup must be a boolean.");
  if (!Array.isArray(record.mediaRefs) || record.mediaRefs.length > 100)
    throw new AppError(
      "mediaRefs must be an array of at most 100 text references.",
    );
  record.mediaRefs.forEach((value) =>
    textField(value, "media reference", { required: true, max: 2000 }),
  );
}
function validateWorkspace(state) {
  objectInput(state, ["version", "aircraft", "snapshots", "sessions"]);
  if (
    state.version !== 1 ||
    !["aircraft", "snapshots", "sessions"].every((key) =>
      Array.isArray(state[key]),
    )
  )
    throw new Error("Unsupported workspace schema.");
  const ids = new Set();
  for (const collection of ["aircraft", "snapshots", "sessions"]) {
    for (const record of state[collection]) {
      if (!record || !identifier(record.id) || ids.has(record.id))
        throw new Error("Invalid or duplicate record ID.");
      ids.add(record.id);
      isoDate(
        collection === "snapshots" ? record.importedAt : record.createdAt,
        "record timestamp",
      );
      if (collection === "aircraft") {
        objectInput(record, ["id", ...aircraftFields, "createdAt"]);
        validateAircraft(state, record);
      }
      if (collection === "sessions") {
        objectInput(record, ["id", ...sessionFields, "createdAt"]);
        validateSession(state, record);
      }
      if (collection === "snapshots") {
        objectInput(record, [
          "id",
          "aircraftId",
          "label",
          "notes",
          "filename",
          "importedAt",
          "sha256",
          "rawText",
          "parsed",
        ]);
        getRecord(state, "aircraft", record.aircraftId);
        textField(record.label, "label", { required: true, max: 200 });
        textField(record.notes, "notes");
        textField(record.filename, "filename", { required: true, max: 255 });
        if (hash(record.rawText) !== record.sha256)
          throw new Error("Snapshot checksum mismatch.");
        const expected = parseExport(record.rawText),
          actual = copy(record.parsed);
        if (!Array.isArray(actual.warnings))
          throw new Error("Invalid snapshot parser schema.");
        actual.warnings = actual.warnings.filter(
          (warning) =>
            warning !==
            "An identical export has already been imported for this aircraft.",
        );
        if (JSON.stringify(expected) !== JSON.stringify(actual))
          throw new Error("Invalid snapshot parsed evidence.");
      }
    }
  }
}

async function acquireLock(dataDir) {
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

/** Open a private, versioned JSON workspace. Corrupt data is never overwritten. */
export async function createStore(dataDir) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const releaseLock = await acquireLock(dataDir);
  const file = join(dataDir, "workspace.json");
  let state = { version: 1, aircraft: [], snapshots: [], sessions: [] };
  let exists = false;
  try {
    const raw = await readFile(file, "utf8");
    exists = true;
    state = JSON.parse(raw);
    validateWorkspace(state);
  } catch (error) {
    if (error.code !== "ENOENT" || exists) {
      await releaseLock();
      throw new Error(
        "Cannot open workspace: invalid or unreadable data. Preserve the file and restore a valid backup before restarting.",
        { cause: error },
      );
    }
  }
  async function persist(next) {
    const temporary = join(dataDir, `.workspace-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(next, null, 2) + "\n", {
        mode: 0o600,
        flag: "wx",
      });
      await rename(temporary, file);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }
  if (!exists) {
    try {
      await persist(state);
    } catch (error) {
      await releaseLock();
      throw error;
    }
  }
  let queue = Promise.resolve();
  let closed = false;
  let closePromise;
  const mutate = (operation) => {
    if (closed) return Promise.reject(new AppError("Workspace is closed."));
    const work = queue.then(async () => {
      const next = copy(state);
      const result = operation(next);
      await persist(next);
      state = next;
      return copy(result);
    });
    queue = work.catch(() => {});
    return work;
  };
  return {
    close: () => {
      if (!closePromise) {
        closed = true;
        closePromise = queue.then(releaseLock);
      }
      return closePromise;
    },
    getState: () =>
      copy({
        aircraft: state.aircraft,
        snapshots: state.snapshots.map(summarizeSnapshot),
        sessions: state.sessions,
      }),
    getSnapshot: (id) => copy(getRecord(state, "snapshots", id)),
    exportWorkspace: () => copy(state),
    createAircraft: (input) =>
      mutate((next) => {
        objectInput(
          input,
          aircraftFields.filter((field) => field !== "baselineSnapshotId"),
        );
        const record = {
          id: randomUUID(),
          name: input.name,
          kind: input.kind ?? "",
          notes: input.notes ?? "",
          baselineSnapshotId: null,
          createdAt: timestamp(),
        };
        next.aircraft.push(record);
        validateAircraft(next, record);
        return record;
      }),
    updateAircraft: (id, input) =>
      mutate((next) => {
        objectInput(input, aircraftFields);
        const record = getRecord(next, "aircraft", id);
        Object.assign(record, input);
        validateAircraft(next, record);
        return record;
      }),
    importSnapshot: (input) =>
      mutate((next) => {
        objectInput(input, [
          "aircraftId",
          "label",
          "filename",
          "rawText",
          "notes",
        ]);
        getRecord(next, "aircraft", input.aircraftId);
        textField(input.label, "label", { required: true, max: 200 });
        textField(input.filename, "filename", { required: true, max: 255 });
        const notes = textField(input.notes ?? "", "notes");
        const parsed = parseExport(input.rawText);
        const sha256 = hash(input.rawText);
        if (
          next.snapshots.some(
            (snapshot) =>
              snapshot.aircraftId === input.aircraftId &&
              snapshot.sha256 === sha256,
          )
        )
          parsed.warnings.push(
            "An identical export has already been imported for this aircraft.",
          );
        const record = {
          id: randomUUID(),
          aircraftId: input.aircraftId,
          label: input.label,
          notes,
          filename: input.filename,
          importedAt: timestamp(),
          sha256,
          rawText: input.rawText,
          parsed,
        };
        next.snapshots.push(record);
        return record;
      }),
    createSession: (input) =>
      mutate((next) => {
        objectInput(input, sessionFields);
        const record = {
          id: randomUUID(),
          aircraftId: input.aircraftId,
          snapshotId: null,
          title: input.title,
          flownAt: input.flownAt,
          location: "",
          durationMinutes: null,
          battery: "",
          props: "",
          conditions: "",
          notes: "",
          outcome: "unrated",
          mediaRefs: [],
          confirmedSetup: false,
          ...input,
          createdAt: timestamp(),
        };
        validateSession(next, record);
        next.sessions.push(record);
        return record;
      }),
    updateSession: (id, input) =>
      mutate((next) => {
        objectInput(input, sessionFields);
        const record = getRecord(next, "sessions", id);
        Object.assign(record, input);
        validateSession(next, record);
        return record;
      }),
  };
}
