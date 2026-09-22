// ─── Sandbox beam weapon validation ─────────────────────────────────
// Tests vector-projection targeting and fixed-step beam damage.
// Run: node scripts/validate-sandbox-weapons.mjs

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
function step(sim, ticks = 1) { sim.step(ticks); }
function fire(angle, expiresAt = 1) {
  return createSandboxIntent({
    type: SandboxIntentType.FIRE,
    source: SandboxIntentSource.LOCAL,
    priority: 1,
    createdAt: 0,
    expiresAt,
    angle,
  });
}
function eventTypes(sim) { return sim.getEvents().map(event => event.type); }

console.log('\n── SandboxRules: beam tuning ──');
assert.ok(R.SANDBOX_BEAM_RANGE > 0);
assert.ok(R.SANDBOX_BEAM_HALF_WIDTH > 0);
assert.ok(R.SANDBOX_BEAM_DAMAGE > 0);
assert.ok(R.SANDBOX_BEAM_COOLDOWN_TICKS > 0);
assert.ok(R.SANDBOX_BEAM_ENERGY_COST > 0);
assert.ok(R.SANDBOX_BEAM_SCORE > 0);
assert.ok(Object.isFrozen(R.SANDBOX_RULES));
ok('beam tuning is centralized and bounded');

console.log('\n── Beam target projection ──');
const targetSim = new SandboxSimulation();
const near = targetSim.spawnZombie({ x: 0.2, z: -4, speed: 0 });
const far = targetSim.spawnZombie({ x: 0, z: -7, speed: 0 });
const outside = targetSim.spawnZombie({ x: R.SANDBOX_BEAM_HALF_WIDTH + 0.01, z: -4, speed: 0 });
const behind = targetSim.spawnZombie({ x: 0, z: 4, speed: 0 });
assert.equal(targetSim.findNearestBeamTarget(0).id, near.id);
assert.equal(targetSim.findNearestBeamTarget(Math.PI).id, behind.id);
assert.equal(targetSim.findNearestBeamTarget(Math.PI / 2), null);
ok('nearest target uses forward projection and excludes sideways/out-of-direction entities');

const boundarySim = new SandboxSimulation();
const boundary = boundarySim.spawnZombie({ x: R.SANDBOX_BEAM_HALF_WIDTH, z: -5, speed: 0 });
assert.equal(boundarySim.findNearestBeamTarget(0).id, boundary.id);
ok('beam half-width boundary is inclusive');

console.log('\n── Beam hit, event and score lifecycle ──');
const hitSim = new SandboxSimulation();
const hit = hitSim.spawnZombie({ x: 0, z: -5, speed: 0, health: R.SANDBOX_BEAM_DAMAGE });
const miss = hitSim.spawnZombie({ x: R.SANDBOX_BEAM_HALF_WIDTH + 1, z: -5, speed: 0 });
const beforeEnergy = hitSim.getState().player.energy;
assert.deepEqual(hitSim.submitIntent(fire(0)), { ok: true, status: 'queued', intent: fire(0) });
step(hitSim);
const hitState = hitSim.getState();
assert.equal(hitState.zombies.some(zombie => zombie.id === hit.id), false);
assert.equal(hitState.zombies.some(zombie => zombie.id === miss.id), true);
assert.equal(hitState.player.energy, beforeEnergy - R.SANDBOX_BEAM_ENERGY_COST);
assert.equal(hitState.score, R.SANDBOX_BEAM_SCORE);
assert.deepEqual(eventTypes(hitSim), [
  'beam_fired',
  'zombie_damaged',
  'zombie_destroyed',
  'score_awarded',
]);
ok('beam damages only the nearest valid target and emits ordered domain events');

console.log('\n── Beam cooldown and energy ──');
const cooldownSim = new SandboxSimulation();
const durable = cooldownSim.spawnZombie({ x: 0, z: -5, speed: 0, health: 100 });
cooldownSim.submitIntent(fire(0, R.SANDBOX_BEAM_COOLDOWN_TICKS + 2));
step(cooldownSim, 1);
const afterFirst = cooldownSim.getZombie(durable.id);
step(cooldownSim, R.SANDBOX_BEAM_COOLDOWN_TICKS - 1);
assert.equal(cooldownSim.getZombie(durable.id).health, afterFirst.health);
step(cooldownSim, 1);
assert.equal(cooldownSim.getZombie(durable.id).health, afterFirst.health - R.SANDBOX_BEAM_DAMAGE);
ok('one fire intent cannot bypass the fixed beam cooldown');

const empty = new SandboxSimulation();
empty.spawnZombie({ x: 0, z: -5, speed: 0 });
empty.player.energy = R.SANDBOX_BEAM_ENERGY_COST - 1;
empty.submitIntent(fire(0));
step(empty);
assert.equal(empty.getEvents().length, 0);
assert.equal(empty.getState().player.energy, R.SANDBOX_BEAM_ENERGY_COST - 1);
ok('insufficient energy rejects a beam pulse without mutating targets');

console.log('\n── Beam determinism ──');
function runBeamFixture() {
  const sim = new SandboxSimulation({ seed: 123 });
  sim.spawnZombie({ x: 0, z: -5, speed: 0, health: 45 });
  sim.spawnZombie({ x: 0.2, z: -8, speed: 0, health: 45 });
  sim.submitIntent(fire(0, 20));
  step(sim, 20);
  return sim.getState();
}
assert.deepEqual(runBeamFixture(), runBeamFixture());
ok('beam damage and event ordering are deterministic');

console.log(`\nPASS: ${pass} assertions. Sandbox beam weapon validated.\n`);
