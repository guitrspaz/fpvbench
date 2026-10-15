import { randomUUID } from 'node:crypto';
import { AppError } from './errors.mjs';
import { readPrivateJson, writePrivateJson } from './ai-private-files.mjs';
import { UPLOAD_FORMATS } from './airdata-transfer.mjs';

const CONFIG = '.airdata-config.json';
const initialConfig = () => ({ version: 1, appKey: null, userToken: null, accountId: null, verifiedAt: null });
const timestamp = () => new Date().toISOString();
const validAppKey = value => typeof value === 'string' && /^[a-zA-Z0-9]{8}$/.test(value);
const validToken = value => typeof value === 'string' && /^HD[a-zA-Z0-9]{8}$/i.test(value);
const genericError = () => new AppError('AirData could not complete this request. Credentials and provider details were not exposed.', 502);

/** Optional original-file uploads; settings saves and reads never contact AirData. */
export async function createAirdataService(directory, { store, fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  let config = initialConfig(), locked = false, closed = false, tail = Promise.resolve();
  try {
    const saved = await readPrivateJson(directory, CONFIG);
    if (saved) {
      if (Object.keys(saved).sort().join() !== Object.keys(config).sort().join() || saved.version !== 1 || (saved.appKey !== null && !validAppKey(saved.appKey)) || (saved.userToken !== null && !validToken(saved.userToken)) || (saved.accountId !== null && (typeof saved.accountId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(saved.accountId))) || (Boolean(saved.userToken) !== Boolean(saved.accountId)) || (saved.verifiedAt !== null && (!saved.appKey || !saved.userToken || typeof saved.verifiedAt !== 'string' || !Number.isFinite(Date.parse(saved.verifiedAt)) || new Date(saved.verifiedAt).toISOString() !== saved.verifiedAt))) throw new Error('Invalid private configuration');
      config = saved;
    }
  } catch { locked = true; }
  const exclusive = operation => {
    if (closed) return Promise.reject(new AppError('AirData connection is closed.', 409));
    const result = tail.then(operation); tail = result.catch(() => {}); return result;
  };
  const settings = () => ({ appKeyConfigured: Boolean(config.appKey), userTokenConfigured: Boolean(config.userToken), accountId: config.accountId, verifiedAt: config.verifiedAt, available: !locked && Boolean(config.appKey && config.userToken && config.verifiedAt), reason: locked ? 'AirData settings are unreadable; preserve the private configuration before repair.' : !config.appKey ? 'An AirData developer upload application key is needed. This is different from the Enterprise read API key.' : !config.userToken ? 'Add your AirData user upload token.' : !config.verifiedAt ? 'Explicitly check the AirData connection before sending files.' : 'Ready for explicit uploads. Existing external upload history is not queried.' });
  const persist = async next => { if (locked) throw new AppError('Preserve unreadable AirData settings before repair.', 409); await writePrivateJson(directory, CONFIG, next); config = next; };
  const requireReady = () => { if (!settings().available) throw new AppError(settings().reason, 409); };
  async function request(url, options = {}) {
    const controller = new AbortController(); let timer;
    const work = async () => {
      const response = await fetchImpl(url, { ...options, redirect: 'error', signal: controller.signal });
      if (!response.ok || !response.body) throw genericError();
      const reader = response.body.getReader(); const chunks = []; let size = 0;
      try {
        for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 65536) throw genericError(); chunks.push(value); }
      } finally { await reader.cancel().catch(() => {}); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw genericError();
      return data;
    };
    try { return await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(genericError()); }, timeoutMs); })]); }
    catch { throw genericError(); } finally { clearTimeout(timer); }
  }
  const validateIds = ids => { if (!Array.isArray(ids) || !ids.length || ids.length > 20 || ids.some(id => typeof id !== 'string' || !id || id.length > 200)) throw new AppError('Select 1 to 20 log records.'); return [...new Set(ids)]; };
  return {
    getSettings: async () => settings(),
    updateSettings: input => exclusive(async () => {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['appKey','userToken'].includes(key))) throw new AppError('Use the AirData application key and user token fields.');
      const next = structuredClone(config);
      for (const key of ['appKey','userToken']) if (Object.hasOwn(input, key)) {
        const value = input[key] === null ? null : typeof input[key] === 'string' ? input[key].trim() : input[key];
        if (value !== null && !(key === 'appKey' ? validAppKey(value) : validToken(value))) throw new AppError('Use the documented AirData upload credential format.');
        if (next[key] !== value) { next.verifiedAt = null; if (key === 'userToken') next.accountId = value ? randomUUID() : null; }
        next[key] = value;
      }
      await persist(next); return settings();
    }),
    checkConnection: () => exclusive(async () => {
      if (locked || !config.appKey || !config.userToken) throw new AppError(settings().reason, 409);
      await persist({ ...config, verifiedAt: null });
      const params = new URLSearchParams({ appkey: config.appKey, usertoken: config.userToken });
      const result = await request('https://api.airdata.com/flight_upload_auth?' + params);
      if (result.status !== 'success') throw genericError();
      await persist({ ...config, verifiedAt: timestamp() }); return settings();
    }),
    sendLogs: ids => exclusive(async () => {
      requireReady(); const selected = validateIds(ids).map(id => store.getFlightLog(id)); const results = [];
      for (const log of selected) {
        const existing = log.airdataTransfer?.accountId === config.accountId ? log.airdataTransfer : null;
        if (log.airdataStatus === 'uploaded' || !UPLOAD_FORMATS.includes(log.format) || (existing && !['error','preparing'].includes(existing.status))) { results.push({ id: log.id, skipped: true, message: 'Manually marked sent, unsupported destination format, or an existing submission needs no resend.' }); continue; }
        let receipt = { accountId: config.accountId, attemptId: randomUUID(), jobId: null, status: 'preparing', startedAt: timestamp(), updatedAt: timestamp(), message: 'Preparing an explicit AirData upload.' };
        const record = async (status, message, extra = {}) => { receipt = { ...receipt, ...extra, status, message, updatedAt: timestamp() }; await store.recordAirdataTransfer(log.id, receipt); };
        try {
          const bytes = await store.getFlightOriginal(log.id);
          await record('preparing', 'Preparing an explicit AirData upload.');
          const params = { appkey: config.appKey, usertoken: config.userToken, appname: 'fpvbench', appversion: '0.5.0' };
          const destination = await request('https://api.airdata.com/get_upload_destination', { method: 'POST', body: new URLSearchParams({ ...params, filename: log.filename.split(/[\\/]/).at(-1) }) });
          let target; try { target = new URL(destination.upload_url); } catch { throw genericError(); }
          if (target.protocol !== 'https:' || target.username || target.password || target.port || !/^api(?:-[a-z0-9-]+)?\.airdata\.com$/.test(target.hostname) || target.pathname !== '/flight_upload' || target.search || target.hash) throw genericError();
          const form = new FormData(); for (const [key, value] of Object.entries(params)) form.append(key, value);
          form.append('file', new Blob([bytes]), log.filename.split(/[\\/]/).at(-1));
          await record('submitting', 'Submission started; completion is not yet established.');
          const result = await request(target.href, { method: 'POST', body: form });
          if (result.status !== 'success' || typeof result.job_id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(result.job_id)) throw genericError();
          await record('pending', 'AirData accepted the file for processing.', { jobId: result.job_id });
          results.push({ id: log.id, status: 'pending' });
        } catch {
          const uncertain = ['submitting','pending'].includes(receipt.status);
          await record(uncertain ? 'unknown' : 'error', uncertain ? 'Submission outcome is unknown. Do not resend without checking AirData.' : 'The file was not submitted. Review connection or format before retrying.');
          results.push({ id: log.id, status: receipt.status, message: receipt.message });
        }
      }
      return { results };
    }),
    refreshJobs: ids => exclusive(async () => {
      requireReady(); const selected = validateIds(ids).map(id => store.getFlightLog(id)); const results = [];
      for (const log of selected) {
        const receipt = log.airdataTransfer;
        if (!receipt || receipt.accountId !== config.accountId || !receipt.jobId || !['pending','running','unknown'].includes(receipt.status)) { results.push({ id: log.id, skipped: true }); continue; }
        try {
          const data = await request('https://api.airdata.com/flight_job/' + encodeURIComponent(receipt.jobId) + '?' + new URLSearchParams({ usertoken: config.userToken }));
          const status = { Pending: 'pending', Running: 'running', Success: 'success', Error: 'error' }[data.data?.status];
          if (!status) throw genericError();
          await store.recordAirdataTransfer(log.id, { ...receipt, status, updatedAt: timestamp(), message: status === 'success' ? 'AirData confirmed successful processing of this submission.' : status === 'error' ? 'AirData reported a processing error. Review the original or retry deliberately.' : 'AirData processing is still in progress.' });
          results.push({ id: log.id, status });
        } catch { results.push({ id: log.id, status: receipt.status, message: 'Status unavailable; the existing receipt was retained.' }); }
      }
      return { results };
    }),
    async close() { closed = true; await tail; },
  };
}
