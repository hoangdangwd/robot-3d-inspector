import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const url = process.env.SHOWCASE_URL || 'http://127.0.0.1:5188';
const edgePath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const cdpPort = Number(process.env.CDP_PORT || 9352);
const profile = await mkdtemp(path.join(tmpdir(), 'robot-foundry-touch-'));
const browser = spawn(edgePath, ['--headless=new', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--no-first-run', `--user-data-dir=${profile}`, `--remote-debugging-port=${cdpPort}`, '--remote-debugging-address=127.0.0.1', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pending = new Map();
let socket;
let requestId = 0;

try {
  let target;
  for (let i = 0; i < 60; i++) {
    try {
      target = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
      if (target?.webSocketDebuggerUrl) break;
    } catch {}
    await sleep(100);
  }
  assert.ok(target?.webSocketDebuggerUrl, 'Edge CDP target available');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!pending.has(message.id)) return;
    const job = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(job.timer);
    message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++requestId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const tap = async selector => {
    const point = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) throw new Error('missing ${selector}'); e.scrollIntoView({block:'nearest'}); const b=e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2}; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });
  await send('Page.navigate', { url });
  for (let i = 0; i < 100; i++) {
    if (await evaluate('Boolean(window.__app?.fighter)')) break;
    await sleep(100);
  }
  assert.equal(await evaluate('Boolean(window.__app?.fighter)'), true, 'showcase initialized on mobile emulation');
  await tap('#nav-fight');
  await sleep(100);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#vs-setup')).display !== 'none'"), true, 'touch opens VS setup');
  const vsOverflow = await evaluate(`(() => ({ width: document.documentElement.scrollWidth, inner: innerWidth, offenders: [...document.querySelectorAll('*')].map(e => ({tag:e.tagName,id:e.id,cls:e.className?.toString?.().slice(0,40),right:e.getBoundingClientRect().right,left:e.getBoundingClientRect().left,width:e.getBoundingClientRect().width})).filter(x => x.right > innerWidth + 1 || x.left < -1).sort((a,b) => b.right-a.right).slice(0,8) }))()`);
  assert.ok(vsOverflow.width <= vsOverflow.inner + 1, `mobile VS setup has no horizontal overflow (${JSON.stringify(vsOverflow)})`);
  await tap('#vs-start-fight');
  for (let i = 0; i < 30; i++) {
    if (await evaluate("window.__app.mode === 'fight'")) break;
    await sleep(50);
  }
  assert.equal(await evaluate('window.__app.mode'), 'fight', 'touch navigation enters Fight Mode');
  assert.equal(await evaluate("document.querySelector('#fight-hud').style.display !== 'none'"), true, 'Fight HUD is visible on mobile');
  await tap('#timeout-open');
  assert.equal(await evaluate("document.querySelector('#timeout-editor').hidden"), false, 'touch opens Time-out editor');
  const overflow = await evaluate(`(() => ({ width: document.documentElement.scrollWidth, inner: innerWidth, offenders: [...document.querySelectorAll('*')].map(e => ({tag:e.tagName,id:e.id,cls:e.className?.toString?.().slice(0,40),right:e.getBoundingClientRect().right,left:e.getBoundingClientRect().left,width:e.getBoundingClientRect().width})).filter(x => x.right > innerWidth + 1 || x.left < -1).sort((a,b) => b.right-a.right).slice(0,8) }))()`);
  assert.ok(overflow.width <= overflow.inner + 1, `mobile page has no horizontal overflow (${JSON.stringify(overflow)})`);
  await tap('#timeout-cancel');
  assert.equal(await evaluate("document.querySelector('#timeout-editor').hidden"), true, 'touch cancels Time-out');
  await tap('#fight-reset');
  assert.equal(await evaluate('window.__app.fightMode.sim.clock.tick < 90'), true, 'touch reset returns simulation near tick zero');
  console.log('PASS: mobile touch navigation, Time-out open/cancel, reset and overflow checks.');
} finally {
  for (const { timer } of pending.values()) clearTimeout(timer);
  socket?.close();
  if (browser.pid) {
    if (process.platform === 'win32') await new Promise(resolve => spawn('taskkill', ['/pid', String(browser.pid), '/T', '/F'], { stdio: 'ignore' }).on('exit', resolve));
    else browser.kill();
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => {});
}
