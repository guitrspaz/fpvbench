import { AppError } from './errors.mjs';
export const UPLOAD_FORMATS = ['dji-txt', 'mavlink-tlog', 'ardupilot-dataflash', 'px4-ulog'];
export const TRANSFER_STATUSES = ['preparing', 'submitting', 'pending', 'running', 'success', 'error', 'unknown'];
export function validateTransfer(value) {
  const fields = ['accountId','attemptId','jobId','status','startedAt','updatedAt','message'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(value, key))) throw new AppError('Invalid AirData receipt.');
  for (const key of ['accountId','attemptId']) if (typeof value[key] !== 'string' || !/^[a-f0-9-]{36}$/i.test(value[key])) throw new AppError('Invalid AirData receipt identity.');
  if (!TRANSFER_STATUSES.includes(value.status) || (value.jobId !== null && (typeof value.jobId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(value.jobId))) || typeof value.message !== 'string' || value.message.length > 300 || [...value.message].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new AppError('Invalid AirData receipt status.');
  for (const key of ['startedAt','updatedAt']) if (typeof value[key] !== 'string' || !Number.isFinite(Date.parse(value[key])) || new Date(value[key]).toISOString() !== value[key]) throw new AppError('Invalid AirData receipt date.');
}
