import { randomUUID } from 'node:crypto';

/** Verify deferred integration and optional bookkeeping with a historical synthetic receipt. */
export async function runAirdataJourney({ page, expect, baseURL, store }) {
  const requests = [];
  const onRequest = request => { if (new URL(request.url()).pathname.startsWith('/api/airdata')) requests.push(request.url()); };
  page.on('request', onRequest);
  await page.getByRole('button', { name: /Settings/ }).click();
  await expect(page.getByRole('heading', { name: 'AirData connection', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('AirData user upload token', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('AirData developer application key', { exact: true })).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem('fpvbench.manualUploadTracking'));
  await page.reload();
  await page.getByRole('button', { name: 'Flight log library', exact: true }).click();
  await expect(page.getByLabel('Show manual upload tracking', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Filter manual upload status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mark selected as uploaded', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Send selected logs to AirData', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh selected AirData status', exact: true })).toHaveCount(0);
  const readState = async () => (await page.request.get(baseURL + '/api/state')).json();
  const before = await readState();
  const bytes = Buffer.concat([Buffer.from([0x55,0x4c,0x6f,0x67,1,0x12,0x35,1]), Buffer.alloc(8)]);
  const response = await page.request.post(baseURL + '/api/log-imports', { data: { filename: 'synthetic-native.ulg', contentBase64: bytes.toString('base64') } });
  expect(response.status()).toBe(201);
  const log = (await response.json()).flightLog;
  expect((await readState()).sessions).toEqual(before.sessions);
  await store.recordAirdataTransfer(log.id, { accountId: randomUUID(), attemptId: randomUUID(), jobId: 'job_SYNTHETIC_BROWSER', status: 'success', startedAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:01:00.000Z', message: 'Synthetic historical receipt' });
  await page.reload(); await page.getByRole('button', { name: 'Flight log library', exact: true }).click();
  await expect(page.getByText('Not uploaded (default)', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'synthetic-native.ulg', exact: true }).click();
  await expect(page.getByLabel('Manual upload status', { exact: true })).not.toBeVisible();
  await page.getByText('Manual upload tracking (optional)', { exact: true }).click();
  await expect(page.getByLabel('Manual upload status', { exact: true })).toHaveValue('unknown');
  await expect(page.getByLabel('Manual upload status', { exact: true }).locator('option:checked')).toHaveText('Not recorded');
  for (const status of ['uploaded', 'not-uploaded', 'unknown']) {
    await page.getByLabel('Manual upload status', { exact: true }).selectOption(status);
    await page.getByRole('button', { name: 'Save manual upload status', exact: true }).click();
    await expect(page.getByText('Manual upload status saved.', { exact: true })).toBeVisible();
    await page.getByText('Manual upload tracking (optional)', { exact: true }).click();
    await expect(page.getByLabel('Manual upload status', { exact: true })).toHaveValue(status);
  }
  await page.getByText('Historical AirData submission receipt', { exact: true }).click();
  await expect(page.getByText('Synthetic historical receipt', { exact: true })).toBeVisible();
  await expect(page.getByText(/Historical evidence only; integration is deferred/)).toBeVisible();
  const exported = await (await page.request.get(baseURL + '/api/export')).json();
  expect(exported.flightLogs.find(item => item.id === log.id).airdataTransfer.jobId).toBe('job_SYNTHETIC_BROWSER');
  expect((await page.request.get(baseURL + '/api/flight-logs/' + log.id + '/raw')).ok()).toBe(true);
  await page.getByRole('button', { name: '← All DJI imports', exact: true }).click();
  await page.getByLabel('Show manual upload tracking', { exact: true }).check();
  await page.getByLabel('Select synthetic-native.ulg', { exact: true }).check();
  await page.getByRole('button', { name: 'Mark selected as uploaded', exact: true }).click();
  await expect(page.getByText('1 marked as uploaded · 0 already marked. No files were sent.', { exact: true })).toBeVisible();
  await page.getByLabel('Show manual upload tracking', { exact: true }).uncheck();
  await expect(page.getByLabel('Select synthetic-native.ulg', { exact: true })).toHaveCount(0);
  await page.reload(); await page.getByRole('button', { name: 'Flight log library', exact: true }).click();
  await expect(page.getByLabel('Show manual upload tracking', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'synthetic-native.ulg', exact: true }).click();
  await page.getByText('Manual upload tracking (optional)', { exact: true }).click();
  await expect(page.getByLabel('Manual upload status', { exact: true })).toHaveValue('uploaded');
  await page.getByLabel('Manual upload status', { exact: true }).selectOption('unknown');
  await page.getByRole('button', { name: 'Save manual upload status', exact: true }).click();
  await expect(page.getByText('Manual upload status saved.', { exact: true })).toBeVisible();
  expect(requests).toEqual([]); page.off('request', onRequest);
  return { passed: ['no AirData settings or upload controls', 'manual tracking defaults off', 'unmarked means not recorded', 'archive import without sessions', 'individual manual mark/change/reset', 'historical receipt independent of connection', 'receipt retained in export', 'original retrievable', 'tracking toggle hides selection without losing marks', 'tracking-off preference survives reload', 'no AirData API requests'] };
}
