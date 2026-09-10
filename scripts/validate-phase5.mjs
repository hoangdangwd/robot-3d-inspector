// Phase 5 bounded tactics/playbook validation.
import assert from 'node:assert/strict';
import { validateTactic, validateTacticV2, migrateTacticToV2, migratePlaybookToV2, validatePlaybook, calculateTacticCost } from '../src/tactics/TacticSchema.js';
import { TacticRuntime } from '../src/tactics/TacticRuntime.js';
import { PlaybookStore } from '../src/tactics/PlaybookStore.js';
import { CombatSimulation } from '../src/combat/CombatSimulation.js';
import { CombatBrain } from '../src/ai/CombatBrain.js';
import * as R from '../src/combat/CombatRules.js';
import { resolveTacticalIntent } from '../src/tactics/TacticalIntentResolver.js';

let assertions = 0;
const ok = (condition, message) => { assert.ok(condition, message); assertions++; };
const tactic = {
  schemaVersion: 1, id: 'right-hook-punish', name: 'Right Hook Punish', goal: 'Slip and punish body.',
  trigger: { type: 'enemy_attack_start', actionId: 'hook_right' },
  phases: [{ id: 'counter', sequence: [{ actionId: 'slip_left' }, { actionId: 'body_cross' }], branches: [] }],
  abort: [{ type: 'near_edge' }], repeatLimit: 1, timeoutTicks: 180, priority: .8,
};

console.log('\n── Tactic schema and cost ──');
{
  const result = validateTactic(tactic);
  ok(result.ok, 'valid tactic accepted');
  ok(result.cost === calculateTacticCost(result.value), 'cost is deterministic');
  ok(result.value.schemaVersion === 1, 'schema version is preserved');
  ok(!validateTactic({ ...tactic, phases: [{ id: 'bad', sequence: [{ actionId: 'eval' }] }], abort: [], repeatLimit: 1, timeoutTicks: 30 }).ok, 'unknown action is rejected');
  ok(!validateTactic({ ...tactic, trigger: { type: 'custom_javascript', code: 'eval(1)' } }).ok, 'arbitrary condition/code is rejected');
  ok(!validateTactic({ ...tactic, phases: Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, sequence: [] })) }).ok, 'phase depth/count is bounded');
}

console.log('\n── Strategy schema v2 and migration ──');
{
  const strategyTactic = {
    schemaVersion: 2, id: 'strategic-counter', name: 'Strategic Counter', goal: 'Wait for the hook, then counter safely.', priority: .9,
    trigger: { type: 'enemy_attack_start', actionId: 'hook_right' },
    phases: [{ id: 'counter', sequence: [
      { intent: { type: 'wait_for', signal: 'enemy_action', actionId: 'hook_right' } },
      { intent: { type: 'counter', response: 'parry', targetZone: 'head' } },
      { intent: { type: 'move', direction: 'out' } },
    ], branches: [] }],
    abort: [], repeatLimit: 1, timeoutTicks: 180,
  };
  const result = validateTacticV2(strategyTactic);
  ok(result.ok && result.value.schemaVersion === 2, 'strategy-level tactic v2 is accepted');
  ok(!validateTacticV2({ ...strategyTactic, phases: [{ id: 'bad', sequence: [{ intent: { type: 'execute_code', code: 'eval(1)' } }] }] }).ok, 'arbitrary strategy intent is rejected');
  const migrated = migrateTacticToV2(tactic);
  ok(migrated.ok && migrated.value.schemaVersion === 2, 'v1 tactic has an explicit v2 migration path');
  ok(migrated.value.phases[0].sequence[0].intent.type === 'action', 'v1 migration preserves concrete action meaning');
  ok(migratePlaybookToV2([tactic]).value[0].schemaVersion === 2, 'legacy playbook migration preserves bounded validation');
  const resolved = resolveTacticalIntent({ type: 'counter', response: 'parry' }, { view: {}, profile: { defenseWeights: { parry_left: 1, parry_right: .5 } } });
  ok(resolved.actionId === 'parry_left', 'counter intent resolves through robot preferences');
}

console.log('\n── Tactic runtime ──');
{
  const validated = validateTactic(tactic).value;
  const runtime = new TacticRuntime(validated);
  const calm = { self: { health: 100, maxHealth: 100, stamina: 100, maxStamina: 100 }, target: { actionId: 'none' }, targetThreat: false, nearEdge: false, targetNearEdge: false, distance: 3 };
  ok(runtime.nextAction(calm, 0) === null, 'false trigger does not activate tactic');
  const threat = { ...calm, target: { actionId: 'hook_right' }, targetThreat: true };
  ok(runtime.nextAction(threat, 1)?.actionId === 'slip_left', 'trigger emits first legal intent request');
  ok(runtime.nextAction(threat, 2)?.actionId === 'body_cross', 'sequence emits next request');
  ok(runtime.nextAction(threat, 3) === null && !runtime.active, 'single-repeat tactic finishes');

  const aborting = new TacticRuntime(validated);
  ok(aborting.nextAction(threat, 1)?.actionId === 'slip_left', 'abort fixture starts');
  ok(aborting.nextAction({ ...threat, nearEdge: true }, 2) === null && !aborting.active, 'abort condition stops execution');
}

console.log('\n── Playbook capacity and atomic revision ──');
{
  const valid = validatePlaybook([tactic], { capacity: 10 });
  ok(valid.ok && valid.value.length === 1, 'playbook accepted within capacity');
  ok(!validatePlaybook([tactic], { capacity: 1 }).ok, 'capacity overflow rejected');
  const storage = new Map();
  const fakeStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const store = new PlaybookStore({ storage: fakeStorage, capacity: 10 });
  const first = store.commit([tactic], 0);
  ok(first.ok && first.revision === 1, 'first commit increments revision');
  ok(!store.commit([], 0).ok, 'stale revision cannot overwrite playbook');
  const loaded = new PlaybookStore({ storage: fakeStorage, capacity: 10 }).load();
  ok(loaded.revision === 1 && loaded.tactics[0].id === tactic.id, 'stored playbook reloads');
}

console.log('\n── Offline tactic-to-brain boundary ──');
{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  const brain = new CombatBrain({ fighterId: 'fighter_a', definitionId: 'test_neutral', seed: 5 });
  const installed = brain.setPlaybook([tactic], 3);
  ok(installed.ok && brain.playbookRevision === 3, 'brain installs validated playbook revision');
  const runtime = new TacticRuntime(validateTactic(tactic).value);
  sim.fighterA.z = -.5; sim.fighterB.z = .5;
  sim.submitIntentFor('fighter_b', { actionId: 'hook_right', source: 'ai', priority: .8, createdAt: 0, expiresAt: 20, targetId: 'fighter_a', reason: 'fixture' });
  sim.update(1 / R.TICK_RATE);
  const view = brain.perceive(sim);
  const request = runtime.nextAction(view, sim.clock.tick);
  ok(request?.actionId === 'slip_left', 'tactic produces request from simulation perception');
  const brainDecision = brain.decide(sim);
  ok(brainDecision.intent?.source === 'tactic' && brainDecision.intent.actionId === 'slip_left', 'CombatBrain emits tactic intent through normal boundary');
  ok(sim.fighterA.health === 100, 'tactic cannot directly mutate health');

  const higher = { ...tactic, id: 'high-priority-hook', name: 'High Priority Hook', priority: .95, phases: [{ id: 'counter', sequence: [{ actionId: 'parry_right' }], branches: [] }] };
  const priorityBrain = new CombatBrain({ fighterId: 'fighter_a', definitionId: 'test_neutral', seed: 6 });
  ok(priorityBrain.setPlaybook([tactic, higher], 1).ok, 'multiple tactics install');
  const priorityDecision = priorityBrain.decide(sim);
  ok(priorityDecision.intent?.actionId === 'parry_right' && priorityDecision.intent.source === 'tactic', 'higher-priority simultaneous tactic wins deterministically');

  const strategy = {
    schemaVersion: 2, id: 'strategy-counter', name: 'Strategy Counter', goal: 'Resolve a hook with a parry.', priority: .9,
    trigger: { type: 'enemy_attack_start', actionId: 'hook_right' },
    phases: [{ id: 'response', sequence: [{ intent: { type: 'counter', response: 'parry', targetZone: 'head' } }], branches: [] }],
    abort: [], repeatLimit: 1, timeoutTicks: 120,
  };
  const strategyBrain = new CombatBrain({ fighterId: 'fighter_a', definitionId: 'aegis_prime', seed: 8 });
  ok(strategyBrain.setPlaybook([strategy], 2).ok, 'brain installs schema v2 strategy playbook');
  const strategySim = new CombatSimulation({ defIdA: 'aegis_prime', defIdB: 'forge_titan' });
  strategySim.fighterA.z = -.5; strategySim.fighterB.z = .5;
  strategySim.submitIntentFor('fighter_b', { actionId: 'hook_right', source: 'ai', priority: .8, createdAt: 0, expiresAt: 30, targetId: 'fighter_a', reason: 'strategy_fixture' });
  strategySim.update(1 / R.TICK_RATE);
  const strategyDecision = strategyBrain.decide(strategySim);
  ok(strategyDecision.intent?.actionId === 'parry_left' && strategyDecision.intent.source === 'tactic', 'v2 counter resolves through normal action legality boundary');
  ok(strategySim.fighterA.health === 100 && strategySim.fighterB.health === 100, 'strategy resolver does not directly mutate simulation state');

  const waitTactic = { schemaVersion: 2, id: 'wait-then-move', name: 'Wait Then Move', goal: 'Wait for the opponent to commit.', priority: .7,
    trigger: { type: 'always' }, phases: [{ id: 'observe', sequence: [
      { intent: { type: 'wait_for', signal: 'distance_band', band: 'close' } },
      { intent: { type: 'move', direction: 'out' } },
    ], branches: [] }], abort: [], repeatLimit: 1, timeoutTicks: 120 };
  const waitRuntime = new TacticRuntime(validateTacticV2(waitTactic).value);
  const farView = { self: { health: 100, maxHealth: 100, stamina: 100, maxStamina: 100 }, target: { actionId: 'none' }, targetThreat: false, nearEdge: false, targetNearEdge: false, distance: 3 };
  ok(waitRuntime.nextAction(farView, 1)?.waiting === true, 'v2 wait_for holds the tactic without skipping its step');
  ok(waitRuntime.nextAction({ ...farView, distance: 1.2 }, 2)?.intent.type === 'move', 'v2 wait_for resumes when its signal becomes true');
}

console.log(`\nPASS: ${assertions} assertions. Phase 5 bounded tactics validated.\n`);
