// Screenshot capture for Tahta Ember: serves game/ with the repo's own
// serve.ts, opens each ?shot= scene from shots.json in Chromium at 1280x720,
// waits for window.__shotReady, and saves a JPEG. Run from the repo root:
//   node tools/capture.mjs
import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.HOME + '/workspace/.playwright/node_modules/playwright-core');

const PORT = 8902;
const shots = JSON.parse(readFileSync(new URL('../shots.json', import.meta.url), 'utf8'));

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'pipe' });
await new Promise((resolve) => setTimeout(resolve, 1200));

const errors = [];
try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  for (const shot of shots) {
    await page.goto(`http://localhost:${PORT}/index.html${shot.query}`, { waitUntil: 'load' });
    try {
      await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 90000 });
    } catch {
      errors.push(`shot ${shot.name} never became ready`);
      continue;
    }
    await page.screenshot({ path: `screenshots/${shot.name}`, type: 'jpeg', quality: 82 });
    const size = statSync(`screenshots/${shot.name}`).size;
    console.log(`${shot.name}: ${size} bytes${size > 262144 ? ' OVER 256 KiB!' : ''}`);
  }
  await browser.close();
} finally {
  server.kill();
}
console.log(errors.length === 0 ? 'console errors: none' : 'console errors:\n' + errors.join('\n'));
