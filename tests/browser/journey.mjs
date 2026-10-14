/**
 * Run the v0.1 browser journey against a disposable loopback workspace.
 * Accepts a Playwright page and expect function from an existing installation.
 * The caller owns server/browser lifetime and must provide synthetic exports.
 */
export async function runJourney({ page, expect, baseURL, baselineText, experimentText, screenshotDir }) {
  const target = new URL(baseURL);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) {
    throw new Error('Browser smoke requires a loopback target.');
  }
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(baseURL);
  await expect(page.getByRole('heading', { name: 'Your flight workbench' })).toBeVisible();
  await expect(page.getByRole('button', { name: '↑ Import setup', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '+ Add aircraft', exact: true }).click();
  const aircraftDialog = page.getByRole('dialog', { name: 'Add an aircraft' });
  await aircraftDialog.getByLabel('Aircraft name').fill('Synthetic smoke quad');
  await aircraftDialog.getByLabel('Type / build').fill('Synthetic Betaflight fixture');
  await aircraftDialog.getByRole('button', { name: 'Add aircraft', exact: true }).click();
  await expect(aircraftDialog).not.toBeVisible();

  for (const [label, rawText] of [
    ['Baseline smoke', '\ufeff' + baselineText.replace(/\r?\n/g, '\r\n')],
    ['Experiment smoke', experimentText.replace(/save\s*$/, 'set smoke_literal = <img src=x onerror="window.__fpvbenchExecuted=true">\nsave\n')],
  ]) {
    await page.locator('.heading-actions').getByRole('button', { name: '↑ Import setup', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Import Betaflight setup' });
    await dialog.getByLabel('Setup label').fill(label);
    if (label === 'Baseline smoke') {
      await dialog.getByLabel('Choose a text export · maximum 1 MiB').setInputFiles({
        name: 'baseline-dump.txt', mimeType: 'text/plain', buffer: Buffer.from(rawText),
      });
      await expect(dialog.getByLabel('Or paste the CLI export')).toHaveValue(/# dump all/);
    } else {
      await dialog.getByLabel('Or paste the CLI export').fill(rawText);
    }
    await dialog.getByRole('button', { name: 'Save snapshot', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    if (label === 'Baseline smoke') {
      const rawLink = page.getByRole('link', { name: '↓ Original export', exact: true });
      await expect(rawLink).toBeVisible();
      const response = await page.request.get(new URL(await rawLink.getAttribute('href'), baseURL).href);
      expect(response.status()).toBe(200);
      expect(await response.body()).toEqual(Buffer.from(rawText));
    }
  }

  await page.getByRole('button', { name: /Setup history/ }).click();
  await page.getByRole('button', { name: 'Baseline smoke', exact: true }).click();
  await page.getByRole('button', { name: 'Set as baseline', exact: true }).click();
  await expect(page.getByText('PREFERRED BASELINE', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Compare setups/ }).click();
  await expect(page.getByRole('columnheader', { name: 'Baseline smoke', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Experiment smoke', exact: true })).toBeVisible();
  const changed = page.getByRole('row').filter({ hasText: 'p_roll' }).filter({ hasText: 'PID 0' });
  await expect(changed).toContainText('45');
  await expect(changed).toContainText('48');
  await expect(changed).toContainText('changed');
  const sparse = page.getByRole('row').filter({ hasText: 'i_roll' }).filter({ hasText: 'PID 0' });
  await expect(sparse).toContainText('80');
  await expect(sparse).toContainText('Unknown · not in export');
  await expect(page.getByRole('row').filter({ hasText: 'smoke_literal' })).toContainText('<img src=x');
  expect(await page.evaluate(() => globalThis.__fpvbenchExecuted === true)).toBe(false);
  await page.getByLabel('Change filter').selectOption('unknown');
  await expect(changed).toHaveCount(0);
  await expect(sparse).toBeVisible();
  await page.getByLabel('Change filter').selectOption('changes');
  if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/fpvbench-comparison.png`, fullPage: true });

  await page.getByRole('button', { name: '+ Log a flight', exact: true }).click();
  const flightDialog = page.getByRole('dialog', { name: 'Log a flight session' });
  await flightDialog.getByLabel('Session title').fill('Synthetic field test');
  await flightDialog.getByLabel('Flight date and time').fill('2026-10-13T15:30');
  await flightDialog.getByLabel('Duration (minutes)').fill('4.5');
  await flightDialog.getByLabel('Setup used').selectOption({ label: 'Experiment smoke' });
  await flightDialog.getByLabel('I checked the aircraft setup for this session.').check();
  await flightDialog.getByLabel('Location', { exact: true }).fill('Synthetic field');
  await flightDialog.getByLabel('Battery', { exact: true }).fill('Synthetic 6S pack');
  await flightDialog.getByLabel('Props', { exact: true }).fill('Synthetic props');
  await flightDialog.getByLabel('Conditions', { exact: true }).fill('Calm');
  await flightDialog.getByLabel('Compared with your previous setup').selectOption('better');
  await flightDialog.getByLabel('Observations').fill('Synthetic comparison observations');
  await flightDialog.getByLabel('Footage / log references').fill('synthetic/flight.mp4\nsynthetic/flight.bbl');
  await flightDialog.getByRole('button', { name: 'Save session', exact: true }).click();
  await expect(flightDialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Synthetic field test', exact: true })).toBeVisible();
  await expect(page.getByText('Confirmed for this session', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Workbench content').getByText('Experiment smoke', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const editDialog = page.getByRole('dialog', { name: 'Edit flight session' });
  await expect(editDialog.getByLabel('Setup used')).toHaveValue(/.+/);
  await expect(editDialog.getByLabel('I checked the aircraft setup for this session.')).toBeChecked();
  await editDialog.getByLabel('Observations').fill('Revised synthetic observations');
  await editDialog.getByLabel('Compared with your previous setup').selectOption('same');
  await editDialog.getByRole('button', { name: 'Save session', exact: true }).click();
  await expect(editDialog).not.toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Flight sessions/ }).click();
  await expect(page.getByText('Revised synthetic observations', { exact: true })).toBeVisible();
  await expect(page.getByText('ABOUT THE SAME', { exact: true })).toBeVisible();
  await expect(page.getByText('Confirmed for this session', { exact: true })).toBeVisible();
  await expect(page.getByText('synthetic/flight.bbl', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of [/Overview/, /Setup history/, /Compare setups/, /Flight sessions/]) {
    await page.getByRole('button', { name }).click();
    await expect(page.locator('.loading')).toHaveCount(0);
    expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1)).toBe(true);
  }
  if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/fpvbench-mobile-session.png`, fullPage: true });
  expect(errors).toEqual([]);
  return {
    passed: ['empty state', 'create aircraft', 'BOM/CRLF file import and exact raw download', 'paste import', 'baseline',
      'changed and sparse-unknown comparison', 'comparison filter', 'inert imported HTML',
      'linked confirmed session', 'edit session', 'reload persistence', 'mobile overflow', 'browser errors'],
    errors,
  };
}
