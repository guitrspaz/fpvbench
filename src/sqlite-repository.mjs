import { DatabaseSync } from 'node:sqlite';
import { lstat, chmod } from 'node:fs/promises';
import { join } from 'node:path';

const schema = `
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE aircraft (
 id TEXT PRIMARY KEY, baseline_snapshot_id TEXT, payload TEXT NOT NULL CHECK(json_valid(payload)),
 FOREIGN KEY(baseline_snapshot_id,id) REFERENCES snapshots(id,aircraft_id) DEFERRABLE INITIALLY DEFERRED);
CREATE TABLE snapshots (
 id TEXT PRIMARY KEY, aircraft_id TEXT NOT NULL REFERENCES aircraft(id) DEFERRABLE INITIALLY DEFERRED,
 payload TEXT NOT NULL CHECK(json_valid(payload)), UNIQUE(id,aircraft_id));
CREATE TABLE flight_logs (
 id TEXT PRIMARY KEY, aircraft_id TEXT NOT NULL REFERENCES aircraft(id) DEFERRABLE INITIALLY DEFERRED,
 sha256 TEXT NOT NULL UNIQUE, payload TEXT NOT NULL CHECK(json_valid(payload)), UNIQUE(id,aircraft_id));
CREATE TABLE sessions (
 id TEXT PRIMARY KEY, aircraft_id TEXT NOT NULL REFERENCES aircraft(id) DEFERRABLE INITIALLY DEFERRED,
 snapshot_id TEXT, flight_log_id TEXT UNIQUE, payload TEXT NOT NULL CHECK(json_valid(payload)),
 FOREIGN KEY(snapshot_id,aircraft_id) REFERENCES snapshots(id,aircraft_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(flight_log_id,aircraft_id) REFERENCES flight_logs(id,aircraft_id) DEFERRABLE INITIALLY DEFERRED);
CREATE TABLE telemetry_frames (
 flight_log_id TEXT NOT NULL REFERENCES flight_logs(id) ON DELETE CASCADE,
 sequence INTEGER NOT NULL CHECK(sequence >= 0), payload TEXT NOT NULL CHECK(json_valid(payload)),
 PRIMARY KEY(flight_log_id,sequence));
CREATE INDEX snapshots_aircraft ON snapshots(aircraft_id);
CREATE INDEX sessions_aircraft ON sessions(aircraft_id);
CREATE INDEX flight_logs_aircraft ON flight_logs(aircraft_id);
INSERT INTO metadata VALUES ('schema_version','2'), ('initialized','0');
PRAGMA user_version=2;
`;
const tables = { aircraft: 'aircraft', snapshots: 'snapshots', sessions: 'sessions', flightLogs: 'flight_logs' };

/** Open versioned local SQLite storage. All values use prepared statements. */
export async function createSqliteRepository(dataDir) {
  const filename = join(dataDir, 'workspace.sqlite');
  let existed = true;
  try { const info = await lstat(filename); if (!info.isFile() || info.isSymbolicLink()) throw new Error('Unsafe SQLite workspace path.'); } catch (error) { if (error.code !== 'ENOENT') throw error; existed = false; }
  let db;
  try {
    db = new DatabaseSync(filename);
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    if (!existed) { db.exec('BEGIN IMMEDIATE;'); try { db.exec(schema); db.exec('COMMIT;'); } catch (error) { db.exec('ROLLBACK;'); throw error; } await chmod(filename, 0o600); }
    const listed = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => row.name).sort();
    if (JSON.stringify(listed) !== JSON.stringify(['aircraft', 'snapshots', 'sessions', 'flight_logs', 'telemetry_frames', 'metadata'].sort())) throw new Error('Unsupported SQLite workspace schema.');
    const normalize = sql => sql.replace(/\s+/g, ' ').trim();
    const expectedSchema = schema.split(';').map(statement => statement.trim()).filter(statement => statement.startsWith('CREATE')).map(normalize).sort();
    const actualSchema = db.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table','index','trigger','view') AND name NOT LIKE 'sqlite_%'").all().map(row => normalize(row.sql)).sort();
    if (JSON.stringify(expectedSchema) !== JSON.stringify(actualSchema)) throw new Error('Unsupported SQLite table or constraint definitions.');
    if (db.prepare('PRAGMA user_version').get().user_version !== 2 || db.prepare("SELECT value FROM metadata WHERE key='schema_version'").get()?.value !== '2') throw new Error('Unsupported SQLite workspace version.');
    if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('SQLite workspace integrity check failed.');
    db.exec('PRAGMA journal_mode=DELETE;');
    const statements = {
      aircraft: db.prepare('INSERT INTO aircraft(id,baseline_snapshot_id,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET baseline_snapshot_id=excluded.baseline_snapshot_id,payload=excluded.payload'),
      snapshots: db.prepare('INSERT INTO snapshots(id,aircraft_id,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET aircraft_id=excluded.aircraft_id,payload=excluded.payload'),
      flightLogs: db.prepare('INSERT INTO flight_logs(id,aircraft_id,sha256,payload) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET aircraft_id=excluded.aircraft_id,sha256=excluded.sha256,payload=excluded.payload'),
      sessions: db.prepare('INSERT INTO sessions(id,aircraft_id,snapshot_id,flight_log_id,payload) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET aircraft_id=excluded.aircraft_id,snapshot_id=excluded.snapshot_id,flight_log_id=excluded.flight_log_id,payload=excluded.payload'),
    };
    const frameInsert = db.prepare('INSERT INTO telemetry_frames(flight_log_id,sequence,payload) VALUES(?,?,?)');
    const frameDelete = db.prepare('DELETE FROM telemetry_frames WHERE flight_log_id=?');
    const frameQuery = db.prepare('SELECT payload FROM telemetry_frames WHERE flight_log_id=? ORDER BY sequence LIMIT ? OFFSET ?');
    let closed = false;
    return {
      load() {
        const initialized = db.prepare("SELECT value FROM metadata WHERE key='initialized'").get()?.value;
        if (!['0', '1'].includes(initialized)) throw new Error('Invalid SQLite migration state.');
        if (initialized === '0') {
          if (Object.values(tables).some(table => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count !== 0) || db.prepare('SELECT COUNT(*) AS count FROM telemetry_frames').get().count !== 0) throw new Error('Incomplete SQLite migration contains uncommitted catalog data.');
          return null;
        }
        const catalog = { version: 2 };
        for (const [collection, table] of Object.entries(tables)) catalog[collection] = db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => {
          const record = JSON.parse(row.payload);
          if (record.id !== row.id || (collection === 'aircraft' ? record.baselineSnapshotId !== row.baseline_snapshot_id : record.aircraftId !== row.aircraft_id) || (collection === 'flightLogs' && record.sha256 !== row.sha256) || (collection === 'sessions' && (record.snapshotId !== row.snapshot_id || record.flightLogId !== row.flight_log_id))) throw new Error('SQLite indexed relationships do not match the stored payload.');
          return record;
        });
        return catalog;
      },
      save(next, previous, { telemetry } = {}) {
        db.exec('BEGIN IMMEDIATE;');
        try {
          for (const collection of ['aircraft', 'snapshots', 'flightLogs', 'sessions']) {
            const previousRecords = new Map((previous?.[collection] ?? []).map(record => [record.id, JSON.stringify(record)]));
            for (const record of next[collection]) {
              const payload = JSON.stringify(record);
              if (previousRecords.get(record.id) === payload) continue;
              if (collection === 'aircraft') statements[collection].run(record.id, record.baselineSnapshotId, payload);
              if (collection === 'snapshots') statements[collection].run(record.id, record.aircraftId, payload);
              if (collection === 'flightLogs') statements[collection].run(record.id, record.aircraftId, record.sha256, payload);
              if (collection === 'sessions') statements[collection].run(record.id, record.aircraftId, record.snapshotId, record.flightLogId, payload);
            }
          }
          if (telemetry) {
            frameDelete.run(telemetry.flightLogId);
            telemetry.frames.forEach((frame, index) => frameInsert.run(telemetry.flightLogId, index, JSON.stringify(frame)));
          }
          db.prepare("UPDATE metadata SET value='1' WHERE key='initialized'").run();
          db.exec('COMMIT;');
        } catch (error) { db.exec('ROLLBACK;'); throw error; }
      },
      readFrames: (id, offset, limit) => frameQuery.all(id, limit, offset).map(row => JSON.parse(row.payload)),
      exportTelemetry() {
        return db.prepare('SELECT id FROM flight_logs ORDER BY rowid').all().map(row => ({ flightLogId: row.id, frames: frameQuery.all(row.id, -1, 0).map(frame => JSON.parse(frame.payload)) }));
      },
      close() { if (!closed) { closed = true; db.close(); } },
    };
  } catch (error) { if (db) db.close(); throw new Error('Cannot open SQLite workspace. Preserve existing data before repairing or restoring it.', { cause: error }); }
}
