import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from '../../src/server.mjs';
import { runJourney } from './journey.mjs';

// Reuse an existing Playwright installation without adding application dependencies.
const moduleDir = process.env.FPVBENCH_PLAYWRIGHT_DIR;
const { chromium } = await import(moduleDir ? pathToFileURL(join(moduleDir, 'index.mjs')).href : 'playwright');
const { expect } = await import(moduleDir ? pathToFileURL(join(moduleDir, 'test.mjs')).href : 'playwright/test');
const dataDir = await mkdtemp(join(tmpdir(), 'fpvbench-browser-'));
const screenshotDir = process.env.FPVBENCH_SCREENSHOT_DIR || process.argv.find(arg => arg.startsWith('--screenshot-dir='))?.slice('--screenshot-dir='.length);
let server, browser;
try {
  if (screenshotDir) await mkdir(screenshotDir, { recursive: true, mode: 0o700 });
  server = await createServer({ dataDir });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.FPVBENCH_CHROMIUM ? { executablePath: process.env.FPVBENCH_CHROMIUM } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const baselineText = await readFile(new URL('../../examples/baseline-dump.txt', import.meta.url), 'utf8');
  const experimentText = await readFile(new URL('../../examples/experiment-diff.txt', import.meta.url), 'utf8');
  const result = await runJourney({ page, expect, baseURL, baselineText, experimentText, screenshotDir });
  console.log(JSON.stringify({ browser: browser.version(), ...result }, null, 2));
} finally {
  if (browser) await browser.close();
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
}
