/**
 * Drives the generator's own page (Vite dev server + headless Chrome) the way a
 * person does on the website: "Import from Clipboard (JSON)", then "ZIP: Split by
 * animation". The page composites and recolors, so the result is the site's.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { GENERATOR_DIR } from './paths';

/** Away from the game's own dev server; Vite moves on to the next free port when taken. */
const FIRST_PORT = 5290;
const SERVER_URL = /Local:\s+(http:\/\/localhost:\d+\/)/;
const SERVER_START_TIMEOUT_MS = 120_000;
const PAGE_TIMEOUT_MS = 120_000;
const EXPORT_TIMEOUT_MS = 180_000;

export interface GeneratorSite {
  /** The ZIP the site downloads for this recipe (raw JSON text of character.json). */
  exportSplitAnimations(
    recipeJson: string,
    expectedItemIds: readonly string[],
  ): Promise<Uint8Array>;
  close(): Promise<void>;
}

export async function openGeneratorSite(): Promise<GeneratorSite> {
  const { server, url } = await startDevServer();
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const openBrowser = browser;
    return {
      exportSplitAnimations: (recipeJson, itemIds) =>
        exportWithFreshPage(openBrowser, url, { recipeJson, itemIds }),
      close: async () => {
        await openBrowser.close();
        server.kill();
      },
    };
  } catch (error) {
    await browser?.close();
    server.kill();
    throw error;
  }
}

interface DevServer {
  server: ChildProcess;
  url: string;
}

function startDevServer(): Promise<DevServer> {
  const vite = join(GENERATOR_DIR, 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(process.execPath, [vite, '--port', String(FIRST_PORT)], {
    cwd: GENERATOR_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      server.kill();
      reject(new Error(`generator dev server did not start in time:\n${output}`));
    }, SERVER_START_TIMEOUT_MS);
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const url = SERVER_URL.exec(stripAnsi(output))?.[1];
      if (url === undefined) return;
      clearTimeout(timer);
      resolve({ server, url });
    };
    server.stdout?.on('data', onData);
    server.stderr?.on('data', onData);
    server.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`generator dev server exited (${code}):\n${output}`));
    });
  });
}

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\[[0-9;]*m/g, '');
}

interface ExportRequest {
  recipeJson: string;
  itemIds: readonly string[];
}

async function exportWithFreshPage(
  browser: Browser,
  url: string,
  { recipeJson, itemIds }: ExportRequest,
): Promise<Uint8Array> {
  const page = await browser.newPage({ acceptDownloads: true });
  page.setDefaultTimeout(PAGE_TIMEOUT_MS);
  const alerts: string[] = [];
  page.on('dialog', (dialog) => {
    alerts.push(dialog.message());
    void dialog.accept();
  });
  try {
    // Stands in for the system clipboard, which a headless page may not read.
    await page.addInitScript((json) => {
      Clipboard.prototype.readText = async () => json;
    }, recipeJson);
    await page.goto(url);
    await importRecipe(page, itemIds, alerts);
    return await downloadZip(page, alerts);
  } finally {
    await page.close();
  }
}

async function importRecipe(
  page: Page,
  expectedItemIds: readonly string[],
  alerts: string[],
): Promise<void> {
  const zipButton = page.getByRole('button', { name: 'ZIP: Split by animation', exact: true });
  await zipButton.and(page.locator(':enabled')).waitFor();
  await page.getByRole('button', { name: 'Import from Clipboard (JSON)' }).click();
  const outcome = await nextAlert(page, alerts, ['Imported', 'Failed']);
  if (outcome !== 'Imported successfully!') {
    throw new Error(`generator refused the recipe: ${outcome}`);
  }
  await page.waitForFunction((ids) => {
    const renderer = (window as unknown as { canvasRenderer?: { drawCalls?: unknown } })
      .canvasRenderer;
    const calls = renderer?.drawCalls;
    if (!Array.isArray(calls)) return false;
    const drawn = new Set(calls.map((call: { itemId?: string }) => call.itemId));
    const busy = document.querySelector('.preview-canvas-busy') !== null;
    return !busy && ids.every((id) => drawn.has(id));
  }, expectedItemIds);
}

async function downloadZip(page: Page, alerts: string[]): Promise<Uint8Array> {
  const download = page.waitForEvent('download', { timeout: EXPORT_TIMEOUT_MS });
  await page.getByRole('button', { name: 'ZIP: Split by animation', exact: true }).click();
  const file = await (await download).path();
  const outcome = await nextAlert(page, alerts, ['Export']);
  if (outcome !== 'Export complete!') throw new Error(`generator export reported: ${outcome}`);
  return new Uint8Array(readFileSync(file));
}

/** The site reports the end of an import or export with an alert; consumes it. */
async function nextAlert(page: Page, alerts: string[], prefixes: string[]): Promise<string> {
  const deadline = Date.now() + EXPORT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const index = alerts.findIndex((message) => prefixes.some((p) => message.startsWith(p)));
    const [outcome] = index >= 0 ? alerts.splice(index, 1) : [];
    if (outcome !== undefined) return outcome;
    await page.waitForTimeout(100);
  }
  throw new Error(`generator did not answer (waiting for ${prefixes.join(' / ')})`);
}
