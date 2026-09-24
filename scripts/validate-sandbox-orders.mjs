// ─── Sandbox Attack-Move mission validation ─────────────────────────
// Persistent destination, combat interrupt, resume, stop/supersede.

import assert from 'node:assert/strict';
import { SandboxBrain } from '../src/sandbox/SandboxBrain.js';
import { parseSandboxCommand } from '../src/sandbox/SandboxCommandParser.js';
import {
  createSandboxIntent,
  SandboxIntentSource,
  SandboxIntentType,
} from '../src/sandbox/SandboxIntent.js';
import { SandboxSimulation } from '../src/sandbox/SandboxSimulation.js';
import * as R from '../src/sandbox/SandboxRules.js';

let pass = 0;
function ok(label) { pass++; console.log(`  ✓ ${label}`); }
function attackMove(angle, expiresAt = 12) {
  return createSandboxIntent({
    type: SandboxIntentType.ATTACK_MOVE,
    source: SandboxIntentSource.LOCAL,
    priority: 1,
    createdAt: 0,
    expiresAt,
    angle,
  });
}
function stepWithBrain(sim, brain, ticks) {
  for (let i = 0; i < ticks; i++) {
    sim.update(R.SANDBOX_TICK_DT, (simulation, tick) => {
      const decision = brain.decide(simulation, tick);
      if (decision.intent) simulation.submitIntent(decision.intent);
    });
  }
}

console.log('\n── Attack-Move: parser and intent ──');
const parsed = parseSandboxCommand('tấn công hướng 6 giờ', { tick: 4 });
assert.equal(parsed.kind, 'sandbox_intent');
assert.equal(parsed.intent.type, SandboxIntentType.ATTACK_MOVE);
assert.equal(parsed.intent.angle, Math.PI);
assert.equal('targetId' in parsed.intent, false);
ok('Vietnamese attack-move becomes a directional mission intent');

const parsedEn = parseSandboxCommand('attack-move south', { tick: 0 });
assert.equal(parsedEn.intent.type, SandboxIntentType.ATTACK_MOVE);
assert.equal(parsedEn.intent.angle, Math.PI);
ok('English attack-move uses the same domain type');

console.log('\n── Attack-Move: interrupt and resume ──');
const sim = new SandboxSimulation({ sensorRadius: 6 });
const near = sim.spawnZombie({ x: 0, z: 8, speed: 0, health: 30 });
const far = sim.spawnZombie({ x: 0, z: 18, speed: 0, health: 30 });
assert.equal(sim.submitIntent(attackMove(Math.PI)).ok, true);
const brain = new SandboxBrain({ sensorRadius: 6, decisionIntervalTicks: 1 });
const zBeforeCombat = [];
stepWithBrain(sim, brain, 120);
assert.equal(sim.getZombie(near.id), null, 'nearest threat on the path is destroyed');
assert.ok(sim.getZombie(far.id), 'farther zombie remains until the robot resumes');
assert.equal(sim.getState().mission?.type, 'attack_move');
zBeforeCombat.push(sim.getState().player.z);
stepWithBrain(sim, brain, 220);
assert.equal(sim.getZombie(far.id), null, 'second zombie is handled after resume');
assert.ok(sim.getState().player.z > zBeforeCombat[0], 'mission continues south after combat');
assert.ok(sim.getEvents().some(event => event.type === 'beam_fired' && event.source === 'ai'));
ok('two zombies on the path are handled without dropping the destination');

console.log('\n── Attack-Move: stop and supersede ──');
const stopped = new SandboxSimulation();
stopped.submitIntent(attackMove(Math.PI));
stopped.step(8);
assert.equal(stopped.getState().mission.type, 'attack_move');
const zMoving = stopped.getState().player.z;
stopped.submitIntent(createSandboxIntent({
  type: SandboxIntentType.STOP,
  source: SandboxIntentSource.LOCAL,
  priority: 1,
  createdAt: stopped.currentTick,
  expiresAt: stopped.currentTick + 18,
}));
stopped.step(4);
assert.equal(stopped.getState().mission, null);
assert.ok(Math.abs(stopped.getState().player.z - zMoving) < 0.2);
assert.ok(stopped.getEvents().some(event => event.type === 'mission_cancelled' && event.reason === 'stop'));
ok('stop cancels the mission without teleporting');

const replaced = new SandboxSimulation();
replaced.submitIntent(attackMove(Math.PI));
replaced.step(4);
replaced.submitIntent(createSandboxIntent({
  type: SandboxIntentType.MOVE,
  source: SandboxIntentSource.LOCAL,
  priority: 1,
  createdAt: replaced.currentTick,
  expiresAt: replaced.currentTick + 60,
  angle: 0,
}));
replaced.step(1);
assert.equal(replaced.getState().mission, null);
assert.ok(replaced.getEvents().some(event => event.type === 'mission_cancelled' && event.reason === 'superseded'));
ok('a player move order supersedes attack-move');

console.log('\n── Attack-Move: arrival and determinism ──');
function run() {
  const fixture = new SandboxSimulation({ sensorRadius: 6 });
  fixture.spawnZombie({ x: 0, z: 8, speed: 0, health: 30 });
  fixture.spawnZombie({ x: 0, z: 18, speed: 0, health: 30 });
  fixture.submitIntent(attackMove(Math.PI));
  const fixtureBrain = new SandboxBrain({ sensorRadius: 6, decisionIntervalTicks: 1 });
  stepWithBrain(fixture, fixtureBrain, 360);
  return {
    z: Number(fixture.getState().player.z.toFixed(4)),
    mission: fixture.getState().mission,
    score: fixture.getScore(),
    zombies: fixture.getZombies().map(zombie => zombie.id),
    events: fixture.getEvents().map(event => event.type),
  };
}
assert.deepEqual(run(), run());
const arrived = run();
assert.equal(arrived.mission, null);
assert.equal(arrived.zombies.length, 0);
assert.ok(arrived.events.includes('mission_completed'));
ok('same attack-move fixture replays and completes at the destination');

function patrol(angle, expiresAt = 12) {
  return createSandboxIntent({
    type: SandboxIntentType.PATROL,
    source: SandboxIntentSource.LOCAL,
    priority: 1,
    createdAt: 0,
    expiresAt,
    angle,
  });
}

console.log('\n── Patrol: parser and route ──');
const parsedPatrol = parseSandboxCommand('tuần tra hướng 6 giờ', { tick: 2 });
assert.equal(parsedPatrol.intent.type, SandboxIntentType.PATROL);
assert.equal(parsedPatrol.intent.angle, Math.PI);
ok('Vietnamese patrol becomes a directional patrol intent');
assert.equal(parseSandboxCommand('patrol south').intent.type, SandboxIntentType.PATROL);
ok('English patrol uses the same domain type');

console.log('\n── Patrol: interrupt, resume and cursor ──');
const patrolSim = new SandboxSimulation({ sensorRadius: 6 });
const patrolZombie = patrolSim.spawnZombie({ x: 0, z: 8, speed: 0, health: 30 });
assert.equal(patrolSim.submitIntent(patrol(Math.PI)).ok, true);
const patrolBrain = new SandboxBrain({ sensorRadius: 6, decisionIntervalTicks: 1 });
stepWithBrain(patrolSim, patrolBrain, 120);
assert.equal(patrolSim.getZombie(patrolZombie.id), null);
const afterCombat = patrolSim.getState().mission;
assert.equal(afterCombat.type, 'patrol');
assert.equal(afterCombat.points.length, 2);
assert.equal(afterCombat.cursor, 0);
const zAfterCombat = patrolSim.getState().player.z;
stepWithBrain(patrolSim, patrolBrain, 220);
const afterFar = patrolSim.getState();
assert.equal(afterFar.mission.type, 'patrol', 'combat does not erase the patrol route');
assert.equal(afterFar.mission.cursor, 1);
assert.ok(afterFar.player.z < afterFar.mission.points[0].z);
ok('patrol flips cursor after the far waypoint and resumes the route');
assert.ok(zAfterCombat > 0);

console.log('\n── Patrol: supersede ──');
const patrolStop = new SandboxSimulation();
patrolStop.submitIntent(patrol(Math.PI));
patrolStop.step(6);
patrolStop.submitIntent(createSandboxIntent({
  type: SandboxIntentType.STOP,
  source: SandboxIntentSource.LOCAL,
  priority: 1,
  createdAt: patrolStop.currentTick,
  expiresAt: patrolStop.currentTick + 18,
}));
patrolStop.step(2);
assert.equal(patrolStop.getState().mission, null);
assert.ok(patrolStop.getEvents().some(event => event.type === 'mission_cancelled' && event.reason === 'stop'));
ok('stop supersedes patrol with a clear cancel reason');

function patrolRun() {
  const fixture = new SandboxSimulation({ sensorRadius: 6 });
  fixture.spawnZombie({ x: 0, z: 8, speed: 0, health: 30 });
  fixture.submitIntent(patrol(Math.PI));
  stepWithBrain(fixture, new SandboxBrain({ sensorRadius: 6, decisionIntervalTicks: 1 }), 340);
  const state = fixture.getState();
  return {
    cursor: state.mission?.cursor,
    type: state.mission?.type,
    z: Number(state.player.z.toFixed(4)),
    events: state.events.map(event => event.type),
  };
}
assert.deepEqual(patrolRun(), patrolRun());
ok('same patrol fixture replays with inspectable cursor state');

console.log(`\nPASS: ${pass} assertions. Sandbox attack-move and patrol validated.\n`);
