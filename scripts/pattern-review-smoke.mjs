import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.env.SHOWCASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(`${base}/?qa&pattern=volt`);
  await page.locator('#pattern-step').waitFor();
  await page.waitForFunction(() => document.querySelector('#pattern-status')?.textContent.includes('Tick 0'));
  const storageBefore = await page.evaluate(() => JSON.stringify(localStorage));
  await page.locator('#pattern-step').click();
  assert.match(await page.locator('#pattern-status').textContent(), /Tick 1 .*PAUSED/);
  await page.waitForTimeout(300);
  assert.match(await page.locator('#pattern-status').textContent(), /Tick 1 /, 'pause freezes sim');
  await mkdir('artifacts/qa/patterns', { recursive: true });
  for (const [response, outcome] of [['none', 'hit'], ['parry_left', 'parried'], ['parry_right', 'hit'], ['too_early', 'hit'], ['out_of_range', null]]) {
    await page.locator('#pattern-case').selectOption(response);
    await page.locator('#pattern-reset').click();
    await page.evaluate(() => window.__app.fightMode.reviewStep(31));
    const text = await page.locator('#pattern-status').textContent();
    if (outcome) assert.ok(text.includes(`31: cross → ${outcome}`), text);
    else assert.match(text, /pattern_aborted — followup_unavailable/);
    if (outcome) {
      const pose = await page.evaluate(() => {
        const fight = window.__app.fightMode, fighter = fight.fighterA;
        const fraction = fighter.getCurrentTime() / fighter.getDuration();
        const before = Object.values(fighter.parts).flatMap(part => part.quaternion.toArray());
        fight._syncPresentation(.03);
        const after = Object.values(fighter.parts).flatMap(part => part.quaternion.toArray());
        return { id: fighter.currentMeta.id, fraction, unchanged: before.every((v, i) => v === after[i]) };
      });
      assert.equal(pose.id, 'cross');
      assert.ok(Math.abs(pose.fraction - .4) < 1e-5, 'tick 31 contact displays the cross extension marker');
      assert.ok(pose.unchanged, 'render delta does not advance the simulation-driven attack pose');
    }
    await page.screenshot({ path: `artifacts/qa/patterns/${response}.png` });
  }
  await page.locator('#pattern-reset').click();
  await page.locator('#pattern-play').click();
  await page.waitForFunction(() => window.__app.fightMode.sim.currentTick > 0);
  await page.locator('#pattern-play').click();
  const paused = await page.evaluate(() => window.__app.fightMode.sim.currentTick);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__app.fightMode.sim.currentTick), paused);
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), storageBefore, 'review does not save tactics/history');
  await page.goto(`${base}/?qa&opponent=volt`);
  await page.waitForFunction(() => window.__app?.fightMode?.brains[1]?.pattern);
  assert.equal(await page.evaluate(() => window.__app.fightMode.brains[1].pattern.definition.tactic.id), 'volt_one_two');
  await page.waitForFunction(() => window.__app.fightMode.sim.currentTick > 30);
  const nativePattern = await page.evaluate(() => {
    const fight = window.__app.fightMode;
    for (let i = 0; i < 1200 && fight.sim.matchStatus === 'fighting'; i++) {
      fight.sim.update(1 / 60, () => fight._runBrains());
    }
    return fight.sim.getReplayMeta().some(e => e.type === 'pattern_started');
  });
  assert.ok(nativePattern, 'Volt pattern actually activates in autonomous matchup, not just fixture');
  assert.deepEqual(errors, []);
  console.log('PASS: animator review five cases, contact outcomes, pause/step/play/reset, no storage writes or page errors; artifacts/qa/patterns/*.png');
} finally { await browser.close(); }
