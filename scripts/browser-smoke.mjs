import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ROBOT_CATALOG } from '../src/robots/robotCatalog.js';

const targetUrl = process.env.SHOWCASE_URL || 'http://127.0.0.1:5188';
const edgePath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const outDir = 'artifacts/animation-library';
const port = 9347;
const profile = await mkdtemp(path.join(tmpdir(), 'robot-foundry-'));
await mkdir(outDir, { recursive: true });
const browser = spawn(edgePath, [
  '--headless=new', '--disable-gpu-sandbox', '--use-angle=swiftshader',
  '--hide-scrollbars', '--no-first-run', `--user-data-dir=${profile}`,
  `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', 'about:blank'
], { stdio: 'ignore' });
let launchError;
browser.on('error', error => { launchError = error; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pending = new Map(), errors = [], warnings = [], results = [], motion = [];
let socket, requestId = 0;
try {
  let target;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (launchError) throw launchError;
    try {
      target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
      if (target.webSocketDebuggerUrl) break;
    } catch { /* Browser is still starting. */ }
    await sleep(100);
  }
  assert.ok(target?.webSocketDebuggerUrl, 'headless browser available');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      pending.delete(message.id); clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled') {
      const { type, args } = message.params;
      if (type === 'error' || type === 'assert') errors.push(args);
      if (type === 'warning') warnings.push(args);
    }
    if (message.method === 'Network.loadingFailed' && !message.params.canceled) errors.push(message.params.errorText);
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
  const capture = async name => {
    const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(`${outDir}/${name}.png`, Buffer.from(image.data, 'base64'));
  };
  const click = async selector => {
    const point = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({block:'nearest'}); const b = e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2}; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  };
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: targetUrl });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate('Boolean(window.__app?.fighter)')) { ready = true; break; }
    await sleep(100);
  }
  assert.ok(ready, `app initialized: ${JSON.stringify(errors)}`);
  for (const robot of ROBOT_CATALOG) {
    await click(`[data-robot-id="${robot.id}"]`);
    await click('[data-family="ALL"]');
    for (let i = 0; i < 40; i++) {
      await evaluate(`document.querySelector('[data-clip-key="clip_${i}"]').click()`);
      assert.equal(await evaluate('window.__app.fighter.currentClipName'), `clip_${i}`);
      assert.ok(await evaluate(`document.querySelector('[data-clip-key="clip_${i}"]').getAttribute('aria-pressed') === 'true'`));
    }
    await click('[data-clip-key="clip_0"]');
    await evaluate('window.__app.fighter.scrubToTime(0); window.__app.syncHUD()');
    await sleep(100); await capture(robot.id);
    await click('#sig-btn');
    const sampleTimes = [0, 0.22, 0.44, 0.66, 0.88, 1];
    const samples = [];
    for (const fraction of sampleTimes) {
      const sample = await evaluate(`(() => {
        const app=window.__app, f=app.fighter;
        f.scrubToTime(f.getDuration()*${fraction}); app.syncHUD();
        return {t:f.getCurrentTime(), rootY:f.root.position.y, left:f.parts.LeftUpperArm.quaternion.toArray(), right:f.parts.RightUpperArm.quaternion.toArray()};
      })()`);
      samples.push(sample);
    }
    assert.ok(new Set(samples.map(s => JSON.stringify([s.left,s.right]))).size >= 3, 'signature changes pose');
    await evaluate(`window.__app.fighter.scrubToTime(window.__app.fighter.getDuration()*${robot.featureStyle === 'mantis' ? 0.44 : 0.60}); window.__app.syncHUD()`);
    await sleep(80); await capture(`${robot.id}-signature`);
    const diagnostics = await evaluate(`(() => {const f=window.__app.fighter; let skinned=0;f.root.traverse(n=>{if(n.isBone||n.isSkinnedMesh)skinned++});return {parts:f.getPartCount(),clips:f.clipList.length,skinned,calls:window.__app.renderer.info.render.calls,triangles:window.__app.renderer.info.render.triangles};})()`);
    assert.equal(diagnostics.parts, 15); assert.equal(diagnostics.clips, 40); assert.equal(diagnostics.skinned, 0);
    results.push({ id: robot.id, diagnostics, samples });
  }
  // Filter through actual DOM buttons; record shared action/recovery poses.
  await click('[data-family="ATTACK"]');
  assert.equal(await evaluate('document.querySelectorAll("[data-clip-key]").length'), 10);
  await click('[data-motion-id="hook_right"]');
  await evaluate('window.__app.fighter.scrubToTime(window.__app.fighter.getDuration()*.4);window.__app.syncHUD()');
  await evaluate('window.scrollTo(0,0)');
  await capture('hook-impact');
  for (const id of ['knockdown','down','get_up']) {
    await click('[data-family="RECOVERY"]');
    await click(`[data-motion-id="${id}"]`);
    await evaluate(`window.__app.fighter.scrubToTime(window.__app.fighter.getDuration()*${id === 'get_up' ? .7 : 1});window.__app.syncHUD()`);
    assert.ok(await evaluate('document.querySelector("#btn-loop").disabled'));
    await evaluate('window.scrollTo(0,0)');
    await capture(id);
  }
  await click('#sig-btn');
  await evaluate('window.__app.fighter.scrubToTime(.2);window.__app.syncHUD()');
  // Actual transport inputs: pause, seek, frame-step, resume, speed persistence.
  await click('#btn-play'); // resume paused signature
  await sleep(250);
  await click('#btn-next');
  const time = await evaluate('window.__app.fighter.getCurrentTime()');
  await sleep(350);
  assert.equal(await evaluate('window.__app.fighter.getCurrentTime()'), time);
  assert.equal(await evaluate("document.querySelector('#btn-play').getAttribute('aria-label')"), 'Play');
  await evaluate("const slider=document.querySelector('#timeline');slider.value=500;slider.dispatchEvent(new Event('input',{bubbles:true}))");
  assert.ok(await evaluate('Math.abs(window.__app.fighter.getCurrentTime()/window.__app.fighter.getDuration()-0.5)<0.001'));
  await evaluate("const speed=document.querySelector('#speed-select');speed.value='0.5';speed.dispatchEvent(new Event('change',{bubbles:true}))");
  await click('[data-robot-id="volt-kestrel"]');
  assert.equal(await evaluate('window.__app.fighter.playbackSpeed'), 0.5);
  await click('#sig-btn');
  // Unpaused motion samples; slow software-rendering timing is reported, not hidden.
  for (let i = 0; i < 5; i++) {
    await sleep(200);
    motion.push(await evaluate('({time:window.__app.fighter.getCurrentTime(),paused:window.__app.fighter.isPaused})'));
    await capture(`motion-${i + 1}`);
  }
  assert.ok(motion.every(s => !s.paused));
  assert.ok(new Set(motion.map(s => s.time)).size > 1);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(200);
  await evaluate('window.scrollTo(0,0)');
  await capture('mobile-stage');
  // Scrolling moves DOM and canvas together, without JS positioning or camera reset.
  const cameraBefore = await evaluate('window.__app.camera.position.toArray()');
  await evaluate('window.scrollTo(0,350)');
  assert.ok(await evaluate(`(() => {
    const host=document.querySelector('#viewport-host').getBoundingClientRect();
    const canvas=document.querySelector('#canvas-container canvas').getBoundingClientRect();
    return Math.abs(host.top-canvas.top)<1 && Math.abs(host.height-canvas.height)<1 && canvas.height>300;
  })()`));
  assert.deepEqual(await evaluate('window.__app.camera.position.toArray()'), cameraBefore);
  await click('[data-family="DEFENSE"]');
  assert.equal(await evaluate('document.querySelectorAll("[data-clip-key]").length'), 8);
  await click('[data-motion-id="duck"]');
  await capture('mobile-library');
  await evaluate("document.querySelector('.dossier').scrollIntoView({block:'start'})");
  await sleep(100); await capture('mobile-stats');
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'no horizontal page overflow');

  // Persisted settings must hydrate both application state and visible controls.
  await evaluate(`localStorage.setItem('robot-foundry.settings.v1', JSON.stringify({ speed: 0.5, loop: false, gridVisible: false, language: 'vi-VN', reducedMotion: false }));`);
  await send('Page.reload', { ignoreCache: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate('Boolean(window.__app?.fighter)')) break;
    await sleep(100);
  }
  assert.equal(await evaluate('window.__app.voiceCoach.language'), 'vi-VN', 'persisted voice language hydrates');
  assert.equal(await evaluate('document.querySelector("#coach-language").value'), 'vi-VN', 'language selector hydrates');
  assert.equal(await evaluate('document.querySelector("#speed-select").value'), '0.5', 'speed selector hydrates');
  assert.equal(await evaluate('document.querySelector("#btn-loop").getAttribute("aria-pressed")'), 'false', 'loop control hydrates');
  assert.equal(await evaluate('document.querySelector("#btn-grid").getAttribute("aria-pressed")'), 'false', 'grid control hydrates');

  // Reduced-motion accessibility mode: reload under the browser media preference
  // and verify presentation animation pauses without breaking initialization.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.reload', { ignoreCache: true });
  let reducedReady = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate('Boolean(window.__app?.fighter)')) { reducedReady = true; break; }
    await sleep(100);
  }
  assert.equal(reducedReady, true, 'reduced-motion app initializes');
  assert.equal(await evaluate('window.__app.reducedMotion'), true, 'reduced-motion preference is honored');
  assert.equal(await evaluate('window.__app.fighter.isPaused'), true, 'showcase animation pauses for reduced motion');
  await send('Emulation.setEmulatedMedia', { features: [] });

  assert.equal(errors.length, 0, JSON.stringify(errors));
  const report = { url: targetUrl, renderer: 'Edge headless / SwiftShader software rendering; not a hardware FPS benchmark', results, motion, reducedMotion: true, errors, warnings };
  await writeFile(`${outDir}/report.json`, JSON.stringify(report, null, 2));
  console.log(`PASS: ${results.length} fighters / 200 clip buttons / transport / speed persistence / 5 signatures / desktop + mobile. ${errors.length} errors. See ${outDir}/report.json`);
} finally {
  for (const { timer } of pending.values()) clearTimeout(timer);
  socket?.close();
  if (browser.pid) {
    if (process.platform === 'win32') {
      await new Promise(resolve => spawn('taskkill', ['/pid', String(browser.pid), '/T', '/F'], { stdio: 'ignore' }).on('exit', resolve));
    } else browser.kill();
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => {});
}
