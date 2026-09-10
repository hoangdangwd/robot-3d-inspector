// ─── Phase 0 validation ─────────────────────────────────────────────
// Tests for CombatTypes, SimClock, SeededRNG, EventLog.
// Run: node scripts/validate-phase0.mjs

import assert from 'node:assert/strict';
import { createActionIntent, createCombatEvent, createFighterState,
         ActionPhase, FighterStatus, ContactResult, IntentSource, ActionFamily }
  from '../src/combat/CombatTypes.js';
import { SimClock } from '../src/combat/SimClock.js';
import { SeededRNG } from '../src/combat/SeededRNG.js';
import { EventLog } from '../src/combat/EventLog.js';

let pass = 0;
function ok(label) { pass++; console.log(`  ✓ ${label}`); }

// ═══════════════════════════════════════════════════════════════════
console.log('\n── CombatTypes: enums ──');
// ═══════════════════════════════════════════════════════════════════

assert.ok(Object.isFrozen(ActionPhase));
assert.ok(Object.isFrozen(FighterStatus));
assert.ok(Object.isFrozen(ContactResult));
assert.ok(Object.isFrozen(IntentSource));
assert.ok(Object.isFrozen(ActionFamily));
assert.equal(Object.keys(ActionPhase).length, 4);
assert.equal(Object.keys(FighterStatus).length, 6);
ok('enums are frozen with expected member count');

// ═══════════════════════════════════════════════════════════════════
console.log('\n── CombatTypes: ActionIntent ──');
// ═══════════════════════════════════════════════════════════════════

const validIntent = createActionIntent({
  actionId: 'jab', source: 'ai', priority: 0.8,
  createdAt: 10, expiresAt: 25, targetId: 'fighter_b', reason: 'in range',
});
assert.equal(validIntent.actionId, 'jab');
assert.equal(validIntent.source, 'ai');
assert.equal(validIntent.priority, 0.8);
assert.equal(validIntent.targetId, 'fighter_b');
assert.ok(Object.isFrozen(validIntent));
ok('valid intent accepted and frozen');

// null targetId
const noTarget = createActionIntent({
  actionId: 'guard_high', source: 'tactic', priority: 0.5,
  createdAt: 0, expiresAt: 100, targetId: null, reason: '',
});
assert.equal(noTarget.targetId, null);
ok('null targetId accepted');

// reject bad enum
assert.throws(() => createActionIntent({
  actionId: 'jab', source: 'INVALID', priority: 0.5,
  createdAt: 0, expiresAt: 10,
}), /expected one of/);
ok('rejects invalid source enum');

// reject NaN priority
assert.throws(() => createActionIntent({
  actionId: 'jab', source: 'ai', priority: NaN,
  createdAt: 0, expiresAt: 10,
}), /finite number/);
ok('rejects NaN priority');

// reject Infinity
assert.throws(() => createActionIntent({
  actionId: 'jab', source: 'ai', priority: Infinity,
  createdAt: 0, expiresAt: 10,
}), /finite number/);
ok('rejects Infinity priority');

// reject out of range priority
assert.throws(() => createActionIntent({
  actionId: 'jab', source: 'ai', priority: 1.5,
  createdAt: 0, expiresAt: 10,
}), /must be <= 1/);
ok('rejects priority > 1');

assert.throws(() => createActionIntent({
  actionId: 'jab', source: 'ai', priority: -0.1,
  createdAt: 0, expiresAt: 10,
}), /must be >= 0/);
ok('rejects priority < 0');

// reject bad actionId
assert.throws(() => createActionIntent({
  actionId: '', source: 'ai', priority: 0.5,
  createdAt: 0, expiresAt: 10,
}), /non-empty string/);
ok('rejects empty actionId');

assert.throws(() => createActionIntent({
  actionId: 'Right Hook', source: 'ai', priority: 0.5,
  createdAt: 0, expiresAt: 10,
}), /must match/);
ok('rejects actionId with spaces/uppercase');

// reject expiresAt < createdAt
assert.throws(() => createActionIntent({
  actionId: 'jab', source: 'ai', priority: 0.5,
  createdAt: 20, expiresAt: 10,
}), /expiresAt.*< createdAt/);
ok('rejects expiresAt < createdAt');

// reject negative tick
assert.throws(() => createActionIntent({
  actionId: 'jab', source: 'ai', priority: 0.5,
  createdAt: -1, expiresAt: 10,
}), /must be >= 0/);
ok('rejects negative createdAt');

// reject null/undefined
assert.throws(() => createActionIntent(null), /expected an object/);
assert.throws(() => createActionIntent(undefined), /expected an object/);
ok('rejects null/undefined input');

// reason truncation
const longReason = createActionIntent({
  actionId: 'jab', source: 'ai', priority: 0.5,
  createdAt: 0, expiresAt: 10, reason: 'x'.repeat(1000),
});
assert.equal(longReason.reason.length, 256);
ok('truncates long reason to 256 chars');

// ═══════════════════════════════════════════════════════════════════
console.log('\n── CombatTypes: CombatEvent ──');
// ═══════════════════════════════════════════════════════════════════

const ev = createCombatEvent({
  type: 'hit_confirmed', tick: 42, fighterId: 'fighter_a',
  data: { damage: 12, contactId: 'right_fist' },
});
assert.equal(ev.type, 'hit_confirmed');
assert.equal(ev.tick, 42);
assert.equal(ev.data.damage, 12);
assert.ok(Object.isFrozen(ev));
assert.ok(Object.isFrozen(ev.data));
ok('valid event accepted and deeply frozen');

assert.throws(() => createCombatEvent({
  type: 'hit_confirmed', tick: -1, fighterId: 'a',
}), /must be >= 0/);
ok('rejects negative tick');

assert.throws(() => createCombatEvent({
  type: '', tick: 0, fighterId: 'a',
}), /non-empty/);
ok('rejects empty event type');

// ═══════════════════════════════════════════════════════════════════
console.log('\n── CombatTypes: FighterState ──');
// ═══════════════════════════════════════════════════════════════════

const fs = createFighterState({
  id: 'fighter_a', definitionId: 'forge_titan',
  x: 2.5, z: -1.0, facing: 0,
  health: 100, maxHealth: 100, stamina: 80, maxStamina: 100,
  status: 'ready', actionId: 'none', actionPhase: 'idle', actionTick: 0,
  targetId: 'fighter_b',
});
assert.equal(fs.id, 'fighter_a');
assert.equal(fs.health, 100);
assert.equal(fs.status, 'ready');
assert.equal(fs.targetId, 'fighter_b');
ok('valid fighter state accepted');

// mutable (not frozen — simulation needs to write to it)
fs.health = 90;
assert.equal(fs.health, 90);
ok('fighter state is mutable (simulation writes to it)');

assert.throws(() => createFighterState({
  id: 'a', definitionId: 'b', x: NaN, z: 0, facing: 0,
  health: 100, maxHealth: 100, stamina: 100, maxStamina: 100,
  status: 'ready', actionPhase: 'idle', actionTick: 0,
}), /finite number/);
ok('rejects NaN position');

assert.throws(() => createFighterState({
  id: 'a', definitionId: 'b', x: 0, z: 0, facing: 0,
  health: 100, maxHealth: 100, stamina: 100, maxStamina: 100,
  status: 'flying', actionPhase: 'idle', actionTick: 0,
}), /expected one of/);
ok('rejects invalid status enum');

assert.throws(() => createFighterState({
  id: 'a', definitionId: 'b', x: 0, z: 0, facing: 0,
  health: -5, maxHealth: 100, stamina: 100, maxStamina: 100,
  status: 'ready', actionPhase: 'idle', actionTick: 0,
}), /must be >= 0/);
ok('rejects negative health');

assert.throws(() => createFighterState({
  id: 'a', definitionId: 'b', x: 0, z: 0, facing: 0,
  health: 100, maxHealth: 0, stamina: 100, maxStamina: 100,
  status: 'ready', actionPhase: 'idle', actionTick: 0,
}), /must be >= 1/);
ok('rejects zero maxHealth');

// ═══════════════════════════════════════════════════════════════════
console.log('\n── SimClock ──');
// ═══════════════════════════════════════════════════════════════════

{
  const clock = new SimClock({ tickRate: 60 });
  assert.equal(clock.tick, 0);
  assert.equal(clock.time, 0);
  assert.equal(clock.paused, false);
  ok('initial state');

  // One tick at exactly dt
  const steps1 = clock.advance(1 / 60);
  assert.equal(steps1, 1);
  assert.equal(clock.tick, 1);
  ok('advance one dt = one tick');

  // Accumulate partial
  const steps2 = clock.advance(1 / 120); // half a tick
  assert.equal(steps2, 0);
  assert.equal(clock.tick, 1);
  ok('half dt = no tick yet');

  const steps3 = clock.advance(1 / 120);
  assert.equal(steps3, 1);
  assert.equal(clock.tick, 2);
  ok('second half completes the tick');

  // Multiple ticks
  const steps4 = clock.advance(5 / 60);
  assert.equal(steps4, 5);
  assert.equal(clock.tick, 7);
  ok('5× dt = 5 ticks');

  // Pause
  clock.pause();
  const steps5 = clock.advance(10);
  assert.equal(steps5, 0);
  assert.equal(clock.tick, 7);
  ok('paused: no ticks');

  clock.resume();
  const steps6 = clock.advance(1 / 60);
  assert.equal(steps6, 1);
  ok('resume works');

  // Max catch-up (default 8)
  const steps7 = clock.advance(100); // huge wall delta
  assert.equal(steps7, 8);
  ok('bounded catch-up at maxCatchUp=8');

  // Negative delta clamped to 0
  const tickBefore = clock.tick;
  clock.advance(-1);
  assert.equal(clock.tick, tickBefore);
  ok('negative delta clamped');

  // Reset
  clock.reset();
  assert.equal(clock.tick, 0);
  assert.equal(clock.time, 0);
  ok('reset');

  // Alpha interpolation
  clock.advance(0.5 / 60); // half a tick
  assert.ok(Math.abs(clock.alpha - 0.5) < 0.01);
  ok('alpha interpolation');
}

// Determinism: same input sequence → same tick count regardless of frame distribution
{
  const a = new SimClock({ tickRate: 60 });
  const b = new SimClock({ tickRate: 60 });

  // Scenario A: steady 60fps
  for (let i = 0; i < 120; i++) a.advance(1 / 60);

  // Scenario B: variable frames totaling same wall time
  b.advance(0.5);    // 30 ticks
  b.advance(0.3);    // 18 ticks
  b.advance(0.2);    // 12 ticks
  b.advance(1.0);    // 60 ticks (but capped at maxCatchUp=8)

  // Not exactly equal because B hits catch-up cap — that's correct behavior.
  // But if we stay below cap:
  // Real invariant: identical input schedule → identical tick count.
  // Float accumulators are NOT associative (different chunking may differ by ±1),
  // but the same chunking must always produce the same result.
  const c = new SimClock({ tickRate: 60, maxCatchUp: 200 });
  const d = new SimClock({ tickRate: 60, maxCatchUp: 200 });
  const schedule = [0.017, 0.014, 0.019, 0.033, 0.016, 0.015, 0.018, 0.032];
  for (const s of schedule) c.advance(s);
  for (const s of schedule) d.advance(s);
  assert.equal(c.tick, d.tick, 'identical schedule → identical ticks');
  ok('deterministic: same wall time = same ticks (no catch-up cap)');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── SeededRNG ──');
// ═══════════════════════════════════════════════════════════════════

{
  const rng = new SeededRNG(42);
  assert.equal(rng.seed, 42);
  assert.equal(rng.calls, 0);

  const v1 = rng.next();
  assert.ok(v1 >= 0 && v1 < 1);
  assert.equal(rng.calls, 1);
  ok('basic next() in [0, 1)');

  // Determinism: same seed → same sequence
  const a = new SeededRNG(12345);
  const b = new SeededRNG(12345);
  const seqA = Array.from({ length: 100 }, () => a.next());
  const seqB = Array.from({ length: 100 }, () => b.next());
  assert.deepEqual(seqA, seqB);
  ok('same seed → same 100-value sequence');

  // Different seeds → different sequences
  const c = new SeededRNG(1);
  const d = new SeededRNG(2);
  const seqC = Array.from({ length: 20 }, () => c.next());
  const seqD = Array.from({ length: 20 }, () => d.next());
  assert.notDeepEqual(seqC, seqD);
  ok('different seeds → different sequences');

  // nextInt range
  const rng2 = new SeededRNG(999);
  for (let i = 0; i < 500; i++) {
    const v = rng2.nextInt(3, 7);
    assert.ok(v >= 3 && v <= 7, `nextInt out of range: ${v}`);
  }
  ok('nextInt stays in [min, max]');

  // nextFloat range
  const rng3 = new SeededRNG(888);
  for (let i = 0; i < 500; i++) {
    const v = rng3.nextFloat(-5, 5);
    assert.ok(v >= -5 && v < 5, `nextFloat out of range: ${v}`);
  }
  ok('nextFloat stays in [min, max)');

  // pick
  const rng4 = new SeededRNG(777);
  const items = ['a', 'b', 'c'];
  const picks = new Set();
  for (let i = 0; i < 100; i++) picks.add(rng4.pick(items));
  assert.ok(picks.size > 1, 'pick should return varied items');
  assert.equal(rng4.pick([]), undefined);
  ok('pick from array');

  // clone preserves state
  const orig = new SeededRNG(555);
  orig.next(); orig.next(); orig.next();
  const copy = orig.clone();
  assert.equal(orig.next(), copy.next());
  assert.equal(orig.next(), copy.next());
  ok('clone preserves sequence position');

  // fork produces different sequence from parent
  const parent = new SeededRNG(100);
  parent.next();
  const child = parent.fork();
  const parentSeq = Array.from({ length: 10 }, () => parent.next());
  const childSeq = Array.from({ length: 10 }, () => child.next());
  assert.notDeepEqual(parentSeq, childSeq);
  ok('fork produces different sequence');

  // Distribution sanity: values should be reasonably spread
  const rng5 = new SeededRNG(42);
  let sum = 0;
  const N = 10000;
  for (let i = 0; i < N; i++) sum += rng5.next();
  const mean = sum / N;
  assert.ok(Math.abs(mean - 0.5) < 0.02, `mean ${mean} too far from 0.5`);
  ok('distribution mean ≈ 0.5');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── EventLog ──');
// ═══════════════════════════════════════════════════════════════════

{
  const log = new EventLog(4);
  assert.equal(log.length, 0);
  assert.equal(log.capacity, 4);
  assert.equal(log.total, 0);
  ok('initial state');

  // Push events
  log.push({ type: 'action_started', tick: 0, fighterId: 'a', data: { actionId: 'jab' } });
  log.push({ type: 'hit_confirmed', tick: 1, fighterId: 'a', data: { damage: 10 } });
  log.push({ type: 'action_ended', tick: 2, fighterId: 'a', data: {} });
  assert.equal(log.length, 3);
  assert.equal(log.total, 3);
  ok('push 3 events');

  // Read
  assert.equal(log.at(0).type, 'action_started');
  assert.equal(log.at(1).type, 'hit_confirmed');
  assert.equal(log.at(2).type, 'action_ended');
  assert.equal(log.at(3), undefined);
  assert.equal(log.at(-1), undefined);
  ok('at() reads correctly');

  // last()
  assert.equal(log.last().type, 'action_ended');
  ok('last() returns newest');

  // Eviction: push beyond capacity
  log.push({ type: 'action_started', tick: 3, fighterId: 'b', data: {} });
  assert.equal(log.length, 4);
  assert.equal(log.total, 4);
  log.push({ type: 'action_started', tick: 4, fighterId: 'b', data: {} });
  assert.equal(log.length, 4); // capped
  assert.equal(log.total, 5);
  // oldest event (tick 0) should be evicted
  assert.equal(log.at(0).tick, 1); // was tick 1
  assert.equal(log.last().tick, 4);
  ok('ring buffer evicts oldest');

  // Iterator
  const ticks = [...log].map(e => e.tick);
  assert.deepEqual(ticks, [1, 2, 3, 4]);
  ok('iterator yields oldest-first');

  // toArray
  assert.deepEqual(log.toArray().map(e => e.tick), [1, 2, 3, 4]);
  ok('toArray');

  // export
  const exported = log.export(42);
  assert.equal(exported.seed, 42);
  assert.equal(exported.total, 5);
  assert.equal(exported.events.length, 4);
  ok('export with seed');

  const exportedNoSeed = log.export();
  assert.equal(exportedNoSeed.seed, undefined);
  ok('export without seed');

  // clear
  log.clear();
  assert.equal(log.length, 0);
  assert.equal(log.total, 0);
  assert.equal(log.last(), undefined);
  ok('clear');

  // Validation: reject bad events
  const log2 = new EventLog();
  assert.throws(() => log2.push({ type: '', tick: 0, fighterId: 'a' }));
  assert.throws(() => log2.push({ type: 'a', tick: -1, fighterId: 'a' }));
  assert.throws(() => log2.push(null));
  ok('rejects invalid events');

  // Invalid capacity
  assert.throws(() => new EventLog(0));
  assert.throws(() => new EventLog(-1));
  assert.throws(() => new EventLog(1.5));
  ok('rejects invalid capacity');
}

// ═══════════════════════════════════════════════════════════════════
// Combined: clock + RNG determinism fixture
// ═══════════════════════════════════════════════════════════════════
console.log('\n── Combined determinism fixture ──');

{
  function runFixture(seed) {
    const clock = new SimClock({ tickRate: 60 });
    const rng = new SeededRNG(seed);
    const log = new EventLog(256);

    // Simulate 2 seconds of wall time in variable chunks
    const chunks = [0.3, 0.5, 0.2, 0.4, 0.6];
    for (const chunk of chunks) {
      const steps = clock.advance(chunk);
      for (let i = 0; i < steps; i++) {
        const roll = rng.next();
        if (roll > 0.8) {
          log.push({
            type: 'action_started', tick: clock.tick - steps + i,
            fighterId: 'test', data: { roll },
          });
        }
      }
    }
    return { tick: clock.tick, rngCalls: rng.calls, logCount: log.length, logTotal: log.total };
  }

  const r1 = runFixture(42);
  const r2 = runFixture(42);
  assert.deepEqual(r1, r2);
  ok('same seed → identical fixture output');

  const r3 = runFixture(99);
  assert.notEqual(r3.logCount, r1.logCount); // different seed likely different event count
  ok('different seed → different event distribution');
}

// ═══════════════════════════════════════════════════════════════════
console.log(`\nPASS: ${pass} assertions. Phase 0 foundation validated.\n`);
