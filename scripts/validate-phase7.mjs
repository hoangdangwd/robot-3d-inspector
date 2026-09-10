// ─── Phase 7 validation: adherence, capacity, version history ──────
// Run: node scripts/validate-phase7.mjs
import assert from 'node:assert/strict';
import { computeAdherence, rollAdherence, adherenceMissReason } from '../src/ai/AdherenceModel.js';
import { SeededRNG } from '../src/combat/SeededRNG.js';
import { CombatBrain } from '../src/ai/CombatBrain.js';
import { CombatSimulation } from '../src/combat/CombatSimulation.js';
import { validateTactic } from '../src/tactics/TacticSchema.js';
import { PlaybookStore } from '../src/tactics/PlaybookStore.js';
import * as R from '../src/combat/CombatRules.js';

let assertions = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); assertions++; };

// ── Shared tactic fixture ────────────────────────────────────────────
const tactic = {
  schemaVersion: 1, id: 'hook-punish', name: 'Hook Punish', goal: 'Counter hook.',
  priority: .8,
  trigger: { type: 'enemy_attack_start', actionId: 'hook_right' },
  phases: [{ id: 'counter', sequence: [{ actionId: 'slip_left' }, { actionId: 'body_cross' }], branches: [] }],
  abort: [{ type: 'near_edge' }], repeatLimit: 2, timeoutTicks: 180,
};

// ════════════════════════════════════════════════════════════════════
console.log('\n── AdherenceModel: compute ──');
// ════════════════════════════════════════════════════════════════════
{
  const base = { baseAdherence: .8, staminaRatio: 1, isStaggered: false,
                 tacticCost: 3, activeTactics: 1, nearEdge: false };

  const healthy = computeAdherence(base);
  ok(Math.abs(healthy - .8) < .001, 'full health → adherence equals base');

  const lowSta = computeAdherence({ ...base, staminaRatio: .10 });
  ok(lowSta < healthy, 'low stamina reduces adherence');

  const staggered = computeAdherence({ ...base, isStaggered: true });
  ok(staggered < healthy, 'staggered reduces adherence');

  const complex = computeAdherence({ ...base, tacticCost: 8 });
  ok(complex < healthy, 'complex tactic reduces adherence');

  const multi = computeAdherence({ ...base, activeTactics: 3 });
  ok(multi < healthy, 'multiple active tactics reduce adherence');

  const edge = computeAdherence({ ...base, nearEdge: true });
  ok(edge < healthy, 'near edge reduces adherence');

  const exhausted = computeAdherence({ ...base, staminaRatio: 0, isStaggered: true, tacticCost: 9, activeTactics: 3, nearEdge: true });
  ok(exhausted >= 0 && exhausted <= 1, 'adherence clamped 0..1 under extreme stress');
  ok(exhausted < .5, 'extreme stress produces low adherence');
}

// ════════════════════════════════════════════════════════════════════
console.log('\n── AdherenceModel: seeded roll ──');
// ════════════════════════════════════════════════════════════════════
{
  const rng1 = new SeededRNG(101);
  const rng2 = new SeededRNG(101);

  const roll1 = rollAdherence(.8, rng1);
  const roll2 = rollAdherence(.8, rng2);
  ok(roll1.roll === roll2.roll, 'same seed → same roll (deterministic)');
  ok(roll1.roll >= 0 && roll1.roll <= 1, 'roll is in 0..1');
  ok(typeof roll1.follows === 'boolean', 'follows is boolean');

  // Full adherence → always follows
  const rng3 = new SeededRNG(42);
  const perfect = rollAdherence(1, rng3);
  ok(perfect.follows === true, 'adherence=1 always follows');

  // Zero adherence → never follows
  const rng4 = new SeededRNG(42);
  const zero = rollAdherence(0, rng4);
  ok(zero.follows === false, 'adherence=0 never follows');
}

// ════════════════════════════════════════════════════════════════════
console.log('\n── AdherenceModel: miss reasons ──');
// ════════════════════════════════════════════════════════════════════
{
  ok(adherenceMissReason({ staminaRatio:1, isStaggered:true, tacticCost:1, activeTactics:1, nearEdge:false }) === 'staggered', 'staggered reason');
  ok(adherenceMissReason({ staminaRatio:.05, isStaggered:false, tacticCost:1, activeTactics:1, nearEdge:false }) === 'exhausted', 'exhausted reason');
  ok(adherenceMissReason({ staminaRatio:.20, isStaggered:false, tacticCost:1, activeTactics:1, nearEdge:false }) === 'low_stamina', 'low_stamina reason');
  ok(adherenceMissReason({ staminaRatio:1, isStaggered:false, tacticCost:10, activeTactics:1, nearEdge:false }) === 'tactic_too_complex', 'tactic_too_complex reason');
  ok(adherenceMissReason({ staminaRatio:1, isStaggered:false, tacticCost:1, activeTactics:4, nearEdge:false }) === 'overloaded', 'overloaded reason');
  ok(adherenceMissReason({ staminaRatio:1, isStaggered:false, tacticCost:1, activeTactics:1, nearEdge:true }) === 'near_edge_disruption', 'near_edge_disruption reason');
  ok(adherenceMissReason({ staminaRatio:1, isStaggered:false, tacticCost:1, activeTactics:1, nearEdge:false }) === 'random_miss', 'random_miss reason');
}

// ════════════════════════════════════════════════════════════════════
console.log('\n── CombatBrain: adherence miss is a game event ──');
// ════════════════════════════════════════════════════════════════════
{
  // Force a miss by giving the brain adherence=0 via a custom profile.
  // We achieve this by setting the robot stamina to near-zero (exhausted penalty)
  // and using forge_titan (adherence .72) which will miss under stress.
  const sim = new CombatSimulation({ defIdA: 'forge_titan', defIdB: 'test_neutral' });
  const brain = new CombatBrain({ fighterId: 'fighter_a', definitionId: 'forge_titan', seed: 7 });
  const installed = brain.setPlaybook([validateTactic(tactic).value], 1);
  ok(installed.ok, 'tactic installs into brain');

  // Set up scenario: trigger active (opponent throwing hook_right), low stamina.
  sim.fighterA.z = -0.5; sim.fighterB.z = 0.5;
  sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;
  // Trigger: submit hook_right from B
  sim.submitIntentFor('fighter_b', {
    actionId: 'hook_right', source: 'ai', priority: .8,
    createdAt: 0, expiresAt: 60, targetId: 'fighter_a', reason: 'fixture',
  });
  sim.update(1 / R.TICK_RATE); // tick 1: B starts hook

  // Now drain A's stamina to force stress penalty
  sim.fighterA.stamina = 5; // < 30% → low_stamina stress

  // Decide for brain. Tactic should trigger (hook_right active) but adherence roll
  // may or may not miss depending on seed. We run many seeds until we capture a miss.
  let foundMiss = false;
  let foundFollow = false;
  for (let seed = 1; seed <= 200; seed++) {
    const b = new CombatBrain({ fighterId: 'fighter_a', definitionId: 'forge_titan', seed });
    const freshSim = new CombatSimulation({ defIdA: 'forge_titan', defIdB: 'test_neutral' });
    freshSim.fighterA.z = -0.5; freshSim.fighterB.z = 0.5;
    freshSim.fighterA.facing = 0; freshSim.fighterB.facing = Math.PI;
    freshSim.submitIntentFor('fighter_b', {
      actionId: 'hook_right', source: 'ai', priority: .8,
      createdAt: 0, expiresAt: 60, targetId: 'fighter_a', reason: 'fix',
    });
    freshSim.update(1 / R.TICK_RATE);
    freshSim.fighterA.stamina = 5;
    b.setPlaybook([validateTactic(tactic).value], 1);
    const d = b.decide(freshSim);
    if (b.lastAdherenceMiss) { foundMiss = true; }
    else if (d?.intent?.source === 'tactic') { foundFollow = true; }
    if (foundMiss && foundFollow) break;
  }
  ok(foundMiss, 'at least one seed produces an adherence miss event');
  ok(foundFollow, 'at least one seed follows the tactic (not all misses)');
}

// ════════════════════════════════════════════════════════════════════
console.log('\n── CombatBrain: miss does not create illegal action ──');
// ════════════════════════════════════════════════════════════════════
{
  // Find a seed that misses, verify combat still runs cleanly afterward.
  let missedBrain = null, missedSim = null;
  for (let seed = 1; seed <= 200; seed++) {
    const b = new CombatBrain({ fighterId: 'fighter_a', definitionId: 'forge_titan', seed });
    const s = new CombatSimulation({ defIdA: 'forge_titan', defIdB: 'test_neutral' });
    s.fighterA.z = -0.5; s.fighterB.z = 0.5; s.fighterA.facing = 0; s.fighterB.facing = Math.PI;
    s.submitIntentFor('fighter_b', { actionId: 'hook_right', source: 'ai', priority: .8, createdAt: 0, expiresAt: 60, targetId: 'fighter_a', reason: 'fix' });
    s.update(1 / R.TICK_RATE);
    s.fighterA.stamina = 5;
    b.setPlaybook([validateTactic(tactic).value], 1);
    b.decide(s);
    if (b.lastAdherenceMiss) { missedBrain = b; missedSim = s; break; }
  }
  ok(missedBrain !== null, 'found a miss seed for illegal-action check');
  if (missedBrain) {
    // After the miss, the brain should fall back to utility. Let simulation run.
    for (let i = 0; i < 30; i++) {
      const d = missedBrain.decide(missedSim);
      if (d?.intent) missedSim.submitIntentFor('fighter_a', d.intent);
      if (d?.movement) missedSim.applyMovement('fighter_a', d.movement);
      missedSim.update(1 / R.TICK_RATE);
    }
    const stateA = missedSim.getState('fighter_a');
    ok(stateA.health > 0 || missedSim.matchStatus === 'ko', 'simulation remains valid after adherence miss');
    ok(Number.isFinite(stateA.health) && Number.isFinite(stateA.stamina), 'no NaN after adherence miss');
  }
}

// ════════════════════════════════════════════════════════════════════
console.log('\n── PlaybookStore: version history ──');
// ════════════════════════════════════════════════════════════════════
{
  const storage = new Map();
  const fakeStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
  const store = new PlaybookStore({ storage: fakeStorage, capacity: 10 });

  ok(store.history().length === 0, 'history starts empty');

  const v1tactic = validateTactic(tactic).value;
  const c1 = store.commit([v1tactic], 0);
  ok(c1.ok && c1.revision === 1, 'first commit succeeds');
  ok(store.history().length === 0, 'history empty before second commit (no prior state to push)');

  const v2tactic = { ...v1tactic, name: 'Hook Punish v2' };
  const c2 = store.commit([v2tactic], 1);
  ok(c2.ok && c2.revision === 2, 'second commit succeeds');
  ok(store.history().length === 1, 'history has one entry after second commit');
  ok(store.history()[0].revision === 1, 'history entry has revision 1');
  ok(store.history()[0].tactics[0].name === tactic.name, 'history preserves old tactic definition');

  // Third commit so we have two history entries.
  const v3tactic = { ...v1tactic, name: 'Hook Punish v3' };
  store.commit([v3tactic], 2);
  ok(store.history().length === 2, 'history depth grows with commits');

  // Rollback to revision 1.
  const rb = store.rollback(1, 3);
  ok(rb.ok, 'rollback to valid revision succeeds');
  ok(rb.revision === 4, 'rollback creates a new commit (revision increments)');
  ok(rb.tactics[0].name === tactic.name, 'rolled-back playbook matches original');

  // Rollback to unknown revision.
  ok(!store.rollback(99, 4).ok, 'rollback to unknown revision fails');
}

// ════════════════════════════════════════════════════════════════════
console.log('\n── PlaybookStore: history persists across reload ──');
// ════════════════════════════════════════════════════════════════════
{
  const storage = new Map();
  const fakeStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
  const store1 = new PlaybookStore({ storage: fakeStorage, capacity: 10 });
  const v1 = validateTactic(tactic).value;
  store1.commit([v1], 0);
  store1.commit([{ ...v1, name: 'v2' }], 1);

  // Reload from the same storage.
  const store2 = new PlaybookStore({ storage: fakeStorage, capacity: 10 });
  store2.load();
  ok(store2.history().length === 1, 'history survives storage reload');
  ok(store2._revision === 2, 'revision survives reload');
}

console.log(`\nPASS: ${assertions} assertions. Phase 7 adherence/history validated.\n`);
