import { AppError } from './errors.mjs';
import { decodeDjiFlight, MAX_DJI_BYTES } from './dji-import.mjs';

export const ARCHIVE_FORMATS = ['unknown-log', 'px4-ulog', 'ardupilot-dataflash', 'mavlink-tlog', 'mavlink-jsonl', 'betaflight-blackbox'];
const extensions = new Set(['txt','json','jsonl','ndjson','log','bin','tlog','ulg','bbl','bfl','ridlog','csv','gpx','kml']);
/** Whether a filename belongs to the bounded original-log intake formats. */
export const supportsLogFilename = filename => typeof filename === 'string' && extensions.has(filename.toLowerCase().split('.').at(-1));
export const emptyLogSummary = () => ({ startTime: null, durationSeconds: null, distanceMeters: null, maxHeightMeters: null, maxHorizontalSpeedMps: null, aircraftSerial: null, aircraftName: null, aircraftModel: null, location: null, startCoordinate: null });

/** Content recognizers are independent of summary decoders. Archives never become flight evidence by extension alone. */
export async function decodeLog(bytes, { filename, decodeDji = decodeDjiFlight } = {}) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_DJI_BYTES) throw new AppError('Choose a nonempty log file up to 25 MiB.', 413);
  if (typeof filename !== 'string' || !filename.trim() || filename.length > 255 || [...filename].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new AppError('Provide a valid log filename.');
  const extension = filename.toLowerCase().split('.').at(-1);
  if (!supportsLogFilename(filename)) throw new AppError('Choose a flight-log, telemetry, JSON, CSV, GPX or KML file.', 415);
  let format = 'unknown-log';
  const binaryDji = extension === 'txt' && bytes.length >= 100 && bytes[10] >= 1 && bytes[10] <= 14;
  if (binaryDji) return decodeDji(bytes, { filename });
  if (['json','jsonl','ndjson'].includes(extension)) {
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { text = ''; }
    if (extension === 'json') {
      let data;
      try { data = JSON.parse(text); } catch { throw new AppError('The JSON log is malformed. Its format could not be safely recognized.', 422); }
      if (data && !Array.isArray(data) && Object.hasOwn(data, 'version') && (Object.hasOwn(data, 'details') || Object.hasOwn(data, 'summary') || Object.hasOwn(data, 'frames'))) return decodeDji(bytes, { filename });
    }
    const lines = text.trim().split(/\r?\n/);
    if (lines.length <= 100000 && lines.length && lines.every(line => {
      try { const data = JSON.parse(line); return typeof data?.meta?.type === 'string' && data.meta.type.length <= 100 && typeof data.meta.timestamp === 'number' && Number.isFinite(data.meta.timestamp) && data.data && typeof data.data === 'object' && !Array.isArray(data.data); } catch { return false; }
    })) format = 'mavlink-jsonl';
  }
  const signature = (...values) => values.every((value, index) => bytes[index] === value);
  if (bytes.length >= 16 && signature(0x55,0x4c,0x6f,0x67,1,0x12,0x35)) format = 'px4-ulog';
  else if (bytes.length >= 89 && signature(0xa3,0x95,0x80)) format = 'ardupilot-dataflash';
  else if (extension === 'tlog' && bytes.length >= 20 && [0xfe,0xfd].includes(bytes[8]) && bytes.length >= 8 + (bytes[8] === 0xfe ? 8 : 12) + bytes[9]) format = 'mavlink-tlog';
  else if (new TextDecoder().decode(bytes.subarray(0, 100)).startsWith('H Product:Blackbox flight data recorder')) format = 'betaflight-blackbox';
  return { format, logVersion: null, status: 'archived', summary: emptyLogSummary(), frames: [], warnings: [format === 'unknown-log' ? 'Original retained. Its format is not yet understood; no flight measurements were inferred.' : 'Format recognized; original retained. Summary and telemetry decoding are not yet available for this format.'] };
}
