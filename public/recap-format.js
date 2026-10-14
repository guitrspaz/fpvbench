/** Human-readable recap presentation; numerical evidence is computed by the server. */
export function formatRecapNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value) : 'Unknown';
}

export function formatRecapDuration(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 'Unknown';
  const total = Math.round(value), hours = Math.floor(total / 3600), minutes = Math.floor(total % 3600 / 60), seconds = total % 60;
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', seconds || !total ? `${seconds}s` : ''].filter(Boolean).join(' ');
}

export const displayUnits = value => value === 'imperial' ? 'imperial' : 'metric';
export const heightValue = (value, units) => typeof value === 'number' && Number.isFinite(value) ? (units === 'imperial' ? value / 0.3048 : value) : null;
export const speedValue = (value, units) => typeof value === 'number' && Number.isFinite(value) ? (units === 'imperial' ? value * 3600 / 1609.344 : value) : null;
export function formatRecapHeight(value, units = 'metric') {
  return heightValue(value, units) === null ? 'Unknown' : `${formatRecapNumber(heightValue(value, units))} ${units === 'imperial' ? 'ft' : 'm'}`;
}
export function formatRecapSpeed(value, units = 'metric') {
  return speedValue(value, units) === null ? 'Unknown' : `${formatRecapNumber(speedValue(value, units))} ${units === 'imperial' ? 'mph' : 'm/s'}`;
}

export function formatRecapDistance(value, units = 'metric') {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 'Unknown';
  if (units === 'imperial') return value >= 1609.344 ? `${formatRecapNumber(value / 1609.344)} mi` : `${formatRecapNumber(value / 0.3048)} ft`;
  return value >= 1000 ? `${formatRecapNumber(value / 1000)} km` : `${formatRecapNumber(value)} m`;
}

export function recapHighlights(facts, units = 'metric') {
  const coverage = measurement => `${measurement?.coveredFlights ?? 0}/${measurement?.totalFlights ?? facts.flightCount} records with duration`;
  const rows = [
    { label: 'Recorded flights', value: formatRecapNumber(facts.flightCount), detail: `${facts.importedFlightCount} imported; ${facts.unlinkedManualSessionCount} manual` },
    { label: 'Total recorded time', value: formatRecapDuration(facts.durationSeconds?.value), detail: coverage(facts.durationSeconds) },
    { label: 'Median recorded duration', value: formatRecapDuration(facts.medianDurationSeconds?.value), detail: 'Middle duration among known records' },
    { label: 'Average recorded duration', value: formatRecapDuration(facts.averageDurationSeconds?.value), detail: coverage(facts.averageDurationSeconds) },
  ];
  if (facts.distanceFlownMeters?.coveredFlights) rows.push(
    { label: 'Recorded flown path', value: formatRecapDistance(facts.distanceFlownMeters.value, units), detail: `${facts.distanceFlownMeters.coveredFlights}/${facts.distanceFlownMeters.totalFlights} records with usable distance` },
    { label: 'Longest flown path', value: formatRecapDistance(facts.longestDistanceFlownMeters?.value, units), detail: 'Total path for one record; not pilot range' },
  );
  return rows;
}
