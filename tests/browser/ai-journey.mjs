import { syntheticCredential } from './test-ai.mjs';

/** Settings must be usable before any aircraft exists; opening them never calls the provider. */
export async function checkEmptyAiSettings({ page, expect, baseURL, provider }) {
  await page.goto(baseURL);
  await page.getByRole('button', { name: /Settings/ }).click();
  await expect(page.getByRole('heading', { name: 'OpenAI API (ChatGPT models)', exact: true })).toBeVisible();
  await expect(page.getByLabel('OpenAI API key', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Monthly app allowance (USD)', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Enable optional OpenAI assistance', { exact: true })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Test connection · small billed API call', exact: true })).toBeDisabled();
  expect(provider.calls).toHaveLength(0);
  await page.getByRole('button', { name: /Overview/ }).click();
  await expect(page.getByRole('button', { name: 'Create AI flight recap', exact: true })).toHaveCount(0);
}

/** Fake-provider UI proof; no real API credentials, HTTP routes, or database are used. */
export async function runAiJourney({ page, expect, baseURL, provider, experimentText, screenshotDir }) {
  const errors = [], expectedQuotaErrors = [], externalRequests = [];
  const onError = error => errors.push(error.message);
  const onConsole = message => {
    if (message.type() !== 'error') return;
    if (message.location().url === baseURL + '/api/ai/review' && /409/.test(message.text())) expectedQuotaErrors.push(message.text());
    else errors.push(message.text());
  };
  page.on('pageerror', onError);
  page.on('console', onConsole);
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort();
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const content = page.getByLabel('Workbench content');
  const showSnapshot = async label => {
    await page.getByRole('button', { name: /Setup history/ }).click();
    await content.getByRole('button', { name: label, exact: true }).click();
  };
  const showSettings = () => page.getByRole('button', { name: /Settings/ }).click();
  const saveSettings = async () => {
    await content.getByRole('button', { name: 'Save AI settings', exact: true }).click();
    await expect(page.getByText('AI settings saved. Saving does not make a billed API call.', { exact: true })).toBeVisible();
    await expect(content.getByRole('button', { name: 'Save AI settings', exact: true })).toBeEnabled();
  };
  const assertPrivate = async () => {
    for (const path of ['/api/ai/settings', '/api/state', '/api/export']) {
      const response = await page.request.get(baseURL + path);
      expect(response.status()).toBe(200);
      expect(await response.text()).not.toContain(syntheticCredential);
    }
    expect(await page.evaluate(() => JSON.stringify({ ...globalThis.localStorage }))).not.toContain(syntheticCredential);
    expect(await page.locator('body').innerText()).not.toContain(syntheticCredential);
  };
  await showSnapshot('Experiment smoke');
  await expect(content.getByRole('button', { name: 'Review setup with AI', exact: true })).toHaveCount(0);
  await showSettings();
  await content.getByLabel('Enable optional OpenAI assistance', { exact: true }).check();
  await content.getByLabel('OpenAI API key', { exact: true }).fill(syntheticCredential);
  await content.getByLabel('Monthly app allowance (USD)', { exact: true }).fill('10');
  await saveSettings();
  await expect(content.getByLabel('OpenAI API key', { exact: true })).toHaveValue('');
  expect(provider.calls).toHaveLength(0);
  await assertPrivate();
  const unverified = await (await page.request.get(baseURL + '/api/ai/settings')).json();
  expect(unverified).toMatchObject({ keyConfigured: true, available: false, billingState: 'unverified' });
  await content.getByRole('button', { name: 'Test connection · small billed API call', exact: true }).click();
  await expect(page.getByText('Connection test completed. Availability reflects the latest verified result.', { exact: true })).toBeVisible();
  expect(provider.calls).toHaveLength(1);
  await showSnapshot('Experiment smoke');
  await expect(content.getByRole('button', { name: 'Review setup with AI', exact: true })).toBeVisible();
  await content.getByLabel('Flying goal or question (optional)', { exact: true }).fill('Explain stick response from this evidence.');
  await content.getByRole('button', { name: 'Review setup with AI', exact: true }).click();
  await expect(content.getByText('Synthetic setup explanation', { exact: true })).toBeVisible();
  expect(provider.calls).toHaveLength(2);
  await expect(content.getByRole('heading', { name: 'Referenced documentation', exact: true })).toBeVisible();
  const links = await content.locator('.ai-sources a').evaluateAll(nodes => nodes.map(node => node.href));
  expect(links.length).toBeGreaterThan(0);
  expect(links.every(href => new URL(href).hostname === 'betaflight.com')).toBe(true);
  await expect(content.locator('.ai-report')).toContainText('Preferred baseline:');
  await expect(content.locator('.ai-report')).toContainText('Baseline smoke');
  await expect(content.locator('.ai-report')).toContainText('Explain stick response from this evidence.');
  const rawHref = await content.getByRole('link', { name: '↓ Original export', exact: true }).getAttribute('href');
  const sourceId = rawHref.split('/')[3];
  const cachedEvidence = await (await page.request.get(baseURL + '/api/ai/review/' + sourceId)).json();
  expect(cachedEvidence.context.snapshotId).toBe(sourceId);
  expect(cachedEvidence.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  await page.getByRole('button', { name: /Overview/ }).click();
  await showSnapshot('Experiment smoke');
  await expect(content.getByText('Synthetic setup explanation', { exact: true })).toBeVisible();
  expect(provider.calls).toHaveLength(2);
  if (screenshotDir) {
    await content.getByText('Synthetic setup explanation', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: screenshotDir + '/fpvbench-ai-review.png' });
  }
  await page.getByRole('button', { name: /Overview/ }).click();
  await content.getByRole('button', { name: 'Create AI flight recap', exact: true }).click();
  await expect(content.getByText('Synthetic aggregate flight recap', { exact: true })).toBeVisible();
  await expect(content.getByRole('heading', { name: 'Computed facts used in this recap', exact: true })).toBeVisible();
  expect(provider.calls).toHaveLength(3);

  await showSettings();
  await content.getByLabel('Automatically review newly imported Betaflight setups').check();
  await saveSettings();
  expect(provider.calls).toHaveLength(3);
  const importSetup = async label => {
    await page.getByRole('button', { name: /Overview/ }).click();
    await page.locator('.heading-actions').getByRole('button', { name: '↑ Import setup', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Import Betaflight setup' });
    await dialog.getByLabel('Setup label').fill(label);
    await dialog.getByLabel('Or paste the CLI export').fill(experimentText + '# synthetic AI browser case: ' + label);
    await dialog.getByRole('button', { name: 'Save snapshot', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(content.getByRole('heading', { name: label, exact: true })).toBeVisible();
  };
  await importSetup('Automatic AI smoke');
  await expect(content.getByText('Synthetic setup explanation', { exact: true })).toBeVisible();
  expect(provider.calls).toHaveLength(4);
  await showSnapshot('Automatic AI smoke');
  await expect(content.getByText('Synthetic setup explanation', { exact: true })).toBeVisible();
  expect(provider.calls).toHaveLength(4);

  provider.setQuota(true);
  await content.getByLabel('Flying goal or question (optional)', { exact: true }).fill('A different question to avoid the cache.');
  await content.getByRole('button', { name: 'Review setup with AI', exact: true }).click();
  await expect(content.getByRole('button', { name: 'Review setup with AI', exact: true })).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Check Settings');
  expect(provider.calls).toHaveLength(5);
  await assertPrivate();
  const blocked = await (await page.request.get(baseURL + '/api/ai/settings')).json();
  expect(blocked).toMatchObject({ available: false, billingState: 'blocked' });
  await importSetup('Offline after quota');
  await expect(content.getByRole('button', { name: 'Review setup with AI', exact: true })).toHaveCount(0);
  expect(provider.calls).toHaveLength(5);
  await showSettings();
  await expect(page.locator('#ai-availability-reason')).toContainText('billing');
  provider.setQuota(false);
  await content.getByRole('button', { name: 'Test connection · small billed API call', exact: true }).click();
  await expect(page.getByText('Connection test completed. Availability reflects the latest verified result.', { exact: true })).toBeVisible();
  expect(provider.calls).toHaveLength(6);
  await showSnapshot('Automatic AI smoke');
  await expect(content.getByText('Synthetic setup explanation', { exact: true })).toBeVisible();
  expect(provider.calls).toHaveLength(6);
  await showSettings();
  await content.getByLabel('Monthly app allowance (USD)', { exact: true }).fill('0');
  await saveSettings();
  await showSnapshot('Automatic AI smoke');
  await expect(content.getByRole('button', { name: 'Review setup with AI', exact: true })).toHaveCount(0);
  await expect(content.getByText('Synthetic setup explanation', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Overview/ }).click();
  await expect(content.getByRole('button', { name: 'Create AI flight recap', exact: true })).toHaveCount(0);
  expect(provider.calls).toHaveLength(6);
  await showSettings();
  await expect(content.getByLabel('OpenAI API key', { exact: true })).toHaveValue('');
  await assertPrivate();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1)).toBe(true);
  if (screenshotDir) {
    await page.evaluate(() => globalThis.scrollTo(0, 0));
    await page.screenshot({ path: screenshotDir + '/fpvbench-mobile-ai-settings.png' });
  }
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
  page.off('pageerror', onError);
  page.off('console', onConsole);
  return { passed: ['settings accessible before aircraft', 'default features hidden', 'write-only key and no call on save', 'no key in GET/export/localStorage', 'explicit fake connection check enables features', 'goal review with fixed sources and actual context', 'cached goal review makes no call', 'recap computed facts', 'automatic import review cached', 'quota blocks features without credential leak', 'offline import after quota', 'explicit recovered check', 'zero budget hides cached and new features', 'mobile settings without overflow', 'no unexpected browser errors or external requests'], errors, expectedQuotaErrors };
}
