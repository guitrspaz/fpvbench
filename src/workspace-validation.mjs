import { createHash } from "node:crypto";
import { AppError, assertSafeObject, containsControlText } from "./errors.mjs";
import { parseExport } from "./parser.mjs";
import { ARCHIVE_FORMATS } from './log-import.mjs';
import { validateTransfer } from './airdata-transfer.mjs';
import { hasVerifiedDistanceSummary, verifiedDistance } from './dji-distance.mjs';

export const aircraftFields = ["name", "kind", "registrationId", "serialNumber", "flightRecordSerials", "status", "notes", "baselineSnapshotId"];
export const sessionFields = [
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
  "flightLogId",
];
const hash = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const copy = (object) => structuredClone(object);

export function objectInput(input, allowed) {
  assertSafeObject(input);
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new AppError("A JSON object is required.");
  for (const key of Object.keys(input))
    if (!allowed.includes(key))
      throw new AppError(`Unsupported field: ${key}.`);
}
export function textField(value, field, { required = false, max = 10000 } = {}) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    containsControlText(value)
  )
    throw new AppError(`${field} must be text of at most ${max} characters.`);
  if (required && !value.trim()) throw new AppError(`${field} is required.`);
  return value;
}
export function isoDate(value, field) {
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
export function getRecord(state, collection, id) {
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
export function validateAircraft(state, record) {
  if (record.status !== undefined && !["active", "retired"].includes(record.status)) throw new AppError("Aircraft status must be active or retired.");
  textField(record.name, "name", { required: true, max: 200 });
  textField(record.kind, "kind", { max: 200 });
  // Older catalogs and backups may omit these optional aircraft identifiers.
  for (const field of ["registrationId", "serialNumber"])
    if (Object.hasOwn(record, field)) textField(record[field], field, { max: 200 });
  if (record.flightRecordSerials !== undefined) {
    if (!Array.isArray(record.flightRecordSerials) || record.flightRecordSerials.length > 100) throw new AppError("flightRecordSerials must contain at most 100 aircraft serials.");
    for (const serial of record.flightRecordSerials) textField(serial, "flight record serial", { required: true, max: 200 });
    if (new Set(record.flightRecordSerials.map(serial => serial.trim().toLowerCase())).size !== record.flightRecordSerials.length) throw new AppError("Duplicate flight record serial.");
  }
  textField(record.notes, "notes");
  snapshotRelationship(state, record.id, record.baselineSnapshotId);
}
export function validateSession(state, record) {
  snapshotRelationship(state, record.aircraftId, record.snapshotId);
  if (record.flightLogId !== null) {
    const log = getRecord(state, "flightLogs", record.flightLogId);
    if (log.status === "archived") throw new AppError("Archive-only files do not establish a flight session. Record a manual session with a file reference instead.");
    if (log.aircraftId !== record.aircraftId) throw new AppError("The flight log must belong to the same aircraft.");
    if (state.sessions.some(session => session.id !== record.id && session.flightLogId === record.flightLogId)) throw new AppError("This flight log already has a session.", 409);
  }
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
export function validateWorkspace(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Invalid workspace object.');
  const legacy = state.version === 1;
  objectInput(state, legacy ? ["version", "aircraft", "snapshots", "sessions"] : ["version", "aircraft", "snapshots", "sessions", "flightLogs"]);
  if (
    ![1, 2, 3].includes(state.version) ||
    !["aircraft", "snapshots", "sessions"].every((key) =>
      Array.isArray(state[key]),
    )
  )
    throw new Error("Unsupported workspace schema.");
  if (!legacy && !Array.isArray(state.flightLogs)) throw new Error("Invalid workspace flight logs.");
  const ids = new Set();
  for (const collection of legacy ? ["aircraft", "snapshots", "sessions"] : ["aircraft", "snapshots", "sessions", "flightLogs"]) {
    for (const record of state[collection]) {
      if (!record || !identifier(record.id) || ids.has(record.id))
        throw new Error("Invalid or duplicate record ID.");
      ids.add(record.id);
      isoDate(
        ["snapshots", "flightLogs"].includes(collection) ? record.importedAt : record.createdAt,
        "record timestamp",
      );
      if (collection === "aircraft") {
        objectInput(record, ["id", ...aircraftFields, "createdAt"]);
        validateAircraft(state, record);
      }
      if (collection === "sessions") {
        objectInput(record, ["id", ...sessionFields.filter(field => !legacy || field !== "flightLogId"), "createdAt"]);
        validateSession(state, legacy ? { ...record, flightLogId: null } : record);
      }
      if (collection === "flightLogs") validateFlightLog(state, record);
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

const distanceProvenance = ['distanceSourceValue', 'distanceSourceUnit', 'distanceUnitBasis'];
const summaryNumbers = {
  durationSeconds: [0, 86400], distanceMeters: [0, 100000000],
  maxHeightMeters: [-10000, 100000], maxHorizontalSpeedMps: [0, 1000],
};
function bounded(value, field, min, max) {
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)) throw new AppError(`${field} is outside the supported range.`);
}

/** Validate decoder summary evidence without inventing missing values. */
export function validateSummary(summary) {
  objectInput(summary, ['startTime', ...Object.keys(summaryNumbers), 'aircraftName', 'aircraftModel', 'aircraftSerial', 'location', 'startCoordinate', ...distanceProvenance]);
  if (distanceProvenance.some(key => Object.hasOwn(summary, key))) {
    if (!hasVerifiedDistanceSummary(summary)) throw new AppError('Invalid distance source evidence.');
  }
  if (summary.startTime !== null) isoDate(summary.startTime, 'startTime');
  for (const [field, bounds] of Object.entries(summaryNumbers)) bounded(summary[field], field, ...bounds);
  for (const field of ['aircraftName', 'aircraftModel', 'location']) if (summary[field] !== null) textField(summary[field], field, { max: 1000 });
  if (summary.aircraftSerial !== undefined && summary.aircraftSerial !== null) textField(summary.aircraftSerial, 'aircraftSerial', { required: true, max: 200 });
  if (summary.startCoordinate !== null) {
    objectInput(summary.startCoordinate, ['latitude', 'longitude']);
    if (summary.startCoordinate.latitude === null || summary.startCoordinate.longitude === null) throw new AppError('A start coordinate requires both latitude and longitude.');
    bounded(summary.startCoordinate.latitude, 'latitude', -90, 90);
    bounded(summary.startCoordinate.longitude, 'longitude', -180, 180);
  }
}

/** Validate normalized local telemetry before persistence or restoration. */
export function validateFrames(frames) {
  if (!Array.isArray(frames) || frames.length > 100000) throw new AppError('Telemetry must contain at most 100000 frames.', 413);
  for (const frame of frames) {
    objectInput(frame, ['timestamp', 'elapsedSeconds', 'latitude', 'longitude', 'altitudeMeters', 'batteryPercent', 'horizontalSpeedMps']);
    if (frame.timestamp !== null) isoDate(frame.timestamp, 'frame timestamp');
    for (const [field, min, max] of [['elapsedSeconds', 0, 86400], ['latitude', -90, 90], ['longitude', -180, 180], ['altitudeMeters', -10000, 100000], ['batteryPercent', 0, 100], ['horizontalSpeedMps', 0, 1000]]) bounded(frame[field], field, min, max);
  }
}

/** Validate immutable flight-log metadata and its aircraft relationship. */
export function validateFlightLog(state, record) {
  objectInput(record, ['id', 'aircraftId', 'filename', 'sourceDevice', 'importedAt', 'sha256', 'byteLength', 'format', 'logVersion', 'status', 'summary', 'frameCount', 'warnings', 'airdataStatus', 'airdataTransfer']);
  if (!Object.hasOwn(record, 'airdataStatus')) record.airdataStatus = 'unknown';
  if (!['unknown', 'not-uploaded', 'uploaded'].includes(record.airdataStatus)) throw new AppError('Choose a valid manual AirData status.');
  if (record.aircraftId !== null) getRecord(state, 'aircraft', record.aircraftId);
  else if (state.version !== 3) throw new AppError('Unassigned flights require a version 3 catalog.');
  textField(record.filename, 'filename', { required: true, max: 255 });
  textField(record.sourceDevice, 'sourceDevice', { max: 200 });
  if (!/^[a-f0-9]{64}$/.test(record.sha256)) throw new AppError('Invalid flight checksum.');
  if (!Number.isInteger(record.byteLength) || record.byteLength < 1 || record.byteLength > 25 * 1024 * 1024) throw new AppError('Invalid flight byte length.');
  if (record.status === 'archived') {
    if (!ARCHIVE_FORMATS.includes(record.format) || record.logVersion !== null || record.frameCount !== 0 || Object.values(record.summary).some(value => value !== null)) throw new AppError('Invalid archive-only log evidence.');
  } else if (!Number.isInteger(record.logVersion) || record.logVersion < 1 || record.logVersion > 255) throw new AppError('Invalid DJI log version.');
  if (record.status !== 'archived' && (!['dji-txt', 'dji-json'].includes(record.format) || !['summary-only', 'decoded'].includes(record.status))) throw new AppError('Invalid format or decode status.');
  if (record.airdataTransfer !== undefined) validateTransfer(record.airdataTransfer);
  if (!Number.isInteger(record.frameCount) || record.frameCount < 0 || record.frameCount > 100000 || (record.status === 'summary-only' && record.frameCount !== 0)) throw new AppError('Invalid telemetry frame count.');
  if (!Array.isArray(record.warnings) || record.warnings.length > 1000) throw new AppError('Invalid flight warnings.');
  record.warnings.forEach(warning => textField(warning, 'warning', { max: 2000 }));
  validateSummary(record.summary);
  if (record.summary.distanceUnitBasis && !verifiedDistance(record)) throw new AppError('Distance verification does not match this source format.');
  if (state.flightLogs.some(log => log.id !== record.id && log.sha256 === record.sha256)) throw new AppError('Duplicate original flight record.', 409);
}

