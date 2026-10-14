import { mkdir, readFile, writeFile, unlink, lstat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { AppError } from './errors.mjs';
import { parseExport } from './parser.mjs';
import { summarizeSnapshot } from './compare.mjs';
import { acquireLock } from './workspace-lock.mjs';
import { aircraftFields, sessionFields, objectInput, textField, getRecord, validateAircraft, validateSession, validateWorkspace, validateFlightLog, validateFrames } from './workspace-validation.mjs';

const copy = value => structuredClone(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const timestamp = () => new Date().toISOString();
export const MAX_FLIGHT_BYTES = 25 * 1024 * 1024;

/** Decode a canonical base64 original with an explicit binary size bound. */
export function decodeOriginalBase64(value) {
  if (typeof value !== 'string' || !value.length) throw new AppError('Flight content must be canonical non-empty base64.');
  if (value.length > 4 * Math.ceil(MAX_FLIGHT_BYTES / 3)) throw new AppError('Flight records must be 25 MiB or smaller.', 413);
  if (value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value)) throw new AppError('Flight content must be canonical non-empty base64.');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > MAX_FLIGHT_BYTES) throw new AppError('Flight records must be 25 MiB or smaller.', 413);
  if (bytes.toString('base64') !== value) throw new AppError('Invalid base64 flight content.');
  return bytes;
}

/** Preserve validated legacy IDs and payloads in the v2 catalog. */
export function migrateLegacyCatalog(legacy) {
  validateWorkspace(legacy);
  if (legacy.version !== 1) throw new Error('Expected a version 1 legacy workspace.');
  return { version: 3, aircraft: copy(legacy.aircraft), snapshots: copy(legacy.snapshots), sessions: legacy.sessions.map(session => ({ ...copy(session), flightLogId: null })), flightLogs: [] };
}

export async function safeOriginal(dataDir, log) {
  if (!/^[a-f0-9]{64}$/.test(log.sha256)) throw new Error('Invalid original checksum path.');
  const imports = join(dataDir, 'imports');
  const directory = await lstat(imports);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Unsafe original imports directory.');
  const path = join(imports, `${log.sha256}.bin`);
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size !== log.byteLength || info.size > MAX_FLIGHT_BYTES) throw new Error('Original flight file is missing or invalid.');
  const handle = await open(path, 'r');
  try {
    const opened = await handle.stat();
    if (opened.ino !== info.ino || opened.dev !== info.dev) throw new Error('Original flight file changed during reading.');
    const bytes = await handle.readFile();
    if (hash(bytes) !== log.sha256) throw new Error('Original flight checksum does not match.');
    return bytes;
  } finally { await handle.close(); }
}

/** Open one-owner catalog storage; repository injection keeps automated checks database-free. */
export async function createStore(dataDir, { repositoryFactory, decodeFlight } = {}) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const releaseLock = await acquireLock(dataDir);
  let repository, state;
  try {
    const factory = repositoryFactory ?? (await import('./sqlite-repository.mjs')).createSqliteRepository;
    repository = await factory(dataDir);
    state = await repository.load();
    if (state === null) {
      let legacyRaw = null;
      try { legacyRaw = await readFile(join(dataDir, 'workspace.json')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (legacyRaw !== null) {
        state = migrateLegacyCatalog(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(legacyRaw)));
        const backup = join(dataDir, `workspace-v1-${Date.now()}-${randomUUID()}.json.bak`);
        await writeFile(backup, legacyRaw, { flag: 'wx', mode: 0o600 });
      } else state = { version: 3, aircraft: [], snapshots: [], sessions: [], flightLogs: [] };
      validateWorkspace(state);
      await repository.save(state, null);
    } else {
      validateWorkspace(state);
      if (![2, 3].includes(state.version)) throw new Error('Repository must contain a version 2 or 3 catalog.');
      if (state.version === 2) { const previous = copy(state); state.version = 3; await repository.save(state, previous); }
    }
    for (const log of state.flightLogs) await safeOriginal(dataDir, log);
    const telemetry = await repository.exportTelemetry();
    validateTelemetry(state, telemetry);
  } catch (error) {
    await repository?.close();
    await releaseLock();
    throw new Error('Cannot open workspace: invalid or unreadable data. Preserve it and restore a complete backup before restarting.', { cause: error });
  }
  let queue = Promise.resolve(), closed = false, closePromise;
  const mutate = operation => {
    if (closed) return Promise.reject(new AppError('Workspace is closed.'));
    const work = queue.then(async () => {
      const next = copy(state);
      const result = await operation(next);
      try { await repository.save(next, state, result.persistence ?? {}); }
      catch (error) { await result.rollback?.(); throw error; }
      state = next;
      return copy(result.value);
    });
    queue = work.catch(() => {});
    return work;
  };
  const sessionRecord = input => ({ id: randomUUID(), aircraftId: input.aircraftId, snapshotId: null, flightLogId: null, title: input.title, flownAt: input.flownAt, location: '', durationMinutes: null, battery: '', props: '', conditions: '', notes: '', outcome: 'unrated', mediaRefs: [], confirmedSetup: false, ...input, createdAt: timestamp() });
  const matchAircraft = (catalog, serial, source = {}) => {
    if (!serial) return [];
    const key = serial.trim().toLowerCase();
    const identifiers = aircraft => [aircraft.serialNumber, ...(aircraft.flightRecordSerials ?? [])].filter(value => typeof value === 'string' && value.trim()).map(value => value.trim().toLowerCase());
    const exact = catalog.aircraft.filter(aircraft => identifiers(aircraft).includes(key));
    if (exact.length) return exact;
    // The pinned TXT decoder's modern details block has a 16-byte aircraft-SN field.
    // Only the documented DJI 16/20-character form qualifies; collisions stay ambiguous.
    if (source.format !== 'dji-txt' || !Number.isInteger(source.logVersion) || source.logVersion < 6 || source.logVersion > 14 || !/^1581f[a-z0-9]{11}$/.test(key)) return [];
    return catalog.aircraft.filter(aircraft => identifiers(aircraft).some(value => /^1581f[a-z0-9]{15}$/.test(value) && value.startsWith(key)));
  };
  const attachSession = (catalog, log) => {
    const existing = catalog.sessions.find(session => session.flightLogId === log.id);
    if (existing) {
      if (existing.aircraftId !== log.aircraftId) Object.assign(existing, { aircraftId: log.aircraftId, snapshotId: null, confirmedSetup: false });
      validateSession(catalog, existing); return existing;
    }
    if (log.aircraftId === null || log.summary.startTime === null) return null;
    const session = sessionRecord({ aircraftId: log.aircraftId, flightLogId: log.id, title: `DJI flight ${log.summary.startTime.slice(0, 10)}`, flownAt: log.summary.startTime, durationMinutes: log.summary.durationSeconds === null ? null : log.summary.durationSeconds / 60, location: log.summary.location ?? '' });
    validateSession(catalog, session); catalog.sessions.push(session); return session;
  };
  const store = {
    close() {
      if (!closePromise) { closed = true; closePromise = queue.then(async () => { try { await repository.close(); } finally { await releaseLock(); } }); }
      return closePromise;
    },
    getState: () => copy({ aircraft: state.aircraft, snapshots: state.snapshots.map(summarizeSnapshot), sessions: state.sessions, flightLogs: state.flightLogs, storage: 'sqlite' }),
    getSnapshot: id => copy(getRecord(state, 'snapshots', id)),
    getFlightLog: id => copy(getRecord(state, 'flightLogs', id)),
    getFlightOriginal: id => safeOriginal(dataDir, getRecord(state, 'flightLogs', id)),
    async getFlightFrames(id, offset = 0, limit = 100) {
      const log = getRecord(state, 'flightLogs', id);
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new AppError('Use a non-negative integer offset and limit from 1 to 1000.');
      const frames = await repository.readFrames(id, offset, limit);
      validateFrames(frames);
      return { frames, total: log.frameCount, offset, limit };
    },
    async exportWorkspace() {
      const work = queue.then(async () => {
        const catalog = copy(state), originals = [];
        for (const log of catalog.flightLogs) originals.push({ flightLogId: log.id, contentBase64: (await safeOriginal(dataDir, log)).toString('base64') });
        const telemetry = await repository.exportTelemetry();
        validateTelemetry(catalog, telemetry);
        return { ...catalog, originals, telemetry: copy(telemetry) };
      });
      queue = work.catch(() => {});
      return work;
    },
    createAircraft: input => mutate(next => {
      objectInput(input, aircraftFields.filter(field => field !== 'baselineSnapshotId'));
      const record = { id: randomUUID(), name: input.name, kind: input.kind ?? '', registrationId: input.registrationId === undefined ? '' : input.registrationId, serialNumber: input.serialNumber === undefined ? '' : input.serialNumber, flightRecordSerials: input.flightRecordSerials === undefined ? [] : input.flightRecordSerials, notes: input.notes ?? '', baselineSnapshotId: null, createdAt: timestamp() };
      next.aircraft.push(record); validateAircraft(next, record); return { value: record };
    }),
    updateAircraft: (id, input) => mutate(next => {
      objectInput(input, aircraftFields); const record = getRecord(next, 'aircraft', id);
      Object.assign(record, input); validateAircraft(next, record); return { value: record };
    }),
    importSnapshot: input => mutate(next => {
      objectInput(input, ['aircraftId', 'label', 'filename', 'rawText', 'notes']);
      getRecord(next, 'aircraft', input.aircraftId);
      textField(input.label, 'label', { required: true, max: 200 }); textField(input.filename, 'filename', { required: true, max: 255 });
      const notes = textField(input.notes ?? '', 'notes'), parsed = parseExport(input.rawText), sha256 = hash(input.rawText);
      if (next.snapshots.some(snapshot => snapshot.aircraftId === input.aircraftId && snapshot.sha256 === sha256)) parsed.warnings.push('An identical export has already been imported for this aircraft.');
      const record = { id: randomUUID(), aircraftId: input.aircraftId, label: input.label, notes, filename: input.filename, importedAt: timestamp(), sha256, rawText: input.rawText, parsed };
      next.snapshots.push(record); return { value: record };
    }),
    createSession: input => mutate(next => {
      objectInput(input, sessionFields); const record = sessionRecord(input);
      validateSession(next, record); next.sessions.push(record); return { value: record };
    }),
    updateSession: (id, input) => mutate(next => {
      objectInput(input, sessionFields); const record = getRecord(next, 'sessions', id);
      Object.assign(record, input); validateSession(next, record); return { value: record };
    }),
    matchUnassignedFlightLogs: () => mutate(next => {
      let matched = 0;
      for (const log of next.flightLogs.filter(log => log.aircraftId === null)) {
        const matches = matchAircraft(next, log.summary.aircraftSerial, log);
        if (matches.length !== 1) continue;
        log.aircraftId = matches[0].id; attachSession(next, log); validateFlightLog(next, log); matched++;
      }
      return { value: { matched, unassigned: next.flightLogs.filter(log => log.aircraftId === null).length } };
    }),
    updateFlightLog: (id, input) => mutate(next => {
      objectInput(input, ['airdataStatus', 'aircraftId', 'rememberAircraft']);
      const record = getRecord(next, 'flightLogs', id);
      if (input.rememberAircraft !== undefined && typeof input.rememberAircraft !== 'boolean') throw new AppError('rememberAircraft must be a boolean.');
      if (input.rememberAircraft && !Object.hasOwn(input, 'aircraftId')) throw new AppError('Choose an aircraft before remembering its serial.');
      if (Object.hasOwn(input, 'airdataStatus')) record.airdataStatus = input.airdataStatus;
      if (Object.hasOwn(input, 'aircraftId')) {
        const aircraft = getRecord(next, 'aircraft', input.aircraftId);
        if (input.rememberAircraft) {
          const serial = record.summary.aircraftSerial;
          if (!serial) throw new AppError('This record has no aircraft serial to remember.');
          if (matchAircraft(next, serial).some(item => item.id !== aircraft.id)) throw new AppError('This aircraft serial already matches a different aircraft. Assign without remembering, or correct the fleet serial first.', 409);
          if (!matchAircraft(next, serial).some(item => item.id === aircraft.id)) aircraft.flightRecordSerials = [...(aircraft.flightRecordSerials ?? []), serial];
          validateAircraft(next, aircraft);
        }
        record.aircraftId = aircraft.id;
        attachSession(next, record);
      }
      validateFlightLog(next, record); return { value: record };
    }),
    importFlightLog: input => mutate(async next => {
      objectInput(input, ['aircraftId', 'filename', 'sourceDevice', 'contentBase64']);
      const manualAircraftId = input.aircraftId ?? null;
      if (manualAircraftId !== null) getRecord(next, 'aircraft', manualAircraftId);
      textField(input.filename, 'filename', { required: true, max: 255 });
      const sourceDevice = textField(input.sourceDevice ?? '', 'sourceDevice', { max: 200 });
      const bytes = decodeOriginalBase64(input.contentBase64), sha256 = hash(bytes);
      const existing = next.flightLogs.find(log => log.sha256 === sha256);
      if (existing) {
        if (manualAircraftId !== null && existing.aircraftId !== manualAircraftId) throw new AppError('These original flight bytes are already attached to another aircraft. Select that aircraft to view the existing import.', 409);
        return { value: { flightLog: existing, session: next.sessions.find(session => session.flightLogId === existing.id) ?? null, duplicate: true, routing: 'existing' } };
      }
      const decoder = decodeFlight ?? (await import('./dji-import.mjs')).decodeDjiFlight;
      const decoded = await decoder(bytes, { filename: input.filename });
      validateFrames(decoded.frames);
      const matches = matchAircraft(next, decoded.summary.aircraftSerial, decoded);
      const matchedAircraftId = manualAircraftId ?? (matches.length === 1 ? matches[0].id : null);
      const routing = manualAircraftId !== null ? 'manual' : matchedAircraftId !== null ? 'serial-match' : 'unassigned';
      const log = { id: randomUUID(), aircraftId: matchedAircraftId, filename: input.filename, sourceDevice, importedAt: timestamp(), sha256, byteLength: bytes.length, format: decoded.format, logVersion: decoded.logVersion, status: decoded.status, summary: copy(decoded.summary), frameCount: decoded.frames.length, warnings: copy(decoded.warnings), airdataStatus: 'unknown' };
      if (log.summary.startTime === null) log.warnings.push('Start time is unavailable. The original was retained; create a session manually using a verified flight time.');
      validateFlightLog(next, log);
      next.flightLogs.push(log);
      const session = attachSession(next, log);
      const imports = join(dataDir, 'imports'); await mkdir(imports, { recursive: true, mode: 0o700 });
      const info = await lstat(imports); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe original imports directory.');
      const originalPath = join(imports, `${sha256}.bin`);
      let created = false;
      try { await writeFile(originalPath, bytes, { flag: 'wx', mode: 0o600 }); created = true; }
      catch (error) { if (error.code !== 'EEXIST') throw error; await safeOriginal(dataDir, log); }
      return { value: { flightLog: log, session, duplicate: false, routing }, persistence: { telemetry: { flightLogId: log.id, frames: decoded.frames } }, rollback: async () => { if (created) await unlink(originalPath); } };
    }),
  };
  store.getFlightLogRaw = store.getFlightOriginal;
  store.getFlightLogFrames = store.getFlightFrames;
  return store;
}

/** Check one complete frame group per imported log and exact metadata counts. */
export function validateTelemetry(catalog, telemetry) {
  if (!Array.isArray(telemetry) || telemetry.length !== catalog.flightLogs.length) throw new Error('Incomplete telemetry backup.');
  const seen = new Set();
  for (const item of telemetry) {
    objectInput(item, ['flightLogId', 'frames']);
    const log = getRecord(catalog, 'flightLogs', item.flightLogId);
    if (seen.has(log.id)) throw new Error('Duplicate telemetry group.');
    seen.add(log.id); validateFrames(item.frames);
    if (item.frames.length !== log.frameCount) throw new Error('Telemetry count does not match the imported log.');
  }
}
