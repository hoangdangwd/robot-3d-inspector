// Jev-first Sandbox acceptance through RobotFoundryApp handlers.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const port = 5191;
const server = spawn('pnpm', ['exec', 'vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore', shell: true });
const browser = await chromium.launch({ headless: true });
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch('http://127.0.0.1:' + port)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:' + port);
  await page.waitForFunction(() => window.__app?.fighter);
  await page.evaluate(() => {
    const app = window.__app;
    app.requests = [];
    app.sandboxJevFetch = async body => {
      app.requests.push(body);
      if (body.mode === 'rule_event') return { type: 'set_directive', directive: 'retreat' };
      if (body.transcript === 'ban zombie') return { type: 'immediate', intent: { type: 'fire_nearest', source: 'ai', priority: 1, createdAt: body.tick, expiresAt: body.tick + 60 } };
      if (body.transcript === 'rule gate') return { type: 'add_rule' };
      return { error: { message: 'JEV TIMEOUT ROBOT STILL AUTONOMOUS' } };
    };
    app.enterSandboxMode();
  });
  const autonomous = await page.waitForFunction(() => window.__app.sandboxMode.getState().events.some(event => event.type === 'beam_fired' && event.source === 'ai'));
  assert.ok(autonomous);
  await page.evaluate(() => window.__app.handleSandboxCommand('ban zombie', 'en-US'));
  const fire = await page.evaluate(() => window.__app.requests.find(request => request.transcript === 'ban zombie'));
  assert.equal(fire.mode, 'command');
  assert.ok(fire.requestVersion > 0);
  assert.equal(typeof fire.heading, 'number');
  await page.evaluate(() => window.__app.handleSandboxCommand('rule gate', 'en-US'));
  assert.match(await page.evaluate(() => window.__app.memoryStore.toStateString()), /rule gate/);
  await page.evaluate(() => {
    const mode = window.__app.sandboxMode;
    const rules = { x: 0, z: -30, radius: 4 };
    mode.sim.zombies.clear();
    mode._insideGate.clear();
    mode._nextRuleEventTick = 0;
    mode.sim.spawnZombie({ x: rules.x, z: rules.z, speed: 0 });
    mode.sim.spawnZombie({ x: rules.x + 0.2, z: rules.z, speed: 0 });
    mode._emitZoneEvent(mode.sim.clock.tick + 6);
  });
  await page.waitForFunction(() => window.__app.requests.some(request => request.mode === 'rule_event'));
  const eventRequest = await page.evaluate(() => {
    const request = window.__app.requests.findLast(item => item.mode === 'rule_event');
    return { entries: request.event.entries.length, eventId: request.eventId };
  });
  assert.equal(eventRequest.entries, 2);
  assert.ok(eventRequest.eventId);
  assert.equal(await page.evaluate(() => window.__app.sandboxMode.brain.directive), 'retreat');
  const beforeRequests = await page.evaluate(() => window.__app.requests.length);
  await page.evaluate(() => { window.__app.mode = 'showcase'; return window.__app.handleSandboxCommand('ban zombie', 'en-US'); });
  assert.equal(await page.evaluate(() => window.__app.requests.length), beforeRequests);
  await page.evaluate(() => { window.__app.mode = 'sandbox'; return window.__app.handleSandboxCommand('timeout', 'en-US'); });
  assert.match(await page.evaluate(() => document.querySelector('#sandbox-command-status').textContent), /TIMEOUT/);
  const beforeTick = await page.evaluate(() => window.__app.sandboxMode.sim.clock.tick);
  await page.evaluate(() => window.__app.sandboxMode.update(1 / 60));
  assert.ok(await page.evaluate(tick => window.__app.sandboxMode.sim.clock.tick > tick, beforeTick));
  console.log('PASS: runtime Jev-first sandbox flow.');
} finally {
  await browser.close();
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  else server.kill();
}
