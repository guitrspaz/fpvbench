/** Human-readable recap presentation; numerical evidence is computed by the server. */
export function formatRecapNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value) : 'Unknown';
}

export function formatRecapDuration(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 'Unknown';
  const total = Math.round(value), hours = Math.floor(total / 3600), minutes = Math.floor(total % 3600 / 60), seconds = total % 60;
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', seconds || !total ? `${seconds}s` : ''].filter(Boolean).join(' ');
}

export function formatRecapDistance(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 'Unknown';
  return value >= 1000 ? `${formatRecapNumber(value / 1000)} km` : `${formatRecapNumber(value)} m`;
}

export function recapHighlights(facts) {
  const coverage = measurement => `${measurement?.coveredFlights ?? 0}/${measurement?.totalFlights ?? facts.flightCount} records with duration`;
  const rows = [
    { label: 'Recorded flights', value: formatRecapNumber(facts.flightCount), detail: `${facts.importedFlightCount} imported; ${facts.unlinkedManualSessionCount} manual` },
    { label: 'Total recorded time', value: formatRecapDuration(facts.durationSeconds?.value), detail: coverage(facts.durationSeconds) },
    { label: 'Median flight', value: formatRecapDuration(facts.medianDurationSeconds?.value), detail: 'Middle duration among known records' },
    { label: 'Average flight', value: formatRecapDuration(facts.averageDurationSeconds?.value), detail: coverage(facts.averageDurationSeconds) },
  ];
  if (facts.distanceFlownMeters?.coveredFlights) rows.push(
    { label: 'Recorded flown path', value: formatRecapDistance(facts.distanceFlownMeters.value), detail: `${facts.distanceFlownMeters.coveredFlights}/${facts.distanceFlownMeters.totalFlights} records with usable distance` },
    { label: 'Longest flown path', value: formatRecapDistance(facts.longestDistanceFlownMeters?.value), detail: 'Total path for one record; not pilot range' },
  );
  return rows;
}
