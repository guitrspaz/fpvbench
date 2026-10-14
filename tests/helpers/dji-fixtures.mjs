/** Synthetic records only: no real flight locations, serial numbers or controller exports. */
export function decodedDjiFixture(overrides = {}) {
  return {
    version: 13,
    details: { startTime: '2026-10-14T12:00:00Z', totalTime: 120, totalDistance: 250, maxHeight: 30, maxHorizontalSpeed: 5, aircraftName: 'Synthetic aircraft', productType: 'Avata2', city: 'Synthetic test site' },
    frames: [{ custom: { dateTime: '2026-10-14T12:00:00Z' }, osd: { flyTime: 0, latitude: 10, longitude: 20, height: 5, xSpeed: 3, ySpeed: 4 }, battery: { chargeLevel: 90 } }],
    ...overrides,
  };
}

/** Minimal synthetic header/details; v13+ wraps details in a zero-key auxiliary info block. */
export function syntheticDjiBinary(version = 12) {
  const bytes = Buffer.alloc(536);
  bytes.writeBigUInt64LE(536n, 0);
  bytes.writeUInt16LE(436, 8);
  bytes[10] = version;
  const details = 100;
  bytes.write('Synthetic site', details + 40, 'utf8');
  bytes.writeBigInt64LE(BigInt(Date.parse('2026-10-14T12:00:00Z')), details + 91);
  bytes.writeDoubleLE(20, details + 99);
  bytes.writeDoubleLE(10, details + 107);
  bytes.writeFloatLE(250, details + 115);
  bytes.writeInt32LE(120000, details + 119);
  bytes.writeFloatLE(30, details + 123);
  bytes.writeFloatLE(5, details + 127);
  if (version >= 13) {
    const wrapped = Buffer.alloc(545);
    bytes.copy(wrapped, 0, 0, 100);
    wrapped.writeBigUInt64LE(545n, 0);
    wrapped[100] = 0; // Auxiliary info type.
    wrapped.writeUInt16LE(442, 101);
    wrapped[103] = 0; // Zero XOR seed produces a zero key.
    wrapped[104] = 1; // Auxiliary data version.
    wrapped.writeUInt16LE(436, 105);
    bytes.copy(wrapped, 107, 100, 536);
    wrapped.writeUInt16LE(0, 543); // No signature in this synthetic fixture.
    return wrapped;
  }
  return bytes;
}
