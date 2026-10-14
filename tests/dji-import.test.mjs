import { describe, test, expect } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { decodeDjiFlight, decodeDjiFlightInProcess, normalizeDecodedFlight, MAX_DJI_BYTES, MAX_DJI_FRAMES } from '../src/dji-import.mjs';
import { decodedDjiFixture, syntheticDjiBinary } from './helpers/dji-fixtures.mjs';

const json = value => new TextEncoder().encode(JSON.stringify(value));
const normalize = overrides => normalizeDecodedFlight(decodedDjiFixture(overrides));
const fakeWorker = () => {
  const worker = new EventEmitter();
  worker.terminate = () => { worker.terminated = true; return Promise.resolve(0); };
  return worker;
};

describe('DJI import normalization', () => {
  test('converts sourced units and retains only aircraft identity, excluding shared controller serials', () => {
    const fixture = decodedDjiFixture();
    fixture.details.aircraftSn = 'SYNTHETIC-AIRCRAFT';
    fixture.details.rcSn = 'PRIVATE-REMOTE';
    fixture.details.cameraSn = 'PRIVATE-CAMERA';
    const result = normalizeDecodedFlight(fixture);
    expect(result).toMatchObject({ format: 'dji-json', logVersion: 13, status: 'decoded', summary: { startTime: '2026-10-14T12:00:00.000Z', durationSeconds: 120, distanceMeters: 250, maxHeightMeters: 30, maxHorizontalSpeedMps: 5, aircraftModel: 'Avata2', location: 'Synthetic test site' } });
    expect(result.frames[0]).toEqual({ timestamp: '2026-10-14T12:00:00.000Z', elapsedSeconds: 0, latitude: 10, longitude: 20, altitudeMeters: 5, batteryPercent: 90, horizontalSpeedMps: 5 });
    expect(result.summary.aircraftSerial).toBe('SYNTHETIC-AIRCRAFT');
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });
  test('derives upstream CLI start time from telemetry without inventing omitted metadata', () => {
    const result = normalize({ details: { totalTime: 120 }, frames: decodedDjiFixture().frames });
    expect(result.summary.startTime).toBe('2026-10-14T12:00:00.000Z');
    expect(result.summary.aircraftName).toBeNull();
    expect(result.summary.distanceMeters).toBeNull();
  });
  test('missing time preserves a useful summary and announces no automatic session', () => {
    const result = normalize({ details: { aircraftName: 'Synthetic' }, frames: [] });
    expect(result.status).toBe('summary-only');
    expect(result.summary.startTime).toBeNull();
    expect(result.warnings.join(' ')).toMatch(/without an automatic flight session/);
  });
  test('rejects meaningless metadata, bad versions and malformed frame structures', () => {
    expect(() => normalize({ details: {}, frames: [] })).toThrow(/no usable/);
    expect(() => normalize({ version: 0 })).toThrow(/version/);
    expect(() => normalize({ frames: [{}] })).toThrow(/unsupported telemetry/);
    expect(() => normalize({ frames: [{ osd: 'bad' }] })).toThrow(/malformed/);
    expect(() => normalize({ frames: [{ latitude: NaN }] })).toThrow(/no usable telemetry/);
    expect(() => normalize({ frames: Array(MAX_DJI_FRAMES + 1).fill({}) })).toThrow(/frame import limit/);
  });
  test('invalid and absent numbers remain null while explicit zero survives', () => {
    const result = normalize({ details: { aircraftName: 'Synthetic', totalTime: 0, totalDistance: -1, maxHeight: '30', latitude: 200, longitude: 0, startTime: 'not a date' }, frames: [] });
    expect(result.summary).toMatchObject({ durationSeconds: 0, distanceMeters: null, maxHeightMeters: null, startCoordinate: null, startTime: null });
    expect(result.warnings.join(' ')).toMatch(/invalid/);
  });
  test('accepts compatible normalized summary and frame fields', () => {
    const result = normalizeDecodedFlight({ version: 13, summary: { startTime: '2026-10-14T12:00:00+02:00', durationSeconds: 40 }, frames: [{ timestamp: '2026-10-14T12:00:00+02:00', altitudeMeters: 10, batteryPercent: 75 }] });
    expect(result.summary.startTime).toBe('2026-10-14T10:00:00.000Z');
    expect(result.frames[0].altitudeMeters).toBe(10);
  });
  test('rejects calendar dates JavaScript would silently normalize', () => {
    const result = normalize({ details: { aircraftName: 'Synthetic', startTime: '2026-02-30T12:00:00Z' }, frames: [] });
    expect(result.summary.startTime).toBeNull();
    expect(result.warnings.join(' ')).toMatch(/invalid/);
  });
});

describe('DJI source decoding with isolated parser seam', () => {
  test('parses supported JSON; rejects raw, arbitrary, polluted, malformed and DAT inputs', async () => {
    await expect(decodeDjiFlightInProcess(json(decodedDjiFixture()), { filename: 'flight.json' })).resolves.toMatchObject({ status: 'decoded' });
    for (const value of [{ records: [] }, {}, { version: 13, details: {}, frames: [], constructor: {} }]) {
      await expect(decodeDjiFlightInProcess(json(value), { filename: 'flight.json' })).rejects.toThrow();
    }
    await expect(decodeDjiFlightInProcess(new Uint8Array([255]), { filename: 'flight.json' })).rejects.toThrow(/UTF-8 JSON/);
    await expect(decodeDjiFlightInProcess(json({}), { filename: 'flight.dat' })).rejects.toMatchObject({ status: 415 });
    await expect(decodeDjiFlight(new Uint8Array(MAX_DJI_BYTES + 1), { filename: 'flight.txt' })).rejects.toMatchObject({ status: 413 });
  });
  test('modern binary reads summary only and never calls frames or keychain methods', async () => {
    let freed = false;
    const result = await decodeDjiFlightInProcess(syntheticDjiBinary(13), { filename: 'flight.txt', parserFactory: () => ({ version: 13, details: decodedDjiFixture().details, frames() { throw new Error('must not call'); }, fetchKeychains() { throw new Error('must not call'); }, free() { freed = true; } }) });
    expect(result).toMatchObject({ format: 'dji-txt', status: 'summary-only', frames: [] });
    expect(result.warnings.join(' ')).toMatch(/encrypted telemetry/);
    expect(freed).toBe(true);
  });
  test('legacy telemetry failure keeps metadata and sanitized warning', async () => {
    const result = await decodeDjiFlightInProcess(syntheticDjiBinary(), { filename: 'flight.txt', parserFactory: () => ({ version: 12, details: decodedDjiFixture().details, frames() { throw new Error('SECRET'); } }) });
    expect(result.status).toBe('summary-only');
    expect(result.warnings.join(' ')).not.toContain('SECRET');
  });
  test('constructor failure is sanitized and legacy frames normalize', async () => {
    await expect(decodeDjiFlightInProcess(syntheticDjiBinary(), { filename: 'flight.txt', parserFactory() { throw new Error('SECRET'); } })).rejects.toThrow(/could not read/);
    await expect(decodeDjiFlightInProcess(syntheticDjiBinary(), { filename: 'flight.txt', parserFactory: () => ({ version: 12, details: decodedDjiFixture().details, frames: () => decodedDjiFixture().frames }) })).resolves.toMatchObject({ status: 'decoded' });
  });
  test('unknown header versions and inconsistent parser versions are rejected', async () => {
    await expect(decodeDjiFlightInProcess(syntheticDjiBinary(15), { filename: 'flight.txt' })).rejects.toThrow(/versions 1–14/);
    await expect(decodeDjiFlightInProcess(syntheticDjiBinary(), { filename: 'flight.txt', parserFactory: () => ({ version: 15 }) })).rejects.toThrow(/unsupported or inconsistent/);
  });
  test('measurements outside catalog bounds become null', () => {
    const result = normalize({ details: { aircraftName: 'Synthetic', totalTime: 90000, maxHorizontalSpeed: 1001 }, frames: [{ elapsedSeconds: 90000, horizontalSpeedMps: 1001, batteryPercent: 50 }] });
    expect(result.summary.durationSeconds).toBeNull();
    expect(result.summary.maxHorizontalSpeedMps).toBeNull();
    expect(result.frames[0].elapsedSeconds).toBeNull();
    expect(result.frames[0].horizontalSpeedMps).toBeNull();
  });
});

describe('bounded DJI worker orchestration', () => {
  test('passes copied bytes and resource limits and terminates successful worker', async () => {
    const worker = fakeWorker();
    const promise = decodeDjiFlight(json(decodedDjiFixture()), { filename: 'flight.json', workerFactory(options) {
      expect(options.resourceLimits.maxOldGenerationSizeMb).toBe(128);
      queueMicrotask(() => worker.emit('message', { ok: true, result: normalize() }));
      return worker;
    } });
    await expect(promise).resolves.toMatchObject({ status: 'decoded' });
    expect(worker.terminated).toBe(true);
  });
  test('timeouts terminate worker and unexpected errors do not reveal content', async () => {
    const worker = fakeWorker();
    await expect(decodeDjiFlight(json({}), { filename: 'flight.json', timeoutMs: 5, workerFactory: () => worker })).rejects.toThrow(/exceeded ten seconds/);
    expect(worker.terminated).toBe(true);
    const failed = fakeWorker();
    await expect(decodeDjiFlight(json({}), { filename: 'flight.json', workerFactory() { queueMicrotask(() => failed.emit('error', new Error('SECRET'))); return failed; } })).rejects.toThrow(/failed safely/);
  });
  test('rejects a third concurrent decoder and releases capacity after completion', async () => {
    const first = fakeWorker();
    const second = fakeWorker();
    const a = decodeDjiFlight(json({}), { filename: 'a.json', workerFactory: () => first });
    const b = decodeDjiFlight(json({}), { filename: 'b.json', workerFactory: () => second });
    await expect(decodeDjiFlight(json({}), { filename: 'c.json', workerFactory: fakeWorker })).rejects.toMatchObject({ status: 429 });
    first.emit('message', { ok: true, result: normalize() });
    second.emit('message', { ok: true, result: normalize() });
    await Promise.all([a, b]);
    const third = fakeWorker();
    const c = decodeDjiFlight(json({}), { filename: 'c.json', workerFactory: () => third });
    third.emit('message', { ok: true, result: normalize() });
    await expect(c).resolves.toMatchObject({ status: 'decoded' });
  });
});
