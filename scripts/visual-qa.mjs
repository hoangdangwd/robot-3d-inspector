import { spawn, spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const port = process.env.VISUAL_QA_PORT || '5241';
const url = `http://127.0.0.1:${port}/?qa=1`;
const previewCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const inspector = '.pi/skills/threejs-qa-release/scripts/inspect-threejs-canvas.mjs';
const preview = spawn(previewCommand, ['preview', '--port', port], { stdio: 'ignore', shell: process.platform === 'win32', windowsHide: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  await mkdir('artifacts/qa', { recursive: true });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}`);
      if (response.ok) { ready = true; break; }
    } catch {}
    await wait(100);
  }
  if (!ready) throw new Error(`preview server did not start on ${port}`);
  const runs = [
    ['desktop', ['--url', url, '--state', 'active-play', '--seed', '9001', '--run-id', 'qa-active-desktop', '--out', 'artifacts/qa/active-desktop']],
    ['mobile', ['--url', url, '--state', 'active-play', '--seed', '9001', '--mobile', '--run-id', 'qa-active-mobile', '--out', 'artifacts/qa/active-mobile']],
  ];
  for (const [name, args] of runs) {
    const result = spawnSync(process.execPath, [inspector, ...args], { stdio: 'inherit', shell: false });
    if (result.status !== 0) throw new Error(`${name} visual QA failed with exit code ${result.status}`);
  }
  console.log('PASS: deterministic active-play canvas QA captured for desktop and mobile.');
} finally {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(preview.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
  } else {
    preview.kill('SIGTERM');
  }
}
