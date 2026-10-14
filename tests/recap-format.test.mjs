import { test, expect } from '@jest/globals';
import { formatRecapNumber, formatRecapDuration, formatRecapDistance, recapHighlights } from '../public/recap-format.js';

test('recap formats units and precision without hiding missing measurements or zero', () => {
  expect(formatRecapDuration(8109.799999999999)).toBe('2h 15m 10s');
  expect(formatRecapDuration(386.18)).toBe('6m 26s');
  expect(formatRecapDuration(0)).toBe('0s');
  expect(formatRecapDuration(null)).toBe('Unknown');
  expect(formatRecapDistance(6419.383525848389)).toBe('6.42 km');
  expect(formatRecapDistance(0)).toBe('0 m');
  expect(formatRecapDistance(null)).toBe('Unknown');
  expect(formatRecapNumber(300.35999999999996)).toBe('300.36');
  const highlights = recapHighlights({ flightCount: 2, importedFlightCount: 1, unlinkedManualSessionCount: 1, durationSeconds: { value: 60, coveredFlights: 1, totalFlights: 2 }, averageDurationSeconds: { value: 60, coveredFlights: 1, totalFlights: 2 }, medianDurationSeconds: { value: 60 } });
  expect(highlights.find(row => row.label === 'Average flight')).toMatchObject({ value: '1m', detail: '1/2 records with duration' });
});
