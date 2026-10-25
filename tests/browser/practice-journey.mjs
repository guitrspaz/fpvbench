import { PRACTICE_IDS } from '../../src/practice-data.mjs';

/** A practice-only novice task pass. Records are fictional; no human study is implied. */
export async function runPracticeJourney({ page, expect, baseURL, screenshotDir }) {
  const errors = [], external = [];
  const onError = error => errors.push(error.message);
  const onRequest = request => { if (new URL(request.url()).origin !== new URL(baseURL).origin) external.push(request.url()); };
  page.on('pageerror', onError); page.on('request', onRequest);
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(baseURL);
    const banner = page.getByLabel('Practice workspace notice', { exact: true });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('reset');
    await page.setViewportSize({width:1440,height:700});
    const sidebarExport=page.getByRole('link',{name:'↓ Export workspace',exact:true});
    await sidebarExport.scrollIntoViewIfNeeded();
    await expect(sidebarExport).toBeInViewport();
    await page.setViewportSize({width:1440,height:1000});
    await page.getByLabel('Fleet status filter', { exact: true }).selectOption('all');
    await page.getByLabel('Selected aircraft', { exact: true }).selectOption(PRACTICE_IDS.aircraft);
    const controllerButton = page.getByRole('button', { name: 'My controller', exact: true });
    await controllerButton.focus(); await page.keyboard.press('Enter');
    const panel = page.getByRole('region', { name: 'Controller 3 map', exact: true });
    await expect(panel.getByText('4 expected button changes', { exact: true })).toBeVisible();
    await expect(panel.locator('[data-control="start-stop"]')).toContainText('Arm / disarm motors');
    await panel.locator('[data-control="c1"]').focus(); await page.keyboard.press('Enter');
    await expect(panel.getByRole('region', { name: 'Selected physical control', exact: true }).getByText('Find the quad', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Last confirmed flight before this import', exact: true }).click();
    await expect(page.getByLabel('Controller reference')).toHaveValue(PRACTICE_IDS.original);
    await panel.getByRole('button', { name: 'Check this control', exact: true }).click();
    await expect(panel.getByRole('heading', { name: /Step 1 of 3/ })).toBeFocused();
    await panel.getByRole('button', { name: 'Leave unfinished', exact: true }).click();
    const source = await (await page.request.get(baseURL + '/api/snapshots/' + PRACTICE_IDS.revised)).json();
    expect(source.controller).toBeUndefined();
    await page.getByLabel('Selected aircraft', { exact: true }).selectOption(PRACTICE_IDS.softwareAircraft);
    await expect(panel.getByText(/different aircraft software or hardware/)).toBeVisible();
    await expect(panel.getByText(/Next: open each backup/)).toBeVisible();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(banner).toBeVisible();
    const apiKey = page.locator('input[name="apiKey"]');
    if (await apiKey.count()) await expect(apiKey).toBeDisabled();
    const saveAi = page.getByRole('button', { name: 'Save AI settings', exact: true });
    if (await saveAi.count()) await expect(saveAi).toBeDisabled();
    await page.getByRole('button', { name: 'Backup and recovery', exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download workspace backup', exact: true }).click()]);
    expect(download.suggestedFilename()).toBe('fpvbench-practice-workspace.json');
    const stream = await download.createReadStream(), chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const backup = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    expect(backup.aircraft).toHaveLength(2);
    expect(backup.snapshots.every(s => !s.controller)).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(banner).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (screenshotDir) await page.screenshot({ path: screenshotDir + '/fpvbench-practice-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    expect(errors).toEqual([]); expect(external).toEqual([]);
    return { passed: ['persistent practice notice', 'keyboard controller navigation', 'four readable example changes', 'last confirmed example flight', 'unfinished check saves nothing', 'software-change unknown and next steps', 'credentials unavailable', 'practice-labelled export', 'mobile reflow', 'no external requests'], errors };
  } finally {
    page.off('pageerror', onError); page.off('request', onRequest);
  }
}
