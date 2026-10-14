import { parentPort, workerData } from 'node:worker_threads';
import { decodeDjiFlightInProcess } from './dji-import.mjs';
import { AppError } from './errors.mjs';

try {
  const result = await decodeDjiFlightInProcess(workerData.bytes, { filename: workerData.filename });
  parentPort.postMessage({ ok: true, result });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error instanceof AppError ? error.message : 'The DJI decoder could not read this file.', status: error instanceof AppError ? error.status : 422 });
}
