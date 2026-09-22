// ─── Sandbox command parser validation ──────────────────────────────
// Converts short text commands into validated SandboxIntent data.
// Run: node scripts/validate-sandbox-commands.mjs

import assert from 'node:assert/strict';
import { parseSandboxCommand, parseSandboxPlanCommand } from '../src/sandbox/SandboxCommandParser.js';
import { SandboxIntentSource, SandboxIntentType } from '../src/sandbox/SandboxIntent.js';

let pass = 0;
function ok(label) { pass++; console.log(`  ✓ ${label}`); }
function intentOf(text, options = {}) {
  const result = parseSandboxCommand(text, options);
  assert.equal(result.kind, 'sandbox_intent', `expected intent for: ${text}`);
  assert.ok(result.intent, `missing intent for: ${text}`);
  return result;
}
function unrecognized(text, reason) {
  const result = parseSandboxCommand(text);
  assert.equal(result.kind, 'unrecognized');
  assert.equal(result.reason, reason, text);
  assert.equal('intent' in result, false);
  return result;
}

console.log('\n── SandboxCommandParser: movement ──');
const moveSouth = intentOf('Đi hướng 6 giờ', { tick: 12 });
assert.equal(moveSouth.intent.type, SandboxIntentType.MOVE);
assert.equal(moveSouth.intent.angle, Math.PI);
assert.equal(moveSouth.intent.source, SandboxIntentSource.LOCAL);
assert.equal(moveSouth.intent.createdAt, 12);
assert.equal('actionId' in moveSouth.intent, false);
assert.equal(moveSouth.transcript, 'Đi hướng 6 giờ');
ok('Vietnamese move command becomes a validated move intent');

const moveRelative = intentOf('move to the left', { currentHeading: Math.PI / 3 });
assert.equal(moveRelative.intent.type, SandboxIntentType.MOVE);
assert.ok(Math.abs(moveRelative.intent.angle - (11 * Math.PI) / 6) < 1e-9);
ok('English relative movement uses current heading');

console.log('\n── SandboxCommandParser: stop, aim and fire ──');
const stop = intentOf('ĐỨNG YÊN', { tick: 4 });
assert.deepEqual(stop.intent, {
  type: SandboxIntentType.STOP,
  source: SandboxIntentSource.LOCAL,
  priority: 1,
  createdAt: 4,
  expiresAt: 22,
});
ok('accented Vietnamese stop command creates a geometry-free stop intent');

const aim = intentOf('ngắm hướng đông', { tick: 20, source: SandboxIntentSource.VOICE, priority: .8 });
assert.equal(aim.intent.type, SandboxIntentType.AIM);
assert.equal(aim.intent.angle, Math.PI / 2);
assert.equal(aim.intent.source, SandboxIntentSource.VOICE);
assert.equal(aim.intent.priority, .8);
ok('Vietnamese aim command preserves source and priority');

const fire = intentOf('bắn zombie hướng 3 giờ', { tick: 30 });
assert.equal(fire.intent.type, SandboxIntentType.FIRE);
assert.equal(fire.intent.angle, Math.PI / 2);
assert.equal(fire.intent.expiresAt, 42);
assert.equal('actionId' in fire.intent, false);
ok('fire command creates a short-lived directional fire intent');

const fireEnglish = intentOf('fire beam at 9 o clock', { tick: 30 });
assert.equal(fireEnglish.intent.type, SandboxIntentType.FIRE);
assert.equal(fireEnglish.intent.angle, (3 * Math.PI) / 2);
ok('English beam command supports clock direction');

const mission = parseSandboxPlanCommand('move east, then fire north', { tick: 10 });
assert.equal(mission.kind, 'sandbox_plan');
assert.equal(mission.plan.steps.length, 2);
assert.equal(mission.plan.steps[0].type, SandboxIntentType.MOVE);
assert.equal(mission.plan.steps[1].type, SandboxIntentType.FIRE);
ok('compound movement and fire command becomes a bounded deterministic plan');

const vietnameseMission = parseSandboxPlanCommand('đi đông rồi bắn bắc', { tick: 0 });
assert.equal(vietnameseMission.kind, 'sandbox_plan');
assert.equal(vietnameseMission.plan.steps[0].type, SandboxIntentType.MOVE);
assert.equal(vietnameseMission.plan.steps[1].type, SandboxIntentType.FIRE);
assert.ok(Math.abs(vietnameseMission.plan.steps[0].angle - Math.PI / 2) < 1e-9);
ok('accented Vietnamese compound commands split on rồi');

const nearest = intentOf('attack nearest zombie', { tick: 5 });
assert.equal(nearest.intent.type, SandboxIntentType.ATTACK_TARGET);
assert.equal(nearest.intent.targetId, 'nearest');
ok('nearest-zombie command delegates target selection to local simulation');

console.log('\n── SandboxCommandParser: deterministic boundary ──');
const options = { tick: 77, currentHeading: Math.PI / 4, source: SandboxIntentSource.AI, priority: .65, expiresInTicks: 90 };
const first = parseSandboxCommand('di chuyen sang phai', options);
const second = parseSandboxCommand('di chuyen sang phai', options);
assert.deepEqual(first, second);
assert.equal(first.intent.source, SandboxIntentSource.AI);
assert.equal(first.intent.priority, .65);
assert.equal(first.intent.expiresAt, 167);
ok('same text and options produce identical output without random ids');

console.log('\n── SandboxCommandParser: unsupported and incomplete commands ──');
unrecognized('', 'empty_command');
unrecognized('đi nhanh lên', 'missing_direction');
unrecognized('bắn zombie', 'missing_direction');
unrecognized('move east, then fire north', 'compound_command');
unrecognized('jab', 'unsupported_command');
unrecognized('right hook', 'unsupported_command');
unrecognized('đấm thẳng sang trái', 'unsupported_command');
ok('missing direction and boxing commands never produce Sandbox intents');

const capped = intentOf('move north', { tick: 0, expiresInTicks: 999999 });
assert.equal(capped.intent.expiresAt, 3600);
ok('parser caps custom expiry to the Sandbox contract limit');

console.log(`\nPASS: ${pass} assertions. Sandbox command parser validated.\n`);
