/** Calibration is deliberately limited to TXT v14/product 137, independently checked against AirData aggregates. */
export const DISTANCE_BASIS = 'txt-v14-product137-km';
export function hasVerifiedDistanceSummary(summary) {
  const source = summary.distanceSourceValue;
  return summary.distanceUnitBasis === DISTANCE_BASIS && summary.distanceSourceUnit === 'km'
    && (source === null || (typeof source === 'number' && Number.isFinite(source) && source >= 0 && source <= 1e8))
    && summary.distanceMeters === (source === null || source * 1000 > 1e8 ? null : source * 1000);
}
export function distanceFamily(log) {
  return log.format === 'dji-txt' && log.logVersion === 14 && log.summary.aircraftModel === 'DJI product type 137';
}
export function verifiedDistance(log) { return distanceFamily(log) && hasVerifiedDistanceSummary(log.summary); }

/** Prepare an atomic correction from immutable originals; refuse any unrelated decoder drift. */
export async function prepareDistanceRepair(state, decodeOriginal) {
  const candidates = state.flightLogs.filter(log => distanceFamily(log) && !Object.hasOwn(log.summary, 'distanceUnitBasis'));
  if (!candidates.length) return null;
  const next = structuredClone(state);
  for (const log of candidates) {
    const decoded = await decodeOriginal(log);
    if (!verifiedDistance(decoded)) throw new Error('The original does not establish the verified distance format.');
    const plain = summary => Object.fromEntries(Object.entries(summary).filter(([key]) => !['distanceMeters', 'distanceSourceValue', 'distanceSourceUnit', 'distanceUnitBasis'].includes(key)).sort(([a], [b]) => a.localeCompare(b)));
    if (JSON.stringify(plain(log.summary)) !== JSON.stringify(plain(decoded.summary))
      || decoded.status !== log.status || decoded.frames.length !== log.frameCount
      || ![decoded.summary.distanceSourceValue, decoded.summary.distanceMeters].includes(log.summary.distanceMeters)) throw new Error('Distance repair would change unrelated or inconsistent source evidence.');
    next.flightLogs.find(item => item.id === log.id).summary = structuredClone(decoded.summary);
  }
  return next;
}
