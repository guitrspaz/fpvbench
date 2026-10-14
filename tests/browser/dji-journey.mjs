import { decodedDjiFixture } from '../helpers/dji-fixtures.mjs';

/** Synthetic JSON browser journey; the server injects an in-memory repository. */
export async function runDjiJourney({ page, expect, baseURL, screenshotDir }) {
  const errors = [], expectedValidationErrors = [], externalRequests = [];
  const onPageError = error => errors.push(error.message);
  const onConsole = message => {
    if (message.type() !== 'error') return;
    if (message.location().url === baseURL + '/api/flight-logs' && /422/.test(message.text())) expectedValidationErrors.push(message.text());
    else errors.push(message.text());
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort();
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const content = page.getByLabel('Workbench content');
  const decoded = decodedDjiFixture({ frames: Array.from({ length: 101 }, (_, index) => ({
    timestamp: new Date(Date.parse('2026-10-14T12:00:00Z') + index * 1000).toISOString(),
    elapsedSeconds: index, latitude: 10, longitude: 20, altitudeMeters: 5 + index / 10,
    batteryPercent: 90, horizontalSpeedMps: 5,
  })) });
  const summary = decodedDjiFixture({ details: { ...decodedDjiFixture().details, startTime: '2026-10-14T13:00:00Z' }, frames: [] });
  const decodedBytes = Buffer.from(JSON.stringify(decoded, null, 2) + '\r\n');
  const summaryBytes = Buffer.from(JSON.stringify(summary, null, 2) + '\n');
  const file = (name, buffer) => ({ name, mimeType: 'application/json', buffer });
  const readState = async () => (await page.request.get(baseURL + '/api/state')).json();
  const importFiles = async files => {
    await page.locator('.heading-actions').getByRole('button', { name: '↑ Import DJI flights', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Import DJI flights' });
    await dialog.getByLabel('Source device (optional)').fill('Synthetic DJI RC');
    await dialog.getByLabel('Choose one or more flight records · maximum 25 MiB each').setInputFiles(files);
    await dialog.getByRole('button', { name: 'Import selected flights', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Import selected flights', exact: true })).toBeEnabled();
    return dialog;
  };
  const before = await readState();
  const batch = await importFiles([file('decoded-smoke.json', decodedBytes), file('malformed-smoke.json', Buffer.from('{bad JSON')), file('summary-smoke.json', summaryBytes)]);
  await expect(batch.getByText('2 saved or already imported · 1 failed. Successful imports are retained.', { exact: true })).toBeVisible();
  await expect(batch.getByText('SAVED', { exact: true })).toHaveCount(2);
  await expect(batch.getByText('NOT IMPORTED', { exact: true })).toHaveCount(1);
  await batch.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(content.getByRole('heading', { name: '2 imported flights', exact: true })).toBeVisible();
  await expect(content.getByText('DECODED', { exact: true })).toBeVisible();
  await expect(content.getByText('SUMMARY ONLY', { exact: true })).toBeVisible();
  const after = await readState();
  expect(after.flightLogs).toHaveLength(before.flightLogs.length + 2);
  expect(after.sessions).toHaveLength(before.sessions.length + 2);

  await content.getByRole('button', { name: 'summary-smoke.json', exact: true }).click();
  await expect(content.getByText('SUMMARY ONLY', { exact: true })).toBeVisible();
  await expect(content.getByText('No decoded telemetry frames are stored for this flight.', { exact: true })).toBeVisible();
  await expect(content.getByText('120 seconds', { exact: true })).toBeVisible();
  let rawLink = content.getByRole('link', { name: '↓ Original flight record', exact: true });
  let response = await page.request.get(new URL(await rawLink.getAttribute('href'), baseURL).href);
  expect(await response.body()).toEqual(summaryBytes);
  await content.getByRole('button', { name: '← All DJI imports', exact: true }).click();
  await content.getByRole('button', { name: 'decoded-smoke.json', exact: true }).click();
  await expect(content.getByText('DECODED', { exact: true })).toBeVisible();
  await expect(content.getByText('LOG VERSION 13', { exact: true })).toBeVisible();
  await expect(content.getByText('250 m', { exact: true })).toBeVisible();
  await expect(content.getByText('1–100 of 101 frames', { exact: true })).toBeVisible();
  await expect(content.getByRole('button', { name: '← Previous', exact: true })).toBeDisabled();
  await content.getByRole('button', { name: 'Next →', exact: true }).click();
  await expect(content.getByText('101–101 of 101 frames', { exact: true })).toBeVisible();
  await expect(content.getByRole('button', { name: 'Next →', exact: true })).toBeDisabled();
  await content.getByRole('button', { name: '← Previous', exact: true }).click();
  await expect(content.getByText('1–100 of 101 frames', { exact: true })).toBeVisible();
  rawLink = content.getByRole('link', { name: '↓ Original flight record', exact: true });
  const rawPath = await rawLink.getAttribute('href');
  const importedId = rawPath.split('/')[3];
  response = await page.request.get(new URL(rawPath, baseURL).href);
  expect(response.status()).toBe(200);
  expect(await response.body()).toEqual(decodedBytes);
  await expect(content.getByLabel('AirData upload status', { exact: true })).toHaveValue('unknown');
  await content.getByLabel('AirData upload status', { exact: true }).selectOption('uploaded');
  await content.getByRole('button', { name: 'Save AirData status', exact: true }).click();
  await expect(page.getByText('AirData status saved.', { exact: true })).toBeVisible();
  await expect(content.getByLabel('AirData upload status', { exact: true })).toBeEnabled();
  await expect(content.getByLabel('AirData upload status', { exact: true })).toHaveValue('uploaded');
  await content.getByRole('button', { name: '← All DJI imports', exact: true }).click();
  await content.getByLabel('Filter AirData upload status', { exact: true }).selectOption('uploaded');
  await expect(content.getByRole('button', { name: 'decoded-smoke.json', exact: true })).toBeVisible();
  await expect(content.getByRole('button', { name: 'summary-smoke.json', exact: true })).toHaveCount(0);
  await content.getByLabel('Filter AirData upload status', { exact: true }).selectOption('unknown');
  await expect(content.getByRole('button', { name: 'summary-smoke.json', exact: true })).toBeVisible();
  await expect(content.getByRole('button', { name: 'decoded-smoke.json', exact: true })).toHaveCount(0);
  await content.getByLabel('Filter AirData upload status', { exact: true }).selectOption('');
  await content.getByRole('button', { name: 'decoded-smoke.json', exact: true }).click();
  await expect(content.getByText('1–100 of 101 frames', { exact: true })).toBeVisible();
  if (screenshotDir) {
    await page.evaluate(() => globalThis.scrollTo(0, 0));
    await page.screenshot({ path: screenshotDir + '/fpvbench-dji-detail.png' });
  }

  const duplicate = await importFiles([file('renamed-decoded.json', decodedBytes), file('renamed-summary.json', summaryBytes)]);
  await expect(duplicate.getByText('2 saved or already imported · 0 failed. Successful imports are retained.', { exact: true })).toBeVisible();
  await expect(duplicate.getByText('ALREADY IMPORTED', { exact: true })).toHaveCount(2);
  await duplicate.getByRole('button', { name: 'Close', exact: true }).click();
  const deduped = await readState();
  expect(deduped.flightLogs).toHaveLength(after.flightLogs.length);
  expect(deduped.sessions).toHaveLength(after.sessions.length);
  expect(deduped.flightLogs.find(log => log.id === importedId).airdataStatus).toBe('uploaded');
  await content.getByRole('button', { name: 'decoded-smoke.json', exact: true }).click();
  await content.getByRole('button', { name: 'Edit session notes', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit flight session' });
  await expect(edit.getByLabel('Duration (minutes)')).toHaveValue('2');
  await expect(edit.getByLabel('Flight date and time')).toHaveValue(/^2026-10-14T/);
  await expect(edit.getByLabel('Setup used')).toHaveValue('');
  await expect(edit.getByLabel('I checked the aircraft setup for this session.')).not.toBeChecked();
  await expect(edit.getByText(/Editing your observations preserves that original link/)).toBeVisible();
  await edit.getByLabel('Observations').fill('Synthetic DJI session notes retained');
  await edit.getByLabel('Compared with your previous setup').selectOption('better');
  await edit.getByRole('button', { name: 'Save session', exact: true }).click();
  await expect(edit).not.toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Flight sessions/ }).click();
  const importedCard = content.getByRole('article').filter({ hasText: 'Synthetic DJI session notes retained' });
  await expect(importedCard).toContainText('Imported DJI flight');
  await expect(importedCard).toContainText('decoded-smoke.json');
  await expect(importedCard).toContainText('Not confirmed');
  const reloaded = await readState();
  const linked = reloaded.sessions.find(session => session.flightLogId === importedId);
  expect(linked.notes).toBe('Synthetic DJI session notes retained');
  expect(linked.snapshotId).toBeNull();
  expect(linked.confirmedSetup).toBe(false);
  expect(reloaded.flightLogs.find(log => log.id === importedId).airdataStatus).toBe('uploaded');

  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of [/Overview/, /Setup history/, /Compare setups/, /Flight sessions/, /DJI flight imports/]) {
    await page.getByRole('button', { name }).click();
    await expect(page.locator('.loading')).toHaveCount(0);
    expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1)).toBe(true);
  }
  await content.getByRole('button', { name: 'decoded-smoke.json', exact: true }).click();
  await expect(content.getByText('1–100 of 101 frames', { exact: true })).toBeVisible();
  await expect(content.getByLabel('AirData upload status', { exact: true })).toHaveValue('uploaded');
  expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1)).toBe(true);
  if (screenshotDir) {
    await page.evaluate(() => globalThis.scrollTo(0, 0));
    await page.screenshot({ path: screenshotDir + '/fpvbench-mobile-dji.png' });
  }
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
  page.off('pageerror', onPageError);
  page.off('console', onConsole);
  return { passed: ['multi-file JSON upload', 'partial batch retains successes', 'summary-only and decoded labels', 'summary metrics', 'exact original downloads', 'telemetry pagination', 'renamed-file deduplication', 'metadata-created unconfirmed session', 'imported link survives edit/reload', 'AirData status/filter survives dedupe and session edit/reload', 'mobile views and telemetry', 'no unexpected browser errors', 'no external requests'], errors, expectedValidationErrors };
}
