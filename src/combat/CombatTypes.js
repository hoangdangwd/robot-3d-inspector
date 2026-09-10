// ─── Combat Domain Types ────────────────────────────────────────────
// Authoritative contracts for the combat simulation layer.
// These are validated data shapes, not classes with behavior.
// Nothing here imports Three.js or touches rendering.

// ── Enums ───────────────────────────────────────────────────────────

/** @enum {string} */
export const ActionPhase = Object.freeze({
  IDLE:     'idle',
  STARTUP:  'startup',
  ACTIVE:   'active',
  RECOVERY: 'recovery',
});

/** @enum {string} */
export const FighterStatus = Object.freeze({
  READY:      'ready',
  ACTING:     'acting',
  STAGGERED:  'staggered',
  DOWN:       'down',
  GETTING_UP: 'getting_up',
  KO:         'ko',
});

/** @enum {string} */
export const ContactResult = Object.freeze({
  HIT:     'hit',
  BLOCKED: 'blocked',
  PARRIED: 'parried',
  MISSED:  'missed',
});

/** @enum {string} */
export const IntentSource = Object.freeze({
  AI:             'ai',
  DIRECT_COMMAND: 'direct_command',
  TACTIC:         'tactic',
});

/** @enum {string} */
export const ActionFamily = Object.freeze({
  MOVEMENT: 'movement',
  ATTACK:   'attack',
  DEFENSE:  'defense',
  REACTION: 'reaction',
  RECOVERY: 'recovery',
});

// ── Validation helpers ──────────────────────────────────────────────

/**
 * @param {unknown} v
 * @param {Record<string, string>} enumObj
 * @param {string} label
 * @returns {string}
 */
function requireEnum(v, enumObj, label) {
  const values = Object.values(enumObj);
  if (typeof v !== 'string' || !values.includes(v)) {
    throw new TypeError(`${label}: expected one of [${values.join(', ')}], got ${JSON.stringify(v)}`);
  }
  return v;
}

/**
 * @param {unknown} v
 * @param {string} label
 * @param {{ min?: number, max?: number, allowZero?: boolean }} [opts]
 * @returns {number}
 */
function requireFinite(v, label, opts = {}) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new TypeError(`${label}: expected finite number, got ${JSON.stringify(v)}`);
  }
  if (opts.min !== undefined && v < opts.min) {
    throw new RangeError(`${label}: must be >= ${opts.min}, got ${v}`);
  }
  if (opts.max !== undefined && v > opts.max) {
    throw new RangeError(`${label}: must be <= ${opts.max}, got ${v}`);
  }
  return v;
}

/**
 * @param {unknown} v
 * @param {string} label
 * @param {number} [maxLen=64]
 * @returns {string}
 */
function requireId(v, label, maxLen = 64) {
  if (typeof v !== 'string' || v.length === 0 || v.length > maxLen) {
    throw new TypeError(`${label}: expected non-empty string (max ${maxLen}), got ${JSON.stringify(v)}`);
  }
  if (!/^[a-z][a-z0-9_-]*$/.test(v)) {
    throw new TypeError(`${label}: must match /^[a-z][a-z0-9_-]*$/, got "${v}"`);
  }
  return v;
}

/**
 * @param {unknown} v
 * @param {string} label
 * @returns {number}
 */
function requireTick(v, label) {
  return requireFinite(v, label, { min: 0 });
}

// ── Factories (create + validate) ───────────────────────────────────

/**
 * Create a validated ActionIntent.
 *
 * An intent is a *request* from the AI, a direct command, or a tactic.
 * The simulation decides whether it is legal to execute.
 *
 * @param {object} raw
 * @returns {Readonly<ActionIntent>}
 *
 * @typedef {object} ActionIntent
 * @property {string}  actionId   - semantic move ID (e.g. 'jab', 'hook_right')
 * @property {string}  source     - IntentSource enum value
 * @property {number}  priority   - 0..1 weighting
 * @property {number}  createdAt  - simulation tick when created
 * @property {number}  expiresAt  - simulation tick when this intent becomes stale
 * @property {string|null} targetId - target fighter instance ID, or null
 * @property {string}  reason     - human-readable debug label
 */
export function createActionIntent(raw) {
  if (raw == null || typeof raw !== 'object') {
    throw new TypeError('ActionIntent: expected an object');
  }
  const intent = Object.freeze({
    actionId:  requireId(raw.actionId, 'ActionIntent.actionId'),
    source:    requireEnum(raw.source, IntentSource, 'ActionIntent.source'),
    priority:  requireFinite(raw.priority, 'ActionIntent.priority', { min: 0, max: 1 }),
    createdAt: requireTick(raw.createdAt, 'ActionIntent.createdAt'),
    expiresAt: requireTick(raw.expiresAt, 'ActionIntent.expiresAt'),
    targetId:  raw.targetId === null || raw.targetId === undefined
                 ? null
                 : requireId(raw.targetId, 'ActionIntent.targetId'),
    reason:    typeof raw.reason === 'string' ? raw.reason.slice(0, 256) : '',
  });
  if (intent.expiresAt < intent.createdAt) {
    throw new RangeError(`ActionIntent: expiresAt (${intent.expiresAt}) < createdAt (${intent.createdAt})`);
  }
  return intent;
}

/**
 * Create a validated CombatEvent.
 *
 * Events are produced by the simulation and consumed by animation, UI, replay.
 * They never flow backwards to mutate simulation state.
 *
 * @param {object} raw
 * @returns {Readonly<CombatEvent>}
 *
 * @typedef {object} CombatEvent
 * @property {string} type       - event type (e.g. 'hit_confirmed', 'action_started', 'round_end')
 * @property {number} tick       - simulation tick
 * @property {string} fighterId  - source fighter instance ID
 * @property {object} data       - type-specific payload (frozen)
 */
export function createCombatEvent(raw) {
  if (raw == null || typeof raw !== 'object') {
    throw new TypeError('CombatEvent: expected an object');
  }
  const ev = Object.freeze({
    type:      requireId(raw.type, 'CombatEvent.type', 128),
    tick:      requireTick(raw.tick, 'CombatEvent.tick'),
    fighterId: requireId(raw.fighterId, 'CombatEvent.fighterId'),
    data:      Object.freeze({ ...(raw.data || {}) }),
  });
  return ev;
}

/**
 * Create a validated FighterState snapshot.
 *
 * This is the authoritative per-fighter state owned by the simulation.
 * Rendering reads from it but never writes to it.
 *
 * @param {object} raw
 * @returns {FighterState}
 *
 * @typedef {object} FighterState
 * @property {string}  id          - unique instance ID for this bout
 * @property {string}  definitionId - robot catalog ID (e.g. 'forge-titan')
 * @property {number}  x           - arena position X (meters)
 * @property {number}  z           - arena position Z (meters)
 * @property {number}  facing      - radians, 0 = +Z
 * @property {number}  health      - 0..maxHealth
 * @property {number}  maxHealth
 * @property {number}  stamina     - 0..maxStamina
 * @property {number}  maxStamina
 * @property {number}  posture     - 0..maxPosture; zero causes knockdown
 * @property {number}  maxPosture
 * @property {number}  downUntil   - simulation tick when down state ends
 * @property {number}  getUpUntil  - simulation tick when get-up state ends
 * @property {string}  status      - FighterStatus enum
 * @property {string}  actionId    - current action semantic ID or 'none'
 * @property {string}  actionPhase - ActionPhase enum
 * @property {number}  actionTick  - tick when current action/phase started
 * @property {string|null} targetId
 */
export function createFighterState(raw) {
  if (raw == null || typeof raw !== 'object') {
    throw new TypeError('FighterState: expected an object');
  }
  const state = {
    id:            requireId(raw.id, 'FighterState.id'),
    definitionId:  requireId(raw.definitionId, 'FighterState.definitionId'),
    x:             requireFinite(raw.x, 'FighterState.x'),
    z:             requireFinite(raw.z, 'FighterState.z'),
    facing:        requireFinite(raw.facing, 'FighterState.facing'),
    health:        requireFinite(raw.health, 'FighterState.health', { min: 0 }),
    maxHealth:     requireFinite(raw.maxHealth, 'FighterState.maxHealth', { min: 1 }),
    stamina:       requireFinite(raw.stamina, 'FighterState.stamina', { min: 0 }),
    maxStamina:    requireFinite(raw.maxStamina, 'FighterState.maxStamina', { min: 1 }),
    posture:       requireFinite(raw.posture ?? 100, 'FighterState.posture', { min: 0 }),
    maxPosture:    requireFinite(raw.maxPosture ?? 100, 'FighterState.maxPosture', { min: 1 }),
    downUntil:    requireTick(raw.downUntil ?? 0, 'FighterState.downUntil'),
    getUpUntil:   requireTick(raw.getUpUntil ?? 0, 'FighterState.getUpUntil'),
    status:        requireEnum(raw.status, FighterStatus, 'FighterState.status'),
    actionId:      typeof raw.actionId === 'string' ? raw.actionId : 'none',
    actionPhase:   requireEnum(raw.actionPhase, ActionPhase, 'FighterState.actionPhase'),
    actionTick:   requireTick(raw.actionTick, 'FighterState.actionTick'),
    targetId:      raw.targetId === null || raw.targetId === undefined
                     ? null
                     : requireId(raw.targetId, 'FighterState.targetId'),
  };
  if (state.health > state.maxHealth) throw new RangeError('FighterState.health: must be <= maxHealth');
  if (state.stamina > state.maxStamina) throw new RangeError('FighterState.stamina: must be <= maxStamina');
  if (state.posture > state.maxPosture) throw new RangeError('FighterState.posture: must be <= maxPosture');
  return state;
}

// ── Unit conventions (documentation, not runtime enforcement) ───────
//
// Distance:  meters (arena scale matches Three.js world units)
// Time:      simulation ticks (see SimClock). 1 tick = fixed timestep.
// Angle:     radians. 0 = +Z. Positive = counter-clockwise from above.
// Health:    abstract points. 100 is a reasonable default max.
// Stamina:   abstract points. 100 is a reasonable default max.
// Priority:  0..1 float. Higher = stronger preference.
