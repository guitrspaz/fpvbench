import { Worker } from 'node:worker_threads';
import { AppError, assertSafeObject, containsControlText } from './errors.mjs';

export const MAX_DJI_BYTES = 25 * 1024 * 1024;
export const MAX_DJI_FRAMES = 100000;
const DECODE_TIMEOUT_MS = 10000;
const MAX_WORKERS = 2;
let activeWorkers = 0;

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
const metric = value => number(value, 0, 1e8);
const text = value => typeof value === 'string' && value.trim() && value.length <= 500 && !containsControlText(value) ? value.trim() : null;
const iso = value => {
  if (typeof value !== 'string') return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!parts) return null;
  const [, year, month, day, hour, minute, second, offsetHour = '0', offsetMinute = '0'] = parts.map((part, index) => index ? Number(part) : part);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= Date.UTC(2000, 0, 1) && time < Date.UTC(2101, 0, 1) ? new Date(time).toISOString() : null;
};
function coordinate(latitude, longitude) {
  const lat = number(latitude, -90, 90);
  const lon = number(longitude, -180, 180);
  return lat !== null && lon !== null && (lat !== 0 || lon !== 0) ? { latitude: lat, longitude: lon } : null;
}

/** Normalize a supported decoded export without retaining serial numbers or unrelated fields. */
export function normalizeDecodedFlight({ version, details, summary, frames }, format = 'dji-json', warnings = []) {
  if (!Number.isInteger(version) || version < 1 || version > 255) throw new AppError('Invalid DJI log version.', 422);
  const metadata = details ?? summary;
  if (!object(metadata) || !Array.isArray(frames)) throw new AppError('Use a decoded DJI JSON export containing version, details (or summary), and frames.', 422);
  if (frames.length > MAX_DJI_FRAMES) throw new AppError('DJI telemetry exceeds the 100,000-frame import limit.', 413);
  const normalized = frames.map(frame => {
    if (!object(frame) || !(['osd', 'custom', 'battery', 'timestamp', 'elapsedSeconds', 'latitude', 'longitude', 'altitudeMeters', 'batteryPercent', 'horizontalSpeedMps'].some(key => Object.hasOwn(frame, key)))) throw new AppError('DJI export contains an unsupported telemetry frame.', 422);
    for (const key of ['osd', 'custom', 'battery']) {
      if (Object.hasOwn(frame, key) && !object(frame[key])) throw new AppError('DJI export contains malformed telemetry.', 422);
    }
    const osd = frame.osd ?? {};
    const battery = frame.battery ?? {};
    const coords = coordinate(frame.latitude ?? osd.latitude, frame.longitude ?? osd.longitude);
    const x = number(osd.xSpeed, -1e4, 1e4);
    const y = number(osd.ySpeed, -1e4, 1e4);
    return {
      timestamp: iso(frame.timestamp ?? frame.custom?.dateTime),
      elapsedSeconds: number(frame.elapsedSeconds ?? osd.flyTime, 0, 86400),
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      altitudeMeters: number(frame.altitudeMeters ?? osd.height, -1e4, 1e5),
      batteryPercent: number(frame.batteryPercent ?? battery.chargeLevel, 0, 100),
      horizontalSpeedMps: number(frame.horizontalSpeedMps ?? (x !== null && y !== null ? Math.hypot(x, y) : null), 0, 1000),
    };
  });
  const firstTimestamp = normalized.find(frame => frame.timestamp)?.timestamp ?? null;
  const startTime = iso(metadata.startTime) ?? firstTimestamp;
  const location = text(metadata.location) ?? text([metadata.subStreet, metadata.street, metadata.city, metadata.area].map(text).filter(Boolean).join(', '));
  const result = {
    startTime,
    durationSeconds: number(metadata.durationSeconds ?? metadata.totalTime, 0, 86400),
    distanceMeters: metric(metadata.distanceMeters ?? metadata.totalDistance),
    maxHeightMeters: number(metadata.maxHeightMeters ?? metadata.maxHeight, -1e4, 1e5),
    maxHorizontalSpeedMps: number(metadata.maxHorizontalSpeedMps ?? metadata.maxHorizontalSpeed, 0, 1000),
    aircraftName: text(metadata.aircraftName),
    aircraftModel: metadata.productType === 'None' && !metadata.aircraftModel ? null : text(metadata.aircraftModel ?? metadata.productType),
    location,
    startCoordinate: coordinate(metadata.startCoordinate?.latitude ?? metadata.latitude, metadata.startCoordinate?.longitude ?? metadata.longitude),
  };
  if (!result.startCoordinate && normalized.some(frame => frame.latitude !== null && frame.longitude !== null)) {
    const first = normalized.find(frame => frame.latitude !== null && frame.longitude !== null);
    result.startCoordinate = { latitude: first.latitude, longitude: first.longitude };
  }
  if (!startTime && !result.aircraftName && !result.startCoordinate && !(result.durationSeconds > 0) && normalized.length === 0) throw new AppError('The file contains no usable DJI flight metadata or telemetry.', 422);
  if (!startTime) warnings.push('No valid flight start time was found. The file is retained without an automatic flight session.');
  if (metadata.startTime && !iso(metadata.startTime)) warnings.push('The source start time is invalid; only a valid telemetry timestamp can supply a flight date.');
  if (normalized.length && normalized.every(frame => Object.values(frame).every(value => value === null))) throw new AppError('The export contains no usable telemetry values.', 422);
  return { format, logVersion: version, status: normalized.length ? 'decoded' : 'summary-only', summary: result, frames: normalized, warnings: [...new Set(warnings)] };
}

function validateSource(bytes, filename) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new AppError('Select a nonempty DJI flight-record file.', 422);
  if (bytes.byteLength > MAX_DJI_BYTES) throw new AppError('DJI flight-record files must be 25 MiB or smaller.', 413);
  if (typeof filename !== 'string' || !filename.trim() || filename.length > 255 || containsControlText(filename)) throw new AppError('Provide a valid flight-record filename.', 400);
  const extension = filename.toLowerCase().split('.').at(-1);
  if (!['txt', 'json'].includes(extension)) throw new AppError('Import a DJI FlightRecord TXT file or a decoded DJI JSON export. DAT files are not supported.', 415);
  return extension;
}

/** Worker-side decoding; parserFactory is a test seam, never supplied by an HTTP request. */
export async function decodeDjiFlightInProcess(bytes, { filename, parserFactory } = {}) {
  const extension = validateSource(bytes, filename);
  if (extension === 'json') {
    let data;
    try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new AppError('The DJI JSON export is not valid UTF-8 JSON.', 422); }
    assertSafeObject(data);
    if (!object(data) || Object.hasOwn(data, 'records')) throw new AppError('Raw-record JSON is not supported. Export decoded DJI frames instead.', 422);
    return normalizeDecodedFlight(data);
  }
  if (bytes.byteLength < 100 || bytes[10] < 1 || bytes[10] > 14) throw new AppError('This file is not a supported DJI FlightRecord TXT file (versions 1–14).', 422);
  let parser;
  try {
    if (!parserFactory) {
      const { DJILog } = await import('dji-log-parser-js');
      parserFactory = value => new DJILog(value);
    }
    parser = parserFactory(bytes);
    const version = parser.version;
    if (!Number.isInteger(version) || version < 1 || version > 14 || version !== bytes[10]) throw new AppError('The decoder reported an unsupported or inconsistent DJI log version.', 422);
    const details = parser.details;
    let frames = [];
    const warnings = [];
    if (version >= 13) {
      warnings.push('This DJI log has encrypted telemetry. Only its local flight summary is imported; this version of FPVBench does not request DJI decryption keychains.');
    } else {
      try { frames = parser.frames(); }
      catch { warnings.push('The local decoder could not read telemetry. The available flight summary has been retained.'); }
    }
    return normalizeDecodedFlight({ version, details, frames }, 'dji-txt', warnings);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('The local DJI decoder could not read this flight-record file. Try an original FlightRecord TXT file or a decoded JSON export.', 422);
  } finally {
    parser?.free?.();
  }
}

/** Decode off the HTTP event loop with a bounded worker pool and a ten-second deadline. */
export async function decodeDjiFlight(bytes, { filename, workerFactory, timeoutMs = DECODE_TIMEOUT_MS } = {}) {
  validateSource(bytes, filename);
  if (activeWorkers >= MAX_WORKERS) throw new AppError('DJI decoding is busy. Try again after the current imports finish.', 429);
  activeWorkers += 1;
  let worker;
  try {
    return await new Promise((resolve, reject) => {
      let settled = false;
      let timer;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker?.terminate();
        if (error) reject(error); else resolve(result);
      };
      try {
        const options = { workerData: { bytes: new Uint8Array(bytes), filename }, resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 }, stdout: true, stderr: true };
        worker = workerFactory ? workerFactory(options) : new Worker(new URL('./dji-worker.mjs', import.meta.url), options);
        // Do not relay parser output, which could contain private record content.
        worker.stdout?.resume();
        worker.stderr?.resume();
        worker.once('message', message => {
          if (message?.ok === true) finish(null, message.result);
          else finish(new AppError(typeof message?.error === 'string' ? message.error : 'DJI decoding failed.', [400, 413, 415, 422].includes(message?.status) ? message.status : 422));
        });
        worker.once('error', () => finish(new AppError('The DJI decoder failed safely. Try a decoded JSON export.', 422)));
        worker.once('exit', () => finish(new AppError('The DJI decoder ended before completing the import.', 422)));
        timer = setTimeout(() => finish(new AppError('DJI decoding exceeded ten seconds. Try a decoded JSON export.', 422)), timeoutMs);
      } catch { finish(new AppError('The DJI decoder could not start.', 422)); }
    });
  } finally {
    // Hold the pool slot until the worker has actually stopped.
    try { await worker?.terminate(); } catch { /* Worker already stopped. */ }
    activeWorkers -= 1;
  }
}
