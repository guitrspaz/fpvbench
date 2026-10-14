import { AppError, containsControlText } from './errors.mjs';

// Explicit names only: arbitrary imported fields and command records are excluded.
const numericNames = new Set([
  ...['p', 'i', 'd', 'f', 'd_min', 'd_max'].flatMap(prefix => ['roll', 'pitch', 'yaw'].map(axis => `${prefix}_${axis}`)),
  ...['roll', 'pitch', 'yaw'].flatMap(axis => [`${axis}_rc_rate`, `${axis}_expo`, `${axis}_srate`]),
  'rc_rate', 'rc_expo', 'rc_yaw_rate', 'rc_yaw_expo', 'roll_rate', 'pitch_rate', 'yaw_rate',
  'thr_mid', 'thr_expo', 'throttle_limit_percent', 'throttle_boost', 'motor_output_limit',
  'gyro_lpf1_static_hz', 'gyro_lpf2_static_hz', 'gyro_lpf1_dyn_min_hz', 'gyro_lpf1_dyn_max_hz',
  'dterm_lpf1_static_hz', 'dterm_lpf2_static_hz', 'dterm_lpf1_dyn_min_hz', 'dterm_lpf1_dyn_max_hz',
  'gyro_notch1_hz', 'gyro_notch1_cutoff', 'gyro_notch2_hz', 'gyro_notch2_cutoff',
  'dterm_notch_hz', 'dterm_notch_cutoff', 'dyn_notch_count', 'dyn_notch_q', 'dyn_notch_min_hz', 'dyn_notch_max_hz',
  'rpm_filter_harmonics', 'rpm_filter_min_hz', 'motor_poles', 'pid_process_denom', 'dshot_idle_value',
  'dyn_idle_min_rpm', 'feedforward_averaging', 'feedforward_smooth_factor', 'feedforward_jitter_factor',
  'feedforward_boost', 'feedforward_max_rate_limit', 'feedforward_transition', 'iterm_relax_cutoff',
  'anti_gravity_gain', 'anti_gravity_cutoff_hz', 'd_min_gain', 'd_min_advance', 'd_max_gain', 'd_max_advance',
  'simplified_master_multiplier', 'simplified_i_gain', 'simplified_d_gain', 'simplified_pi_gain',
  'simplified_dmax_gain', 'simplified_feedforward_gain', 'simplified_pitch_d_gain', 'simplified_pitch_pi_gain',
  'simplified_dterm_filter_multiplier', 'simplified_gyro_filter_multiplier',
]);
const enums = new Map([
  ['rates_type', ['ACTUAL', 'BETAFLIGHT', 'KISS', 'QUICK', 'QUICKRATES', 'RACEFLIGHT']],
  ['throttle_limit_type', ['OFF', 'SCALE', 'CLIP']],
  ['motor_pwm_protocol', ['PWM', 'ONESHOT125', 'ONESHOT42', 'MULTISHOT', 'BRUSHED', 'DSHOT150', 'DSHOT300', 'DSHOT600']],
  ['dshot_bidir', ['ON', 'OFF']], ['simplified_pids_mode', ['OFF', 'RP', 'RPY']],
  ['simplified_dterm_filter', ['ON', 'OFF']], ['simplified_gyro_filter', ['ON', 'OFF']],
  ['iterm_relax', ['OFF', 'RP', 'RPY', 'RP_INC', 'RPY_INC']], ['iterm_relax_type', ['SETPOINT', 'GYRO']],
  ...['gyro_lpf1_type', 'gyro_lpf2_type', 'dterm_lpf1_type', 'dterm_lpf2_type'].map(name => [name, ['PT1', 'PT2', 'PT3', 'BIQUAD']]),
]);

function metadata(value, max = 80) {
  return typeof value === 'string' && value.length <= max && /^[A-Za-z0-9_. /()-]+$/.test(value) ? value : null;
}
function selected(value) { return Number.isInteger(value) && value >= 0 && value <= 255 ? value : null; }

/** Select bounded inert tuning evidence; no source text, commands, names or serials. */
export function snapshotEvidence(snapshot) {
  const parsed = snapshot.parsed;
  const settings = [];
  for (const record of parsed.settings) {
    if (!['global', 'pid', 'rate'].includes(record.scope)) continue;
    const profile = record.scope === 'global' ? null : selected(record.profile);
    if (record.scope !== 'global' && profile === null) continue;
    let value;
    if (numericNames.has(record.name) && /^-?\d+(?:\.\d+)?$/.test(record.value) && record.value.length <= 16 && Number.isFinite(Number(record.value))) value = record.value;
    else if (enums.get(record.name)?.includes(record.value)) value = record.value;
    else continue;
    settings.push({ key: `${record.scope}:${profile ?? '-'}:${record.name}`, name: record.name, scope: record.scope, profile, value });
  }
  const priority = record => record.scope === 'global' ? 0 : record.scope === 'pid' && record.profile === selected(parsed.activeProfile) ? 1 : record.scope === 'rate' && record.profile === selected(parsed.activeRateProfile) ? 2 : 3;
  settings.sort((a, b) => priority(a) - priority(b) || a.key.localeCompare(b.key));
  const bounded = settings.slice(0, 80);
  return {
    firmware: { version: metadata(parsed.firmware.version, 40), board: metadata(parsed.firmware.board), boardName: metadata(parsed.firmware.boardName), manufacturer: metadata(parsed.firmware.manufacturer, 40) },
    exportKind: ['dump', 'diff'].includes(parsed.exportKind) ? parsed.exportKind : 'unknown',
    exportScope: parsed.exportScope === 'all' ? 'all' : 'partial',
    selectedProfiles: { pid: selected(parsed.activeProfile), rate: selected(parsed.activeRateProfile) },
    settings: bounded,
    omittedSettingCount: parsed.settings.length - bounded.length,
    limitations: [
      'Only explicit allowlisted tuning, rates, filters and protocol values are included. Every omitted value remains unknown.',
      'Hardware condition, motor/prop/battery specifications and flight response are not established by this export.',
      'The documentation is general guidance; firmware-specific applicability and configuration compatibility are unverified.',
      ...(parsed.warnings.length ? ['The parser reported incomplete, sparse or otherwise qualified source evidence; inspect the original locally.'] : []),
      ...(settings.length > bounded.length ? ['The review includes at most 80 allowlisted settings, prioritizing global values and explicitly selected profiles; additional settings were omitted.'] : []),
    ],
  };
}

/** Compare only filtered explicit values. Absence never becomes a default or deletion. */
export function compareEvidence(baseline, current) {
  if (!baseline) return { baselinePresent: false, rows: [], counts: { changed: 0, unchanged: 0, unknown: 0 } };
  const left = new Map(baseline.settings.map(record => [record.key, record]));
  const right = new Map(current.settings.map(record => [record.key, record]));
  const counts = { changed: 0, unchanged: 0, unknown: 0 };
  const rows = [...new Set([...left.keys(), ...right.keys()])].sort().map(key => {
    const a = left.get(key), b = right.get(key);
    const change = !a || !b ? 'unknown' : a.value === b.value ? 'unchanged' : 'changed';
    counts[change]++;
    return { key, from: a?.value ?? null, to: b?.value ?? null, change };
  });
  return { baselinePresent: true, rows, counts, firmwareChanged: baseline.firmware.version !== current.firmware.version, boardChanged: baseline.firmware.board !== current.firmware.board || baseline.firmware.boardName !== current.firmware.boardName, selectedPidProfileChanged: baseline.selectedProfiles.pid !== current.selectedProfiles.pid, selectedRateProfileChanged: baseline.selectedProfiles.rate !== current.selectedProfiles.rate };
}

export function validateQuestion(question) {
  if (question === undefined) return '';
  if (typeof question !== 'string' || question.length > 1000 || containsControlText(question)) throw new AppError('The optional flying goal must be plain text of at most 1000 characters.');
  return question.trim();
}

/** Aggregate imported flights and unlinked manual sessions without double counting. */
export function flightFacts(state) {
  // The pinned parser labels v14 header distances as metres, but observed values
  // conflict with that contract. Keep originals/catalog unchanged; withhold these
  // distances from recap evidence until the source unit is independently verified.
  const needsDistanceVerification = log => log.format === 'dji-txt' && log.logVersion === 14 && typeof log.summary.distanceMeters === 'number' && Number.isFinite(log.summary.distanceMeters) && log.summary.distanceMeters >= 0;
  const distanceWithheldFlightCount = state.flightLogs.filter(needsDistanceVerification).length;
  const records = state.flightLogs.map(log => ({ aircraftId: log.aircraftId, startTime: log.summary.startTime, durationSeconds: log.summary.durationSeconds, distanceMeters: needsDistanceVerification(log) ? null : log.summary.distanceMeters, maxHeightMeters: log.summary.maxHeightMeters }));
  const manual = state.sessions.filter(session => !session.flightLogId).map(session => ({ aircraftId: session.aircraftId, startTime: session.flownAt, durationSeconds: session.durationMinutes === null ? null : session.durationMinutes * 60, distanceMeters: null, maxHeightMeters: null }));
  for (const record of manual) records.push(record);
  const round = value => Math.round(value * 100) / 100;
  const numeric = field => records.map(record => record[field]).filter(value => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  const measurement = (field, reducer) => {
    const values = numeric(field);
    return { value: values.length ? round(reducer(values)) : null, coveredFlights: values.length, totalFlights: records.length };
  };
  const sum = values => values.reduce((total, value) => total + value, 0);
  const average = values => sum(values) / values.length;
  const highest = values => values.reduce((max, value) => Math.max(max, value), 0);
  const lowest = values => values.reduce((min, value) => Math.min(min, value), Infinity);
  const median = values => {
    values.sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  };
  const countByAircraft = new Map();
  for (const record of records) countByAircraft.set(record.aircraftId, (countByAircraft.get(record.aircraftId) ?? 0) + 1);
  const aircraft = [...countByAircraft].map(([id, flightCount]) => ({ label: state.aircraft.find(item => item.id === id)?.name.slice(0, 80) ?? 'Unassigned aircraft', flightCount })).sort((a, b) => b.flightCount - a.flightCount || a.label.localeCompare(b.label));
  const dayCounts = new Map();
  let datedFlights = 0;
  for (const record of records) {
    const time = typeof record.startTime === 'string' ? Date.parse(record.startTime) : NaN;
    if (!Number.isFinite(time)) continue;
    const day = new Date(time).toISOString().slice(0, 10);
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1); datedFlights++;
  }
  const days = [...dayCounts.keys()].sort();
  const peak = [...dayCounts.values()].reduce((max, count) => Math.max(max, count), 0);
  const busiestDays = days.filter(day => dayCounts.get(day) === peak).map(date => ({ date, flightCount: peak }));
  const durations = numeric('durationSeconds');
  return {
    flightCount: records.length, importedFlightCount: state.flightLogs.length, unassignedFlightCount: state.flightLogs.filter(log => log.aircraftId === null).length, unlinkedManualSessionCount: manual.length,
    linkedSessionCount: state.sessions.filter(session => session.flightLogId).length,
    durationSeconds: measurement('durationSeconds', sum),
    averageDurationSeconds: measurement('durationSeconds', average),
    medianDurationSeconds: measurement('durationSeconds', median),
    shortestDurationSeconds: measurement('durationSeconds', lowest),
    longestDurationSeconds: measurement('durationSeconds', highest),
    flightsUnderOneMinute: { count: durations.filter(value => value < 60).length, coveredFlights: durations.length, totalFlights: records.length },
    distanceWithheldFlightCount,
    distanceFlownMeters: measurement('distanceMeters', sum),
    averageDistanceFlownMeters: measurement('distanceMeters', average),
    longestDistanceFlownMeters: measurement('distanceMeters', highest),
    highestRecordedHeightMeters: measurement('maxHeightMeters', highest),
    flyingActivity: { firstFlightDate: days[0] ?? null, lastFlightDate: days.at(-1) ?? null, activeDays: days.length, busiestDays: busiestDays.slice(0, 3), busiestDayTieCount: busiestDays.length, coveredFlights: datedFlights, totalFlights: records.length, timezone: 'UTC' },
    aircraft: aircraft.slice(0, 20), omittedAircraftCount: Math.max(0, aircraft.length - 20),
    limitations: [
      'Only this aircraft’s imported records and unlinked manual sessions are covered; inventory completeness is unknown.',
      'Distance flown is path distance, not distance from the pilot.',
      ...(distanceWithheldFlightCount ? ['DJI TXT version 14 summary distance units need verification against AirData or another known reference; those distances are withheld from this recap.'] : []),
      ...(manual.length ? ['Unlinked manual sessions may duplicate an imported record; they are not proof of distinct real flights.'] : []),
    ],
  };
}
