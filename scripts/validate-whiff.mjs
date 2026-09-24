// Whiff event, public recovery window, tactic signal, punish boundaries.

import assert from 'node:assert/strict';
import { CombatSimulation } from '../src/combat/CombatSimulation.js';
import { CombatBrain } from '../src/ai/CombatBrain.js';
import { validateTactic } from '../src/tactics/TacticSchema.js';
import { matchesCondition } from '../src/tactics/TacticRuntime.js';
import { getAction } from '../src/combat/ActionRegistry.js';

let pass = 0;
const ok = label => { pass++; console.log(`  ✓ ${label}`); };
function arm(sim, attack, defense, options = {}) {
  const a = sim.fighterA;
  const b = sim.fighterB;
  Object.assign(a, {
    z: -0.3, facing: options.attackerFacing ?? 0, status: 'acting',
    actionId: attack, actionPhase: 'active', actionTick: options.actionTick ?? 1,
  });
  Object.assign(b, {
    z: options.distance ?? 0.3, facing: options.facing ?? Math.PI,
    status: options.status || 'acting', actionId: defense, actionPhase: options.phase || 'active',
  });
  sim._resolveContacts(options.tick ?? 10);
  return sim;
}
function events(sim, type) {
  return sim.log.toArray().filter(event => event.type === type);
}

console.log('\n── Whiff reasons and recovery boundary ──');
const jab = getAction('jab');
const out = arm(new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' }), 'jab', 'guard_high', { distance: 9 });
const whiff = events(out, 'attack_whiffed')[0];
assert.equal(events(out, 'contact_resolved')[0].data.reason, 'out_of_range');
assert.equal(whiff.data.reason, 'out_of_range');
assert.equal(whiff.data.actionId, 'jab');
assert.equal(whiff.data.targetId, 'fighter_b');
assert.equal(whiff.data.recoveryUntil, 10 + Math.max(0, jab.active - (10 - 1)) + jab.recovery);
assert.equal(out.fighterA.whiffUntil, whiff.data.recoveryUntil);
assert.equal(out.fighterB.health, out.fighterB.maxHealth);
ok('out-of-range whiff keeps damage authority and publishes recoveryUntil');

const facing = arm(new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' }), 'jab', 'guard_high', { attackerFacing: Math.PI });
assert.equal(events(facing, 'attack_whiffed')[0].data.reason, 'bad_facing');
ok('bad facing is a whiff');

const dodged = arm(new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' }), 'jab', 'slip_left');
assert.equal(events(dodged, 'attack_whiffed')[0].data.reason, 'dodged');
ok('dodge is a whiff');

console.log('\n── Punish window boundaries ──');
function hit(whiffUntil) {
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  sim.fighterB.whiffUntil = whiffUntil;
  sim.fighterB.whiffActionId = 'jab';
  arm(sim, 'jab', 'none', { status: 'ready', phase: 'idle' });
  return sim;
}
const inside = hit(10);
const outside = hit(9);
const plain = hit(0);
assert.equal(events(inside, 'punish').length, 1);
assert.equal(events(inside, 'punish')[0].data.whiffActionId, 'jab');
assert.equal(events(outside, 'punish').length, 0);
assert.equal(events(plain, 'punish').length, 0);
assert.equal(inside.fighterB.health, plain.fighterB.health);
ok('punish marks a clean hit only through recoveryUntil and does not change damage');

const blocked = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
blocked.fighterB.whiffUntil = 10;
arm(blocked, 'jab', 'guard_high');
assert.equal(events(blocked, 'contact_resolved')[0].data.result, 'blocked');
assert.equal(events(blocked, 'punish').length, 0);
ok('a blocked hit is not a punish');

console.log('\n── Perception and tactic condition ──');
const brain = new CombatBrain({ fighterId: 'fighter_a', definitionId: 'test_neutral', seed: 1 });
inside.currentTick = 10;
plain.currentTick = 10;
const view = brain.perceive(inside);
assert.equal(view.isEnemyWhiffing, true);
assert.equal(view.punishWindowTicksRemaining, 0);
assert.equal(matchesCondition({ type: 'enemy_whiff' }, view), true);
assert.equal(matchesCondition({ type: 'enemy_whiff' }, brain.perceive(plain)), false);
assert.equal(validateTactic({
  schemaVersion: 1, id: 'whiff-punish', name: 'Whiff Punish', goal: 'Punish the miss.',
  trigger: { type: 'enemy_whiff' },
  phases: [{ id: 'counter', sequence: [{ actionId: 'jab' }], branches: [] }],
  abort: [], repeatLimit: 1, timeoutTicks: 60, priority: 0.8,
}).ok, true);
assert.equal(validateTactic({
  schemaVersion: 1, id: 'bad', name: 'Bad', trigger: { type: 'eval' },
  phases: [{ id: 'x', sequence: [{ actionId: 'jab' }], branches: [] }],
  abort: [], repeatLimit: 1, timeoutTicks: 30,
}).ok, false);
ok('brain reads public whiff state and enemy_whiff stays a bounded condition');

console.log('\n── Replay keeps the classification ──');
function run() {
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  sim.fighterB.whiffUntil = 10;
  sim.fighterB.whiffActionId = 'cross';
  arm(sim, 'jab', 'none', { status: 'ready', phase: 'idle' });
  return sim.log.toArray().map(event => [event.type, event.tick, event.data?.result, event.data?.reason, event.data?.actionId]);
}
assert.deepEqual(run(), run());
ok('same whiff fixture replays the same events');

console.log(`\nPASS: ${pass} assertions. Whiff and punish validated.\n`);
