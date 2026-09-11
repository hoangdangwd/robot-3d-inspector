// ─── Replay import/export boundary ──────────────────────────────────
// Replay files are untrusted data. Normalize them into a small, explicit
// shape before persistence or simulation playback.

import { getAction } from '../combat/ActionRegistry.js';
import { ActionPhase, FighterStatus, createActionIntent } from '../combat/CombatTypes.js';
import * as R from '../combat/CombatRules.js';
import { ROBOT_CATALOG } from '../robots/robotCatalog.js';

// v2 changes authoritative attack-defense coverage; v1 cannot be replayed faithfully.
export const REPLAY_LOG_VERSION = 2;
export const REPLAY_LIMITS = Object.freeze({
  maxInputs: 50000,
  maxMeta: 10000,
  maxEvents: 50000,
  maxDurationTicks: 50000,
  maxStringLength: 256,
});

const FIGHTERS = new Set(['fighter_a', 'fighter_b']);
const INITIAL_STATE_KEYS = new Set([
  'x', 'z', 'facing', 'health', 'stamina', 'posture', 'status',
  'actionId', 'actionPhase', 'actionTick', 'downUntil', 'getUpUntil',
]);
const EVENT_KEYS = new Set(['type', 'tick', 'fighterId', 'data']);

export function validateReplayLog(raw) {
  const result = normalizeReplayLog(raw);
  if (!result.ok) throw new TypeError(`MatchReplay: ${result.errors.join('; ')}`);
  return result.value;
}

export function tryValidateReplayLog(raw) {
  return normalizeReplayLog(raw);
}

function normalizeReplayLog(raw) {
  const errors = [];
  if (!isPlainObject(raw)) return fail('replay must be an object');
  if (raw.version !== REPLAY_LOG_VERSION) errors.push(`incompatible log version (expected ${REPLAY_LOG_VERSION}, got ${raw.version})`);

  const defIdA = normalizeDefinitionId(raw.defIdA, 'defIdA', errors);
  const defIdB = normalizeDefinitionId(raw.defIdB, 'defIdB', errors);
  const seed = boundedInteger(raw.seed, 'seed', 0, 0x7fffffff, errors);
  const roundDurationTicks = boundedInteger(raw.roundDurationTicks, 'roundDurationTicks', 1, REPLAY_LIMITS.maxDurationTicks, errors);
  const totalTicks = raw.totalTicks === undefined
    ? 0
    : boundedInteger(raw.totalTicks, 'totalTicks', 0, REPLAY_LIMITS.maxDurationTicks, errors);

  const initialState = normalizeInitialState(raw.initialState, errors);
  const inputs = normalizeInputs(raw.inputs, roundDurationTicks, errors);
  const replayMeta = normalizeMeta(raw.replayMeta, roundDurationTicks, errors);
  const events = normalizeEvents(raw.events, roundDurationTicks, errors);

  if (errors.length) return fail(errors);
  return {
    ok: true,
    value: {
      version: REPLAY_LOG_VERSION,
      defIdA,
      defIdB,
      seed,
      roundDurationTicks,
      totalTicks,
      matchStatus: normalizeMatchStatus(raw.matchStatus),
      winnerId: raw.winnerId === null || FIGHTERS.has(raw.winnerId) ? raw.winnerId ?? null : null,
      matchResult: normalizeMatchResult(raw.matchResult, roundDurationTicks),
      initialState,
      inputs,
      replayMeta,
      events,
    },
  };
}

function normalizeInitialState(raw, errors) {
  if (!isPlainObject(raw)) {
    errors.push('initialState is required');
    return {};
  }
  const output = {};
  for (const fighterId of FIGHTERS) {
    const source = raw[fighterId];
    if (!isPlainObject(source)) {
      errors.push(`initialState.${fighterId} is invalid`);
      continue;
    }
    const state = {};
    for (const key of Object.keys(source)) {
      if (!INITIAL_STATE_KEYS.has(key)) errors.push(`initialState.${fighterId}.${key} is not allowed`);
    }
    for (const key of ['x', 'z', 'facing']) finiteField(source, key, state, errors, `initialState.${fighterId}`);
    boundedResourceField(source, 'health', R.MAX_HEALTH, state, errors, `initialState.${fighterId}`);
    boundedResourceField(source, 'stamina', R.MAX_STAMINA, state, errors, `initialState.${fighterId}`);
    boundedResourceField(source, 'posture', R.MAX_POSTURE, state, errors, `initialState.${fighterId}`);
    for (const key of ['actionTick', 'downUntil', 'getUpUntil']) optionalNonNegativeField(source, key, state, errors, `initialState.${fighterId}`);
    if (!Object.values(FighterStatus).includes(source.status)) errors.push(`initialState.${fighterId}.status is invalid`);
    else state.status = source.status;
    if (!Object.values(ActionPhase).includes(source.actionPhase)) errors.push(`initialState.${fighterId}.actionPhase is invalid`);
    else state.actionPhase = source.actionPhase;
    if (typeof source.actionId !== 'string' || !getAction(source.actionId) && source.actionId !== 'none') errors.push(`initialState.${fighterId}.actionId is invalid`);
    else state.actionId = source.actionId;
    output[fighterId] = state;
  }
  return output;
}

function normalizeInputs(raw, duration, errors) {
  if (!Array.isArray(raw) || raw.length > REPLAY_LIMITS.maxInputs) {
    errors.push('inputs must be a bounded array');
    return [];
  }
  return raw.map((input, index) => {
    const label = `inputs[${index}]`;
    if (!isPlainObject(input) || !FIGHTERS.has(input.fighterId) || !boundedTick(input.tick, duration)) {
      errors.push(`${label} is invalid`);
      return null;
    }
    if (input.type === 'movement_applied') {
      if (!isPlainObject(input.move) || !Number.isFinite(input.move.forward) || !Number.isFinite(input.move.strafe)) {
        errors.push(`${label}.move is invalid`);
        return null;
      }
      return {
        type: input.type,
        tick: input.tick,
        fighterId: input.fighterId,
        move: {
          forward: clamp(input.move.forward, -1, 1),
          strafe: clamp(input.move.strafe, -1, 1),
          turnTo: input.move.turnTo === null ? null : finiteOrNull(input.move.turnTo),
        },
      };
    }
    if (input.type === 'intent_submitted') {
      if (!isPlainObject(input.intent) || !getAction(input.intent.actionId)) {
        errors.push(`${label}.intent is invalid`);
        return null;
      }
      try {
        const intent = createActionIntent({
          actionId: input.intent.actionId,
          source: input.intent.source,
          priority: input.intent.priority,
          createdAt: input.intent.createdAt,
          expiresAt: input.intent.expiresAt,
          targetId: input.intent.targetId ?? null,
          reason: input.intent.reason,
        });
        if (!boundedTick(intent.createdAt, REPLAY_LIMITS.maxDurationTicks) || !boundedTick(intent.expiresAt, REPLAY_LIMITS.maxDurationTicks)) throw new RangeError('intent tick is out of bounds');
        return { type: input.type, tick: input.tick, fighterId: input.fighterId, intent: { ...intent } };
      } catch {
        errors.push(`${label}.intent is invalid`);
        return null;
      }
    }
    errors.push(`${label}.type is unsupported`);
    return null;
  }).filter(Boolean);
}

function normalizeMeta(raw, duration, errors) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > REPLAY_LIMITS.maxMeta) {
    errors.push('replayMeta must be a bounded array');
    return [];
  }
  return raw.map((item, index) => {
    if (!isPlainObject(item) || typeof item.type !== 'string' || item.type.length > REPLAY_LIMITS.maxStringLength || !boundedTick(item.tick, duration) || !isPlainObject(item.data)) {
      errors.push(`replayMeta[${index}] is invalid`);
      return null;
    }
    const data = normalizePayload(item.data);
    if (!data.ok) {
      errors.push(`replayMeta[${index}].data is invalid`);
      return null;
    }
    return { type: item.type, tick: item.tick, data: data.value };
  }).filter(Boolean);
}

function normalizeEvents(raw, duration, errors) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > REPLAY_LIMITS.maxEvents) {
    errors.push('events must be a bounded array');
    return [];
  }
  return raw.map((event, index) => {
    if (!isPlainObject(event) || Object.keys(event).some(key => !EVENT_KEYS.has(key)) ||
        typeof event.type !== 'string' || event.type.length > REPLAY_LIMITS.maxStringLength ||
        !boundedTick(event.tick, duration) || !FIGHTERS.has(event.fighterId) || !isPlainObject(event.data)) {
      errors.push(`events[${index}] is invalid`);
      return null;
    }
    const data = normalizePayload(event.data);
    if (!data.ok) {
      errors.push(`events[${index}].data is invalid`);
      return null;
    }
    return { type: event.type, tick: event.tick, fighterId: event.fighterId, data: data.value };
  }).filter(Boolean);
}

function normalizeMatchResult(raw, duration) {
  if (!isPlainObject(raw)) return null;
  if (!['ko', 'time', 'draw'].includes(raw.reason) || !boundedTick(raw.tick, duration)) return null;
  if (raw.winnerId !== null && !FIGHTERS.has(raw.winnerId)) return null;
  if (!isPlainObject(raw.finalHealth) || !Number.isFinite(raw.finalHealth.fighter_a) || !Number.isFinite(raw.finalHealth.fighter_b)) return null;
  return {
    reason: raw.reason,
    winnerId: raw.winnerId ?? null,
    finalHealth: { fighter_a: raw.finalHealth.fighter_a, fighter_b: raw.finalHealth.fighter_b },
    tick: raw.tick,
  };
}

function normalizeMatchStatus(value) { return ['fighting', 'ko', 'time', 'draw'].includes(value) ? value : 'fighting'; }
function normalizeDefinitionId(value, label, errors) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(value)) { errors.push(`${label} is invalid`); return ''; }
  const canonical = value.replace(/-/g, '_');
  if (canonical !== 'test_neutral' && !ROBOT_CATALOG.some(robot => robot.id.replace(/-/g, '_') === canonical)) { errors.push(`${label} is unknown`); return ''; }
  return canonical;
}
function boundedInteger(value, label, min, max, errors) {
  if (!Number.isInteger(value) || value < min || value > max) { errors.push(`${label} is invalid`); return min; }
  return value;
}
function boundedTick(value, duration) { return Number.isInteger(value) && value >= 0 && value <= (duration || REPLAY_LIMITS.maxDurationTicks); }
function finiteField(source, key, target, errors, label) { if (!Number.isFinite(source[key])) errors.push(`${label}.${key} is invalid`); else target[key] = source[key]; }
function nonNegativeField(source, key, target, errors, label) { if (!Number.isFinite(source[key]) || source[key] < 0) errors.push(`${label}.${key} is invalid`); else target[key] = source[key]; }
function boundedResourceField(source, key, max, target, errors, label) { if (!Number.isFinite(source[key]) || source[key] < 0 || source[key] > max) errors.push(`${label}.${key} is invalid`); else target[key] = source[key]; }
function optionalNonNegativeField(source, key, target, errors, label) { if (source[key] !== undefined) nonNegativeField(source, key, target, errors, label); }
function finiteOrNull(value) { return Number.isFinite(value) ? value : null; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function normalizePayload(value, depth = 0) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return { ok: true, value: typeof value === 'string' ? value.slice(0, REPLAY_LIMITS.maxStringLength) : value };
  if (typeof value === 'number') return { ok: Number.isFinite(value), value };
  if (Array.isArray(value)) {
    if (depth >= 2 || value.length > 32) return { ok: false };
    const items = value.map(item => normalizePayload(item, depth + 1));
    return items.every(item => item.ok) ? { ok: true, value: items.map(item => item.value) } : { ok: false };
  }
  if (depth >= 2 || !isPlainObject(value)) return { ok: false };
  const output = {};
  const keys = Object.keys(value).filter(key => key !== '__proto__' && key !== 'constructor' && key !== 'prototype');
  if (keys.length > 32) return { ok: false };
  for (const key of keys) {
    const child = normalizePayload(value[key], depth + 1);
    if (!child.ok) return { ok: false };
    output[key.slice(0, 64)] = child.value;
  }
  return { ok: true, value: output };
}
function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function fail(...errors) { return { ok: false, errors: errors.flat() }; }
