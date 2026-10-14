import assert from 'node:assert/strict';
import { decodeDjiFlight } from '../src/dji-import.mjs';
import { decodedDjiFixture, syntheticDjiBinary } from '../tests/helpers/dji-fixtures.mjs';

// Explicit local operational proof against synthetic inputs, never a real flight record.
for (const version of [12, 13, 14]) {
  const result = await decodeDjiFlight(syntheticDjiBinary(version), { filename: 'synthetic.txt' });
  assert.equal(result.logVersion, version);
  assert.equal(result.summary.durationSeconds, 120);
  assert.equal(result.summary.startTime, '2026-10-14T12:00:00.000Z');
  assert.equal(result.summary.distanceMeters, 250);
  assert.equal(result.status, 'summary-only');
  if (version >= 13) assert.match(result.warnings.join(' '), /encrypted/);
}
const decoded = await decodeDjiFlight(new TextEncoder().encode(JSON.stringify(decodedDjiFixture())), { filename: 'synthetic.json' });
assert.equal(decoded.status, 'decoded');
assert.equal(decoded.frames[0].horizontalSpeedMps, 5);
console.log('DJI operational proof passed: synthetic v12/v13/v14 binary summaries and decoded JSON through real workers/WASM.');
