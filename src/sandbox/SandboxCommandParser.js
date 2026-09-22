// ─── Offline Sandbox command parser ────────────────────────────────
// Converts short English/Vietnamese text into validated SandboxIntent data.
// It never emits boxing action IDs and never mutates simulation or scene state.

import { DirectionResolver } from './DirectionResolver.js';
import {
  createSandboxIntent,
  SandboxIntentSource,
  SandboxIntentType,
  SANDBOX_INTENT_LIMITS,
} from './SandboxIntent.js';
import { createSandboxPlan } from './SandboxPlan.js';

const MAX_TRANSCRIPT_LENGTH = 256;
const DEFAULT_EXPIRES_IN_TICKS = Object.freeze({
  [SandboxIntentType.MOVE]: 60,
  [SandboxIntentType.STOP]: 18,
  [SandboxIntentType.AIM]: 60,
  [SandboxIntentType.FIRE]: 12,
});

const STOP_PHRASES = Object.freeze([
  'stop', 'halt', 'stand still', 'stay still', 'hold position',
  'dung', 'dung lai', 'dung yen', 'dung im',
]);

const MOVE_PHRASES = Object.freeze([
  'move', 'move to', 'go', 'go to', 'head to', 'head', 'walk', 'advance',
  'toward', 'towards', 'direction', 'retreat', 'fall back', 'back up',
  'đi', 'đi chuyển', 'đi về', 'tiến', 'tiến lên', 'tiến về', 'hướng',
  'di', 'di chuyen', 'di ve', 'tien', 'tien len', 'tien ve', 'huong',
  'lui', 'lui lai',
]);

const AIM_PHRASES = Object.freeze([
  'aim', 'aim at', 'look at', 'look toward', 'point toward',
  'ngam', 'nham', 'quay nong', 'huong nong', 'xoay nong',
]);

const FIRE_PHRASES = Object.freeze([
  'fire', 'fire beam', 'shoot', 'shoot beam', 'blast', 'laser',
  'ban', 'ban laser', 'xa laser', 'xa tia', 'ban tia',
]);

const ATTACK_NEAREST_PHRASES = Object.freeze([
  'attack nearest', 'attack the nearest', 'target nearest', 'kill nearest',
  'shoot nearest', 'fire at nearest', 'ban con gan nhat',
  'tan cong gan nhat', 'danh muc tieu gan nhat', 'diet con gan nhat',
]);

const PLAN_SPLIT = /\s*(?:,|;|\band then\b|\bthen\b|\band\b|\bsau do\b|\broi\b|\bva\b)\s*/i;

const VALID_SOURCES = new Set(Object.values(SandboxIntentSource));

/**
 * @typedef {object} SandboxCommandOptions
 * @property {number} [currentHeading=0] Absolute current heading in radians.
 * @property {number} [tick=0] Current simulation tick.
 * @property {number} [expiresInTicks] Override the command lifetime.
 * @property {number} [priority=1] Intent priority in the range 0..1.
 * @property {'local'|'voice'|'ai'|'system'} [source='local'] Intent source.
 */

/**
 * Parse a short Sandbox command.
 *
 * Successful output keeps transcript metadata outside the domain intent:
 * `{ kind: 'sandbox_intent', transcript, intent }`.
 * Unrecognized input returns a stable reason and never throws.
 *
 * @param {unknown} raw
 * @param {SandboxCommandOptions} [options]
 * @returns {{ kind: 'sandbox_intent', transcript: string, intent: Readonly<object> } | { kind: 'unrecognized', reason: string, transcript: string }}
 */
export function parseSandboxPlanCommand(raw, options = {}) {
  const settings = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  const text = typeof raw === 'string' ? raw.trim() : '';
  const clauses = splitPlanClauses(normalize(text));
  if (clauses.length < 2) return unrecognized('not_a_plan', text.slice(0, MAX_TRANSCRIPT_LENGTH));
  const steps = [];
  let offset = safeTick(settings.tick);
  for (const clause of clauses) {
    const parsed = parseSandboxCommand(clause, { ...settings, tick: offset });
    if (parsed.kind !== 'sandbox_intent') return unrecognized('invalid_plan_step', text.slice(0, MAX_TRANSCRIPT_LENGTH));
    const durationTicks = parsed.intent.type === SandboxIntentType.MOVE ? 90
      : parsed.intent.type === SandboxIntentType.FIRE ? 24
      : parsed.intent.type === SandboxIntentType.ATTACK_TARGET ? 30
      : parsed.intent.type === SandboxIntentType.AIM ? 36
      : 18;
    const step = { type: parsed.intent.type, durationTicks };
    if (parsed.intent.angle !== undefined) step.angle = parsed.intent.angle;
    if (parsed.intent.targetId !== undefined) step.targetId = parsed.intent.targetId;
    steps.push(step);
    offset += durationTicks;
  }
  try {
    return {
      kind: 'sandbox_plan',
      transcript: text.slice(0, MAX_TRANSCRIPT_LENGTH),
      plan: createSandboxPlan({
        source: settings.source || SandboxIntentSource.LOCAL,
        priority: safePriority(settings.priority),
        createdAt: safeTick(settings.tick),
        steps,
      }),
    };
  } catch {
    return unrecognized('invalid_plan', text.slice(0, MAX_TRANSCRIPT_LENGTH));
  }
}

export function parseSandboxCommand(raw, options = {}) {
  const settings = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  const text = typeof raw === 'string' ? raw.trim() : '';
  const transcript = text.slice(0, MAX_TRANSCRIPT_LENGTH);
  const normalized = normalize(text);
  if (!normalized) return unrecognized('empty_command', transcript);
  if (splitPlanClauses(normalized).length >= 2) return unrecognized('compound_command', transcript);
  if (hasPhrase(normalized, ATTACK_NEAREST_PHRASES)) {
    return Object.freeze({
      kind: 'sandbox_intent',
      transcript: text.slice(0, MAX_TRANSCRIPT_LENGTH),
      intent: createSandboxIntent({
        type: SandboxIntentType.ATTACK_TARGET,
        targetId: 'nearest',
        source: settings.source || SandboxIntentSource.LOCAL,
        priority: safePriority(settings.priority),
        createdAt: safeTick(settings.tick),
        expiresAt: safeTick(settings.tick) + 30,
      }),
    });
  }

  if (hasPhrase(normalized, STOP_PHRASES)) {
    return createResult(SandboxIntentType.STOP, text, null, settings);
  }

  const type = resolveCommandType(normalized);
  if (!type) return unrecognized('unsupported_command', transcript);

  const direction = DirectionResolver.parse(text, safeHeading(settings.currentHeading));
  if (!direction) return unrecognized('missing_direction', transcript);

  return createResult(type, text, direction.angle, settings);
}

function splitPlanClauses(text) {
  if (typeof text !== 'string') return [];
  return text.split(PLAN_SPLIT).map(clause => clause.trim()).filter(Boolean).slice(0, 6);
}

export const SANDBOX_COMMAND_DEFAULTS = Object.freeze({
  expiresInTicks: Object.freeze({ ...DEFAULT_EXPIRES_IN_TICKS }),
  priority: 1,
  source: SandboxIntentSource.LOCAL,
});

function resolveCommandType(text) {
  // Fire is checked before movement so a future compound phrase such as
  // “move and fire east” cannot accidentally become only a movement request.
  if (hasPhrase(text, FIRE_PHRASES)) return SandboxIntentType.FIRE;
  if (hasPhrase(text, AIM_PHRASES)) return SandboxIntentType.AIM;
  if (hasPhrase(text, MOVE_PHRASES)) return SandboxIntentType.MOVE;
  return null;
}

function createResult(type, text, angle, options) {
  const createdAt = safeTick(options.tick);
  const lifetime = safeLifetime(options.expiresInTicks, DEFAULT_EXPIRES_IN_TICKS[type]);
  const source = VALID_SOURCES.has(options.source) ? options.source : SandboxIntentSource.LOCAL;
  const priority = safePriority(options.priority);
  const rawIntent = {
    type,
    source,
    priority,
    createdAt,
    expiresAt: createdAt + lifetime,
  };
  if (angle !== null) rawIntent.angle = angle;

  return Object.freeze({
    kind: 'sandbox_intent',
    transcript: text.slice(0, MAX_TRANSCRIPT_LENGTH),
    intent: createSandboxIntent(rawIntent),
  });
}

function unrecognized(reason, transcript) {
  return Object.freeze({ kind: 'unrecognized', reason, transcript });
}

function hasPhrase(text, phrases) {
  return phrases.some(phrase => phraseMatches(text, normalize(phrase)));
}

function phraseMatches(text, phrase) {
  return text === phrase || text.startsWith(`${phrase} `) ||
    text.endsWith(` ${phrase}`) || text.includes(` ${phrase} `);
}

function normalize(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeHeading(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function safeTick(value) {
  const maxTick = Number.MAX_SAFE_INTEGER - SANDBOX_INTENT_LIMITS.maxLifetimeTicks;
  return Number.isSafeInteger(value) && value >= 0 ? Math.min(value, maxTick) : 0;
}

function safeLifetime(value, fallback) {
  if (!Number.isSafeInteger(value)) return fallback;
  return Math.max(1, Math.min(value, SANDBOX_INTENT_LIMITS.maxLifetimeTicks));
}

function safePriority(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : 1;
}
