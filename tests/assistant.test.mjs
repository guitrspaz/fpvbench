import { test, expect, jest } from '@jest/globals';
import { parseExport } from '../src/parser.mjs';
import { createAssistant } from '../src/assistant.mjs';
import { snapshotEvidence, compareEvidence, flightFacts } from '../src/assistant-evidence.mjs';
import { DISTANCE_BASIS } from '../src/dji-distance.mjs';

test('verified TXT distance is usable and recap units isolate cache and prepared presentation', async () => {
  const { assistant, ai, state } = harness();
  state.flightLogs = [{ id: 'verified', aircraftId: 'quad-a', format: 'dji-txt', logVersion: 14, summary: { aircraftModel: 'DJI product type 137', distanceMeters: 1609.344, distanceSourceValue: 1.609344, distanceSourceUnit: 'km', distanceUnitBasis: DISTANCE_BASIS, durationSeconds: 120, startTime: '2026-10-14T12:00:00Z' } }];
  const metric = await assistant.recapFlights('quad-a');
  expect(metric.facts.distanceWithheldFlightCount).toBe(0);
  expect(metric.facts.distanceFlownMeters.value).toBe(1609.34);
  expect(metric.facts.durationBasis).toMatch(/not independently established airborne/);
  const imperial = await assistant.recapFlights('quad-a', { units: 'imperial' });
  expect(imperial.context.units).toBe('imperial');
  expect(ai.run.mock.calls[1][1].presentation.highlights.find(row => row.label === 'Recorded flown path').value).toBe('5,279.99 ft');
  expect((await assistant.recapFlights('quad-a', { units: 'imperial' })).cached).toBe(true);
  expect((await assistant.recapFlights('quad-a')).cached).toBe(true);
  await expect(assistant.recapFlights('quad-a', { units: 'invalid' })).rejects.toMatchObject({ status: 400 });
  expect(ai.run).toHaveBeenCalledTimes(2);
});

const result = { summary: 'Review the explicit changes.', observations: ['Rates affect stick response.'], questions: ['Which response do you prefer?'], limitations: ['Hardware evidence is incomplete.'] };
function snapshot(id, lines, extra = {}) {
  const rawText = `# dump all\n# Betaflight / TESTBOARD 4.5.1 / MSP API: 1.46\n${lines}\nsave\n`;
  return { id, aircraftId: 'quad-a', importedAt: '2026-10-14T12:00:00Z', label: 'Private label', filename: 'private-file.txt', rawText, notes: 'private notes', parsed: parseExport(rawText), ...extra };
}
function harness(snapshots = [snapshot('current', 'set p_roll = 45')], baselineSnapshotId = null) {
  const state = { aircraft: [{ id: 'quad-a', name: 'Test aircraft', baselineSnapshotId }, { id: 'quad-b', name: 'Other aircraft', baselineSnapshotId: null }], snapshots, flightLogs: [], sessions: [] };
  const reports = new Map();
  const settings = { available: true, reason: 'Ready' };
  const ai = {
    getSettings: jest.fn(async () => ({ ...settings })), updateSettings: jest.fn(), checkConnection: jest.fn(),
    getReport: jest.fn(async key => structuredClone(reports.get(key) ?? null)),
    findReport: jest.fn(async predicate => structuredClone([...reports.values()].reverse().find(predicate) ?? null)),
    saveReport: jest.fn(async (key, report) => { reports.set(key, structuredClone(report)); return structuredClone(report); }),
    run: jest.fn(async () => ({ result: structuredClone(result) })), close: jest.fn(),
  };
  const store = { getState: () => structuredClone(state), getSnapshot: id => { const found = state.snapshots.find(item => item.id === id); if (!found) throw new Error('Not found'); return structuredClone(found); } };
  return { assistant: createAssistant({ store, ai }), state, ai, settings };
}

test('review sends only explicit allowlisted bounded evidence and actual same-aircraft baseline', async () => {
  const old = snapshot('baseline', 'set p_roll = 40\nset roll_expo = 15');
  const current = snapshot('current', 'set p_roll = 45\nset roll_expo = 20\nset uid = PRIVATE_UID\nset craft_name = PRIVATE_NAME\nset gyro_lpf1_type = IGNORE_THIS\nset dshot_bidir = ON\nset p_yaw = SECRET_VALUE\nresource MOTOR 1 A01');
  const { assistant, ai, state } = harness([old, current], old.id);
  Object.assign(state.aircraft[0], { registrationId: 'PRIVATE_REGISTRATION', serialNumber: 'PRIVATE_SERIAL', flightRecordSerials: ['PRIVATE_ALIAS'] });
  const report = await assistant.reviewSnapshot(current.id);
  const transmitted = JSON.stringify(ai.run.mock.calls[0][1]);
  for (const secret of ['PRIVATE_UID', 'PRIVATE_NAME', 'private-file', 'Private label', 'private notes', 'SECRET_VALUE', 'IGNORE_THIS', 'resource MOTOR', 'baselineSnapshotId', 'PRIVATE_REGISTRATION', 'PRIVATE_SERIAL', 'PRIVATE_ALIAS']) expect(transmitted).not.toContain(secret);
  expect(report.context.snapshotId).toBe(current.id);
  expect(report.context.baselineSnapshotId).toBe(old.id);
  expect(report.context.comparison.counts.changed).toBe(2);
  expect(report.context.comparison.counts.unknown).toBe(1);
  expect(report.sources.map(source => source.url)).toEqual(['https://betaflight.com/docs/wiki/app/pid-tuning-tab', 'https://betaflight.com/docs/wiki/app/presets-tab']);
  expect(report.disclaimer).toMatch(/verify/i);
});

test('cross-aircraft baseline is ignored and sparse omissions remain unknown', async () => {
  const other = snapshot('other', 'set p_roll = 99', { aircraftId: 'quad-b' });
  const { assistant, ai } = harness([snapshot('current', 'set p_roll = 40'), other], other.id);
  const report = await assistant.reviewSnapshot('current');
  expect(report.context.baselineSnapshotId).toBeNull();
  expect(ai.run.mock.calls[0][1].evidence.baseline).toBeNull();
  const left = snapshotEvidence(snapshot('left', 'set p_roll = 40\nset d_roll = 20'));
  const right = snapshotEvidence(snapshot('right', 'set p_roll = 45'));
  expect(compareEvidence(left, right).rows.find(row => row.key.endsWith(':d_roll'))).toEqual(expect.objectContaining({ from: '20', to: null, change: 'unknown' }));
});

test('cap prioritizes globals and selected profile while retaining profile identity', () => {
  const lines = [];
  for (let profile = 0; profile < 5; profile++) {
    lines.push(`profile ${profile}`);
    for (const axis of ['roll', 'pitch', 'yaw']) for (const term of ['p', 'i', 'd', 'f', 'd_min', 'd_max']) lines.push(`set ${term}_${axis} = ${profile + 1}`);
  }
  lines.push('# restore original profile selection', 'profile 4');
  const evidence = snapshotEvidence(snapshot('many', lines.join('\n')));
  expect(evidence.settings).toHaveLength(80);
  expect(evidence.settings.filter(record => record.profile === 4)).toHaveLength(18);
  expect(evidence.settings[0].profile).toBe(4);
  expect(evidence.limitations.join(' ')).toMatch(/80/);
  const baseline = structuredClone(evidence); baseline.selectedProfiles.pid = 0;
  expect(compareEvidence(baseline, evidence).selectedPidProfileChanged).toBe(true);
});

test('cache and concurrent dedupe reuse result without provider charges; source change invalidates cache', async () => {
  const { assistant, ai, state } = harness();
  const [first, second] = await Promise.all([assistant.reviewSnapshot('current'), assistant.reviewSnapshot('current')]);
  expect(ai.run).toHaveBeenCalledTimes(1);
  expect(first.fingerprint).toBe(second.fingerprint);
  expect((await assistant.reviewSnapshot('current')).cached).toBe(true);
  expect((await assistant.getSnapshotReview('current')).fingerprint).toBe(first.fingerprint);
  expect(ai.run).toHaveBeenCalledTimes(1);
  const questioned = await assistant.reviewSnapshot('current', { question: 'I prefer smooth center stick.' });
  expect(questioned.fingerprint).not.toBe(first.fingerprint);
  expect((await assistant.getSnapshotReview('current')).fingerprint).toBe(questioned.fingerprint);
  expect(ai.run).toHaveBeenCalledTimes(2);
  state.snapshots[0].parsed.settings[0].value = '46';
  expect(await assistant.getSnapshotReview('current')).toBeNull();
  await assistant.reviewSnapshot('current');
  expect(ai.run).toHaveBeenCalledTimes(3);
});

test('disabled assistant refuses provider and cached reads; question bounds and provider failures do not cache', async () => {
  const { assistant, ai, settings } = harness();
  await assistant.reviewSnapshot('current');
  settings.available = false;
  await expect(assistant.reviewSnapshot('current')).rejects.toMatchObject({ status: 403 });
  await expect(assistant.getSnapshotReview('current')).rejects.toMatchObject({ status: 403 });
  expect(ai.run).toHaveBeenCalledTimes(1);
  settings.available = true;
  await expect(assistant.reviewSnapshot('current', { question: 'x'.repeat(1001) })).rejects.toMatchObject({ status: 400 });
  await expect(assistant.reviewSnapshot('current', { question: 15 })).rejects.toMatchObject({ status: 400 });
  ai.run.mockRejectedValueOnce(new Error('Provider failed'));
  await expect(assistant.reviewSnapshot('current', { question: 'different' })).rejects.toThrow('Provider failed');
  expect(ai.saveReport).toHaveBeenCalledTimes(1);
  ai.run.mockResolvedValueOnce({ result: { ...result, summary: 'set p_roll = 50' } });
  await expect(assistant.reviewSnapshot('current', { question: 'unsupported' })).rejects.toMatchObject({ status: 502 });
  expect(ai.saveReport).toHaveBeenCalledTimes(1);
});

test('recap facts avoid linked-session duplicates, preserve zero/missing coverage and never transmit private details', async () => {
  const { assistant, ai, state } = harness();
  Object.assign(state.aircraft[0], { registrationId: 'PRIVATE_REGISTRATION', serialNumber: 'PRIVATE_SERIAL' });
  state.flightLogs = [
    { id: 'log-a', aircraftId: 'quad-a', rawText: 'PRIVATE_RAW', filename: 'SECRET_FILE', summary: { durationSeconds: 60, distanceMeters: 100, maxHeightMeters: 30, location: 'PRIVATE_LOCATION', startCoordinate: { lat: 12, lon: 34 } } },
    { id: 'log-b', aircraftId: 'quad-a', summary: { durationSeconds: 0, distanceMeters: null, maxHeightMeters: 0 } },
  ];
  state.flightLogs.push({ id: 'outside', aircraftId: 'quad-b', summary: { durationSeconds: 900, distanceMeters: 9999, maxHeightMeters: 500 } }, { id: 'inbox', aircraftId: null, summary: { durationSeconds: 900, distanceMeters: 9999, maxHeightMeters: 500 } });
  state.sessions = [{ aircraftId: 'quad-a', flightLogId: 'log-a', durationMinutes: 1, notes: 'PRIVATE_NOTES' }, { aircraftId: 'quad-a', flightLogId: null, durationMinutes: 2, location: 'PRIVATE_LOCATION' }];
  state.sessions.push({ aircraftId: 'quad-b', flightLogId: null, durationMinutes: 900 });
  state.aircraft[0].status = 'retired';
  const report = await assistant.recapFlights('quad-a');
  expect(report.context.aircraftId).toBe('quad-a');
  expect(report.context.recapVersion).toBe(3);
  expect(report.facts.unassignedFlightCount).toBe(0);
  expect(report.facts.flightCount).toBe(3);
  expect(report.facts.durationSeconds).toEqual({ value: 180, coveredFlights: 3, totalFlights: 3 });
  expect(report.facts.distanceFlownMeters).toEqual({ value: 100, coveredFlights: 1, totalFlights: 3 });
  expect(report.facts.highestRecordedHeightMeters.coveredFlights).toBe(2);
  expect(report.facts.aircraft).toEqual([{ label: 'Test aircraft', flightCount: 3 }]);
  const sent = JSON.stringify(ai.run.mock.calls[0][1]);
  for (const secret of ['PRIVATE', 'SECRET', '"lat":', '"lon":', 'log-a', 'quad-a', 'quad-b', 'Other aircraft', '9999']) expect(sent).not.toContain(secret);
  expect((await assistant.recapFlights('quad-a')).cached).toBe(true);
  expect(ai.run).toHaveBeenCalledTimes(1);
  expect(report.facts.limitations.join(' ')).toMatch(/not distance from the pilot/);
});

test('recap rejects missing or unknown aircraft without provider calls', async () => {
  const { assistant, ai, state } = harness();
  state.sessions.push({ aircraftId: 'quad-b', flightLogId: null, durationMinutes: 10 });
  for (const id of [undefined, null, '', 42]) await expect(assistant.recapFlights(id)).rejects.toMatchObject({ status: 400 });
  await expect(assistant.recapFlights('missing')).rejects.toMatchObject({ status: 404 });
  await expect(assistant.recapFlights('quad-a')).rejects.toMatchObject({ status: 400 });
  expect(ai.run).not.toHaveBeenCalled();
});

test('recap caches stay separate for identical aircraft labels and facts; unrelated changes keep the selected cache', async () => {
  const { assistant, ai, state } = harness();
  state.aircraft[1].name = state.aircraft[0].name;
  state.sessions = ['quad-a', 'quad-b'].map(aircraftId => ({ aircraftId, flightLogId: null, durationMinutes: 2 }));
  const first = await assistant.recapFlights('quad-a');
  const other = await assistant.recapFlights('quad-b');
  expect(other.fingerprint).not.toBe(first.fingerprint);
  expect(other.context.aircraftId).toBe('quad-b');
  expect(ai.run).toHaveBeenCalledTimes(2);
  state.sessions[1].durationMinutes = 9;
  expect((await assistant.recapFlights('quad-a')).cached).toBe(true);
  expect(ai.run).toHaveBeenCalledTimes(2);
  state.sessions[0].durationMinutes = 3;
  expect((await assistant.recapFlights('quad-a')).cached).toBe(false);
  expect(ai.run).toHaveBeenCalledTimes(3);
});

test('empty recap does not call provider; aggregates large catalogs without argument overflow', async () => {
  const { assistant, ai } = harness();
  await expect(assistant.recapFlights('quad-a')).rejects.toMatchObject({ status: 400 });
  expect(ai.run).not.toHaveBeenCalled();
  const facts = flightFacts({ aircraft: [], sessions: [], flightLogs: Array.from({ length: 150000 }, () => ({ aircraftId: 'missing', summary: { durationSeconds: null, distanceMeters: 0, maxHeightMeters: 0 } })) });
  expect(facts.longestDistanceFlownMeters.value).toBe(0);
  expect(facts.durationSeconds.value).toBeNull();
});

test('flight facts calculate useful duration distribution and UTC flying activity with readable precision', () => {
  const facts = flightFacts({
    aircraft: [{ id: 'a', name: 'Synthetic quad' }],
    flightLogs: [
      { id: 'first', aircraftId: 'a', summary: { startTime: '2026-10-10T23:30:00-02:00', durationSeconds: 30.1, distanceMeters: 100.123456, maxHeightMeters: 5 } },
      { id: 'second', aircraftId: 'a', summary: { startTime: '2026-10-11T12:00:00Z', durationSeconds: 90.2, distanceMeters: 200.234567, maxHeightMeters: 20 } },
      { id: 'missing', aircraftId: 'a', summary: { startTime: null, durationSeconds: null, distanceMeters: null, maxHeightMeters: null } },
    ],
    sessions: [
      { aircraftId: 'a', flightLogId: 'second', flownAt: '2026-10-11T12:00:00Z', durationMinutes: 99 },
      { aircraftId: 'a', flightLogId: null, flownAt: '2026-10-12T10:00:00Z', durationMinutes: 3 },
    ],
  });
  expect(facts.durationSeconds).toEqual({ value: 300.3, coveredFlights: 3, totalFlights: 4 });
  expect(facts.averageDurationSeconds.value).toBe(100.1);
  expect(facts.medianDurationSeconds.value).toBe(90.2);
  expect(facts.shortestDurationSeconds.value).toBe(30.1);
  expect(facts.longestDurationSeconds.value).toBe(180);
  expect(facts.flightsUnderOneMinute).toEqual({ count: 1, coveredFlights: 3, totalFlights: 4 });
  expect(facts.averageDistanceFlownMeters.value).toBe(150.18);
  expect(facts.distanceFlownMeters.value).toBe(300.36);
  expect(facts.flyingActivity).toEqual({ firstFlightDate: '2026-10-11', lastFlightDate: '2026-10-12', activeDays: 2, busiestDays: [{ date: '2026-10-11', flightCount: 2 }], busiestDayTieCount: 1, coveredFlights: 3, totalFlights: 4, timezone: 'UTC' });
});

test('flight distribution keeps explicit zero and unknown separate, handles even medians and tied days', () => {
  const facts = flightFacts({
    aircraft: [], sessions: [],
    flightLogs: [0, 60, 120, 180].map((durationSeconds, i) => ({ aircraftId: 'a', summary: { startTime: i < 2 ? '2026-10-10T12:00:00Z' : '2026-10-11T12:00:00Z', durationSeconds, distanceMeters: null, maxHeightMeters: null } })),
  });
  expect(facts.medianDurationSeconds.value).toBe(90);
  expect(facts.shortestDurationSeconds.value).toBe(0);
  expect(facts.flightsUnderOneMinute.count).toBe(1);
  expect(facts.flyingActivity.busiestDays).toEqual([{ date: '2026-10-10', flightCount: 2 }, { date: '2026-10-11', flightCount: 2 }]);
  const empty = flightFacts({ aircraft: [], sessions: [], flightLogs: [] });
  expect(empty.averageDurationSeconds).toEqual({ value: null, coveredFlights: 0, totalFlights: 0 });
  expect(empty.flyingActivity.firstFlightDate).toBeNull();
  expect(empty.flyingActivity.busiestDays).toEqual([]);
});

test('explicit limitations about flightworthiness remain valid explanations', async () => {
  const { assistant, ai } = harness();
  ai.run.mockResolvedValueOnce({ result: { ...result, limitations: ['I cannot establish whether this is safe to fly.', 'Flightworthiness is unverified.'] } });
  expect((await assistant.reviewSnapshot('current')).result.limitations).toHaveLength(2);
  ai.run.mockResolvedValueOnce({ result: { ...result, summary: 'This aircraft is safe to fly.' } });
  await expect(assistant.reviewSnapshot('current', { question: 'certification?' })).rejects.toMatchObject({ status: 502 });
});

test('fresh responses return the credential-redacted saved record for local context and aircraft labels', async () => {
  const { assistant, ai, state } = harness();
  ai.saveReport.mockImplementation(async (_key, report) => JSON.parse(JSON.stringify(report).replaceAll('test-credential', '[redacted]')));
  const review = await assistant.reviewSnapshot('current', { question: 'test-credential' });
  expect(review.context.question).toBe('[redacted]');
  expect(JSON.stringify(review)).not.toContain('test-credential');
  state.aircraft[0].name = 'test-credential';
  state.sessions.push({ aircraftId: 'quad-a', flightLogId: null, durationMinutes: 1 });
  const recap = await assistant.recapFlights('quad-a');
  expect(recap.facts.aircraft[0].label).toBe('[redacted]');
  expect(JSON.stringify(recap)).not.toContain('test-credential');
});

test('recap withholds unverified modern TXT distances without changing source data or valid JSON coverage', async () => {
  const { assistant, ai, state } = harness();
  state.flightLogs = [
    { id: 'uncertain', aircraftId: 'quad-a', format: 'dji-txt', logVersion: 14, summary: { startTime: '2026-10-10T12:00:00Z', durationSeconds: 90, distanceMeters: 6.419383525848389, maxHeightMeters: 20 } },
    { id: 'verified', aircraftId: 'quad-a', format: 'dji-json', logVersion: 14, summary: { startTime: '2026-10-11T12:00:00Z', durationSeconds: 120, distanceMeters: 200, maxHeightMeters: 30 } },
  ];
  const before = structuredClone(state);
  const report = await assistant.recapFlights('quad-a');
  expect(report.facts.distanceFlownMeters).toEqual({ value: 200, coveredFlights: 1, totalFlights: 2 });
  expect(report.facts.distanceWithheldFlightCount).toBe(1);
  expect(report.facts.limitations.join(' ')).toMatch(/distance units.*verif/i);
  expect(JSON.stringify(ai.run.mock.calls[0][1])).not.toContain('6.419383525848389');
  expect(state).toEqual(before);
});
