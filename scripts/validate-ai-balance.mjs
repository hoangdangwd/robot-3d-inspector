// ─── Phase 3.4 AI balance / telegraph matrix ────────────────────────
// Deterministic bout matrix: 10 unordered matchups + 5 mirrors, 3 seeds.
// Checks action readability, outcome progress, arena bounds, separation,
// deterministic traces, and absence of silent/stalled combat.
// Run: node scripts/validate-ai-balance.mjs

import assert from 'node:assert/strict';
import { CombatSimulation } from '../src/combat/CombatSimulation.js';
import { CombatBrain } from '../src/ai/CombatBrain.js';
import { getAction, getAttackIds, getDefenseIds } from '../src/combat/ActionRegistry.js';
import * as R from '../src/combat/CombatRules.js';

const ROBOTS = ['forge_titan', 'aegis_prime', 'vanta_razor', 'volt_kestrel', 'solstice_mantis'];
const SEEDS = [101, 202, 303];
const TICKS_PER_BOUT = 3600; // 60 seconds at 60Hz: bounded test, not an infinite soak.
const MIN_ACTIONS = 8;
const MIN_COMBAT_EVENTS = 3;

const pairs = [];
for (let i = 0; i < ROBOTS.length; i++) {
  for (let j = i; j < ROBOTS.length; j++) pairs.push([ROBOTS[i], ROBOTS[j]]);
}

function makeBrain(fighterId, definitionId, seed) {
  return new CombatBrain({ fighterId, definitionId, seed, decisionInterval: 6 });
}

function runBout(defA, defB, seed) {
  const sim = new CombatSimulation({ defIdA: defA, defIdB: defB, seed });
  const brainA = makeBrain('fighter_a', defA, seed * 11 + 1);
  const brainB = makeBrain('fighter_b', defB, seed * 11 + 2);
  const trace = [];
  let invalidState = null;
  let maxArenaRadius = 0;
  let minSeparation = Infinity;

  for (let i = 0; i < TICKS_PER_BOUT && sim.matchStatus !== 'ko'; i++) {
    sim.update(1 / R.TICK_RATE, () => {
      for (const brain of [brainA, brainB]) {
        const result = brain.decide(sim);
        if (!result) continue;
        sim.applyMovement(brain.fighterId, result.movement);
        if (result.intent) {
          sim.submitIntentFor(brain.fighterId, result.intent);
          trace.push({
            tick: sim.currentTick,
            fighterId: brain.fighterId,
            actionId: result.intent.actionId,
            state: result.state,
          });
        }
      }
    });

    const a = sim.fighterA;
    const b = sim.fighterB;
    for (const f of [a, b]) {
      const radius = Math.hypot(f.x, f.z);
      maxArenaRadius = Math.max(maxArenaRadius, radius);
      if (!Number.isFinite(f.x) || !Number.isFinite(f.z) ||
          !Number.isFinite(f.health) || !Number.isFinite(f.stamina) ||
          f.health < 0 || f.health > f.maxHealth ||
          f.stamina < 0 || f.stamina > f.maxStamina ||
          radius > R.ARENA_RADIUS + .001) {
        invalidState = { tick: sim.currentTick, fighter: f.id, state: { ...f } };
      }
    }
    minSeparation = Math.min(minSeparation, sim.getDistance());
  }

  const events = sim.log.toArray();
  const contacts = events.filter(e => e.type === 'contact_resolved');
  const hits = contacts.filter(e => ['hit', 'blocked', 'parried'].includes(e.data.result));
  const started = events.filter(e => e.type === 'action_started');
  const phases = events.filter(e => e.type === 'action_phase_changed');
  const actionIds = new Set(started.map(e => e.data.actionId));
  const result = {
    defA, defB, seed,
    ticks: sim.clock.tick,
    matchStatus: sim.matchStatus,
    winnerId: sim.winnerId,
    aHealth: sim.fighterA.health,
    bHealth: sim.fighterB.health,
    actions: started.length,
    actionKinds: actionIds.size,
    contacts: contacts.length,
    combatEvents: hits.length,
    phaseTransitions: phases.length,
    traceLength: trace.length,
    maxArenaRadius,
    minSeparation,
    invalidState,
    trace,
  };
  return result;
}

function summarize(results) {
  return results.reduce((summary, result) => {
    summary.bouts++;
    summary.ended += result.matchStatus === 'ko' ? 1 : 0;
    summary.actions += result.actions;
    summary.contacts += result.contacts;
    summary.combatEvents += result.combatEvents;
    summary.actionKinds = Math.max(summary.actionKinds, result.actionKinds);
    return summary;
  }, { bouts: 0, ended: 0, actions: 0, contacts: 0, combatEvents: 0, actionKinds: 0 });
}

let assertions = 0;
const results = [];
console.log(`\n── AI balance matrix: ${pairs.length} pairs × ${SEEDS.length} seeds ──`);

for (const [defA, defB] of pairs) {
  const boutResults = SEEDS.map(seed => runBout(defA, defB, seed));
  results.push(...boutResults);
  for (const result of boutResults) {
    assert.equal(result.invalidState, null,
      `${defA} vs ${defB} seed ${result.seed}: invalid state`);
    assertions++;
    assert.ok(result.actions >= MIN_ACTIONS,
      `${defA} vs ${defB} seed ${result.seed}: too few actions (${result.actions})`);
    assertions++;
    assert.ok(result.contacts >= MIN_COMBAT_EVENTS,
      `${defA} vs ${defB} seed ${result.seed}: too few contacts (${result.contacts})`);
    assertions++;
    assert.ok(result.combatEvents > 0,
      `${defA} vs ${defB} seed ${result.seed}: no hit/block/parry consequence`);
    assertions++;
    assert.ok(result.maxArenaRadius <= R.ARENA_RADIUS + .001,
      `${defA} vs ${defB} seed ${result.seed}: escaped arena`);
    assertions++;
    assert.ok(result.minSeparation >= .719,
      `${defA} vs ${defB} seed ${result.seed}: fighters overlapped (${result.minSeparation})`);
    assertions++;
    assert.ok(result.phaseTransitions >= result.actions,
      `${defA} vs ${defB} seed ${result.seed}: action phases not observable`);
    assertions++;
  }
  const summary = summarize(boutResults);
  console.log(`  ${defA} vs ${defB}: ${summary.ended}/${summary.bouts} KO, ${summary.actions} actions, ${summary.contacts} contacts`);
}

console.log('\n── Per-action telegraph contracts ──');
for (const id of [...getAttackIds(), ...getDefenseIds()]) {
  const def = getAction(id);
  assert.ok(Number.isInteger(def.startup) && def.startup > 0, `${id}: startup telegraph > 0`);
  assertions++;
  assert.ok(Number.isInteger(def.recovery) && def.recovery > 0, `${id}: recovery > 0`);
  assertions++;
  if (def.family === 'attack' && id !== 'feint_jab') {
    assert.ok(def.active > 0, `${id}: attack active window > 0`);
    assertions++;
    assert.ok(def.animationId === id, `${id}: semantic animation mapping`);
    assertions++;
  } else if (def.family === 'attack') {
    assert.equal(def.damage, 0, 'feint_jab has no damage');
    assertions++;
    assert.equal(def.active, 0, 'feint_jab intentionally has no contact window');
    assertions++;
  }
}

console.log('\n── Deterministic matrix spot-check ──');
const first = runBout('forge_titan', 'vanta_razor', 909);
const second = runBout('forge_titan', 'vanta_razor', 909);
assert.deepEqual(first, second, 'same matchup/seed must reproduce exact trace');
assertions++;

console.log('\n── Progress and diversity ──');
const allActionKinds = new Set(results.flatMap(result => result.trace.map(entry => entry.actionId)));
assert.ok(allActionKinds.size >= 8, `matrix should exercise varied moves, got ${allActionKinds.size}`);
assertions++;
assert.ok(results.every(result => result.matchStatus === 'ko'), 'every current bout reaches a bounded KO outcome');
assertions++;

const total = summarize(results);
console.log(`\nPASS: ${assertions} assertions; ${total.bouts} deterministic bouts; ${total.ended} KO; ${total.actions} actions; ${total.contacts} contacts; ${allActionKinds.size} action kinds.`);
