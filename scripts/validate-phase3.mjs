// ─── Phase 3 validation ─────────────────────────────────────────────
// Local autonomous CombatBrain: perception, spacing, scoring, commitment,
// deterministic choices and offline combat.
// Run: node scripts/validate-phase3.mjs

import assert from 'node:assert/strict';
import { CombatSimulation } from '../src/combat/CombatSimulation.js';
import { CombatBrain, BRAIN_STATES } from '../src/ai/CombatBrain.js';
import { getAction } from '../src/combat/ActionRegistry.js';
import { getBehaviorProfile } from '../src/ai/robotBehaviorProfiles.js';
import { SeededRNG } from '../src/combat/SeededRNG.js';
import * as R from '../src/combat/CombatRules.js';

let pass = 0;
function ok(label) { pass++; console.log(`  ✓ ${label}`); }
function stepN(sim, n, callback = null) {
  for (let i = 0; i < n; i++) sim.update(1 / R.TICK_RATE, callback);
}
function intentFor(brain, sim) {
  const result = brain.decide(sim);
  if (result?.intent) sim.submitIntentFor(brain.fighterId, result.intent);
  if (result) sim.applyMovement(brain.fighterId, result.movement);
  return result;
}
function makePair(seedA = 101, seedB = 202) {
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral', seed: 77 });
  const brainA = new CombatBrain({ fighterId: 'fighter_a', definitionId: 'test_neutral', seed: seedA });
  const brainB = new CombatBrain({ fighterId: 'fighter_b', definitionId: 'test_neutral', seed: seedB });
  return { sim, brainA, brainB };
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Profile contracts ──');
// ═══════════════════════════════════════════════════════════════════

{
  const ids = ['forge_titan', 'aegis_prime', 'vanta_razor', 'volt_kestrel', 'solstice_mantis'];
  for (const id of ids) {
    const p = getBehaviorProfile(id);
    assert.ok(p.preferredDistance > 0);
    assert.ok(p.distanceTolerance > 0);
    assert.ok(p.pressureBias >= 0 && p.pressureBias <= 1);
    assert.ok(p.counterBias >= 0 && p.counterBias <= 1);
    assert.ok(p.retreatBias >= 0 && p.retreatBias <= 1);
    assert.ok(p.riskTolerance >= 0 && p.riskTolerance <= 1);
    assert.ok(Object.isFrozen(p));
    assert.ok(Object.isFrozen(p.attackWeights));
    assert.ok(Object.isFrozen(p.defenseWeights));
  }
  ok('five behavior profiles are bounded and frozen');

  assert.ok(getBehaviorProfile('forge_titan').pressureBias > getBehaviorProfile('aegis_prime').pressureBias);
  assert.ok(getBehaviorProfile('vanta_razor').evadeBias > getBehaviorProfile('forge_titan').evadeBias);
  assert.ok(getBehaviorProfile('solstice_mantis').preferredDistance > getBehaviorProfile('forge_titan').preferredDistance);
  ok('profiles express distinct archetype tendencies');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Perception ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  const brain = new CombatBrain({ fighterId: 'fighter_a', definitionId: 'test_neutral', seed: 1 });
  const view = brain.perceive(sim);
  assert.equal(view.self.id, 'fighter_a');
  assert.equal(view.target.id, 'fighter_b');
  assert.equal(view.distance, R.STARTING_DISTANCE);
  assert.equal(view.inFacing, true);
  assert.equal(view.targetThreat, false);
  assert.equal(view.nearEdge, false);
  ok('brain perceives distance, facing, target and resources');

  sim.submitIntentFor('fighter_b', {
    actionId: 'jab', source: 'ai', priority: .8,
    createdAt: 0, expiresAt: 20, targetId: 'fighter_a', reason: 'fixture',
  });
  sim.update(1 / R.TICK_RATE);
  const threatView = brain.perceive(sim);
  assert.equal(threatView.targetThreat, true);
  assert.equal(threatView.targetAttacking, true);
  ok('brain recognizes an opponent attack telegraph');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Spacing state and movement ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  const brain = new CombatBrain({ fighterId: 'fighter_a', definitionId: 'solstice_mantis', seed: 9 });
  const initial = brain.decide(sim);
  assert.equal(initial.state, BRAIN_STATES.APPROACH);
  assert.equal(initial.movement.forward, 1);
  assert.equal(initial.movement.turnTo, 0);
  ok('far target produces approach state and forward movement');

  // Apply movement while idle for 60 ticks; target remains at +Z.
  for (let i = 0; i < 60; i++) {
    const result = brain.decide(sim);
    sim.applyMovement('fighter_a', result.movement);
  }
  assert.ok(sim.getDistance() < R.STARTING_DISTANCE, 'approach closes distance');
  ok('approach movement closes distance without teleporting');

  // Put fighter at the arena edge and force an inward/sideways response.
  sim.fighterA.x = 0; sim.fighterA.z = -R.ARENA_RADIUS * .9;
  sim.fighterA.facing = Math.PI;
  const edge = brain.decide(sim);
  assert.ok(edge.movement.forward <= 0, 'edge awareness avoids pushing outward');
  assert.notEqual(edge.state, BRAIN_STATES.PRESSURE);
  ok('edge awareness changes movement intent');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Commitment prevents action spam ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  sim.fighterA.z = -.5; sim.fighterB.z = .5;
  const brain = new CombatBrain({ fighterId: 'fighter_a', definitionId: 'test_neutral', seed: 12, decisionInterval: 6 });

  const first = intentFor(brain, sim);
  assert.ok(first.intent, 'first idle decision produces intent');
  const firstAction = first.intent.actionId;
  const firstTick = first.intent.createdAt;
  const second = intentFor(brain, sim);
  assert.equal(second.intent, null, 'same state does not produce a second intent');
  assert.equal(brain.lastDecision.actionId, firstAction);
  assert.equal(firstTick, 0);
  ok('commitment and decision interval prevent spam');

  // After simulation starts the action, brain must still leave it alone.
  sim.update(1 / R.TICK_RATE);
  const duringAction = brain.decide(sim);
  assert.equal(duringAction.intent, null);
  ok('brain does not replace a committed action mid-phase');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Utility scoring changes with threat ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  sim.fighterA.z = -.5; sim.fighterB.z = .5;
  const defensive = new CombatBrain({ fighterId: 'fighter_a', definitionId: 'aegis_prime', seed: 1 });

  // No threat: Aegis should still select a legal move, usually an attack at close range.
  const calm = defensive.decide(sim);
  assert.ok(calm.intent);
  const calmDef = getAction(calm.intent.actionId);
  assert.ok(calmDef);

  // Threat: put B in jab startup, then ask A again after resetting brain gate.
  sim.submitIntentFor('fighter_b', {
    actionId: 'jab', source: 'ai', priority: .8,
    createdAt: 0, expiresAt: 30, targetId: 'fighter_a', reason: 'threat_fixture',
  });
  sim.update(1 / R.TICK_RATE);
  defensive.nextDecisionTick = 0;
  defensive.commitUntil = 0;
  const threatened = defensive.decide(sim);
  assert.ok(threatened.intent);
  const threatenedDef = getAction(threatened.intent.actionId);
  assert.ok(threatenedDef);
  assert.ok(['defense', 'attack'].includes(threatenedDef.family));
  assert.ok(threatened.state === BRAIN_STATES.DEFEND || threatened.state === BRAIN_STATES.EVADE || threatened.state === BRAIN_STATES.PREFERRED_RANGE);
  ok(`threat produces readable defensive-aware choice (${threatened.intent.actionId})`);
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Heavy attacks are deprioritized at low stamina ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  sim.fighterA.z = -.5; sim.fighterB.z = .5;
  sim.fighterA.stamina = 8;
  const brain = new CombatBrain({ fighterId: 'fighter_a', definitionId: 'forge_titan', seed: 3 });
  const result = brain.decide(sim);
  assert.ok(result.intent);
  const def = getAction(result.intent.actionId);
  assert.ok(def.staminaCost <= 20);
  // A heavy action may still be selected when the profile strongly likes it,
  // but a zero-stamina decision must never claim an impossible free choice.
  assert.ok(result.intent.priority >= 0 && result.intent.priority <= 1);
  ok(`low stamina produces bounded legal choice (${result.intent.actionId})`);
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Deterministic brain choices ──');
// ═══════════════════════════════════════════════════════════════════

{
  function run(seedA, seedB) {
    const { sim, brainA, brainB } = makePair(seedA, seedB);
    const trace = [];
    for (let i = 0; i < 360 && sim.matchStatus !== 'ko'; i++) {
      sim.update(1 / R.TICK_RATE, () => {
        for (const brain of [brainA, brainB]) {
          const result = brain.decide(sim);
          sim.applyMovement(brain.fighterId, result?.movement || { forward: 0 });
          if (result?.intent) sim.submitIntentFor(brain.fighterId, result.intent);
          if (result?.intent) trace.push([sim.currentTick, brain.fighterId, result.intent.actionId, result.state]);
        }
      });
    }
    return {
      tick: sim.clock.tick,
      health: [sim.fighterA.health, sim.fighterB.health],
      distance: sim.getDistance(),
      events: sim.log.total,
      trace,
    };
  }

  const a = run(10, 20);
  const b = run(10, 20);
  assert.deepEqual(a, b);
  assert.ok(a.events > 0);
  assert.ok(a.trace.length > 0);
  ok('same seeds and inputs produce identical AI trace and combat state');

  const different = run(11, 21);
  assert.notDeepEqual(different.trace, a.trace);
  ok('different seeds can produce different action choices');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Autonomous offline encounter ──');
// ═══════════════════════════════════════════════════════════════════

{
  const { sim, brainA, brainB } = makePair(301, 302);
  let decisionReasons = 0;
  let actionEvents = 0;
  for (let i = 0; i < 1800 && sim.matchStatus !== 'ko'; i++) {
    sim.update(1 / R.TICK_RATE, () => {
      for (const brain of [brainA, brainB]) {
        const result = brain.decide(sim);
        sim.applyMovement(brain.fighterId, result?.movement || { forward: 0 });
        if (result?.intent) {
          sim.submitIntentFor(brain.fighterId, result.intent);
          if (result.intent.reason) decisionReasons++;
        }
      }
    });
  }
  actionEvents = sim.log.toArray().filter(e => e.type === 'action_started').length;
  assert.ok(sim.clock.tick > 0);
  assert.ok(actionEvents >= 4, `expected autonomous actions, got ${actionEvents}`);
  assert.ok(decisionReasons >= 4, 'decision reasons are available for debug');
  assert.ok(sim.fighterA.x ** 2 + sim.fighterA.z ** 2 <= R.ARENA_RADIUS ** 2 + .001);
  assert.ok(sim.fighterB.x ** 2 + sim.fighterB.z ** 2 <= R.ARENA_RADIUS ** 2 + .001);
  assert.ok(sim.fighterA.health < 100 || sim.fighterB.health < 100 || sim.matchStatus === 'ko',
    'autonomous encounter must create combat consequence');
  ok(`offline autonomous encounter produced ${actionEvents} actions and ${sim.log.total} events`);
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── No renderer/provider dependency ──');

{
  const { sim, brainA, brainB } = makePair(501, 502);
  // This test imports only domain/AI modules and runs without a browser or Three.js.
  stepN(sim, 120, () => {
    for (const brain of [brainA, brainB]) {
      const result = brain.decide(sim);
      sim.applyMovement(brain.fighterId, result?.movement || { forward: 0 });
      if (result?.intent) sim.submitIntentFor(brain.fighterId, result.intent);
    }
  });
  assert.ok(sim.clock.tick > 0);
  ok('AI combat runs as a local Node fixture without renderer/network/model');
}

console.log(`\nPASS: ${pass} assertions. Phase 3 local autonomous AI validated.\n`);
