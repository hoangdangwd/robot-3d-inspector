// ─── Sandbox domain intent contract ─────────────────────────────────
// Serializable requests shared by text, voice and local Sandbox AI.
// This module has no Three.js, DOM, network or callback dependencies.

export const SandboxIntentType = Object.freeze({
  MOVE: 'move',
  STOP: 'stop',
  AIM: 'aim',
  FIRE: 'fire',
  ATTACK_TARGET: 'attack_target',
});

export const SandboxIntentSource = Object.freeze({
  LOCAL: 'local',
  VOICE: 'voice',
  AI: 'ai',
  SYSTEM: 'system',
});

export const SANDBOX_INTENT_LIMITS = Object.freeze({
  maxIdLength: 64,
  maxLifetimeTicks: 3600,
});

const TYPES = new Set(Object.values(SandboxIntentType));
const SOURCES = new Set(Object.values(SandboxIntentSource));
const ANGULAR_TYPES = new Set([
  SandboxIntentType.MOVE,
  SandboxIntentType.AIM,
  SandboxIntentType.FIRE,
]);
const TARGET_TYPES = new Set([SandboxIntentType.ATTACK_TARGET]);
const ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const TAU = Math.PI * 2;

/**
 * Serializable, validated request for a Sandbox simulation.
 *
 * @typedef {object} SandboxIntent
 * @property {'move'|'stop'|'aim'|'fire'|'attack_target'} type
 * @property {'local'|'voice'|'ai'|'system'} source
 * @property {number} priority 0..1
 * @property {number} createdAt non-negative simulation tick
 * @property {number} expiresAt simulation tick at which the request expires
 * @property {number} [angle] normalized absolute angle in radians
 * @property {string} [targetId] bounded Sandbox entity id
 */

/**
 * Validate and normalize untrusted Sandbox intent data.
 * Unknown properties are intentionally discarded so runtime objects cannot
 * cross the domain boundary into simulation state.
 *
 * @param {unknown} raw
 * @returns {{ ok: true, value: Readonly<SandboxIntent> } | { ok: false, error: string }}
 */
export function validateSandboxIntent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('invalid_object');

  const type = raw.type;
  if (typeof type !== 'string' || !TYPES.has(type)) return fail('invalid_type');

  const source = raw.source === undefined ? SandboxIntentSource.LOCAL : raw.source;
  if (typeof source !== 'string' || !SOURCES.has(source)) return fail('invalid_source');

  const priority = raw.priority === undefined ? 1 : raw.priority;
  if (!isNumberInRange(priority, 0, 1)) return fail('invalid_priority');

  const createdAt = raw.createdAt;
  if (!isNonNegativeInteger(createdAt)) return fail('invalid_created_at');

  const expiresAt = raw.expiresAt;
  if (!isNonNegativeInteger(expiresAt)) return fail('invalid_expires_at');
  if (expiresAt < createdAt) return fail('invalid_expiry');
  if (expiresAt - createdAt > SANDBOX_INTENT_LIMITS.maxLifetimeTicks) return fail('expiry_too_far');

  const hasAngle = raw.angle !== undefined;
  const hasTarget = raw.targetId !== undefined;
  if (ANGULAR_TYPES.has(type)) {
    if (!hasAngle) return fail('missing_angle');
    if (typeof raw.angle !== 'number' || !Number.isFinite(raw.angle)) return fail('invalid_angle');
  } else if (hasAngle) {
    return fail('unexpected_angle');
  }

  if (TARGET_TYPES.has(type)) {
    if (!hasTarget) return fail('missing_target');
    if (!isValidId(raw.targetId)) return fail('invalid_target');
  } else if (hasTarget) {
    return fail('unexpected_target');
  }

  const value = {
    type,
    source,
    priority,
    createdAt,
    expiresAt,
  };
  if (ANGULAR_TYPES.has(type)) value.angle = normalizeAngle(raw.angle);
  if (TARGET_TYPES.has(type)) value.targetId = raw.targetId;

  return { ok: true, value: Object.freeze(value) };
}

/**
 * Create a validated Sandbox intent or throw with its stable validation code.
 * Use this at trusted internal construction sites; use validateSandboxIntent
 * when accepting user, model or transport data.
 *
 * @param {unknown} raw
 * @returns {Readonly<SandboxIntent>}
 */
export function createSandboxIntent(raw) {
  const result = validateSandboxIntent(raw);
  if (!result.ok) throw new TypeError(`SandboxIntent: ${result.error}`);
  return result.value;
}

function isNumberInRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isValidId(value) {
  return typeof value === 'string' && value.length <= SANDBOX_INTENT_LIMITS.maxIdLength && ID_PATTERN.test(value);
}

function normalizeAngle(angle) {
  const normalized = angle % TAU;
  if (Object.is(normalized, -0) || normalized === 0) return 0;
  return normalized < 0 ? normalized + TAU : normalized;
}

function fail(error) {
  return { ok: false, error };
}
