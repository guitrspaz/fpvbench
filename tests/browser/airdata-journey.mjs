import { createAirdataService } from '../../src/airdata.mjs';

/** Real upload-state logic with a fake AirData transport; no external uploads. */
export function browserAirdata() {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options.method || 'GET' });
    const data = url.includes('flight_upload_auth') ? { status: 'success' } : url.includes('get_upload_destination') ? { upload_url: 'https://api.airdata.com/flight_upload' } : url.includes('/flight_job/') ? { data: { status: 'Success' } } : { status: 'success', job_id: 'job_SYNTHETIC_BROWSER' };
    return new Response(JSON.stringify(data), { status: 200 });
  };
  return { calls, factory: (directory, options) => createAirdataService(directory, { ...options, fetchImpl }) };
}

export async function runAirdataJourney({ page, expect, baseURL, airdata }) {
  const readState = async () => (await page.request.get(baseURL + '/api/state')).json();
  const before = await readState();
  await page.getByRole('button', { name: /Settings/ }).click();
  await expect(page.getByRole('button', { name: 'Check AirData connection', exact: true })).toBeDisabled();
  await page.getByLabel('AirData user upload token', { exact: true }).fill('HDTEST0001');
  await page.getByLabel('AirData developer application key', { exact: true }).fill('TESTKEY1');
  await page.getByRole('button', { name: 'Save AirData settings', exact: true }).click();
  await expect(page.getByText('AirData credentials saved privately.', { exact: true })).toBeVisible();
  expect(airdata.calls).toHaveLength(0);
  await expect(page.getByLabel('AirData user upload token', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Check AirData connection', exact: true }).click();
  await expect(page.getByText('AirData upload connection verified.', { exact: true })).toBeVisible();
  expect(airdata.calls).toHaveLength(1);
  await page.getByRole('button', { name: 'Flight log library', exact: true }).click();
  await page.getByRole('button', { name: '↑ Import flight logs', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import flight logs', exact: true });
  const bytes = Buffer.concat([Buffer.from([0x55,0x4c,0x6f,0x67,1,0x12,0x35,1]), Buffer.alloc(8)]);
  await dialog.getByLabel('Choose one or more flight records · maximum 25 MiB each').setInputFiles([
    { name: 'synthetic-native.ulg', mimeType: 'application/octet-stream', buffer: bytes },
    { name: 'synthetic-remote.ridlog', mimeType: 'text/plain', buffer: Buffer.from('opaque synthetic capture') },
  ]);
  await dialog.getByRole('button', { name: 'Import selected flights', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Import selected flights', exact: true })).toBeEnabled();
  await expect(dialog.getByText('2 saved or already imported · 0 failed. Successful imports are retained.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  const imported = await readState();
  expect(imported.sessions).toEqual(before.sessions);
  expect(imported.flightLogs.filter(log => log.status === 'archived')).toHaveLength(2);
  await page.getByLabel('Filter AirData upload status').selectOption('not-uploaded');
  const defaultRow=page.locator('.item-row').filter({has:page.getByRole('button',{name:'synthetic-native.ulg',exact:true})});
  await expect(defaultRow.getByText('AirData: Not uploaded (default)',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'synthetic-remote.ridlog',exact:true})).toBeVisible();
  await page.getByLabel('Select synthetic-native.ulg', { exact: true }).check();
  await page.getByRole('button', { name: 'Send selected logs to AirData', exact: true }).click();
  await expect(page.getByText('AirData: Processing', { exact: true })).toBeVisible();
  expect(airdata.calls).toHaveLength(3);
  await page.getByLabel('Filter AirData upload status').selectOption('not-uploaded');
  await expect(page.getByRole('button',{name:'synthetic-native.ulg',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'synthetic-remote.ridlog',exact:true})).toBeVisible();
  await page.getByLabel('Filter AirData upload status').selectOption('');
  await page.getByLabel('Select synthetic-native.ulg', { exact: true }).check();
  await page.getByRole('button', { name: 'Refresh selected AirData status', exact: true }).click();
  await expect(page.getByText('AirData: Confirmed by AirData', { exact: true })).toBeVisible();
  expect(airdata.calls).toHaveLength(4);
  await page.getByLabel('Filter AirData upload status').selectOption('not-uploaded');
  await expect(page.getByRole('button',{name:'synthetic-native.ulg',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'synthetic-remote.ridlog',exact:true})).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Flight log library', exact: true }).click();
  await expect(page.getByText('AirData: Confirmed by AirData', { exact: true })).toBeVisible();
  await page.getByLabel('Select synthetic-native.ulg', { exact: true }).check();
  await page.getByRole('button', { name: 'Send selected logs to AirData', exact: true }).click();
  await expect(page.getByText('0 processed · 1 skipped. Inspect receipts for results.', { exact: true })).toBeVisible();
  expect(airdata.calls).toHaveLength(4);
  await page.getByLabel('Filter AirData upload status').selectOption('transfer:success');
  await expect(page.getByRole('button', { name: 'synthetic-remote.ridlog', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'synthetic-native.ulg', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'AirData submission receipt', exact: true })).toBeVisible();
  await expect(page.getByText('ARCHIVED ORIGINAL', { exact: true })).toBeVisible();
  const exported = await (await page.request.get(baseURL + '/api/export')).text();
  expect(exported).toContain('job_SYNTHETIC_BROWSER');
  expect(exported).not.toContain('HDTEST0001');
  expect(exported).not.toContain('TESTKEY1');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('HDTEST0001');
  return { passed: ['write-only AirData settings', 'no call on save', 'explicit verification', 'native and unknown archives', 'archives create no flights', 'unmarked defaults join not-uploaded queue','processing and confirmed excluded from not-uploaded queue', 'explicit original upload', 'processing and confirmed receipts', 'reload receipt', 'dedupe submission', 'provider-state filter', 'private credentials excluded from export/browser storage'], providerCalls: airdata.calls.length };
}
