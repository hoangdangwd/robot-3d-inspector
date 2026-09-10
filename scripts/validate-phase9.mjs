// Phase 9 deterministic acceptance contracts. Browser and production Worker
// journeys live in test:acceptance and test:worker:production respectively.
import assert from 'node:assert/strict';
import { CombatSimulation } from '../src/combat/CombatSimulation.js';
import { createActionIntent } from '../src/combat/CombatTypes.js';
import { CombatBrain } from '../src/ai/CombatBrain.js';
import { getAction } from '../src/combat/ActionRegistry.js';
import { parseCoachText } from '../src/coaching/LocalCommandParser.js';
import { DirectCommandQueue } from '../src/coaching/DirectCommandQueue.js';
import { CombatBlackboard } from '../src/ai/CombatBlackboard.js';
import { TimeOutManager } from '../src/match/TimeOutManager.js';
import { MatchReplay } from '../src/match/MatchReplay.js';

let assertions = 0;
const ok = (condition, message) => { assert.ok(condition, message); assertions++; };
const step = (sim, ticks) => { for (let i = 0; i < ticks; i++) sim.update(1 / 60); };
const stepAutonomous = (sim, brains, ticks) => {
  for (let i = 0; i < ticks; i++) {
    sim.update(1 / 60, () => {
      for (const brain of brains) {
        const decision = brain.decide(sim);
        if (!decision) continue;
        sim.applyMovement(brain.fighterId, decision.movement);
        if (decision.intent) sim.submitIntentFor(brain.fighterId, decision.intent);
      }
    });
  }
};

console.log('\n── P9.1 acceptance contracts ──');

// Journey 1: no-input autonomous simulation produces real combat, then terminates.
{
  const sim = new CombatSimulation({ defIdA: 'forge_titan', defIdB: 'aegis_prime', seed: 901, roundDurationTicks: 1800 });
  const brains = [
    new CombatBrain({ fighterId: 'fighter_a', definitionId: 'forge_titan', seed: 1901 }),
    new CombatBrain({ fighterId: 'fighter_b', definitionId: 'aegis_prime', seed: 1902 }),
  ];
  stepAutonomous(sim, brains, 1800);
  const events = sim.log.toArray();
  ok(events.some(event => event.type === 'action_started'), 'autonomous brains start combat actions');
  ok(events.some(event => event.type === 'contact_resolved'), 'autonomous brains produce contact events');
  ok(sim.fighterA.health < sim.fighterA.maxHealth || sim.fighterB.health < sim.fighterB.maxHealth, 'autonomous contact changes authoritative health');
  ok(['ko', 'time', 'draw'].includes(sim.matchStatus), 'autonomous match reaches a terminal result');
  ok(sim.matchResult?.reason, 'terminal match has a result snapshot');
  sim.reset();
  for (const brain of brains) brain.reset();
  ok(sim.matchStatus === 'fighting' && sim.fighterA.health === sim.fighterA.maxHealth, 'retry reset restores match state');
  stepAutonomous(sim, brains, 360);
  ok(sim.log.toArray().some(event => event.type === 'action_started'), 'retry continues autonomous combat');
}

// Journey 2: a real knockdown cannot be overridden by a direct command.
{
  const sim = new CombatSimulation({ defIdA: 'forge_titan', defIdB: 'aegis_prime', seed: 902 });
  sim.fighterA.z = -.5; sim.fighterB.z = .5;
  sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;
  sim.fighterB.posture = 1;
  sim.submitIntentFor('fighter_a', createActionIntent({ actionId: 'jab', source: 'direct_command', priority: 0.9, createdAt: 0, expiresAt: 30, targetId: 'fighter_b' }));
  step(sim, getAction('jab').startup + getAction('jab').active + 1);
  ok(sim.fighterB.status === 'down', 'combat contact enters the complete DOWN lifecycle');
  sim.submitIntentFor('fighter_b', createActionIntent({ actionId: 'hook_right', source: 'direct_command', priority: 0.9, createdAt: sim.currentTick, expiresAt: sim.currentTick + 30, targetId: 'fighter_a' }));
  step(sim, 1);
  ok(sim.fighterB.actionId === 'none', 'down fighter does not execute direct command');
  ok(!sim.log.toArray().some(event => event.type === 'action_started' && event.fighterId === 'fighter_b'), 'impossible command does not start an action');
}

// Journey 3: resource exhaustion cannot bypass action legality.
{
  const sim = new CombatSimulation({ defIdA: 'forge_titan', defIdB: 'aegis_prime', seed: 903 });
  sim.fighterA.stamina = 0;
  sim.submitIntentFor('fighter_a', createActionIntent({ actionId: 'overhand', source: 'direct_command', priority: 0.9, createdAt: 0, expiresAt: 30, targetId: 'fighter_b' }));
  step(sim, 1);
  ok(sim.fighterA.actionId === 'none', 'exhausted fighter does not start an action');
  ok(sim.log.toArray().some(event => event.type === 'action_rejected' && event.data.reason === 'insufficient_stamina'), 'exhaustion emits a rejection reason');
}

// Journey 4: a temporary steer affects blackboard only, not a playbook definition.
{
  const board = new CombatBlackboard({ fighterId: 'fighter_a' });
  const before = board.definitionHash();
  const override = parseCoachText('stay outside', { fighterId: 'fighter_a', tick: 10 });
  ok(override.kind === 'blackboard_override', 'temporary spacing command parses as override');
  ok(board.apply({ ...override, createdAt: 10, expiresAt: 20 }).status === 'active', 'temporary override is accepted');
  ok(board.snapshot(11).preferredDistance === 'far', 'temporary override changes current behavior');
  ok(board.snapshot(21).preferredDistance === 'mid', 'temporary override expires to base');
  ok(board.definitionHash() === before, 'temporary override does not rewrite playbook definition');
}

// Journey 5: persistent tactical requests stay out of Live Fight.
{
  const result = parseCoachText('when he hooks counter body', { fighterId: 'fighter_a', tick: 0 });
  ok(result.kind === 'unrecognized' && result.reason === 'persistent_tactic_not_allowed_live', 'Live Fight rejects persistent tactic language');
}

// Journey 6: Time-out economy is exactly three uses and reset-scoped.
{
  const timeouts = new TimeOutManager({ max: 3 });
  ok(timeouts.open(0).ok, 'first Time-out opens'); timeouts.cancel();
  ok(timeouts.open(1).ok, 'second Time-out opens'); timeouts.commit();
  ok(timeouts.open(2).ok, 'third Time-out opens'); timeouts.cancel();
  ok(timeouts.open(3).ok === false && timeouts.open(3).error === 'no_timeouts_remaining', 'fourth Time-out is rejected');
  timeouts.reset();
  ok(timeouts.remaining === 3, 'match reset refills Time-outs');
}

// Journey 7: replay export/import is offline and deterministic.
{
  const sim = new CombatSimulation({ defIdA: 'forge_titan', defIdB: 'aegis_prime', seed: 903, roundDurationTicks: 240 });
  sim.fighterA.z = -.5; sim.fighterB.z = .5; sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;
  sim.captureInitialState();
  sim.submitIntentFor('fighter_a', createActionIntent({ actionId: 'jab', source: 'direct_command', priority: 0.9, createdAt: 0, expiresAt: 30, targetId: 'fighter_b' }));
  step(sim, 240);
  const log = MatchReplay.exportLog(sim, { defIdA: 'forge_titan', defIdB: 'aegis_prime' });
  const replayA = new MatchReplay(log); replayA.stepToEnd();
  const replayB = new MatchReplay(JSON.parse(JSON.stringify(log))); replayB.stepToEnd();
  ok(JSON.stringify(replayA.getState()) === JSON.stringify(replayB.getState()), 'same replay produces same final state');
  ok(replayA.result()?.reason === sim.matchResult?.reason, 'replay preserves terminal result reason');
}

console.log(`PASS: ${assertions} assertions. Phase 9 deterministic acceptance contracts validated.`);
