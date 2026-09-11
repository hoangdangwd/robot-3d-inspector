import assert from 'node:assert/strict';
import { CombatSimulation } from '../src/combat/CombatSimulation.js';
import { CombatBrain } from '../src/ai/CombatBrain.js';
import { createActionIntent } from '../src/combat/CombatTypes.js';
import { VoltPatternScenario, VOLT_REVIEW_CASES } from '../src/ai/VoltPatternScenario.js';
import { VOLT_ONE_TWO } from '../src/ai/RobotPatterns.js';

function fixture(response = 'none', mutate = () => {}) {
  const sim = new CombatSimulation({ defIdA: 'volt_kestrel', defIdB: 'aegis_prime' });
  const review = new VoltPatternScenario(sim, response);
  for (let i = 0; i < 120; i++) sim.update(1 / 60, () => { mutate(sim, review.brain); review.beforeTick(); });
  return { sim, review, events: sim.log.toArray() };
}
const baseline = fixture();
const starts = baseline.events.filter(e => e.type === 'action_started');
assert.deepEqual(starts.map(e => e.data.actionId), ['jab', 'cross']);
const endedJab = baseline.events.find(e => e.type === 'action_ended' && e.data.actionId === 'jab');
assert.ok(starts[1].tick > endedJab.tick);
assert.deepEqual(fixture().events, baseline.events, 'deterministic simulation events');
assert.deepEqual(fixture().review.history, baseline.review.history);
assert.equal(baseline.review.history.at(-1).type, 'pattern_finished');
assert.equal(new CombatBrain({ fighterId: 'fighter_a', definitionId: 'forge_titan' }).pattern, null);
assert.ok(new CombatBrain({ fighterId: 'fighter_a', definitionId: 'volt-kestrel' }).pattern);
assert.ok(Object.isFrozen(VOLT_ONE_TWO.tactic));
for (const response of VOLT_REVIEW_CASES) {
  const f = fixture(response);
  const cross = f.events.find(e => e.type === 'contact_resolved' && e.data.actionId === 'cross');
  if (response === 'out_of_range') {
    assert.equal(cross, undefined);
    assert.equal(f.review.history.at(-1).reason, 'followup_unavailable');
  } else assert.equal(cross.data.result, response === 'parry_left' ? 'parried' : 'hit', response);
  if (response === 'parry_left') assert.ok(f.sim.fighterB.health > baseline.sim.fighterB.health, 'correct read reduces real health loss');
  if (response === 'parry_right' || response === 'too_early') assert.equal(f.sim.fighterB.health, baseline.sim.fighterB.health, 'wrong read is not corrected');
}
for (const [name, mutate] of [
  ['stamina', s => { s.fighterA.stamina = 1; }],
  ['facing', s => { s.fighterA.facing = Math.PI; }],
  ['down', s => { s.fighterA.status = 'down'; s.fighterA.downUntil = 200; }],
  ['override', (s, b) => { b.blackboard.apply({ kind: 'blackboard_override', fighterId: 'fighter_a', commandId: 'test', expiresAt: 200, changes: { avoidActions: ['cross'] } }); }],
]) {
  const f = fixture('none', (s, b) => { if (s.currentTick === 21) mutate(s, b); });
  assert.equal(f.events.some(e => e.type === 'action_started' && e.data.actionId === 'cross'), false, name);
  assert.equal(f.review.history.at(-1).type, 'pattern_aborted', name);
}
// A competing executed action must abort, not resume a stale cross afterward.
const interrupted = fixture('none', s => {
  if (s.currentTick === 21) s.submitIntentFor('fighter_a', createActionIntent({ actionId: 'slip_left', source: 'direct_command',
    priority: 1, createdAt: 21, expiresAt: 40, targetId: 'fighter_b', reason: 'test command' }));
});
assert.equal(interrupted.review.history.at(-1).reason, 'other_action');
assert.equal(interrupted.events.some(e => e.type === 'action_started' && e.data.actionId === 'cross'), false);

// Native brain: probability, fallback, cooldown, reset and playbook precedence.
function autonomous(seed, setup = () => {}) {
  const sim = new CombatSimulation({ defIdA: 'volt_kestrel', defIdB: 'aegis_prime' });
  sim.fighterA.z = -.85; sim.fighterB.z = .85;
  const brain = new CombatBrain({ fighterId: 'fighter_a', definitionId: 'volt_kestrel', seed });
  setup(brain);
  const transitions = [];
  let previous;
  for (let i = 0; i < 600; i++) sim.update(1 / 60, () => {
    const d = brain.decide(sim);
    if (d?.intent) sim.submitIntentFor('fighter_a', d.intent);
    if (brain.pattern.lastEvent && brain.pattern.lastEvent !== previous) transitions.push(previous = brain.pattern.lastEvent);
  });
  return { sim, brain, transitions };
}
const natural = autonomous(1);
assert.ok(natural.transitions.some(e => e.type === 'pattern_started'));
for (let i = 1; i < natural.transitions.length; i++) {
  if (natural.transitions[i].type === 'pattern_started') assert.ok(natural.transitions[i].tick - natural.transitions[i - 1].tick >= VOLT_ONE_TWO.cooldownTicks);
}
const skipped = autonomous(3);
assert.notEqual(skipped.sim.log.toArray().find(e => e.type === 'action_started').data.reason.includes('pattern:'), true, 'probability is not a forced combo');
assert.ok(natural.sim.log.toArray().some(e => e.type === 'action_started' && !e.data.reason.includes('pattern:')), 'base AI remains autonomous');
const taught = autonomous(1, b => assert.ok(b.setPlaybook([{ ...VOLT_ONE_TWO.tactic, id: 'player_plan', phases: [{ id: 'test', sequence: [{ actionId: 'body_jab' }] }] }]).ok));
assert.equal(taught.sim.log.toArray().find(e => e.type === 'action_started').data.source, 'tactic');
natural.brain.reset();
assert.equal(natural.brain.pattern.active, false);
assert.equal(natural.brain.pattern.nextStart, 0);
assert.equal(natural.brain.pattern.lastEvent, null);
console.log('PASS: Volt jab→cross, seeded/fallback/cooldown/reset/precedence; five visual scenarios; wrong/early parry, range/stamina/facing/down/override/command aborts.');
