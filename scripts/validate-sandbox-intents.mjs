// ─── Sandbox intent contract validation ────────────────────────────
// Tests the serializable boundary used by text, voice and local Sandbox AI.
// Run: node scripts/validate-sandbox-intents.mjs

import assert from 'node:assert/strict';
import {
  SandboxIntentType,
  SandboxIntentSource,
  validateSandboxIntent,
  createSandboxIntent,
} from '../src/sandbox/SandboxIntent.js';

let pass = 0;
function ok(label) { pass++; console.log(`  ✓ ${label}`); }
function valid(raw) {
  const result = validateSandboxIntent(raw);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.value;
}
function invalid(raw, error) {
  const result = validateSandboxIntent(raw);
  assert.deepEqual(result, { ok: false, error });
  return result;
}
function base(overrides = {}) {
  return {
    type: SandboxIntentType.MOVE,
    createdAt: 10,
    expiresAt: 40,
    angle: 0,
    ...overrides,
  };
}

console.log('\n── SandboxIntent: contract constants ──');
assert.ok(Object.isFrozen(SandboxIntentType));
assert.ok(Object.isFrozen(SandboxIntentSource));
assert.deepEqual(Object.values(SandboxIntentType), ['move', 'stop', 'aim', 'fire', 'attack_target']);
assert.deepEqual(Object.values(SandboxIntentSource), ['local', 'voice', 'ai', 'system']);
ok('intent type and source enums are frozen and bounded');

console.log('\n── SandboxIntent: valid variants ──');
const move = valid(base({ angle: -Math.PI / 2 }));
assert.equal(move.type, 'move');
assert.equal(move.angle, (Math.PI * 3) / 2);
assert.equal(move.source, 'local');
assert.equal(move.priority, 1);
assert.equal(move.createdAt, 10);
assert.equal(move.expiresAt, 40);
assert.ok(Object.isFrozen(move));
ok('move accepts a direction and normalizes negative angles');

const stop = valid(base({ type: SandboxIntentType.STOP, angle: undefined }));
assert.deepEqual(stop, {
  type: 'stop', source: 'local', priority: 1, createdAt: 10, expiresAt: 40,
});
ok('stop accepts a time-bounded intent without geometry');

const aim = valid(base({ type: SandboxIntentType.AIM, angle: 2 * Math.PI }));
assert.equal(aim.angle, 0);
ok('aim normalizes a full-turn angle to zero');

const negativeFullTurn = valid(base({ angle: -2 * Math.PI }));
assert.equal(negativeFullTurn.angle, 0);
assert.equal(Object.is(negativeFullTurn.angle, -0), false);
ok('angle normalization does not leak negative zero');

const fire = valid(base({
  type: SandboxIntentType.FIRE,
  source: SandboxIntentSource.VOICE,
  priority: .85,
  angle: 7 * Math.PI,
}));
assert.equal(fire.angle, Math.PI);
assert.equal(fire.source, 'voice');
assert.equal(fire.priority, .85);
ok('fire accepts an explicit source, priority and direction');

const attackTarget = valid(base({
  type: SandboxIntentType.ATTACK_TARGET,
  source: SandboxIntentSource.AI,
  targetId: 'zombie_7',
  angle: undefined,
}));
assert.equal(attackTarget.targetId, 'zombie_7');
assert.equal(attackTarget.source, 'ai');
assert.equal('angle' in attackTarget, false);
ok('attack_target requires and preserves a bounded entity id');

console.log('\n── SandboxIntent: validation errors ──');
invalid(null, 'invalid_object');
invalid([], 'invalid_object');
invalid(base({ type: 'teleport' }), 'invalid_type');
invalid(base({ source: 'network' }), 'invalid_source');
invalid(base({ priority: 1.1 }), 'invalid_priority');
invalid(base({ priority: NaN }), 'invalid_priority');
invalid(base({ createdAt: -1 }), 'invalid_created_at');
invalid(base({ createdAt: 1.5 }), 'invalid_created_at');
invalid(base({ createdAt: Number.MAX_SAFE_INTEGER + 1 }), 'invalid_created_at');
invalid(base({ expiresAt: -1 }), 'invalid_expires_at');
invalid(base({ expiresAt: 9, createdAt: 10 }), 'invalid_expiry');
invalid(base({ expiresAt: 10 + 3601 }), 'expiry_too_far');
invalid(base({ angle: undefined }), 'missing_angle');
invalid(base({ angle: Infinity }), 'invalid_angle');
invalid(base({ angle: 'east' }), 'invalid_angle');
invalid(base({ type: SandboxIntentType.ATTACK_TARGET, angle: undefined }), 'missing_target');
invalid(base({ type: SandboxIntentType.ATTACK_TARGET, angle: undefined, targetId: 'Zombie 7' }), 'invalid_target');
invalid(base({ type: SandboxIntentType.ATTACK_TARGET, angle: undefined, targetId: '__proto__' }), 'invalid_target');
invalid(base({ type: SandboxIntentType.STOP, angle: 0 }), 'unexpected_angle');
invalid(base({ type: SandboxIntentType.MOVE, targetId: 'zombie_7' }), 'unexpected_target');
ok('invalid values return stable machine-readable error codes');

console.log('\n── SandboxIntent: safe serializable boundary ──');
const rawWithRuntimeValues = base({
  source: SandboxIntentSource.SYSTEM,
  onExecute: () => 'must not cross the boundary',
  mesh: { position: { x: 1, y: 2, z: 3 } },
});
const safe = createSandboxIntent(rawWithRuntimeValues);
assert.equal('onExecute' in safe, false);
assert.equal('mesh' in safe, false);
assert.deepEqual(JSON.parse(JSON.stringify(safe)), safe);
assert.ok(Object.isFrozen(safe));
ok('normalized intents contain only serializable domain data');

assert.throws(() => createSandboxIntent(base({ angle: NaN })), /invalid_angle/);
ok('createSandboxIntent rejects invalid data at the boundary');

console.log(`\nPASS: ${pass} assertions. Sandbox intent contract validated.\n`);
