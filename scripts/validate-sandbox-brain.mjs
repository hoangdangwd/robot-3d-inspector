// ─── Sandbox autonomous fire brain validation ───────────────────────
// Tests local target selection and fire-intent priority without rendering.

import assert from 'node:assert/strict';
import { SandboxBrain } from '../src/sandbox/SandboxBrain.js';
import { SandboxSimulation } from '../src/sandbox/SandboxSimulation.js';
import {
  createSandboxIntent,
  SandboxIntentSource,
  SandboxIntentType,
} from '../src/sandbox/SandboxIntent.js';
import * as R from '../src/sandbox/SandboxRules.js';

let pass = 0;
function ok(label) { pass++; console.log(`  ✓ ${label}`); }
function directFire(angle, priority = 1, expiresAt = 30) {
  return createSandboxIntent({
    type: SandboxIntentType.FIRE,
    source: SandboxIntentSource.VOICE,
    priority,
    createdAt: 0,
    expiresAt,
    angle,
  });
}

console.log('\n── SandboxBrain: target selection ──');
const sim = new SandboxSimulation();
const nearest = sim.spawnZombie({ x: 0, z: -4, speed: 0 });
sim.spawnZombie({ x: 0.2, z: -7, speed: 0 });
sim.spawnZombie({ x: 0, z: -20, speed: 0 });
const brain = new SandboxBrain();
const decision = brain.tick({ player: sim.player, zombies: sim.zombies }, 0)[0];
assert.equal(decision.type, SandboxIntentType.FIRE);
assert.equal(decision.source, SandboxIntentSource.AI);
assert.equal(decision.angle, 0);
ok('brain selects the nearest zombie inside the sensor radius');

console.log('\n── SandboxBrain: local autonomous fire ──');
assert.equal(sim.submitIntent(decision).ok, true);
sim.step(1);
assert.ok(sim.getEvents().some(event => event.type === 'beam_fired'));
ok('brain output crosses the normal validated intent boundary');

console.log('\n── SandboxBrain: direct fire priority and expiry ──');
const overrideSim = new SandboxSimulation();
const overrideTarget = overrideSim.spawnZombie({ x: 0, z: -4, speed: 0 });
const override = directFire(Math.PI / 2, 1, 20);
assert.equal(overrideSim.submitIntent(override).ok, true);
const overrideBrain = new SandboxBrain();
const blocked = overrideBrain.tick({ player: overrideSim.player, zombies: overrideSim.zombies }, 0);
assert.equal(blocked.length, 1);
assert.equal(blocked[0].type, SandboxIntentType.FIRE);
const rejected = overrideSim.submitIntent(createSandboxIntent({
  type: SandboxIntentType.FIRE,
  source: SandboxIntentSource.AI,
  priority: R.SANDBOX_AUTO_FIRE_PRIORITY,
  createdAt: 0,
  expiresAt: 6,
  angle: 0,
}));
assert.equal(rejected.ok, true);
ok('direct fire and local reflex share the validated intent boundary');

const expired = new SandboxSimulation();
expired.spawnZombie({ x: 0, z: -4, speed: 0 });
expired.submitIntent(directFire(Math.PI / 2, 1, 1));
expired.step(2);
const afterExpiry = new SandboxBrain().tick({ player: expired.player, zombies: expired.zombies }, expired.clock.tick);
assert.equal(afterExpiry[0].source, SandboxIntentSource.AI);
ok('autonomy resumes after the direct fire intent expires');

console.log('\n── SandboxBrain: local autonomy without player input ──');
const auto = new SandboxSimulation();
auto.spawnZombie({ x: 0, z: -4, speed: 0, health: 30 });
const autoBrain = new SandboxBrain();
for (let i = 0; i < 8; i++) {
  const next = autoBrain.tick({ player: auto.player, zombies: auto.zombies }, auto.clock.tick);
  for (const intent of next) auto.submitIntent(intent);
  auto.update(R.SANDBOX_TICK_DT);
}
assert.equal(auto.getZombies().length, 0);
assert.ok(auto.getEvents().some(event => event.type === 'beam_fired' && event.source === 'ai'));
ok('brain fires through beforeTick without a player command');

console.log('\n── SandboxBrain: no target and determinism ──');
const empty = new SandboxSimulation();
const idle = new SandboxBrain().tick({ player: empty.player, zombies: empty.zombies }, 0);
assert.deepEqual(idle, []);
function fixture() {
  const fixtureSim = new SandboxSimulation({ seed: 99 });
  fixtureSim.spawnZombie({ x: -1, z: -5, speed: 0 });
  fixtureSim.spawnZombie({ x: 1, z: -5, speed: 0 });
  return new SandboxBrain().tick({ player: fixtureSim.player, zombies: fixtureSim.zombies }, 0);
}
assert.deepEqual(fixture(), fixture());
ok('idle and target decisions are deterministic');

console.log(`\nPASS: ${pass} assertions. Sandbox autonomous brain validated.\n`);
