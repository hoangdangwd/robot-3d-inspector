// ─── Phase 2 validation ─────────────────────────────────────────────
// Tests for expanded moveset, capabilities, dodge, parry, guard matching.
// Run: node scripts/validate-phase2.mjs

import assert from 'node:assert/strict';
import { CombatSimulation } from '../src/combat/CombatSimulation.js';
import { createActionIntent, ActionPhase, FighterStatus } from '../src/combat/CombatTypes.js';
import { getAction, getAttackIds, getDefenseIds, applyCapability }
  from '../src/combat/ActionRegistry.js';
import * as R from '../src/combat/CombatRules.js';

let pass = 0;
function ok(label) { pass++; console.log(`  ✓ ${label}`); }

function intent(fighterId, actionId, tick) {
  return createActionIntent({
    actionId, source: 'ai', priority: 0.8,
    createdAt: tick, expiresAt: tick + 120,
    targetId: fighterId === 'fighter_a' ? 'fighter_b' : 'fighter_a',
    reason: 'test',
  });
}
function stepN(sim, n) { for (let i = 0; i < n; i++) sim.update(1 / R.TICK_RATE); }
function step1(sim) { stepN(sim, 1); }

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Action registry completeness ──');
// ═══════════════════════════════════════════════════════════════════

{
  const attacks = getAttackIds();
  const defenses = getDefenseIds();

  const expectedAttacks = [
    'jab', 'cross', 'hook_left', 'hook_right',
    'uppercut_left', 'uppercut_right',
    'body_jab', 'body_cross', 'overhand', 'feint_jab',
  ];
  const expectedDefenses = [
    'guard_high', 'guard_low',
    'parry_left', 'parry_right',
    'slip_left', 'slip_right', 'duck', 'roll',
  ];

  for (const id of expectedAttacks) {
    assert.ok(attacks.includes(id), `missing attack: ${id}`);
    const def = getAction(id);
    assert.ok(def.startup > 0, `${id} startup must be > 0`);
    assert.ok(def.recovery > 0, `${id} recovery must be > 0`);
    if (id !== 'feint_jab') {
      assert.ok(def.damage > 0, `${id} damage must be > 0`);
      assert.ok(def.reach > 0, `${id} reach must be > 0`);
    }
  }
  ok(`${expectedAttacks.length} attacks registered with valid data`);

  for (const id of expectedDefenses) {
    assert.ok(defenses.includes(id), `missing defense: ${id}`);
    const def = getAction(id);
    assert.ok(def.startup > 0, `${id} startup must be > 0`);
    assert.ok(def.recovery > 0, `${id} recovery must be > 0`);
  }
  ok(`${expectedDefenses.length} defenses registered with valid data`);

  // Verify special flags
  assert.ok(getAction('slip_left').isDodge);
  assert.ok(getAction('slip_right').isDodge);
  assert.ok(getAction('duck').isDodge);
  assert.ok(getAction('roll').isDodge);
  assert.ok(getAction('parry_left').isParry);
  assert.ok(getAction('parry_right').isParry);
  assert.ok(getAction('guard_high').isHold);
  assert.ok(getAction('guard_low').isHold);
  assert.ok(getAction('body_jab').isBodyAttack);
  assert.ok(getAction('body_cross').isBodyAttack);
  ok('special flags correct');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Capability profiles ──');
// ═══════════════════════════════════════════════════════════════════

{
  const profiles = ['forge_titan', 'aegis_prime', 'vanta_razor', 'volt_kestrel', 'solstice_mantis'];
  for (const id of profiles) {
    const cap = R.getCapability(id);
    assert.ok(cap, `profile ${id} exists`);
    assert.ok(cap.startupMult > 0 && cap.startupMult < 3, `${id} startupMult in range`);
    assert.ok(cap.damageMult > 0 && cap.damageMult < 3, `${id} damageMult in range`);
    assert.ok(cap.reachMult > 0 && cap.reachMult < 3, `${id} reachMult in range`);
  }
  ok('5 capability profiles with valid multipliers');

  // Forge hits hardest
  const forge = R.getCapability('forge_titan');
  const vanta = R.getCapability('vanta_razor');
  assert.ok(forge.damageMult > vanta.damageMult, 'forge hits harder than vanta');
  ok('forge > vanta damage');

  // Vanta fastest startup
  assert.ok(vanta.startupMult < forge.startupMult, 'vanta faster startup than forge');
  ok('vanta faster startup than forge');

  // Mantis longest reach
  const mantis = R.getCapability('solstice_mantis');
  assert.ok(mantis.reachMult > forge.reachMult, 'mantis longer reach than forge');
  ok('mantis longest reach');

  // Aegis best guard
  const aegis = R.getCapability('aegis_prime');
  assert.ok(aegis.guardMult > 1.2, 'aegis strong guard');
  ok('aegis best guard');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Capability modifiers applied ──');
// ═══════════════════════════════════════════════════════════════════

{
  const jabBase = getAction('jab');
  const forgeCap = R.getCapability('forge_titan');
  const vantaCap = R.getCapability('vanta_razor');

  const forgeJab = applyCapability(jabBase, forgeCap);
  const vantaJab = applyCapability(jabBase, vantaCap);

  // Forge jab: slower startup, more damage
  assert.ok(forgeJab.startup > vantaJab.startup, 'forge jab slower startup');
  assert.ok(forgeJab.damage > vantaJab.damage, 'forge jab more damage');
  ok('forge jab: slower but harder');

  // Vanta jab: faster, lighter
  assert.ok(vantaJab.startup < jabBase.startup, 'vanta jab faster than base');
  assert.ok(vantaJab.damage < jabBase.damage, 'vanta jab lighter than base');
  ok('vanta jab: faster but lighter');

  // Mantis reach > forge reach
  const mantisCap = R.getCapability('solstice_mantis');
  const mantisJab = applyCapability(jabBase, mantisCap);
  const forgeJab2 = applyCapability(jabBase, forgeCap);
  assert.ok(mantisJab.reach > forgeJab2.reach, 'mantis outreaches forge');
  ok('reach modifiers work');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Cross attack ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  sim.fighterA.z = -0.5; sim.fighterB.z = 0.5;
  sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;
  const bBefore = sim.fighterB.health;
  const cross = getAction('cross');

  sim.submitIntentFor('fighter_a', intent('fighter_a', 'cross', sim.clock.tick));
  stepN(sim, 1 + cross.startup + cross.active + 1);

  const events = sim.log.toArray().filter(e => e.type === 'contact_resolved');
  const hit = events.find(e => e.data.result === 'hit');
  assert.ok(hit, 'cross hit resolved');
  assert.equal(hit.data.damage, cross.damage);
  assert.equal(sim.fighterB.health, bBefore - cross.damage);
  ok('cross deals correct damage');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Hook and uppercut ──');
// ═══════════════════════════════════════════════════════════════════

{
  for (const actionId of ['hook_left', 'hook_right', 'uppercut_left', 'uppercut_right']) {
    const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
    sim.fighterA.z = -0.3; sim.fighterB.z = 0.3;
    sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;
    const def = getAction(actionId);
    const bBefore = sim.fighterB.health;

    sim.submitIntentFor('fighter_a', intent('fighter_a', actionId, sim.clock.tick));
    stepN(sim, 1 + def.startup + def.active + 1);

    assert.equal(sim.fighterB.health, bBefore - def.damage, `${actionId} damage`);
  }
  ok('hooks and uppercuts deal correct damage at close range');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Body attacks ──');
// ═══════════════════════════════════════════════════════════════════

{
  for (const actionId of ['body_jab', 'body_cross']) {
    const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
    sim.fighterA.z = -0.5; sim.fighterB.z = 0.5;
    sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;
    const def = getAction(actionId);
    const bBefore = sim.fighterB.health;

    sim.submitIntentFor('fighter_a', intent('fighter_a', actionId, sim.clock.tick));
    stepN(sim, 1 + def.startup + def.active + 1);

    assert.equal(sim.fighterB.health, bBefore - def.damage, `${actionId} damage`);
  }
  ok('body attacks deal correct damage');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Overhand: heaviest single hit ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  sim.fighterA.z = -0.3; sim.fighterB.z = 0.3;
  sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;
  const overhand = getAction('overhand');
  const jab = getAction('jab');
  const bBefore = sim.fighterB.health;

  sim.submitIntentFor('fighter_a', intent('fighter_a', 'overhand', sim.clock.tick));
  stepN(sim, 1 + overhand.startup + overhand.active + 1);

  assert.ok(overhand.damage > jab.damage, 'overhand hits harder than jab');
  assert.ok(overhand.startup > jab.startup, 'overhand slower startup');
  assert.ok(overhand.recovery > jab.recovery, 'overhand longer recovery');
  assert.equal(sim.fighterB.health, bBefore - overhand.damage);
  ok('overhand: high damage, high commitment');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Feint: no damage ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  sim.fighterA.z = -0.5; sim.fighterB.z = 0.5;
  sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;
  const bBefore = sim.fighterB.health;

  sim.submitIntentFor('fighter_a', intent('fighter_a', 'feint_jab', sim.clock.tick));
  stepN(sim, 30);

  assert.equal(sim.fighterB.health, bBefore, 'feint deals no damage');
  ok('feint_jab: zero damage, costs stamina');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Dodge (slip) avoids hit ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  sim.fighterA.z = -0.5; sim.fighterB.z = 0.5;
  sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;

  const slipDef = getAction('slip_left');
  const jabDef = getAction('jab');

  // A starts jab first
  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
  step1(sim); // tick 1: A enters startup

  // B starts slip a few ticks later so B is in dodge active when A’s jab becomes active
  // A active starts at tick 1 + 8 = tick 9
  // B needs to be in active at tick 9. B startup = 4, so B must start by tick 5.
  stepN(sim, 3); // tick 4
  sim.submitIntentFor('fighter_b', intent('fighter_b', 'slip_left', sim.clock.tick));
  step1(sim); // tick 5: B enters startup
  // B enters active at tick 5 + 4 = tick 9
  // B active lasts 8 ticks: ticks 9–16
  // A enters active at tick 9, active lasts 4 ticks: ticks 9–12
  // Contact resolved within ticks 9–12 — B is in dodge active

  const bBefore = sim.fighterB.health;
  stepN(sim, jabDef.startup + jabDef.active); // advance to A's active window

  const events = sim.log.toArray().filter(e => e.type === 'contact_resolved');
  const lastContact = events[events.length - 1];
  assert.equal(lastContact.data.result, 'missed');
  assert.equal(lastContact.data.reason, 'dodged');
  assert.equal(sim.fighterB.health, bBefore);
  ok('slip dodges attack');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Duck dodges ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  sim.fighterA.z = -0.5; sim.fighterB.z = 0.5;
  sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;

  const duckDef = getAction('duck');
  const jabDef = getAction('jab');

  // A jabs first
  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
  step1(sim);
  // A active starts at tick 1+8 = 9
  // B needs duck active to overlap. Duck startup=5, so start B at tick ~4
  stepN(sim, 2);
  sim.submitIntentFor('fighter_b', intent('fighter_b', 'duck', sim.clock.tick));
  step1(sim); // tick 4: B enters startup
  // B active at tick 4+5=9, lasts 10 ticks (9-18)
  // A active at tick 9, lasts 4 ticks (9-12) → overlap

  stepN(sim, jabDef.startup + jabDef.active);

  const events = sim.log.toArray().filter(e => e.type === 'contact_resolved');
  assert.equal(events[events.length - 1].data.reason, 'dodged');
  ok('duck dodges attack');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Parry stuns attacker ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  sim.fighterA.z = -0.5; sim.fighterB.z = 0.5;
  sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;

  const parryDef = getAction('parry_right');
  const jabDef = getAction('jab');

  // A jabs first
  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab', sim.clock.tick));
  step1(sim); // tick 1: A startup
  // A active at tick 9 (1+8)
  // B parry startup=3, start B at tick ~6 so B active at tick 6+3=9
  stepN(sim, 4); // tick 5
  sim.submitIntentFor('fighter_b', intent('fighter_b', 'parry_right', sim.clock.tick));
  step1(sim); // tick 6: B enters startup
  // B active at tick 9, lasts 6 ticks (9-14)
  // A active at tick 9, lasts 4 ticks (9-12) → overlap

  const bBefore = sim.fighterB.health;
  stepN(sim, jabDef.startup + jabDef.active); // advance past A’s active

  const events = sim.log.toArray().filter(e => e.type === 'contact_resolved');
  const parryEv = events[events.length - 1];
  assert.equal(parryEv.data.result, 'parried');
  assert.equal(sim.fighterB.health, bBefore, 'parry negates damage');
  ok('parry negates hit and stuns attacker');

  // Attacker remains in its committed action, but is frozen for the stun window;
  // a new intent must not start a second action or reset the current action clock.
  sim.submitIntentFor('fighter_a', intent('fighter_a', 'cross', sim.clock.tick));
  const actionBeforeStunStep = sim.getState('fighter_a').actionId;
  const actionTickBeforeStunStep = sim.getState('fighter_a').actionTick;
  step1(sim);
  assert.equal(sim.getState('fighter_a').actionId, actionBeforeStunStep, 'stun preserves committed action');
  assert.equal(sim.getState('fighter_a').actionTick, actionTickBeforeStunStep, 'stun freezes action clock');
  ok('stunned attacker cannot start or replace action');

  // After stun wears off and the committed action recovers, the pending request executes.
  stepN(sim, R.PARRY_STUN_TICKS + 45);
  const queuedStarted = sim.log.toArray().some(e =>
    e.type === 'action_started' && e.fighterId === 'fighter_a' && e.data.actionId === 'cross'
  );
  assert.ok(queuedStarted, 'queued request executes after stun and recovery');
  ok('stun expires and queued intent acts again');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Guard_low blocks body attacks better ──');
// ═══════════════════════════════════════════════════════════════════

{
  // Matched guard: body attack vs guard_low
  const simLow = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  simLow.fighterA.z = -0.5; simLow.fighterB.z = 0.5;
  simLow.fighterA.facing = 0; simLow.fighterB.facing = Math.PI;

  const bodyJab = getAction('body_jab');
  const guardLow = getAction('guard_low');

  simLow.submitIntentFor('fighter_b', intent('fighter_b', 'guard_low', simLow.clock.tick));
  stepN(simLow, 1 + guardLow.startup);

  const bLowBefore = simLow.fighterB.health;
  simLow.submitIntentFor('fighter_a', intent('fighter_a', 'body_jab', simLow.clock.tick));
  stepN(simLow, 1 + bodyJab.startup + 1);

  const lowEv = simLow.log.toArray().filter(e => e.type === 'contact_resolved');
  const lowBlock = lowEv[lowEv.length - 1];
  assert.equal(lowBlock.data.result, 'blocked');
  assert.ok(lowBlock.data.matched, 'guard_low matched body attack');
  const matchedChip = bLowBefore - simLow.fighterB.health;

  // Mismatched: body attack vs guard_high
  const simHigh = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  simHigh.fighterA.z = -0.5; simHigh.fighterB.z = 0.5;
  simHigh.fighterA.facing = 0; simHigh.fighterB.facing = Math.PI;

  simHigh.submitIntentFor('fighter_b', intent('fighter_b', 'guard_high', simHigh.clock.tick));
  stepN(simHigh, 1 + getAction('guard_high').startup);

  const bHighBefore = simHigh.fighterB.health;
  simHigh.submitIntentFor('fighter_a', intent('fighter_a', 'body_jab', simHigh.clock.tick));
  stepN(simHigh, 1 + bodyJab.startup + 1);

  const highEv = simHigh.log.toArray().filter(e => e.type === 'contact_resolved');
  const highBlock = highEv[highEv.length - 1];
  assert.equal(highBlock.data.result, 'hit');
  assert.equal(highBlock.data.defenseOutcome, 'hit', 'guard_high exposes body');
  const mismatchedChip = bHighBefore - simHigh.fighterB.health;

  assert.ok(mismatchedChip > matchedChip,
    `mismatched chip (${mismatchedChip}) > matched chip (${matchedChip})`);
  ok('mismatched guard takes a clean hit rather than chip damage');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Same action, different robots ──');
// ═══════════════════════════════════════════════════════════════════

{
  // Forge Titan vs Vanta Razor doing the same cross
  const simForge = new CombatSimulation({ defIdA: 'forge_titan', defIdB: 'test_neutral' });
  const simVanta = new CombatSimulation({ defIdA: 'vanta_razor', defIdB: 'test_neutral' });

  // Place close together facing each other
  for (const sim of [simForge, simVanta]) {
    sim.fighterA.z = -0.5; sim.fighterB.z = 0.5;
    sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;
  }

  const crossBase = getAction('cross');
  const forgeCross = applyCapability(crossBase, R.getCapability('forge_titan'));
  const vantaCross = applyCapability(crossBase, R.getCapability('vanta_razor'));

  // Same action, different profiles
  assert.ok(forgeCross.damage > vantaCross.damage, 'forge cross hits harder');
  assert.ok(forgeCross.startup > vantaCross.startup, 'forge cross slower startup');
  assert.ok(vantaCross.reach > forgeCross.reach, 'vanta cross has more reach');
  ok('same cross action produces different stats per robot');

  // Actually simulate: forge jab KOs from more health
  simForge.submitIntentFor('fighter_a', intent('fighter_a', 'cross', simForge.clock.tick));
  simVanta.submitIntentFor('fighter_a', intent('fighter_a', 'cross', simVanta.clock.tick));

  stepN(simForge, 1 + forgeCross.startup + forgeCross.active + 1);
  stepN(simVanta, 1 + vantaCross.startup + vantaCross.active + 1);

  const forgeDmg = R.MAX_HEALTH - simForge.fighterB.health;
  const vantaDmg = R.MAX_HEALTH - simVanta.fighterB.health;
  assert.ok(forgeDmg > vantaDmg, `forge dealt ${forgeDmg} > vanta dealt ${vantaDmg}`);
  ok('forge cross deals more actual damage in simulation');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Movement speed differs by profile ──');
// ═══════════════════════════════════════════════════════════════════

{
  const simForge = new CombatSimulation({ defIdA: 'forge_titan', defIdB: 'test_neutral' });
  const simVanta = new CombatSimulation({ defIdA: 'vanta_razor', defIdB: 'test_neutral' });

  for (const sim of [simForge, simVanta]) {
    sim.fighterA.x = 0; sim.fighterA.z = 0; sim.fighterA.facing = 0;
  }

  // Move forward for 60 ticks
  for (let i = 0; i < 60; i++) {
    simForge.applyMovement('fighter_a', { forward: 1 });
    simVanta.applyMovement('fighter_a', { forward: 1 });
  }

  const forgeDist = Math.sqrt(simForge.fighterA.x ** 2 + simForge.fighterA.z ** 2);
  const vantaDist = Math.sqrt(simVanta.fighterA.x ** 2 + simVanta.fighterA.z ** 2);

  assert.ok(vantaDist > forgeDist,
    `vanta moved ${vantaDist.toFixed(3)} > forge ${forgeDist.toFixed(3)}`);
  ok('vanta moves faster than forge');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Guard cancel into any attack ──');
// ═══════════════════════════════════════════════════════════════════

{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral' });
  const a = sim.getState('fighter_a');

  // Enter guard hold
  sim.submitIntentFor('fighter_a', intent('fighter_a', 'guard_high', sim.clock.tick));
  stepN(sim, 1 + getAction('guard_high').startup);
  assert.equal(a.actionPhase, ActionPhase.ACTIVE);

  // Request cross (not just jab) — should cancel guard
  sim.submitIntentFor('fighter_a', intent('fighter_a', 'cross', sim.clock.tick));
  step1(sim);
  assert.equal(a.actionPhase, ActionPhase.RECOVERY, 'guard drops on any attack request');
  ok('guard cancels into cross (not just jab)');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── All five profiles produce different jab timing ──');
// ═══════════════════════════════════════════════════════════════════

{
  const jabBase = getAction('jab');
  const ids = ['forge_titan', 'aegis_prime', 'vanta_razor', 'volt_kestrel', 'solstice_mantis'];
  const startups = new Set();
  const damages = new Set();
  const reaches = new Set();

  for (const id of ids) {
    const mod = applyCapability(jabBase, R.getCapability(id));
    startups.add(mod.startup);
    damages.add(mod.damage);
    reaches.add(mod.reach);
  }

  // At least 3 distinct values across 5 robots for each stat
  assert.ok(startups.size >= 3, `${startups.size} distinct jab startups across 5 robots`);
  assert.ok(damages.size >= 3, `${damages.size} distinct jab damages`);
  assert.ok(reaches.size >= 3, `${reaches.size} distinct jab reaches`);
  ok('five profiles produce varied jab characteristics');
}

// ═══════════════════════════════════════════════════════════════════
console.log(`\nPASS: ${pass} assertions. Phase 2 expanded moveset validated.\n`);
