// Full browser acceptance suite for the production preview.
import { spawn, spawnSync } from 'node:child_process';

const port = process.env.ACCEPTANCE_PORT || '5235';
const url = `http://127.0.0.1:${port}`;
const previewCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const preview = spawn(previewCommand, ['preview', '--port', port], { stdio: 'ignore', shell: process.platform === 'win32', windowsHide: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, SHOWCASE_URL: url },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`)));
  });
}

try {
  for (let i = 0; i < 50; i++) {
    try { await fetch(url); break; } catch { await wait(100); }
  }
  await run('scripts/fight-mode-smoke.mjs');
  await run('scripts/browser-smoke.mjs');
  await run('scripts/touch-smoke.mjs');
  await run('scripts/performance-smoke.mjs');
  console.log('PASS: browser acceptance suite (Fight Mode + showcase + touch + active-scene performance evidence).');
} finally {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(preview.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
  } else {
    preview.kill('SIGTERM');
  }
}
