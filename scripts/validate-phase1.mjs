// ─── Phase 1 validation ─────────────────────────────────────────────
// Tests for CombatSimulation: arena, jab, guard, contact, KO, movement.
// Run: node scripts/validate-phase1.mjs

import assert from 'node:assert/strict';
import { CombatSimulation } from '../src/combat/CombatSimulation.js';
import { createActionIntent, ActionPhase, FighterStatus } from '../src/combat/CombatTypes.js';
import { getAction, applyCapability } from '../src/combat/ActionRegistry.js';
import * as R from '../src/combat/CombatRules.js';

let pass = 0;
function ok(label) { pass++; console.log(`  ✓ ${label}`); }

// Action timing helpers — use base action defs (no capability modifier for generic tests)
const JAB = getAction('jab');
const GUARD = getAction('guard_high');
const JAB_STARTUP = JAB.startup;
const JAB_ACTIVE = JAB.active;
const JAB_RECOVERY = JAB.recovery;
const JAB_STAMINA = JAB.staminaCost;
const JAB_DAMAGE = JAB.damage;
const JAB_CHIP = JAB.chipDamage;
const GUARD_STARTUP = GUARD.startup;
const GUARD_RECOVERY = GUARD.recovery;

function intent(fighterId, actionId, tick, extra = {}) {
  return createActionIntent({
    actionId, source: 'ai', priority: 0.8,
    createdAt: tick, expiresAt: tick + 120,
    targetId: fighterId === 'fighter_a' ? 'fighter_b' : 'fighter_a',
    reason: 'test', ...extra,
  });
}

/** Advance sim by exactly N ticks. */
function stepN(sim, n) {
  for (let i = 0; i < n; i++) sim.update(1 / R.TICK_RATE);
}

/** Step one tick. */
function step1(sim) { stepN(sim, 1); }

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Initial state ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  const a = sim.getState('fighter_a');
  const b = sim.getState('fighter_b');

  assert.equal(a.health, R.MAX_HEALTH);
  assert.equal(a.stamina, R.MAX_STAMINA);
  assert.equal(a.status, FighterStatus.READY);
  assert.equal(a.actionPhase, ActionPhase.IDLE);
  assert.equal(b.status, FighterStatus.READY);
  ok('both fighters start healthy and idle');

  assert.equal(a.z, -R.STARTING_DISTANCE / 2);
  assert.equal(b.z, R.STARTING_DISTANCE / 2);
  const dist = sim.getDistance();
  assert.ok(Math.abs(dist - R.STARTING_DISTANCE) < 0.001);
  ok('starting positions are correct distance apart');

  assert.equal(sim.matchStatus, 'fighting');
  assert.equal(sim.winnerId, null);
  ok('match status is fighting');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Jab action FSM ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  const a = sim.getState('fighter_a');

  // Submit jab intent
  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
  step1(sim); // tick 1: intent processed

  assert.equal(a.actionId, 'jab');
  assert.equal(a.actionPhase, ActionPhase.STARTUP);
  assert.equal(a.status, FighterStatus.ACTING);
  ok('jab enters startup on first tick');

  // Stamina consumed
  assert.equal(a.stamina, R.MAX_STAMINA - JAB_STAMINA);
  ok('stamina consumed on action start');

  // Startup began at tick 1 (actionTick=1). Elapsed = currentTick - actionTick.
  // After JAB_STARTUP more steps, elapsed = 8 → transitions to active.
  stepN(sim, JAB_STARTUP);
  assert.equal(a.actionPhase, ActionPhase.ACTIVE, `should be active after ${JAB_STARTUP} elapsed ticks`);
  ok('transitions to active after startup ticks');

  // Active window: after JAB_ACTIVE more steps, elapsed in active = 4 → recovery
  stepN(sim, JAB_ACTIVE);
  assert.equal(a.actionPhase, ActionPhase.RECOVERY);
  ok('transitions to recovery after active ticks');

  // Recovery: after JAB_RECOVERY more steps → idle
  stepN(sim, JAB_RECOVERY);
  assert.equal(a.actionPhase, ActionPhase.IDLE);
  assert.equal(a.actionId, 'none');
  assert.equal(a.status, FighterStatus.READY);
  ok('returns to idle after recovery');

  // Verify action_started event
  const events = sim.log.toArray();
  const started = events.find(e => e.type === 'action_started' && e.fighterId === 'fighter_a');
  assert.ok(started);
  assert.equal(started.data.actionId, 'jab');
  ok('action_started event emitted');

  const ended = events.find(e => e.type === 'action_ended' && e.fighterId === 'fighter_a');
  assert.ok(ended);
  ok('action_ended event emitted');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Cannot jab during recovery ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  const a = sim.getState('fighter_a');

  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
  stepN(sim, JAB_STARTUP + JAB_ACTIVE + 1); // into recovery
  assert.equal(a.actionPhase, ActionPhase.RECOVERY);

  // Try another jab during recovery — should not start
  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
  step1(sim);
  assert.equal(a.actionPhase, ActionPhase.RECOVERY, 'cannot jab during recovery');
  ok('cannot start new jab during recovery');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Guard action ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  const a = sim.getState('fighter_a');

  sim.submitIntentFor('fighter_a', intent('fighter_a', 'guard_high', sim.clock.tick));
  step1(sim);
  assert.equal(a.actionId, 'guard_high');
  assert.equal(a.actionPhase, ActionPhase.STARTUP);
  ok('guard enters startup');

  stepN(sim, GUARD_STARTUP);
  assert.equal(a.actionPhase, ActionPhase.ACTIVE, 'guard should be in hold');
  ok('guard transitions to active (hold)');

  // Guard holds indefinitely
  const staminaBefore = a.stamina;
  stepN(sim, 60); // 1 second
  assert.equal(a.actionPhase, ActionPhase.ACTIVE);
  assert.ok(a.stamina < staminaBefore, 'stamina should drain during guard');
  const expectedDrain = GUARD.drainPerSec; // 1 second
  assert.ok(Math.abs((staminaBefore - a.stamina) - expectedDrain) < 0.5);
  ok('guard holds and drains stamina');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Guard cancel into jab ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  const a = sim.getState('fighter_a');

  // Enter guard hold
  sim.submitIntentFor('fighter_a', intent('fighter_a', 'guard_high', sim.clock.tick));
  stepN(sim, 1 + GUARD_STARTUP);
  assert.equal(a.actionPhase, ActionPhase.ACTIVE);

  // Request jab while in guard hold
  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
  step1(sim);
  // Should drop to recovery
  assert.equal(a.actionId, 'guard_high');
  assert.equal(a.actionPhase, ActionPhase.RECOVERY);
  ok('jab request during guard triggers guard recovery');

  // Wait for guard recovery to end — the pending jab intent persists through
  // recovery and auto-fires when idle is reached.
  stepN(sim, GUARD_RECOVERY + 1);
  // The jab should have auto-started from the persisted intent
  assert.equal(a.actionId, 'jab');
  assert.equal(a.actionPhase, ActionPhase.STARTUP);
  ok('jab auto-starts from persisted intent after guard recovery');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Contact: hit ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  const b = sim.getState('fighter_b');
  // Move fighters close together (within jab reach)
  sim.fighterA.z = -0.5;
  sim.fighterB.z = 0.5;
  // Face each other
  sim.fighterA.facing = 0; // +Z
  sim.fighterB.facing = Math.PI; // -Z

  const healthBefore = b.health;

  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
  stepN(sim, 1 + JAB_STARTUP); // into active

  assert.equal(sim.getState('fighter_a').actionPhase, ActionPhase.ACTIVE);

  // Resolve contact on this tick
  step1(sim);

  const events = sim.log.toArray().filter(e => e.type === 'contact_resolved');
  assert.ok(events.length >= 1, 'should have contact event');
  const hitEvent = events[events.length - 1];
  assert.equal(hitEvent.data.result, 'hit');
  assert.equal(hitEvent.data.damage, JAB_DAMAGE);
  assert.equal(b.health, healthBefore - JAB_DAMAGE);
  ok('clean hit deals full damage');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Contact: blocked ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  sim.fighterA.z = -0.5; sim.fighterB.z = 0.5;
  sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;

  // B guards first
  sim.submitIntentFor('fighter_b', intent('fighter_b', 'guard_high', sim.clock.tick));
  stepN(sim, 1 + GUARD_STARTUP);
  assert.equal(sim.getState('fighter_b').actionPhase, ActionPhase.ACTIVE);

  const bHealthBefore = sim.fighterB.health;
  const bStaminaBefore = sim.fighterB.stamina;

  // A jabs
  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
  stepN(sim, 1 + JAB_STARTUP + 1); // through startup + first active tick

  const events = sim.log.toArray().filter(e => e.type === 'contact_resolved');
  const blockEvent = events[events.length - 1];
  assert.equal(blockEvent.data.result, 'blocked');
  assert.equal(blockEvent.data.damage, JAB_CHIP);
  assert.equal(sim.fighterB.health, bHealthBefore - JAB_CHIP);
  ok('blocked hit deals chip damage');

  assert.ok(sim.fighterB.stamina < bStaminaBefore, 'guard stamina drain on block');
  ok('defender loses stamina on block');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Contact: miss (out of range) ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  // Keep default positions — 3m apart > 1.8m reach
  sim.fighterA.facing = 0;
  sim.fighterB.facing = Math.PI;

  const bHealthBefore = sim.fighterB.health;

  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
  stepN(sim, 1 + JAB_STARTUP + JAB_ACTIVE + 1); // past active

  assert.equal(sim.fighterB.health, bHealthBefore);

  const events = sim.log.toArray().filter(e => e.type === 'contact_resolved');
  assert.ok(events.length >= 1);
  assert.equal(events[events.length - 1].data.result, 'missed');
  assert.equal(events[events.length - 1].data.reason, 'out_of_range');
  ok('jab at range misses, no damage');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Contact: miss (bad facing) ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  sim.fighterA.z = -0.5; sim.fighterB.z = 0.5;
  sim.fighterA.facing = Math.PI; // facing AWAY from B

  const bHealthBefore = sim.fighterB.health;

  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
  stepN(sim, 1 + JAB_STARTUP + JAB_ACTIVE + 1);

  assert.equal(sim.fighterB.health, bHealthBefore);
  const events = sim.log.toArray().filter(e => e.type === 'contact_resolved');
  assert.equal(events[events.length - 1].data.result, 'missed');
  assert.equal(events[events.length - 1].data.reason, 'bad_facing');
  ok('jab facing wrong direction misses');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Contact dedup ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  sim.fighterA.z = -0.5; sim.fighterB.z = 0.5;
  sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;

  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
  stepN(sim, 1 + JAB_STARTUP + JAB_ACTIVE + JAB_RECOVERY + 1); // full action

  const contacts = sim.log.toArray().filter(e => e.type === 'contact_resolved' && e.fighterId === 'fighter_a');
  assert.equal(contacts.length, 1, 'only one contact per jab');
  ok('same jab only resolves contact once');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── KO ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  sim.fighterA.z = -0.5; sim.fighterB.z = 0.5;
  sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;

  // Set B to low health
  sim.fighterB.health = JAB_DAMAGE;

  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
  stepN(sim, 1 + JAB_STARTUP + JAB_ACTIVE + 1);

  assert.equal(sim.fighterB.health, 0);
  assert.equal(sim.fighterB.status, FighterStatus.KO);
  assert.equal(sim.matchStatus, 'ko');
  assert.equal(sim.winnerId, 'fighter_a');
  ok('KO when health reaches 0');

  // KO fighter cannot act
  sim.submitIntentFor('fighter_b', intent('fighter_b', 'jab', sim.clock.tick));
  step1(sim);
  assert.equal(sim.fighterB.actionId, 'none', 'KO fighter cannot act');
  ok('KO fighter rejects intents');

  // Simulation stops progressing
  const tickBefore = sim.clock.tick;
  sim.update(1);
  assert.equal(sim.clock.tick, tickBefore, 'sim stops after KO');
  ok('simulation halts after KO');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Arena bounds ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  const a = sim.getState('fighter_a');

  // Place fighter near edge
  a.x = 0; a.z = -R.ARENA_RADIUS + 0.1; a.facing = Math.PI; // facing -Z (toward edge)

  // Push hard toward edge
  for (let i = 0; i < 300; i++) { // 5 seconds of movement
    sim.applyMovement('fighter_a', { forward: 1 });
  }

  const distFromCenter = Math.sqrt(a.x * a.x + a.z * a.z);
  assert.ok(distFromCenter <= R.ARENA_RADIUS + 0.001, `should not exceed arena: ${distFromCenter}`);
  ok('fighter stays within arena bounds');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Movement blocked during action ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  const a = sim.getState('fighter_a');

  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
  step1(sim);
  assert.equal(a.actionPhase, ActionPhase.STARTUP);

  const xBefore = a.x, zBefore = a.z;
  sim.applyMovement('fighter_a', { forward: 1 });
  assert.equal(a.x, xBefore);
  assert.equal(a.z, zBefore);
  ok('cannot move during action phase');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Turn rate ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  const a = sim.getState('fighter_a');
  a.facing = 0;

  // Turn 180° — should take roughly 1 second at 180°/s
  for (let i = 0; i < 60; i++) {
    sim.applyMovement('fighter_a', { turnTo: Math.PI });
  }

  assert.ok(Math.abs(a.facing - Math.PI) < 0.05, `facing should be ~π, got ${a.facing}`);
  ok('turn rate approximately correct');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Stamina regen when idle ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  const a = sim.getState('fighter_a');
  a.stamina = 50;

  stepN(sim, 60); // 1 second idle

  assert.ok(Math.abs(a.stamina - (50 + R.STAMINA_REGEN_PER_SEC)) < 0.5);
  ok('stamina regens at correct rate when idle');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── No regen during action ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  const a = sim.getState('fighter_a');

  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
  step1(sim);
  const staminaAfterStart = a.stamina;

  stepN(sim, JAB_STARTUP - 1); // still in startup
  assert.equal(a.stamina, staminaAfterStart, 'no regen during startup');
  ok('no stamina regen during action phases');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Exhaustion: slower startup ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  const a = sim.getState('fighter_a');

  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
  step1(sim);
  a.stamina = 0; // become exhausted after the action starts
  assert.equal(a.actionPhase, ActionPhase.STARTUP);

  // Normal startup = 8 ticks, exhausted = ceil(8 * 1.5) = 12
  const exhaustedStartup = Math.ceil(JAB_STARTUP * R.EXHAUSTION_STARTUP_MULT);

  // Should still be in startup after normal threshold (8 more ticks = tick 9, elapsed=8 < 12)
  stepN(sim, JAB_STARTUP);
  assert.equal(a.actionPhase, ActionPhase.STARTUP, 'still in startup at normal threshold');

  // Step remaining to reach exhausted threshold
  stepN(sim, exhaustedStartup - JAB_STARTUP);
  assert.equal(a.actionPhase, ActionPhase.ACTIVE, 'transitions at exhausted threshold');
  ok(`exhaustion extends startup from ${JAB_STARTUP} to ${exhaustedStartup} ticks`);
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Expired intent rejected ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  const a = sim.getState('fighter_a');

  // Create intent that expires immediately
  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', 0, { expiresAt: 0 }));
  step1(sim); // tick 1 > expiresAt 0 → expired
  assert.equal(a.actionId, 'none', 'expired intent should not execute');
  ok('stale intent rejected');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Reset ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  sim.fighterA.z = -0.5; sim.fighterB.z = 0.5;
  sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;
  sim.fighterB.health = JAB_DAMAGE;

  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
  stepN(sim, 30);
  assert.equal(sim.matchStatus, 'ko');

  sim.reset();
  assert.equal(sim.matchStatus, 'fighting');
  assert.equal(sim.fighterA.health, R.MAX_HEALTH);
  assert.equal(sim.fighterB.health, R.MAX_HEALTH);
  assert.equal(sim.fighterA.actionPhase, ActionPhase.IDLE);
  assert.equal(sim.clock.tick, 0);
  assert.equal(sim.log.length, 0);
  ok('reset restores initial state');

  // Can fight again after reset
  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
  step1(sim);
  assert.equal(sim.fighterA.actionId, 'jab');
  ok('can act after reset');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Determinism ──');
// ═══════════════════════════════════════════════════════════════════

{
  function runScenario() {
    const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
    sim.fighterA.z = -0.5; sim.fighterB.z = 0.5;
    sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;

    // Script: A jabs, B guards, A jabs again
    sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
    stepN(sim, JAB_STARTUP + JAB_ACTIVE + JAB_RECOVERY + 2);

    sim.submitIntentFor('fighter_b', intent('fighter_b', 'guard_high', sim.clock.tick));
    stepN(sim, 1 + GUARD_STARTUP);

    sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
    stepN(sim, JAB_STARTUP + JAB_ACTIVE + JAB_RECOVERY + 2);

    return {
      tick: sim.clock.tick,
      aHealth: sim.fighterA.health,
      bHealth: sim.fighterB.health,
      aStamina: sim.fighterA.stamina,
      bStamina: sim.fighterB.stamina,
      events: sim.log.total,
    };
  }

  const r1 = runScenario();
  const r2 = runScenario();
  assert.deepEqual(r1, r2);
  ok('same scripted input → identical state');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Guard auto-drop on stamina depletion ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  const a = sim.getState('fighter_a');

  sim.submitIntentFor('fighter_a', intent('fighter_a', 'guard_high', sim.clock.tick));
  stepN(sim, 1 + GUARD_STARTUP); // enter hold
  assert.equal(a.actionPhase, ActionPhase.ACTIVE);

  // Set low stamina AFTER entering hold to avoid regen interfering
  a.stamina = 2;

  // Run until stamina depletes: 2 / (12/60) = 10 ticks, then recovery+idle regen.
  // We just check guard dropped and the fighter isn't stuck in hold.
  stepN(sim, 60);
  assert.notEqual(a.actionPhase, ActionPhase.ACTIVE, 'guard dropped at 0 stamina');
  // Check that action transitioned away from guard_high
  // (either in recovery or back to idle after recovery finished)
  ok('guard auto-drops when stamina hits 0');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Posture damage and knockdown ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  sim.fighterA.z = -0.5; sim.fighterB.z = 0.5;
  sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;

  const b = sim.getState('fighter_b');
  assert.equal(b.posture, R.MAX_POSTURE, 'posture starts full');
  ok('posture starts full');

  // Force posture to near-zero so a jab causes knockdown.
  b.posture = 1;
  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
  stepN(sim, 1 + JAB_STARTUP + 1); // startup → first active tick → contact

  const hitEvt = sim.log.toArray().find(e => e.type === 'contact_resolved' && e.data.result === 'hit');
  assert.ok(hitEvt && hitEvt.data.postureDamage > 0, 'hit event carries postureDamage');
  ok('hit event includes postureDamage field');

  const downEvt = sim.log.toArray().find(e => e.type === 'fighter_down');
  assert.ok(downEvt, 'fighter_down event emitted when posture breaks');
  assert.equal(downEvt.fighterId, 'fighter_b');
  ok('fighter_down event emitted on posture break');

  assert.equal(b.status, FighterStatus.DOWN, 'fighter status is DOWN');
  ok('fighter status transitions to DOWN');

  // Cannot act while DOWN (submit with short expiry so it doesn't fire on get-up).
  sim.submitIntentFor('fighter_b', intent('fighter_b', 'jab', sim.clock.tick, { expiresAt: sim.clock.tick + 2 }));
  step1(sim);
  assert.equal(b.actionId, 'none', 'cannot start action while DOWN');
  ok('cannot act while DOWN');
  step1(sim); // let the short-lived intent expire

  // Wait for downUntil ticks, then get-up sequence.
  const ticksLeft = b.downUntil - sim.clock.tick;
  stepN(sim, ticksLeft + 1);
  assert.equal(b.status, FighterStatus.GETTING_UP, 'transitions to GETTING_UP after downUntil');
  ok('transitions to GETTING_UP after down duration');

  stepN(sim, R.GET_UP_TICKS + 5);
  // Fighter B should be READY; A may still be acting from its jab.
  assert.equal(b.status, FighterStatus.READY, 'transitions back to READY after get-up');
  ok('transitions to READY after get-up sequence');

  const getUpEvt = sim.log.toArray().find(e => e.type === 'fighter_get_up_complete');
  assert.ok(getUpEvt, 'fighter_get_up_complete event emitted');
  ok('fighter_get_up_complete event emitted');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Guard break (guard stamina exhausted) ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  sim.fighterA.z = -0.5; sim.fighterB.z = 0.5;
  sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;

  const b = sim.getState('fighter_b');
  sim.submitIntentFor('fighter_b', intent('fighter_b', 'guard_high', sim.clock.tick));
  stepN(sim, 1 + GUARD_STARTUP); // B is now holding guard

  // Exhaust B's stamina so the next block causes guard break.
  b.stamina = 1;
  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
  stepN(sim, 1 + JAB_STARTUP + 1);

  const gbEvt = sim.log.toArray().find(e => e.type === 'guard_break' && e.fighterId === 'fighter_b');
  assert.ok(gbEvt, 'guard_break event emitted');
  ok('guard_break event emitted when guard stamina exhausted by hit');
  assert.equal(b.status, FighterStatus.STAGGERED, 'guard-broken fighter is STAGGERED');
  ok('guard-broken fighter status is STAGGERED');
}

// ═══════════════════════════════════════════════════════════════════
console.log(`\nPASS: ${pass} assertions. Phase 1 combat simulation validated.\n`);
