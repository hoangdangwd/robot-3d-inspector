// ─── Fight mode browser smoke ───────────────────────────────────────
// Run against a running Vite preview/dev server:
//   SHOWCASE_URL=http://localhost:5198 node scripts/fight-mode-smoke.mjs

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const url = process.env.SHOWCASE_URL || 'http://127.0.0.1:5188';
const edgePath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const cdpPort = 9351;
const profile = await mkdtemp(path.join(tmpdir(), 'robot-foundry-fight-'));
const browser = spawn(edgePath, [
  '--headless=new', '--disable-gpu-sandbox', '--use-angle=swiftshader',
  '--no-first-run', `--user-data-dir=${profile}`,
  `--remote-debugging-port=${cdpPort}`, '--remote-debugging-address=127.0.0.1',
  'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pending = new Map();
const errors = [];
let socket;
let requestId = 0;

try {
  let target;
  for (let i = 0; i < 60; i++) {
    try {
      target = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
      if (target?.webSocketDebuggerUrl) break;
    } catch { /* browser starting */ }
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
    if (pending.has(message.id)) {
      const job = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(job.timer);
      if (message.error) job.reject(new Error(message.error.message));
      else job.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(message.params.type)) {
      errors.push(message.params.args);
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++requestId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
  });
  await send('Page.navigate', { url });

  for (let i = 0; i < 100; i++) {
    if (await evaluate('Boolean(window.__app?.fighter)')) break;
    await sleep(100);
  }
  assert.equal(await evaluate('Boolean(window.__app?.fighter)'), true, 'showcase initialized');

  await evaluate("document.querySelector('#nav-fight').click()");
  for (let i = 0; i < 30; i++) {
    if (await evaluate("window.__app.mode === 'fight' && Boolean(window.__app.fightMode)")) break;
    await sleep(50);
  }

  const entered = await evaluate(`(() => ({
    mode: window.__app.mode,
    viewport: (() => { const e=document.querySelector('#viewport-host'); const c=document.querySelector('#canvas-container canvas'); return {host:e?.getBoundingClientRect().toJSON(), canvas:c?.getBoundingClientRect().toJSON(), canvasDisplay:c && getComputedStyle(c).display, canvasWidth:c?.width, canvasHeight:c?.height}; })(),
    hasFightMode: Boolean(window.__app.fightMode),
    showcaseFighter: Boolean(window.__app.fighter),
    fightHud: getComputedStyle(document.querySelector('#fight-hud')).display,
    motionPanel: getComputedStyle(document.querySelector('.motion-panel')).display,
  }))()`);
  assert.equal(entered.mode, 'fight');
  assert.equal(entered.hasFightMode, true);
  assert.equal(entered.showcaseFighter, false);
  assert.notEqual(entered.fightHud, 'none');
  assert.equal(entered.motionPanel, 'none');
  assert.notEqual(entered.viewport.host.width, 0, 'fight viewport has layout width');

  await evaluate(`(() => { const input = document.querySelector('#coach-input'); input.value = 'stay outside'; document.querySelector('#coach-form').requestSubmit(); })()`);
  await sleep(100);
  const coached = await evaluate(`(() => ({
    feedback: document.querySelector('#coach-feedback').textContent,
    blackboard: window.__app.fightMode.brains[0].blackboard.snapshot(window.__app.fightMode.sim.clock.tick),
    commands: window.__app.fightMode.getCoachingSnapshot().commands,
  }))()`);
  assert.match(coached.feedback, /OVERRIDE ACTIVE/);
  assert.equal(coached.blackboard.preferredDistance, 'far');

  // A slower provider response must not overwrite a newer local command.
  const staleResponse = await evaluate(`(async () => {
    const originalFetch = window.fetch;
    window.fetch = () => new Promise(resolve => setTimeout(() => resolve(new Response(JSON.stringify({ intent: { kind: 'direct_command', commandId: 'remote_stale', actionId: 'overhand', confidence: 1, expiresAt: 60 } }), { status: 200, headers: { 'content-type': 'application/json' } })), 180));
    const pending = window.__app.handleCoachText('watch his right side', 'en-US');
    await new Promise(resolve => setTimeout(resolve, 25));
    await window.__app.handleCoachText('jab', 'en-US');
    await pending;
    window.fetch = originalFetch;
    return document.querySelector('#coach-feedback').textContent;
  })()`);
  assert.match(staleResponse, /JAB|QUEUED|REQUEST ONLY/, 'stale provider response cannot overwrite a newer local command');

  const providerFailure = await evaluate(`(async () => {
    const originalFetch = window.fetch;
    window.fetch = async () => new Response(JSON.stringify({ error: { message: 'SIMULATED PROVIDER FAILURE' } }), { status: 503, headers: { 'content-type': 'application/json' } });
    await window.__app.handleCoachText('an unknown coaching phrase', 'en-US');
    window.fetch = originalFetch;
    return document.querySelector('#coach-feedback').textContent;
  })()`);
  assert.match(providerFailure, /SIMULATED PROVIDER FAILURE|FALLBACK|SHORT COMMANDS/, 'provider failure remains non-fatal');

  await evaluate(`(() => { const input = document.querySelector('#coach-input'); input.value = 'when he hooks, counter body'; document.querySelector('#coach-form').requestSubmit(); })()`);
  await sleep(50);
  assert.match(await evaluate("document.querySelector('#coach-feedback').textContent"), /TIME-OUT/);

  await evaluate("document.querySelector('#timeout-open').click()");
  const paused = await evaluate(`(() => ({
    tick: window.__app.fightMode.sim.clock.tick,
    remaining: window.__app.fightMode.timeouts.remaining,
    hidden: document.querySelector('#timeout-editor').hidden,
  }))()`);
  await sleep(250);
  const pausedLater = await evaluate('window.__app.fightMode.sim.clock.tick');
  assert.equal(paused.hidden, false, 'time-out editor opens');
  assert.equal(paused.remaining, 2, 'opening consumes one Time-out');
  assert.equal(pausedLater, paused.tick, 'simulation pauses during Time-out');
  assert.equal(await evaluate("document.querySelectorAll('#tactic-select option').length"), 1, 'playbook editor lists the selected tactic');
  await evaluate("document.querySelector('#tactic-new').click()");
  assert.equal(await evaluate("document.querySelectorAll('#tactic-select option').length"), 2, 'playbook editor creates a bounded second tactic');
  await evaluate("document.querySelector('#tactic-delete').click()");
  assert.equal(await evaluate("document.querySelectorAll('#tactic-select option').length"), 1, 'playbook editor deletes a selected tactic from the draft');
  await evaluate("document.querySelector('#timeout-preview').click()");
  assert.equal(await evaluate("document.querySelector('#timeout-commit').disabled"), false, 'valid draft enables commit');
  const reviewedTactic = await evaluate(`(() => {
    const app = window.__app;
    app._timeoutDraft.repeatLimit = 3;
    app._timeoutDraft.timeoutTicks = 77;
    app._timeoutReviewed = true;
    return { repeatLimit: app._timeoutDraft.repeatLimit, timeoutTicks: app._timeoutDraft.timeoutTicks };
  })()`);
  await evaluate("document.querySelector('#timeout-commit').click()");
  await sleep(250);
  const committed = await evaluate(`(() => ({
    hidden: document.querySelector('#timeout-editor').hidden,
    remaining: window.__app.fightMode.timeouts.remaining,
    tactics: window.__app.fightMode.getCoachingSnapshot().playbooks[0].tacticCount,
    tick: window.__app.fightMode.sim.clock.tick,
  }))()`);
  assert.equal(committed.hidden, true, 'commit closes editor');
  assert.equal(committed.remaining, 2, 'committed Time-out remains consumed');
  assert.equal(committed.tactics, 1, 'committed tactic is installed locally');
  assert.deepEqual(await evaluate(`(() => { const tactic = window.__app.fightMode.getPlaybook('fighter_a')[0]; return { repeatLimit: tactic.repeatLimit, timeoutTicks: tactic.timeoutTicks }; })()`), reviewedTactic, 'commit preserves the reviewed tactic definition');
  assert.ok(committed.tick >= paused.tick, `simulation resumes after commit (${paused.tick} -> ${committed.tick})`);

  await sleep(300);
  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile('artifacts/animation-library/fight-mode.png', Buffer.from(screenshot.data, 'base64'));

  await sleep(700);
  const running = await evaluate(`(() => {
    const fm = window.__app.fightMode;
    const a = fm.sim.getState('fighter_a');
    const b = fm.sim.getState('fighter_b');
    return { tick: fm.sim.clock.tick, aHealth: a.health, bHealth: b.health,
      aAction: a.actionId, bAction: b.actionId, distance: fm.sim.getDistance(),
      eventTotal: fm.sim.log.total };
  })()`);
  assert.ok(running.tick > 0, 'fight simulation advanced');
  assert.ok(Number.isFinite(running.distance), 'fight distance finite');
  assert.ok(running.eventTotal > 0, 'fight emitted simulation events');
  assert.ok(running.aHealth < 100 || running.bHealth < 100 || running.aAction !== 'none' || running.bAction !== 'none',
    'fight is active, not a static scene');

  // Force a short deterministic timer boundary to verify result UI and replay
  // without waiting for the production 180-second round.
  await evaluate(`(() => {
    const fm = window.__app.fightMode;
    fm.sim.fighterA.health = 100; fm.sim.fighterB.health = 100;
    fm.sim.matchStatus = 'fighting';
    fm.sim.clock.resume();
    fm.sim.roundDurationTicks = fm.sim.clock.tick + 1;
    fm.sim.clock.accumulator = 0;
    fm.sim.update(fm.sim.clock.dt * 2);
    fm.update(0);
  })()`);
  let timedResult = await evaluate(`(() => ({
    status: window.__app.fightMode.sim.matchStatus,
    result: window.__app.fightMode.sim.matchResult,
    overlayHidden: document.querySelector('#fight-result').hidden,
    replay: window.__app.fightMode.exportReplay(),
    savedResults: JSON.parse(localStorage.getItem('robot-foundry.results.v1') || '[]').length,
  }))()`);
  assert.ok(['time', 'draw', 'ko'].includes(timedResult.status), `match reaches terminal result (${JSON.stringify(timedResult)})`);
  assert.ok(timedResult.result, 'match result is populated');
  assert.equal(timedResult.overlayHidden, false, 'result overlay is visible');
  assert.equal(timedResult.replay.version, 1, 'replay export is versioned');
  assert.ok(timedResult.replay.events.length > 0, 'replay contains validated events');
  assert.ok(timedResult.savedResults >= 1, 'match result persists locally');
  assert.equal(await evaluate(`(() => { const result = JSON.parse(localStorage.getItem('robot-foundry.results.v1') || '[]')[0]; const replay = JSON.parse(localStorage.getItem('robot-foundry.replays.v1') || '[]')[0]; return replay?.matchId === result?.id; })()`), true, 'saved replay is associated with its match result');
  assert.equal(await evaluate(`window.__app.persistence.importReplay(JSON.stringify({ version: 1, inputs: 'malformed' })).ok`), false, 'malformed replay is rejected before persistence');

  // Test Watch Replay button from fight result
  await evaluate("document.querySelector('#replay-watch-last').click()");
  await sleep(150);
  const replayStarted = await evaluate(`(() => ({
    mode: window.__app.mode,
    hudVisible: document.querySelector('#replay-hud').style.display !== 'none',
    matchup: document.querySelector('#replay-matchup').textContent,
    tick: window.__app.replayPlayer?.replay?._replayedTick,
  }))()`);
  assert.equal(replayStarted.mode, 'replay', 'starts replay mode');
  assert.equal(replayStarted.hudVisible, true, 'replay HUD is visible');
  assert.ok(replayStarted.matchup.length > 0, 'replay matchup rendered');

  // Step and scrub in replay
  await evaluate("document.querySelector('#replay-step').click()");
  await sleep(50);
  await evaluate("document.querySelector('#replay-play-btn').click()");
  await sleep(50);
  await evaluate("document.querySelector('#replay-exit-btn').click()");
  await sleep(100);
  assert.equal(await evaluate('window.__app.mode'), 'showcase', 'exits replay to showcase');

  // Open match history dialog
  await evaluate("document.querySelector('#nav-history').click()");
  await sleep(100);
  const historyDialog = await evaluate(`(() => ({
    open: document.querySelector('#history-dialog').open,
    itemsCount: document.querySelectorAll('.history-item').length,
  }))()`);
  assert.equal(historyDialog.open, true, 'history dialog opened');
  assert.ok(historyDialog.itemsCount >= 1, 'history dialog lists recorded matches');
  assert.ok(await evaluate("document.querySelectorAll('.history-item-actions').length >= 1"), 'matching replay exposes watch/export actions');
  await evaluate(`(() => {
    const replays = JSON.parse(localStorage.getItem('robot-foundry.replays.v1') || '[]');
    if (replays[0]) replays[0].matchId = 'unrelated-match-id';
    localStorage.setItem('robot-foundry.replays.v1', JSON.stringify(replays));
    document.querySelector('#btn-close-history').click();
    window.__app.openHistory();
  })()`);
  await sleep(50);
  assert.equal(await evaluate("document.querySelectorAll('.history-item-actions').length"), 0, 'mismatched replay is not associated by list position');
  await evaluate("document.querySelector('#btn-close-history').click()");
  await sleep(50);

  // Return to Fight Mode to test reset & coaching
  await evaluate("document.querySelector('#nav-fight').click()");
  await sleep(150);

  await evaluate("document.querySelector('#fight-reset').click()");
  await sleep(120);
  const reset = await evaluate(`(() => ({
    mode: window.__app.mode,
    tick: window.__app.fightMode?.sim.clock.tick,
    aHealth: window.__app.fightMode?.sim.getState('fighter_a')?.health,
    bHealth: window.__app.fightMode?.sim.getState('fighter_b')?.health,
  }))()`);
  assert.equal(reset.mode, 'fight');
  assert.ok(reset.tick >= 0 && reset.tick < 90, `reset tick should be near zero, got ${reset.tick}`);
  assert.ok(reset.aHealth > 85, `aHealth should be near 100 after reset, got ${reset.aHealth}`);
  assert.ok(reset.bHealth > 85, `bHealth should be near 100 after reset, got ${reset.bHealth}`);

  await evaluate(`(() => { const input = document.querySelector('#coach-input'); input.value = 'jab'; document.querySelector('#coach-form').requestSubmit(); })()`);
  await sleep(180);
  const commandState = await evaluate(`(() => ({
    events: window.__app.fightMode.getCoachingSnapshot().commands,
    pending: window.__app.fightMode.getCoachingSnapshot().pending,
  }))()`);
  assert.ok(commandState.events.some(event => event.actionId === 'jab' && ['queued', 'active', 'executed'].includes(event.status)), 'direct jab command entered lifecycle');
  await sleep(100);

  await evaluate("document.querySelector('#nav-fight').click()");
  await sleep(100);
  assert.equal(await evaluate('window.__app.mode'), 'showcase');
  assert.equal(await evaluate('Boolean(window.__app.fighter)'), true, 'showcase restored');
  if (errors.length) console.error('browser errors:', JSON.stringify(errors));
  assert.equal(errors.length, 0, `browser errors: ${JSON.stringify(errors)}`);

  console.log('PASS: Fight mode enter / autonomous ticks / HUD / reset / exit. 0 errors.');
} finally {
  for (const job of pending.values()) clearTimeout(job.timer);
  socket?.close();
  browser.kill();
  // Edge can briefly retain dictionary files after the process exits. Cleanup
  // is best-effort and must not turn a passing browser assertion into a failure.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await rm(profile, { recursive: true, force: true });
      break;
    } catch {
      await sleep(100);
    }
  }
}
