import assert from 'node:assert/strict';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const url = process.env.SHOWCASE_URL || 'http://127.0.0.1:5188';
const edgePath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const cdpPort = Number(process.env.CDP_PORT || 9353);
const profile = await mkdtemp(path.join(tmpdir(), 'robot-foundry-perf-'));
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${url}/?qa=1` });
  for (let i = 0; i < 100; i++) {
    if (await evaluate('Boolean(window.__app?.fighter && window.__THREE_GAME_TEST_HOOKS__)')) break;
    await sleep(100);
  }
  assert.equal(await evaluate('Boolean(window.__THREE_GAME_TEST_HOOKS__)'), true, 'QA hooks are installed only for qa URL');
  await evaluate("window.__THREE_GAME_TEST_HOOKS__.seed(9001)");
  await evaluate("window.__THREE_GAME_TEST_HOOKS__.setState('active-play')");
  await evaluate("window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(false)");
  const metrics = await evaluate(`(async () => {
    let frames = 0;
    const start = performance.now();
    await new Promise(resolve => {
      const sample = () => { frames++; if (performance.now() - start >= 2000) resolve(); else requestAnimationFrame(sample); };
      requestAnimationFrame(sample);
    });
    const info = window.__app.renderer.info;
    return {
      durationMs: performance.now() - start,
      frames,
      observedFps: frames / ((performance.now() - start) / 1000),
      rendererCalls: info.render.calls,
      triangles: info.render.triangles,
      lines: info.render.lines,
      points: info.render.points,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      simulationTick: window.__app.fightMode.sim.clock.tick,
      simulationStatus: window.__app.fightMode.sim.matchStatus,
    };
  })()`);
  assert.ok(metrics.frames > 10, `active scene rendered frames (${metrics.frames})`);
  assert.ok(metrics.rendererCalls > 0 && metrics.triangles > 0, 'active scene has renderer workload');
  await evaluate("window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true)");
  await mkdir('artifacts/qa', { recursive: true });
  await writeFile('artifacts/qa/performance.json', JSON.stringify({
    url,
    environment: 'Edge headless / SwiftShader; functional timing evidence, not hardware benchmark',
    targetViewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
    metrics,
    budgets: { maxRendererCalls: 220, maxTriangles: 50000, maxGeometries: 200, maxTextures: 100 },
    budgetStatus: {
      rendererCalls: metrics.rendererCalls <= 220,
      triangles: metrics.triangles <= 50000,
      geometries: metrics.geometries <= 200,
      textures: metrics.textures <= 100,
    },
  }, null, 2));
  console.log(`PASS: active Fight Mode performance smoke; ${metrics.rendererCalls} calls, ${metrics.triangles} triangles, ${metrics.geometries} geometries, ${metrics.textures} textures, ${metrics.observedFps.toFixed(1)} observed FPS. See artifacts/qa/performance.json`);
} finally {
  for (const { timer } of pending.values()) clearTimeout(timer);
  socket?.close();
  if (browser.pid) {
    if (process.platform === 'win32') await new Promise(resolve => spawn('taskkill', ['/pid', String(browser.pid), '/T', '/F'], { stdio: 'ignore' }).on('exit', resolve));
    else browser.kill();
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => {});
}
