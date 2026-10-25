/** The beginner example reads synthetic browser fixtures and never creates workspace records. */
export async function runGettingStartedJourney({ page, expect, baseURL }) {
  const before = await (await page.request.get(baseURL + '/api/state')).json();
  const writes = [];
  const requests = request => {
    if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) writes.push(request.method() + ' ' + new URL(request.url()).pathname);
  };
  page.on('request', requests);
  try {
    await page.getByRole('button', { name: 'Start here', exact: true }).click();
    const start = page.getByRole('region', { name: 'Getting started', exact: true });
    const example = page.getByRole('region', { name: 'Synthetic controller example', exact: true });
    await expect(start.getByRole('heading', { name: 'Understand your controls, one setup at a time' })).toBeVisible();
    await expect(example).not.toBeVisible();
    await start.getByRole('button', { name: 'Try the example', exact: true }).click();
    await expect(example).toBeVisible();
    await expect(example.getByText(/does not add aircraft, change your setups/)).toBeVisible();
    await expect(example.getByText('4 expected button changes', { exact: true })).toBeVisible();
    await example.locator('[data-control="c1"]').click();
    await expect(example.getByRole('region', { name: 'Selected physical control', exact: true }).getByText('Find the quad', { exact: true })).toBeVisible();
    await expect(example.getByRole('button', { name: 'Save control observations', exact: true })).toHaveCount(0);
    await page.getByLabel('Example setup', { exact: true }).selectOption('before');
    await expect(example.getByRole('heading', { name: 'What changed', exact: true })).toHaveCount(0);
    await page.getByLabel('Example setup', { exact: true }).selectOption('after');
    await expect(example.getByText('4 expected button changes', { exact: true })).toBeVisible();
    const recovery = page.getByRole('region', { name: 'Backup and recovery', exact: true });
    await expect(recovery.getByRole('link', { name: 'Download workspace backup', exact: true })).toHaveAttribute('href', '/api/export');
    await recovery.getByText('How to restore a backup', { exact: true }).click();
    await expect(recovery.getByText(/Restoring replaces the workspace; it does not merge/)).toBeVisible();
    await expect(recovery.locator('code').filter({ hasText: 'npm run restore' }).first()).toBeVisible();
    await expect(recovery.getByText(/Optional AI keys, AI history and local folder preferences are not included/)).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const after = await (await page.request.get(baseURL + '/api/state')).json();
    expect(after).toEqual(before);
    expect(writes).toEqual([]);
    return { passed: ['start-here path', 'synthetic comparison', 'button exploration', 'setup switching', 'no demo mutations', 'backup and stopped-server recovery instructions', 'mobile layout'], writes };
  } finally {
    page.off('request', requests);
  }
}
