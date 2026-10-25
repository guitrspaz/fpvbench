/** Disposable in-memory catalog and telemetry; never opens or writes a database. */
export function createMemoryRepository(initialCatalog = null) {
  let catalog = structuredClone(initialCatalog);
  const telemetry = new Map();
  return {
    load() { return structuredClone(catalog); },
    save(next, _previous, { telemetry: update } = {}) {
      catalog = structuredClone(next);
      if (update) telemetry.set(update.flightLogId, structuredClone(update.frames));
    },
    readFrames(flightLogId, offset, limit) {
      return structuredClone((telemetry.get(flightLogId) ?? []).slice(offset, offset + limit));
    },
    exportTelemetry() {
      return [...telemetry].map(([flightLogId, frames]) => ({ flightLogId, frames: structuredClone(frames) }));
    },
    close() {},
  };
}
