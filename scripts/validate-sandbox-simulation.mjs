// ─── Fixed-step Sandbox movement validation ──────────────────────────
// Tests player movement without Three.js, wall-clock access or rendering.
// Run: node scripts/validate-sandbox-simulation.mjs

import assert from 'node:assert/strict';
import { SandboxSimulation } from '../src/sandbox/SandboxSimulation.js';
import {
  SandboxIntentSource,
  SandboxIntentType,
  createSandboxIntent,
} from '../src/sandbox/SandboxIntent.js';
import * as R from '../src/sandbox/SandboxRules.js';

let pass = 0;
function ok(label) { pass++; console.log(`  ✓ ${label}`); }
function close(actual, expected, label, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${label}: expected ${expected}, got ${actual}`);
}
function move(angle, createdAt = 0, expiresAt = 120) {
  return createSandboxIntent({
    type: SandboxIntentType.MOVE,
    source: SandboxIntentSource.LOCAL,
    priority: 1,
    createdAt,
    expiresAt,
    angle,
  });
}
function stop(createdAt, expiresAt = createdAt + 18) {
  return createSandboxIntent({
    type: SandboxIntentType.STOP,
    source: SandboxIntentSource.LOCAL,
    priority: 1,
    createdAt,
    expiresAt,
  });
}
function step(sim, ticks) {
  for (let i = 0; i < ticks; i++) sim.update(R.SANDBOX_TICK_DT);
}
function snapshot(sim) {
  return sim.getState();
}

console.log('\n── SandboxRules: fixed-step constants ──');
assert.equal(R.SANDBOX_TICK_RATE, 60);
assert.equal(R.SANDBOX_TICK_DT, 1 / 60);
assert.ok(R.SANDBOX_ARENA_RADIUS > 0);
assert.ok(R.SANDBOX_MOVE_SPEED > 0);
assert.ok(R.SANDBOX_TURN_RATE > 0);
assert.ok(Object.isFrozen(R.SANDBOX_RULES));
ok('Sandbox movement tuning is centralized and frozen');

console.log('\n── SandboxSimulation: initial state ──');
const initial = new SandboxSimulation({ seed: 7 });
const initialState = snapshot(initial);
assert.equal(initialState.tick, 0);
assert.equal(initialState.player.x, 0);
assert.equal(initialState.player.z, 0);
assert.equal(initialState.player.heading, 0);
assert.equal(initialState.player.desiredMoveAngle, null);
assert.deepEqual(initialState.player.velocity, { x: 0, z: 0 });
assert.equal(initialState.player.isMoving, false);
assert.equal(initialState.player.activeIntent, null);
ok('simulation starts at a deterministic stopped origin');

console.log('\n── SandboxSimulation: zombie entities ──');
const horde = new SandboxSimulation({ seed: 21 });
const spawned = horde.spawnZombie({ x: 2, z: 0, speed: 2, health: 30 });
assert.equal(spawned.id, 'zombie_1');
assert.equal(spawned.maxHealth, 30);
assert.equal('mesh' in spawned, false);
assert.equal('scene' in spawned, false);
assert.deepEqual(horde.getZombies(), [spawned]);
const detachedZombie = horde.getZombie(spawned.id);
assert.ok(Object.isFrozen(detachedZombie));
const mutableCopy = horde.getState().zombies[0];
mutableCopy.x = 999;
assert.equal(horde.getZombie(spawned.id).x, spawned.x);
ok('zombies are data-only entities with detached read snapshots');

step(horde, 31);
const contactState = snapshot(horde);
assert.ok(contactState.zombies[0].x <= 1.01, `zombie should approach player: ${contactState.zombies[0].x}`);
assert.equal(contactState.player.health, R.SANDBOX_MAX_PLAYER_HEALTH - R.SANDBOX_ZOMBIE_CONTACT_DAMAGE);
ok('zombie approaches the player and applies contact damage in simulation time');

const cooldownRemaining = contactState.zombies[0].contactCooldownUntil - contactState.tick;
step(horde, Math.max(0, cooldownRemaining - 1));
assert.equal(snapshot(horde).player.health, 90);
step(horde, 1);
assert.equal(snapshot(horde).player.health, 80);
ok('each zombie contact uses a fixed-tick cooldown instead of render frames');

const killable = horde.spawnZombie({ x: 8, z: 0, speed: 0, health: 15 });
const damageResult = horde.damageZombie(killable.id, 20);
assert.deepEqual(damageResult, { ok: true, killed: true, zombie: { ...killable, health: 0 } });
assert.equal(horde.getZombie(killable.id), null);
ok('dead zombies are removed from the authoritative collection');

console.log('\n── SandboxSimulation: fixed-step movement ──');
const moving = new SandboxSimulation({ seed: 11 });
const queued = moving.submitIntent(move(0));
assert.equal(queued.ok, true);
assert.equal(queued.status, 'queued');
step(moving, 1);
const afterNorth = snapshot(moving);
assert.equal(afterNorth.tick, 1);
close(afterNorth.player.x, 0, 'north movement x');
close(afterNorth.player.z, -R.SANDBOX_MOVE_SPEED * R.SANDBOX_TICK_DT, 'north movement z');
close(afterNorth.player.velocity.x, 0, 'north velocity x');
close(afterNorth.player.velocity.z, -R.SANDBOX_MOVE_SPEED, 'north velocity z');
assert.equal(afterNorth.player.isMoving, true);
assert.equal(afterNorth.player.activeIntent.type, SandboxIntentType.MOVE);
ok('move intent is consumed on a fixed simulation tick');

const turn = new SandboxSimulation({ seed: 12 });
turn.submitIntent(move(Math.PI));
step(turn, 1);
const firstTurn = snapshot(turn);
assert.ok(firstTurn.player.heading > 0 && firstTurn.player.heading < Math.PI);
step(turn, 30);
close(snapshot(turn).player.heading, Math.PI, 'heading converges to move angle', 1e-8);
ok('heading turns toward the movement angle at a bounded rate');

console.log('\n── SandboxSimulation: future and expired intents ──');
const scheduled = new SandboxSimulation();
scheduled.submitIntent(move(0, 3, 10));
step(scheduled, 2);
assert.equal(snapshot(scheduled).player.isMoving, false);
step(scheduled, 1);
assert.equal(snapshot(scheduled).player.isMoving, true);
ok('future intent waits for its simulation tick');

const expiring = new SandboxSimulation();
expiring.submitIntent(move(0, 0, 2));
step(expiring, 2);
assert.equal(snapshot(expiring).player.isMoving, true);
step(expiring, 1);
const expiredState = snapshot(expiring);
assert.equal(expiredState.player.isMoving, false);
assert.deepEqual(expiredState.player.velocity, { x: 0, z: 0 });
ok('expired movement intent stops without requiring wall-clock time');

console.log('\n── SandboxSimulation: stop behavior ──');
const stoppable = new SandboxSimulation();
stoppable.submitIntent(move(Math.PI / 2));
step(stoppable, 5);
const beforeStop = snapshot(stoppable);
const stopResult = stoppable.submitIntent(stop(beforeStop.tick));
assert.equal(stopResult.ok, true);
step(stoppable, 1);
const afterStop = snapshot(stoppable);
close(afterStop.player.x, beforeStop.player.x, 'stop preserves x position');
close(afterStop.player.z, beforeStop.player.z, 'stop preserves z position');
assert.deepEqual(afterStop.player.velocity, { x: 0, z: 0 });
assert.equal(afterStop.player.isMoving, false);
assert.equal(afterStop.player.desiredMoveAngle, null);
assert.equal(afterStop.player.activeIntent.type, SandboxIntentType.STOP);
ok('stop clears velocity without teleporting the player');

const resettable = new SandboxSimulation({ startX: .5, startZ: -.25, startHeading: Math.PI / 2 });
resettable.submitIntent(move(0));
step(resettable, 4);
resettable.reset();
const resetState = snapshot(resettable);
assert.equal(resetState.tick, 0);
close(resetState.player.x, .5, 'reset x');
close(resetState.player.z, -.25, 'reset z');
close(resetState.player.heading, Math.PI / 2, 'reset heading');
assert.equal(resetState.player.isMoving, false);
ok('reset restores the configured starting pose and clears transient movement');

console.log('\n── SandboxSimulation: arena bounds ──');
const bounded = new SandboxSimulation({ arenaRadius: 1 });
bounded.submitIntent(move(0));
step(bounded, 120);
const boundedState = snapshot(bounded);
assert.ok(Math.hypot(boundedState.player.x, boundedState.player.z) <= 1 + 1e-9);
close(boundedState.player.z, -1, 'player clamps to the arena boundary');
ok('movement cannot leave the circular Sandbox arena');

console.log('\n── SandboxSimulation: deterministic replay ──');
function runFixture(seed) {
  const sim = new SandboxSimulation({ seed });
  sim.submitIntent(move(Math.PI / 4, 0, 180));
  const deltas = [R.SANDBOX_TICK_DT, R.SANDBOX_TICK_DT * 2, R.SANDBOX_TICK_DT / 2, R.SANDBOX_TICK_DT * 3];
  for (const delta of deltas) sim.update(delta);
  sim.submitIntent(stop(sim.getState().tick));
  sim.update(R.SANDBOX_TICK_DT);
  return sim.getState();
}
assert.deepEqual(runFixture(42), runFixture(42));
assert.deepEqual(runFixture(42), runFixture(999));
ok('same input and delta sequence produces the same state independent of seed');

console.log('\n── SandboxSimulation: supported and unsupported intent boundary ──');
const unsupported = new SandboxSimulation();
const fire = createSandboxIntent({
  type: SandboxIntentType.FIRE,
  source: SandboxIntentSource.LOCAL,
  priority: 1,
  createdAt: 0,
  expiresAt: 10,
  angle: 0,
});
assert.equal(unsupported.submitIntent(fire).ok, true);
assert.equal(snapshot(unsupported).player.isMoving, false);
const aim = createSandboxIntent({
  type: SandboxIntentType.AIM,
  source: SandboxIntentSource.LOCAL,
  priority: 1,
  createdAt: 0,
  expiresAt: 10,
  angle: 0,
});
assert.deepEqual(unsupported.submitIntent(aim), { ok: false, error: 'unsupported_intent_type' });
ok('fire is accepted while future aim behavior remains explicitly unsupported');

console.log(`\nPASS: ${pass} assertions. Sandbox fixed-step movement validated.\n`);
