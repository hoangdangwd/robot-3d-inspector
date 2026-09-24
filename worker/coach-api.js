// ─── Robot Foundry Jev Worker ──────────────────────────────────────
// All voice/text goes through Jev Decisions API. No local parser.
// Returns: { intent_type, directive, intent/plan } or { rule } for memory.

import { validateTactic, validateTacticV2 } from '../src/tactics/TacticSchema.js';
import { validateTacticPatch, applyTacticPatch } from '../src/tactics/TacticPatch.js';
import {
  createSandboxIntent,
  SandboxIntentSource,
} from '../src/sandbox/SandboxIntent.js';
import { BrainDirective } from '../src/sandbox/SandboxBrain.js';

const ALLOWED_LANGUAGES = new Set(['en-US', 'vi-VN']);
const JEV_CONFIDENCE_THRESHOLD = 0.72;
const ACTIONS = new Set([
  'jab', 'cross', 'hook_left', 'hook_right', 'uppercut_left', 'uppercut_right',
  'body_jab', 'body_cross', 'overhand', 'feint_jab', 'guard_high', 'guard_low',
  'parry_left', 'parry_right', 'slip_left', 'slip_right', 'duck', 'roll',
]);
const DISTANCES = new Set(['close', 'mid', 'far']);
const ZONES = new Set(['any', 'head', 'body']);
const TEMPOS = new Set(['patient', 'normal', 'high']);
const MAX_MODEL_OUTPUT_CHARS = 4096;
const MAX_PLAYER_RULES = 4096;
const MAX_GAME_STATE_BYTES = 4096;
const MAX_EVENT_ENTRIES = 8;

const SANDBOX_ACTIONS = new Set(['move', 'stop', 'fire', 'fire_nearest', 'attack_nearest']);
const SANDBOX_EVENT_TYPES = new Set(['zombie_entered_zone']);
const SANDBOX_ZONES = new Set(['gate', 'player']);
const SANDBOX_DIRECTIVES = new Set(Object.values(BrainDirective));
const SANDBOX_DIRECTIONS = new Set([
  'clock_12', 'clock_1', 'clock_2', 'clock_3', 'clock_4', 'clock_5', 'clock_6',
  'clock_7', 'clock_8', 'clock_9', 'clock_10', 'clock_11',
  'relative_forward', 'relative_right', 'relative_behind', 'relative_left', 'none',
]);

const CLOCK_ANGLES = Object.freeze({
  clock_12: 0, clock_1: Math.PI / 6, clock_2: Math.PI / 3,
  clock_3: Math.PI / 2, clock_4: (2 * Math.PI) / 3, clock_5: (5 * Math.PI) / 6,
  clock_6: Math.PI, clock_7: (7 * Math.PI) / 6, clock_8: (4 * Math.PI) / 3,
  clock_9: (3 * Math.PI) / 2, clock_10: (5 * Math.PI) / 3, clock_11: (11 * Math.PI) / 6,
});

const RELATIVE_OFFSETS = Object.freeze({
  relative_forward: 0, relative_right: Math.PI / 2,
  relative_behind: Math.PI, relative_left: -Math.PI / 2,
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), request, env);

    if (url.pathname === '/health' && request.method === 'GET') {
      return cors(json({
        ok: true, service: 'robot-foundry-jev',
        aiConfigured: Boolean(env.OPENROUTER_API_KEY),
        boxingAiConfigured: Boolean(env.AI),
        provider: 'openrouter_jev',
      }), request, env);
    }

    if (url.pathname === '/api/coach/tactic-patch') {
      return cors(await handleTacticPatch(request, env), request, env);
    }
    if (url.pathname === '/api/sandbox/interpret') {
      return cors(await handleSandboxInterpret(request, env), request, env);
    }
    if (url.pathname === '/api/coach/interpret') {
      return cors(await handleCoachInterpret(request, env), request, env);
    }

    return cors(json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404), request, env);
  },
};

// ── Main handler ───────────────────────────────────────────────────

async function handleSandboxInterpret(request, env) {
  if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } }, 405);

  const originResult = checkOrigin(request, env);
  if (!originResult.ok) return json({ error: originResult.error }, 403);

  let input;
  try { input = await readJson(request, 8192); } catch (error) {
    return json({ error: { code: error.code || 'INVALID_JSON', message: error.message } }, 400);
  }

  const validation = validateInput(input);
  if (!validation.ok) return json({ error: validation.error }, 422);

  const { mode, transcript, language, requestId, currentHeading, tick, playerRules, gameState, event } = validation.value;

  if (!env.OPENROUTER_API_KEY) {
    return json({ error: { code: 'OPENROUTER_UNAVAILABLE', message: 'OpenRouter API key required', requestId } }, 503);
  }

  try {
    const fetchImpl = typeof env.OPENROUTER_FETCH === 'function' ? env.OPENROUTER_FETCH : fetch;
    const response = await fetchImpl('https://openrouter.ai/api/alpha/decisions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        ...(env.OPENROUTER_SITE_URL ? { 'HTTP-Referer': env.OPENROUTER_SITE_URL } : {}),
        ...(env.OPENROUTER_APP_NAME ? { 'X-Title': env.OPENROUTER_APP_NAME } : {}),
      },
      body: JSON.stringify({
        model: env.OPENROUTER_JEV_MODEL || 'typesafe/jev-1.13',
        state: buildJevState({ mode, transcript, language, currentHeading, tick, playerRules, gameState, event }),
        questions: buildJevQuestions(),
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return json({ error: { code: 'OPENROUTER_REQUEST_FAILED', message: 'Jev request failed', requestId } }, 502);
    }

    const result = interpretJevResponse(payload, { requestId, currentHeading, tick });
    if (!result) {
      return json({ error: { code: 'JEV_INVALID_DECISION', message: 'No safe decision from Jev', requestId } }, 422);
    }

    return json({ ok: true, requestId, source: 'openrouter_jev', ...result, usage: safeUsage(payload?.usage) });
  } catch (error) {
    if (error?.message === 'JEV_LOW_CONFIDENCE') {
      return json({ error: { code: 'JEV_LOW_CONFIDENCE', message: 'Jev not confident enough', requestId } }, 422);
    }
    return json({ error: { code: 'OPENROUTER_REQUEST_FAILED', message: 'Jev unavailable', requestId } }, 502);
  }
}

// ── Jev state + questions ──────────────────────────────────────────

function buildJevState({ mode, transcript, language, currentHeading, tick, playerRules, gameState, event }) {
  const state = {
    mode,
    player_command: transcript || '',
    language,
    current_heading_radians: currentHeading,
    current_tick: tick,
    game: 'Robot Foundry Zombie Survival',
  };
  if (playerRules) state.player_rules = playerRules;
  if (event) state.event = event;
  if (gameState) {
    if (gameState.playerHealth !== undefined) state.player_health = gameState.playerHealth;
    if (gameState.playerEnergy !== undefined) state.player_energy = gameState.playerEnergy;
    if (gameState.zombieCount !== undefined) state.zombie_count = gameState.zombieCount;
    if (gameState.nearestZombieDistance !== undefined) state.nearest_zombie_distance = gameState.nearestZombieDistance;
    if (gameState.score !== undefined) state.score = gameState.score;
    if (gameState.directive !== undefined) state.directive = gameState.directive;
    if (gameState.gate !== undefined) state.gate = gameState.gate;
    if (gameState.gateDistance !== undefined) state.gate_distance = gameState.gateDistance;
  }
  return state;
}

function buildJevQuestions() {
  return {
    intent_type: {
      type: 'choice',
      instructions: 'Is the player giving an immediate tactical command, teaching the bot a standing rule to remember, or changing the bot strategic behavior?',
      criteria: {
        immediate_command: 'A direct order to do something right now: move, fire, stop, attack.',
        add_rule: 'A standing instruction the bot should remember and follow from now on. Examples: "when zombies get close to the gate, retreat and fire", "always prioritize big zombies".',
        set_strategy: 'Changing the overall strategic behavior: be aggressive, play defensive, kite them, hold position.',
        unclear: 'Cannot determine intent.',
      },
    },
    action: {
      type: 'choice',
      instructions: 'If this is an immediate command, what action? Choose the closest match.',
      criteria: {
        move: 'Move in a direction.',
        stop: 'Stop and hold position.',
        fire: 'Fire beam in a direction.',
        fire_nearest: 'Fire at the nearest zombie without a named direction.',
        attack_nearest: 'Attack the nearest zombie.',
        none: 'Not an immediate action command.',
      },
    },
    directive: {
      type: 'choice',
      instructions: 'If this sets strategy, which directive best matches? Consider the player rules context.',
      criteria: {
        patrol: 'Default patrol behavior, auto-fire at nearest.',
        advance: 'Move toward enemies aggressively.',
        retreat: 'Move away from enemies while firing.',
        hold_and_fire: 'Stay in position and keep firing.',
        kite: 'Maintain distance, fire while backing away.',
        focus_nearest: 'Prioritize the closest zombie.',
        focus_largest: 'Prioritize the biggest/toughest zombie.',
        flank: 'Move to the side to avoid frontal engagement.',
        idle: 'Do nothing, wait for orders.',
        none: 'Not a strategy change.',
      },
    },
    direction: {
      type: 'choice',
      instructions: 'Direction for immediate commands. Use clock for absolute, relative for robot-heading-based.',
      criteria: {
        clock_12: '12 o\'clock / north.', clock_1: '1 o\'clock.', clock_2: '2 o\'clock.',
        clock_3: '3 o\'clock / east.', clock_4: '4 o\'clock.', clock_5: '5 o\'clock.',
        clock_6: '6 o\'clock / south.', clock_7: '7 o\'clock.', clock_8: '8 o\'clock.',
        clock_9: '9 o\'clock / west.', clock_10: '10 o\'clock.', clock_11: '11 o\'clock.',
        relative_forward: 'Forward.', relative_right: 'Right.',
        relative_behind: 'Behind.', relative_left: 'Left.',
        none: 'No direction needed.',
      },
    },
  };
}

// ── Interpret Jev response ─────────────────────────────────────────

function interpretJevResponse(payload, context) {
  const answers = payload?.answers || {};
  const intentType = answers.intent_type;
  const action = answers.action;
  const directive = answers.directive;
  const direction = answers.direction;

  if (!intentType?.choice) return null;
  const typeConfidence = Number(intentType.confidence ?? 0);
  if (typeConfidence < JEV_CONFIDENCE_THRESHOLD) throw new Error('JEV_LOW_CONFIDENCE');

  // ── Player is teaching a rule ──
  if (intentType.choice === 'add_rule') {
    return { type: 'add_rule' };
  }
  if (intentType.choice === 'unclear' || intentType.choice === 'no_action') return { type: 'no_action' };

  // ── Strategy change ──
  if (intentType.choice === 'set_strategy') {
    const dir = directive?.choice;
    if (!dir || dir === 'none' || !SANDBOX_DIRECTIVES.has(dir)) return null;
    const dirConfidence = Number(directive.confidence ?? 0);
    if (dirConfidence < JEV_CONFIDENCE_THRESHOLD) throw new Error('JEV_LOW_CONFIDENCE');
    return { type: 'set_directive', directive: dir };
  }

  // ── Immediate command ──
  if (intentType.choice === 'immediate_command') {
    const act = action?.choice;
    if (act === 'none') return { type: 'no_action' };
    if (!act) return null;
    if (!SANDBOX_ACTIONS.has(act)) return null;
    const actConfidence = Number(action.confidence ?? 0);
    if (actConfidence < JEV_CONFIDENCE_THRESHOLD) throw new Error('JEV_LOW_CONFIDENCE');

    if (act === 'stop') {
      return {
        type: 'immediate',
        intent: createSandboxIntent({
          type: 'stop', source: SandboxIntentSource.AI,
          priority: 1, createdAt: context.tick, expiresAt: context.tick + 18,
        }),
      };
    }
    if (act === 'attack_nearest' || act === 'fire_nearest') {
      return {
        type: 'immediate',
        intent: createSandboxIntent({
          type: act === 'fire_nearest' ? 'fire_nearest' : 'attack_target',
          ...(act === 'fire_nearest' ? {} : { targetId: 'nearest' }),
          source: SandboxIntentSource.AI,
          priority: 1, createdAt: context.tick, expiresAt: context.tick + 60,
        }),
      };
    }
    // move or fire need direction
    const angle = resolveDirection(direction, context.currentHeading);
    if (angle === null) return null;
    return {
      type: 'immediate',
      intent: createSandboxIntent({
        type: act, source: SandboxIntentSource.AI,
        priority: 1, createdAt: context.tick, expiresAt: context.tick + (act === 'fire' ? 12 : 60),
        angle,
      }),
    };
  }

  return null;
}

function resolveDirection(dirAnswer, currentHeading) {
  if (!dirAnswer?.choice || dirAnswer.choice === 'none') return null;
  const dirConf = Number(dirAnswer.confidence ?? 0);
  if (dirConf < JEV_CONFIDENCE_THRESHOLD) return null;
  const choice = dirAnswer.choice;
  if (CLOCK_ANGLES[choice] !== undefined) return CLOCK_ANGLES[choice];
  if (RELATIVE_OFFSETS[choice] !== undefined) {
    const heading = Number.isFinite(currentHeading) ? currentHeading : 0;
    return normalizeAngle(heading + RELATIVE_OFFSETS[choice]);
  }
  return null;
}

// ── Validation ─────────────────────────────────────────────────────

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('VALIDATION_ERROR', 'Body must be an object');
  const mode = input.mode === undefined ? 'command' : input.mode;
  if (mode !== 'command' && mode !== 'rule_event') return fail('VALIDATION_ERROR', 'mode is invalid');
  const transcript = typeof input.transcript === 'string' ? input.transcript.trim() : '';
  const language = input.language;
  const requestId = typeof input.requestId === 'string' ? input.requestId : '';
  const currentHeading = input.currentHeading === undefined ? 0 : Number(input.currentHeading);
  const tick = input.tick === undefined ? 0 : Number(input.tick);
  const requestVersion = input.requestVersion === undefined ? 0 : Number(input.requestVersion);
  const eventId = typeof input.eventId === 'string' ? input.eventId : '';
  const commandId = typeof input.commandId === 'string' ? input.commandId : '';
  if (mode === 'command' && (!transcript || transcript.length > 256)) return fail('VALIDATION_ERROR', 'transcript must be 1-256 characters');
  if (mode === 'rule_event' && transcript.length > 256) return fail('VALIDATION_ERROR', 'transcript must be at most 256 characters');
  if (!ALLOWED_LANGUAGES.has(language)) return fail('VALIDATION_ERROR', 'language must be en-US or vi-VN');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(requestId)) return fail('VALIDATION_ERROR', 'requestId is invalid');
  if (!Number.isSafeInteger(requestVersion) || requestVersion < 0) return fail('VALIDATION_ERROR', 'requestVersion is invalid');
  if (eventId && !/^[a-zA-Z0-9_-]{1,64}$/.test(eventId)) return fail('VALIDATION_ERROR', 'eventId is invalid');
  if (commandId && !/^[a-zA-Z0-9_-]{1,64}$/.test(commandId)) return fail('VALIDATION_ERROR', 'commandId is invalid');
  if (!Number.isFinite(currentHeading)) return fail('VALIDATION_ERROR', 'currentHeading must be finite');
  if (!Number.isSafeInteger(tick) || tick < 0) return fail('VALIDATION_ERROR', 'tick must be a non-negative integer');
  if (typeof input.playerRules === 'string' && input.playerRules.length > MAX_PLAYER_RULES) return fail('VALIDATION_ERROR', 'playerRules is too large');
  const playerRules = typeof input.playerRules === 'string' ? input.playerRules : '';
  const gameState = validateGameState(input.gameState);
  if (input.gameState !== undefined && input.gameState !== null && !gameState) return fail('VALIDATION_ERROR', 'gameState is invalid');
  const event = mode === 'rule_event' ? validateEvent(input.event) : null;
  if (mode === 'rule_event' && !event) return fail('VALIDATION_ERROR', 'event is invalid');
  return { ok: true, value: { mode, transcript, language, requestId, requestVersion, eventId, commandId, currentHeading, tick, playerRules, gameState, event } };
}

function validateGameState(gameState) {
  if (gameState === undefined || gameState === null) return null;
  if (!gameState || typeof gameState !== 'object' || Array.isArray(gameState)) return null;
  const encoded = JSON.stringify(gameState);
  if (!encoded || encoded.length > MAX_GAME_STATE_BYTES) return null;
  for (const field of ['playerHealth', 'playerEnergy', 'zombieCount', 'nearestZombieDistance', 'score', 'gateDistance']) {
    if (gameState[field] !== undefined && !Number.isFinite(Number(gameState[field]))) return null;
  }
  if (gameState.directive !== undefined && gameState.directive !== 'none' && !SANDBOX_DIRECTIVES.has(gameState.directive)) return null;
  if (gameState.gate !== undefined) {
    const gate = gameState.gate;
    if (!gate || typeof gate !== 'object' || !Number.isFinite(Number(gate.x)) || !Number.isFinite(Number(gate.z)) || !Number.isFinite(Number(gate.radius))) return null;
  }
  return gameState;
}

function validateEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  if (!SANDBOX_EVENT_TYPES.has(event.type) || !SANDBOX_ZONES.has(event.zoneId)) return null;
  const entries = Array.isArray(event.entries) ? event.entries : [{ zombieId: event.zombieId, distance: event.distance }];
  if (!entries.length || entries.length > MAX_EVENT_ENTRIES) return null;
  const normalized = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') return null;
    if (typeof entry.zombieId !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(entry.zombieId)) return null;
    const distance = Number(entry.distance);
    if (!Number.isFinite(distance) || distance < 0 || distance > 1000) return null;
    normalized.push({ zombieId: entry.zombieId, distance });
  }
  return { type: event.type, zoneId: event.zoneId, entries: normalized, zombieId: normalized[0].zombieId, distance: normalized[0].distance };
}

async function handleCoachInterpret(request, env) {
  if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } }, 405);
  const originResult = checkOrigin(request, env);
  if (!originResult.ok) return json({ error: originResult.error }, 403);
  let input;
  try { input = await readJson(request, 8192); } catch (error) {
    return json({ error: { code: error.code || 'INVALID_JSON', message: error.message } }, 400);
  }
  const validation = validateCoachInput(input);
  if (!validation.ok) return json({ error: validation.error }, 422);
  const { transcript, language, requestId } = validation.value;
  if (!env.OPENROUTER_API_KEY) return json({ error: { code: 'OPENROUTER_UNAVAILABLE', message: 'OpenRouter API key required', requestId } }, 503);
  try {
    const fetchImpl = typeof env.OPENROUTER_FETCH === 'function' ? env.OPENROUTER_FETCH : fetch;
    const response = await fetchImpl('https://openrouter.ai/api/alpha/decisions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.OPENROUTER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.OPENROUTER_JEV_MODEL || 'typesafe/jev-1.13', state: { mode: 'fight', player_command: transcript, language }, questions: fightQuestions() }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) return json({ error: { code: 'JEV_INVALID_DECISION', message: 'No safe decision from Jev', requestId } }, 422);
    const intent = interpretFightJev(payload, { language, requestId });
    if (!intent) return json({ error: { code: 'JEV_INVALID_DECISION', message: 'No safe decision from Jev', requestId } }, 422);
    if (intent.type === 'no_action') return json({ ok: true, requestId, source: 'openrouter_jev', type: 'no_action' });
    return json({ ok: true, requestId, source: 'openrouter_jev', intent });
  } catch (error) {
    if (error?.message === 'JEV_LOW_CONFIDENCE') return json({ error: { code: 'JEV_LOW_CONFIDENCE', message: 'Jev not confident enough', requestId } }, 422);
    return json({ error: { code: 'OPENROUTER_REQUEST_FAILED', message: 'Jev unavailable', requestId } }, 502);
  }
}

function fightQuestions() {
  return {
    intent_type: { type: 'choice', instructions: 'Classify one Live Fight utterance.', criteria: { direct_command: 'Do one legal move now.', blackboard_override: 'Temporary tactical preference.', live_tactic: 'Persistent when/if/after tactic.', unclear: 'Cannot tell.' } },
    action: { type: 'choice', instructions: 'Action for a direct command.', criteria: Object.fromEntries([...ACTIONS, 'none'].map(action => [action, action])) },
    override: { type: 'choice', instructions: 'Temporary preference.', criteria: { far: 'Keep distance.', close: 'Move closer.', body: 'Target body.', head: 'Target head.', patient: 'Slow down.', aggressive: 'Pressure.', avoid_jab: 'Stop jabbing.', none: 'None.' } },
  };
}

function interpretFightJev(payload, context) {
  const answers = payload?.answers || {};
  const intent = answers.intent_type;
  if (!intent?.choice || Number(intent.confidence ?? 0) < JEV_CONFIDENCE_THRESHOLD) throw new Error('JEV_LOW_CONFIDENCE');
  if (intent.choice === 'live_tactic') return null;
  if (intent.choice === 'unclear') return { type: 'no_action' };
  if (intent.choice === 'direct_command') {
    const action = answers.action?.choice;
    if (!ACTIONS.has(action) || Number(answers.action.confidence ?? 0) < JEV_CONFIDENCE_THRESHOLD) return null;
    return { kind: 'direct_command', commandId: 'remote_' + context.requestId, fighterId: 'fighter_a', language: context.language, transcript: '', createdAt: 0, expiresAt: 24, priority: Number(answers.action.confidence), confidence: Number(answers.action.confidence), actionId: action };
  }
  if (intent.choice !== 'blackboard_override') return null;
  const changes = fightOverride(answers.override?.choice);
  if (!changes || Number(answers.override?.confidence ?? 0) < JEV_CONFIDENCE_THRESHOLD) return null;
  return { kind: 'blackboard_override', commandId: 'remote_' + context.requestId, fighterId: 'fighter_a', language: context.language, transcript: '', createdAt: 0, expiresAt: 360, priority: Number(answers.override.confidence), confidence: Number(answers.override.confidence), changes };
}

function fightOverride(choice) {
  return { far: { preferredDistance: 'far' }, close: { preferredDistance: 'close', aggression: .25 }, body: { targetZone: 'body' }, head: { targetZone: 'head' }, patient: { aggression: -.4, tempo: 'patient' }, aggressive: { aggression: .45, tempo: 'high' }, avoid_jab: { avoidActions: ['jab', 'body_jab'] } }[choice] || null;
}

function validateCoachInput(input) {
  if (!input || typeof input !== 'object') return fail('VALIDATION_ERROR', 'Body must be an object');
  const transcript = typeof input.transcript === 'string' ? input.transcript.trim() : '';
  const requestId = typeof input.requestId === 'string' ? input.requestId : '';
  if (!transcript || transcript.length > 256) return fail('VALIDATION_ERROR', 'transcript must be 1-256 characters');
  if (!ALLOWED_LANGUAGES.has(input.language)) return fail('VALIDATION_ERROR', 'language must be en-US or vi-VN');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(requestId)) return fail('VALIDATION_ERROR', 'requestId is invalid');
  return { ok: true, value: { transcript, language: input.language, requestId } };
}

function validateModelIntent(raw, context) {
  const parsed = parseModelJson(raw);
  if (!parsed) return null;
  const confidence = Number(parsed.confidence);
  const expiresInTicks = Number(parsed.expiresInTicks);
  if (!Number.isFinite(confidence) || confidence < .7 || confidence > 1 || !Number.isInteger(expiresInTicks) || expiresInTicks < 6 || expiresInTicks > 600) return null;
  if (parsed.kind === 'direct_command' && ACTIONS.has(parsed.actionId)) {
    return { kind: 'direct_command', commandId: 'remote_' + context.requestId, fighterId: 'fighter_a', language: context.language, transcript: '', createdAt: 0, expiresAt: expiresInTicks, priority: confidence, confidence, actionId: parsed.actionId };
  }
  if (parsed.kind !== 'blackboard_override') return null;
  const changes = validateChanges(parsed.changes);
  if (!changes) return null;
  return { kind: 'blackboard_override', commandId: 'remote_' + context.requestId, fighterId: 'fighter_a', language: context.language, transcript: '', createdAt: 0, expiresAt: expiresInTicks, priority: confidence, confidence, changes };
}

function validateChanges(changes) {
  if (!changes || typeof changes !== 'object') return null;
  const result = {};
  if (changes.preferredDistance !== undefined && DISTANCES.has(changes.preferredDistance)) result.preferredDistance = changes.preferredDistance;
  else if (changes.preferredDistance !== undefined) return null;
  if (changes.targetZone !== undefined && ZONES.has(changes.targetZone)) result.targetZone = changes.targetZone;
  else if (changes.targetZone !== undefined) return null;
  if (changes.tempo !== undefined && TEMPOS.has(changes.tempo)) result.tempo = changes.tempo;
  else if (changes.tempo !== undefined) return null;
  for (const key of ['aggression', 'risk', 'guardBias']) {
    if (changes[key] !== undefined && typeof changes[key] === 'number' && Number.isFinite(changes[key])) result[key] = Math.max(-1, Math.min(1, changes[key]));
    else if (changes[key] !== undefined) return null;
  }
  if (changes.avoidActions !== undefined) {
    if (!Array.isArray(changes.avoidActions) || changes.avoidActions.length > 12 || changes.avoidActions.some(id => !ACTIONS.has(id))) return null;
    result.avoidActions = [...new Set(changes.avoidActions)];
  }
  return Object.keys(result).length ? result : null;
}

function parseModelJson(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_MODEL_OUTPUT_CHARS) return null;
  try { const parsed = JSON.parse(raw.trim()); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null; }
  catch { return null; }
}

function extractModelText(result) {
  return typeof result === 'string' ? result : (typeof result?.response === 'string' ? result.response : '');
}

function stripIntent(intent) {
  const { kind, actionId, changes, confidence, expiresAt, priority, commandId, fighterId, language, createdAt } = intent;
  return { kind, actionId, changes, confidence, expiresAt, priority, commandId, fighterId, language, createdAt };
}

async function handleTacticPatch(request, env) {
  if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } }, 405);
  const originResult = checkOrigin(request, env);
  if (!originResult.ok) return json({ error: originResult.error }, 403);
  let input;
  try { input = await readJson(request, 16384); } catch (error) {
    return json({ error: { code: error.code || 'INVALID_JSON', message: error.message } }, 400);
  }
  if (!input || typeof input !== 'object' || typeof input.transcript !== 'string' || input.transcript.trim().length < 1 || input.transcript.length > 256 || !ALLOWED_LANGUAGES.has(input.language) || !/^[a-zA-Z0-9_-]{1,64}$/.test(input.requestId) || !Number.isInteger(input.baseRevision) || input.baseRevision < 0) {
    return json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid tactic patch request' } }, 422);
  }
  const base = input.tactic?.schemaVersion === 2 ? validateTacticV2(input.tactic) : validateTactic(input.tactic);
  if (!base.ok) return json({ error: { code: 'INVALID_BASE_TACTIC', message: 'Base tactic is invalid' } }, 422);
  if (!env.OPENROUTER_API_KEY) return json({ error: { code: 'OPENROUTER_UNAVAILABLE', message: 'OpenRouter API key required', requestId: input.requestId } }, 503);
  try {
    const fetchImpl = typeof env.OPENROUTER_FETCH === 'function' ? env.OPENROUTER_FETCH : fetch;
    const response = await fetchImpl('https://openrouter.ai/api/alpha/decisions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.OPENROUTER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.OPENROUTER_JEV_MODEL || 'typesafe/jev-1.13', state: { mode: 'timeout', player_command: input.transcript, base_revision: input.baseRevision }, questions: tacticQuestions() }),
    });
    const payload = await response.json().catch(() => null);
    const patch = validateTacticPatch(tacticPatchFromJev(payload, input.baseRevision), { baseRevision: input.baseRevision });
    if (!patch.ok) return json({ error: { code: 'INVALID_MODEL_PATCH', message: patch.error, requestId: input.requestId } }, 502);
    const preview = applyTacticPatch(base.value, patch.value);
    if (!preview.ok) return json({ error: { code: 'INVALID_PATCH_PREVIEW', message: 'Patch preview failed validation', requestId: input.requestId } }, 502);
    return json({ ok: true, requestId: input.requestId, source: 'openrouter_jev', patch: patch.value, previewTactic: preview.value });
  } catch {
    return json({ error: { code: 'AI_REQUEST_FAILED', message: 'Tactic proposal unavailable', requestId: input.requestId } }, 502);
  }
}

function tacticQuestions() {
  return { operation: { type: 'choice', instructions: 'Choose one bounded playbook edit. Never commit it.', criteria: { replace_sequence_hook_right: 'Counter with right hook.', replace_sequence_body_cross: 'Counter with body cross.', set_repeat_limit_1: 'Run once.', set_timeout_ticks_180: 'Expire after 180 ticks.', none: 'No safe edit.' } } };
}

function tacticPatchFromJev(payload, baseRevision) {
  const answer = payload?.answers?.operation;
  if (!answer || Number(answer.confidence ?? 0) < JEV_CONFIDENCE_THRESHOLD || answer.choice === 'none') return null;
  const operations = { replace_sequence_hook_right: [{ type: 'replace_sequence', actionIds: ['hook_right'] }], replace_sequence_body_cross: [{ type: 'replace_sequence', actionIds: ['body_cross'] }], set_repeat_limit_1: [{ type: 'set_repeat_limit', value: 1 }], set_timeout_ticks_180: [{ type: 'set_timeout_ticks', value: 180 }] }[answer.choice];
  return operations ? { baseRevision, operations } : null;
}

// ── Utilities ──────────────────────────────────────────────────────

function normalizeAngle(angle) {
  const tau = Math.PI * 2;
  const n = angle % tau;
  return n < 0 ? n + tau : n;
}

function safeUsage(usage) {
  if (!usage || typeof usage !== 'object') return undefined;
  return {
    input_tokens: Number(usage.input_tokens) || 0,
    output_tokens: Number(usage.output_tokens) || 0,
    cost: Number(usage.cost) || 0,
  };
}

function fail(code, message) { return { ok: false, error: { code, message } }; }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }); }

function cors(response, request, env) {
  const headers = new Headers(response.headers);
  const configured = typeof env.ALLOWED_ORIGIN === 'string' && env.ALLOWED_ORIGIN
    ? env.ALLOWED_ORIGIN.trim().replace(/\/+$/, '') : '';
  const origin = (request.headers.get('origin') || '').trim().replace(/\/+$/, '');
  let allowOrigin = '*';
  if (origin && isAllowedOrigin(origin, configured)) allowOrigin = origin;
  else if (configured) allowOrigin = configured;
  headers.set('access-control-allow-origin', allowOrigin);
  headers.set('access-control-allow-methods', 'POST, GET, OPTIONS');
  headers.set('access-control-allow-headers', 'content-type, x-request-id');
  headers.set('vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}

function isAllowedOrigin(origin, configured) {
  if (!origin) return false;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  if (!configured) return false;
  if (origin === configured) return true;
  try {
    const a = new URL(origin);
    const b = new URL(configured);
    if (a.protocol === b.protocol && (a.hostname === b.hostname || a.hostname.endsWith('.' + b.hostname))) return true;
  } catch {}
  return false;
}

function checkOrigin(request, env) {
  const configured = typeof env.ALLOWED_ORIGIN === 'string' ? env.ALLOWED_ORIGIN.trim().replace(/\/+$/, '') : '';
  const origin = (request.headers.get('origin') || '').trim().replace(/\/+$/, '');
  if (!origin) return { ok: true };
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return { ok: true };
  if (configured) {
    return isAllowedOrigin(origin, configured)
      ? { ok: true }
      : { ok: false, error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin is not allowed' } };
  }
  const requestOrigin = new URL(request.url).origin;
  if (origin === requestOrigin) return { ok: true };
  return { ok: false, error: { code: 'ORIGIN_NOT_CONFIGURED', message: 'Set ALLOWED_ORIGIN' } };
}

async function readJson(request, maxBytes) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) { const e = new Error('Request body too large'); e.code = 'PAYLOAD_TOO_LARGE'; throw e; }
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { const e = new Error('Request body too large'); e.code = 'PAYLOAD_TOO_LARGE'; throw e; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
