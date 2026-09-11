import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createActionIntent } from '../src/combat/CombatTypes.js';
import { CombatSimulation } from '../src/combat/CombatSimulation.js';
import { getAction, getAttackIds, getDefenseIds } from '../src/combat/ActionRegistry.js';

// Independent expected design table: B=block, P=parry, E=evade, H=hit, N=no contact.
const defenses = ['guard_high', 'guard_low', 'parry_left', 'parry_right', 'slip_left', 'slip_right', 'duck', 'roll'];
const rows = {
  jab:             'BHHPEEEH',
  cross:           'BHPHEEEH',
  hook_left:       'BHHHHHEE',
  hook_right:      'BHHHHHEE',
  uppercut_left:   'BHHHEEHH',
  uppercut_right:  'BHHHEEHH',
  body_jab:        'HBHHHHHH',
  body_cross:      'HBHHHHHH',
  overhand:        'BHHHEHHH',
  feint_jab:       'NNNNNNNN',
};
const results = { B: 'blocked', P: 'parried', E: 'missed', H: 'hit' };
function contact(attack, defense, options = {}) {
  const sim = new CombatSimulation({ defIdA: options.profile || 'test_neutral', defIdB: options.profile || 'test_neutral' });
  const a = sim.fighterA, b = sim.fighterB;
  Object.assign(a, { z: -.3, facing: options.attackerFacing ?? 0, status: 'acting', actionId: attack, actionPhase: options.attackPhase || 'active', actionTick: 1 });
  Object.assign(b, { z: options.distance ?? .3, facing: options.facing ?? Math.PI, status: options.status || 'acting', actionId: defense, actionPhase: options.phase || 'active' });
  // Isolate contact arbitration; existing phase suites exercise legal action startup and tick progression.
  sim._resolveContacts(10);
  const events = sim.log.toArray().filter(e => e.type === 'contact_resolved');
  sim._resolveContacts(11);
  assert.equal(sim.log.toArray().filter(e => e.type === 'contact_resolved').length, events.length, 'one contact per action');
  return { sim, event: events[0]?.data };
}
// Regression: body jab must not be avoided by duck's generic isDodge flag.
assert.equal(contact('body_jab', 'duck').event.result, 'hit');
const { ATTACK_DEFENSE_MATRIX, ATTACK_PROFILES, resolveDefenseOutcome } = await import('../src/combat/AttackDefenseMatrix.js');
assert.deepEqual(Object.keys(rows).sort(), getAttackIds().sort());
assert.deepEqual([...defenses].sort(), getDefenseIds().sort());
let cells = 0;
for (const [attack, expected] of Object.entries(rows)) {
  assert.equal(expected.length, defenses.length);
  assert.equal(getAction(attack).contactProfile, ATTACK_PROFILES[attack]);
  assert.ok(Object.isFrozen(ATTACK_DEFENSE_MATRIX[attack]));
  for (const [i, defense] of defenses.entries()) {
    for (const profile of ['test_neutral', 'forge_titan', 'aegis_prime', 'vanta_razor', 'volt_kestrel', 'solstice_mantis']) {
      const { sim, event } = contact(attack, defense, { profile });
      const code = expected[i];
      if (code === 'N') { assert.equal(event, undefined); assert.equal(sim.fighterB.health, 100); continue; }
      assert.equal(event.result, results[code], `${profile}: ${attack} vs ${defense}`);
      assert.equal(event.defenseId, defense);
      assert.equal(event.defenseOutcome, ATTACK_DEFENSE_MATRIX[attack][defense]);
      assert.equal(sim.fighterB.health < 100, ['H', 'B'].includes(code));
      assert.equal(sim.fighterB.posture < 100, code === 'H');
      assert.equal(sim._stunTicksRemaining.get('fighter_a') > 0, code === 'P');
    }
    cells++;
  }
}
for (const [attack, defense] of [['jab', 'parry_right'], ['hook_left', 'duck'], ['body_jab', 'guard_low']]) {
  for (const phase of ['startup', 'recovery', 'none']) assert.equal(contact(attack, defense, { phase }).event.result, 'hit');
  for (const status of ['down', 'getting_up', 'staggered', 'ko']) assert.equal(contact(attack, defense, { status }).event.result, 'hit');
  assert.equal(contact(attack, defense, { facing: 0 }).event.result, 'hit', 'defense cannot cover rear');
  assert.equal(contact(attack, defense, { distance: 5 }).event.reason, 'out_of_range');
  assert.equal(contact(attack, defense, { attackerFacing: Math.PI }).event.reason, 'bad_facing');
  assert.equal(contact(attack, defense, { attackPhase: 'startup' }).event, undefined);
  assert.equal(contact(attack, defense, { attackPhase: 'recovery' }).event, undefined);
}
assert.equal(resolveDefenseOutcome('jab', 'unknown'), 'hit');
assert.equal(resolveDefenseOutcome('unknown', 'duck'), 'hit');
assert.equal(resolveDefenseOutcome('jab', 'constructor'), 'hit');
assert.equal(resolveDefenseOutcome('__proto__', 'duck'), 'hit');
assert.equal(resolveDefenseOutcome('jab', 'duck', false), 'hit');
// Real legal intents on exact phase boundaries, not just injected contact fixtures.
let boundaries = 0;
for (const [attack, codes] of Object.entries(rows)) {
  if (attack === 'feint_jab') continue;
  const attackDef = getAction(attack);
  for (const [i, defense] of defenses.entries()) {
    const defenseDef = getAction(defense);
    for (const boundary of ['startup', 'first_active', 'last_active', 'recovery']) {
      if (defenseDef.isHold && ['last_active', 'recovery'].includes(boundary)) continue;
      const contactTick = 40;
      let startDefense = contactTick - defenseDef.startup;
      if (boundary === 'startup') startDefense++;
      if (boundary === 'last_active') startDefense -= defenseDef.active - 1;
      if (boundary === 'recovery') startDefense -= defenseDef.active;
      const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
      sim.fighterA.z = -.3; sim.fighterB.z = .3;
      for (let tick = 1; tick <= contactTick; tick++) {
        for (const [id, actionId, start] of [['fighter_a', attack, contactTick - attackDef.startup], ['fighter_b', defense, startDefense]]) {
          if (tick === start) sim.submitIntentFor(id, createActionIntent({ actionId, source: 'ai', priority: .8, createdAt: tick - 1, expiresAt: 100, targetId: id === 'fighter_a' ? 'fighter_b' : 'fighter_a', reason: 'matrix_boundary' }));
        }
        sim.update(1 / 60);
      }
      const event = sim.log.toArray().find(e => e.type === 'contact_resolved');
      assert.equal(event?.tick, contactTick);
      assert.equal(event.data.result, ['startup', 'recovery'].includes(boundary) ? 'hit' : results[codes[i]], `${attack}/${defense}/${boundary}`);
      boundaries++;
    }
  }
}
// The team-facing table and timing sheet must not silently drift from executable rules.
const doc = readFileSync(new URL('../docs/ATTACK_DEFENSE_MATRIX.md', import.meta.url), 'utf8');
for (const [attack, expected] of Object.entries(rows)) assert.ok(doc.includes(`| ${attack} | ${[...expected].join(' | ')} |`), `documented matrix: ${attack}`);
for (const id of [...getAttackIds(), ...getDefenseIds()]) {
  const d = getAction(id);
  assert.ok(doc.includes(`| ${id} | ${d.startup} | ${d.isHold ? 'hold' : d.active} | ${d.recovery} | ${d.staminaCost}${d.isHold ? '; drain ' + d.drainPerSec + '/s' : ''} |`), `documented timing: ${id}`);
}
console.log(`PASS: ${cells} attack-defense cells across six capability profiles; ${boundaries} legal phase-boundary fixtures; facing/range/dedup/resource/stun and documentation contracts.`);
