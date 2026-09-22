// Bounded Sandbox plan and multi-step runtime validation.
import assert from 'node:assert/strict';
import { parseSandboxPlanCommand } from '../src/sandbox/SandboxCommandParser.js';
import { SandboxSimulation } from '../src/sandbox/SandboxSimulation.js';

let pass = 0;
const ok = label => { pass++; console.log(`  ✓ ${label}`); };

console.log('\n── SandboxPlan: bounded missions ──');
const parsed = parseSandboxPlanCommand('move east, then fire north', { tick: 0 });
assert.equal(parsed.kind, 'sandbox_plan');
assert.equal(parsed.plan.steps.length, 2);
assert.ok(parsed.plan.totalTicks <= 1800);
ok('compound command is converted into a bounded serializable plan');

const sim = new SandboxSimulation({ startHeading: 0 });
sim.spawnZombie({ x: 0, z: -6, speed: 0, health: 30 });
assert.equal(sim.submitPlan(parsed.plan).ok, true);
sim.step(90);
assert.equal(sim.getState().player.activeIntent?.type, 'move', 'move occupies its full duration');
sim.step(1);
assert.equal(sim.getState().player.isMoving, false, 'move step ends before fire step');
assert.equal(sim.getState().beam.activeIntent?.type, 'fire');
sim.step(24);
assert.ok(sim.getEvents().some(event => event.type === 'beam_fired'), 'fire step emits an authoritative beam event');
ok('simulation executes plan steps in order without rendering or network access');

const override = new SandboxSimulation();
assert.equal(override.submitPlan(parsed.plan).ok, true);
assert.equal(override.submitIntent({ type: 'stop', source: 'local', priority: 1, createdAt: 0, expiresAt: 18 }).ok, true);
override.step(1);
assert.equal(override.getState().player.isMoving, false);
ok('urgent direct command interrupts a queued mission');

console.log(`PASS: ${pass} assertions. Sandbox plans validated.\n`);
