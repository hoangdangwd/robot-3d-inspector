// ─── Robot Foundry Coach Worker ────────────────────────────────────
// Optional Phase 4B fallback. The browser/local parser remains the fast path.
// This endpoint returns constrained intent data only; it never touches combat.

import { parseCoachText } from '../src/coaching/LocalCommandParser.js';
import { parseSandboxCommand, parseSandboxPlanCommand } from '../src/sandbox/SandboxCommandParser.js';
import {
  createSandboxIntent,
  SandboxIntentSource,
} from '../src/sandbox/SandboxIntent.js';
import { createSandboxPlan } from '../src/sandbox/SandboxPlan.js';
import { validateTactic, validateTacticV2 } from '../src/tactics/TacticSchema.js';
import { validateTacticPatch, applyTacticPatch } from '../src/tactics/TacticPatch.js';

const ALLOWED_LANGUAGES = new Set(['en-US', 'vi-VN']);
const ACTIONS = new Set([
  'jab', 'cross', 'hook_left', 'hook_right', 'uppercut_left', 'uppercut_right',
  'body_jab', 'body_cross', 'overhand', 'feint_jab', 'guard_high', 'guard_low',
  'parry_left', 'parry_right', 'slip_left', 'slip_right', 'duck', 'roll',
]);
const DISTANCES = new Set(['close', 'mid', 'far']);
const ZONES = new Set(['any', 'head', 'body']);
const TEMPOS = new Set(['patient', 'normal', 'high']);
const MAX_MODEL_OUTPUT_CHARS = 4096;
const JEV_CONFIDENCE_THRESHOLD = .72;
const SANDBOX_ACTIONS = new Set(['move', 'stop', 'aim', 'fire', 'attack_nearest', 'unsupported']);
const SANDBOX_COMMANDS = new Set([
  'move', 'stop', 'aim', 'fire', 'move_then_fire', 'retreat_and_fire',
  'hold_and_fire', 'patrol_square', 'attack_move', 'attack_nearest', 'unsupported',
]);
const SANDBOX_DIRECTIONS = new Set([
  'clock_12', 'clock_1', 'clock_2', 'clock_3', 'clock_4', 'clock_5', 'clock_6',
  'clock_7', 'clock_8', 'clock_9', 'clock_10', 'clock_11',
  'relative_forward', 'relative_right', 'relative_behind', 'relative_left', 'none',
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), request, env);
    if (url.pathname === '/health' && request.method === 'GET') {
      return cors(json({ ok: true, service: 'robot-foundry-coach', aiConfigured: Boolean(env.AI) }), request, env);
    }
    if (url.pathname === '/api/coach/tactic-patch') {
      return cors(await handleTacticPatch(request, env), request, env);
    }
    if (url.pathname === '/api/sandbox/interpret') {
      return cors(await handleSandboxInterpret(request, env), request, env);
    }
    if (url.pathname !== '/api/coach/interpret') {
      return cors(json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404), request, env);
    }
    if (request.method !== 'POST') {
      return cors(json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } }, 405), request, env);
    }

    const originResult = checkOrigin(request, env);
    if (!originResult.ok) return cors(json({ error: originResult.error }, 403), request, env);

    let input;
    try {
      input = await readJson(request, 8192);
    } catch (error) {
      return cors(json({ error: { code: error.code || 'INVALID_JSON', message: error.message } }, 400), request, env);
    }
    const validation = validateInput(input);
    if (!validation.ok) return cors(json({ error: validation.error }, 422), request, env);

    const { transcript, language, requestId } = validation.value;
    const local = parseCoachText(transcript, { language, fighterId: 'fighter_a', tick: 0 });
    if (local.kind !== 'unrecognized') {
      return cors(json({ ok: true, requestId, source: 'local_worker_fast_path', intent: stripIntent(local) }), request, env);
    }
    if (local.reason === 'persistent_tactic_not_allowed_live') {
      return cors(json({ error: { code: 'LIVE_TACTIC_NOT_ALLOWED', message: 'Persistent tactics require Time-out', requestId } }, 422), request, env);
    }
    if (!env.AI) {
      return cors(json({ error: { code: 'AI_UNAVAILABLE', message: 'No Workers AI binding configured; use local text commands', requestId } }, 503), request, env);
    }

    try {
      const modelResult = await env.AI.run(env.AI_MODEL || '@cf/meta/llama-3.2-3b-instruct', {
        messages: [
          { role: 'system', content: systemPrompt() },
          { role: 'user', content: JSON.stringify({ transcript, language }) },
        ],
        temperature: 0,
        max_tokens: 180,
      });
      const intent = validateModelIntent(extractModelText(modelResult), { language, requestId });
      if (!intent) {
        return cors(json({
          ok: false,
          source: 'workers_ai',
          requestId,
          error: { code: 'MODEL_UNRECOGNIZED', message: 'No safe Live Fight intent was recognized; continue with local commands', requestId },
        }, 422), request, env);
      }
      return cors(json({ ok: true, requestId, source: 'workers_ai', intent }), request, env);
    } catch (error) {
      console.error('Workers AI error in interpret:', error);
      return cors(json({ error: { code: 'AI_REQUEST_FAILED', message: 'Coach fallback unavailable; continue with local commands', requestId } }, 502), request, env);
    }
  },
};

function systemPrompt() {
  return `You interpret one short Robot Foundry Live Fight coaching utterance. Return JSON only.\n` +
    `Allowed kinds: direct_command or blackboard_override. Never return a tactic, condition, sequence, code, damage, transform, animation, or physics instruction.\n` +
    `Direct command shape: {"kind":"direct_command","actionId": one allowed action, "confidence": number 0..1, "expiresInTicks": integer 6..60}.\n` +
    `Override shape: {"kind":"blackboard_override","changes": object, "confidence": number 0..1, "expiresInTicks": integer 30..600}.\n` +
    `Allowed actions: jab,cross,hook_left,hook_right,uppercut_left,uppercut_right,body_jab,body_cross,overhand,feint_jab,guard_high,guard_low,parry_left,parry_right,slip_left,slip_right,duck,roll.\n` +
    `Allowed changes: preferredDistance close|mid|far; targetZone any|head|body; tempo patient|normal|high; aggression/risk/guardBias numbers -1..1; avoidActions array of allowed actions.\n` +
    `If ambiguous or asks for a persistent when/if/after tactic, return {"kind":"unrecognized"}.`;
}

function validateInput(input) {
  if (!input || typeof input !== 'object') return fail('VALIDATION_ERROR', 'Body must be an object');
  const transcript = typeof input.transcript === 'string' ? input.transcript.trim() : '';
  const language = input.language;
  const requestId = typeof input.requestId === 'string' ? input.requestId : '';
  if (!transcript || transcript.length > 256) return fail('VALIDATION_ERROR', 'transcript must be 1–256 characters');
  if (!ALLOWED_LANGUAGES.has(language)) return fail('VALIDATION_ERROR', 'language must be en-US or vi-VN');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(requestId)) return fail('VALIDATION_ERROR', 'requestId is invalid');
  return { ok: true, value: { transcript, language, requestId } };
}

function parseModelJson(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_MODEL_OUTPUT_CHARS) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidates = [trimmed];
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) candidates.push(fence[1].trim());
  const objectCandidate = extractFirstJsonObject(trimmed);
  if (objectCandidate) candidates.push(objectCandidate);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* Continue to the next bounded candidate. */ }
  }
  return null;
}

function extractFirstJsonObject(text) {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (char === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function validateModelIntent(raw, context) {
  const parsed = parseModelJson(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  const confidence = Number(parsed.confidence);
  const expiresInTicks = Number(parsed.expiresInTicks);
  if (!Number.isFinite(confidence) || confidence < .7 || confidence > 1 ||
      !Number.isInteger(expiresInTicks) || expiresInTicks < 6 || expiresInTicks > 600) return null;

  if (parsed.kind === 'direct_command' && ACTIONS.has(parsed.actionId)) {
    return {
      kind: 'direct_command', commandId: `remote_${context.requestId}`,
      fighterId: 'fighter_a', language: context.language, transcript: '',
      createdAt: 0, expiresAt: expiresInTicks, priority: confidence,
      confidence, actionId: parsed.actionId,
    };
  }
  if (parsed.kind !== 'blackboard_override' || !parsed.changes || typeof parsed.changes !== 'object') return null;
  const changes = validateChanges(parsed.changes);
  if (!changes) return null;
  return {
    kind: 'blackboard_override', commandId: `remote_${context.requestId}`,
    fighterId: 'fighter_a', language: context.language, transcript: '',
    createdAt: 0, expiresAt: expiresInTicks, priority: confidence,
    confidence, changes,
  };
}

function validateChanges(changes) {
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

function extractModelText(result) {
  if (typeof result === 'string') return result;
  if (typeof result?.response === 'string') return result.response;
  return '';
}

function stripIntent(intent) {
  const { kind, actionId, changes, confidence, expiresAt, priority, commandId, fighterId, language, createdAt } = intent;
  return { kind, actionId, changes, confidence, expiresAt, priority, commandId, fighterId, language, createdAt };
}

async function handleSandboxInterpret(request, env) {
  if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } }, 405);
  const originResult = checkOrigin(request, env);
  if (!originResult.ok) return json({ error: originResult.error }, 403);

  let input;
  try { input = await readJson(request, 8192); } catch (error) {
    return json({ error: { code: error.code || 'INVALID_JSON', message: error.message } }, 400);
  }
  const validation = validateSandboxInput(input);
  if (!validation.ok) return json({ error: validation.error }, 422);
  const { transcript, language, requestId, currentHeading, tick } = validation.value;

  const localPlan = parseSandboxPlanCommand(transcript, {
    source: SandboxIntentSource.LOCAL,
    currentHeading,
    tick,
  });
  if (localPlan.kind === 'sandbox_plan') {
    return json({ ok: true, requestId, source: 'local_worker_fast_path', plan: localPlan.plan });
  }
  const local = parseSandboxCommand(transcript, {
    source: SandboxIntentSource.LOCAL,
    currentHeading,
    tick,
  });
  if (local.kind === 'sandbox_intent') {
    return json({ ok: true, requestId, source: 'local_worker_fast_path', intent: local.intent });
  }

  if (!env.OPENROUTER_API_KEY) {
    return json({
      error: {
        code: 'OPENROUTER_UNAVAILABLE',
        message: 'OpenRouter is not configured; use a short local Sandbox command',
        requestId,
      },
    }, 503);
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
        state: {
          player_command: transcript,
          language,
          current_heading_radians: currentHeading,
          current_tick: tick,
          game: 'Robot Foundry Zombie Survival Sandbox',
          allowed_actions: 'move, stop, aim, fire, attack_nearest, attack_move, move_then_fire, retreat_and_fire, hold_and_fire, patrol_square. No damage, transforms, animation or code may be returned.',
        },
        questions: sandboxJevQuestions(),
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return json({ error: { code: 'OPENROUTER_REQUEST_FAILED', message: 'Jev command interpretation failed', requestId } }, 502);
    }
    const decision = createSandboxDecisionFromJev(payload, { requestId, currentHeading, language, tick });
    if (!decision) {
      return json({ error: { code: 'JEV_INVALID_DECISION', message: 'Jev returned no safe Sandbox intent', requestId } }, 422);
    }
    return json({
      ok: true,
      requestId,
      source: 'openrouter_jev',
      ...decision,
      usage: safeUsage(payload?.usage),
    });
  } catch (error) {
    if (error?.message === 'JEV_LOW_CONFIDENCE') {
      return json({ error: { code: 'JEV_LOW_CONFIDENCE', message: 'Jev was not confident enough to issue a Sandbox command', requestId } }, 422);
    }
    console.error('OpenRouter Jev error in Sandbox interpret:', error);
    return json({ error: { code: 'OPENROUTER_REQUEST_FAILED', message: 'Jev command interpretation unavailable', requestId } }, 502);
  }
}

function validateSandboxInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('VALIDATION_ERROR', 'Body must be an object');
  const transcript = typeof input.transcript === 'string' ? input.transcript.trim() : '';
  const language = input.language;
  const requestId = typeof input.requestId === 'string' ? input.requestId : '';
  const currentHeading = input.currentHeading === undefined ? 0 : Number(input.currentHeading);
  const tick = input.tick === undefined ? 0 : Number(input.tick);
  if (!transcript || transcript.length > 256) return fail('VALIDATION_ERROR', 'transcript must be 1–256 characters');
  if (!ALLOWED_LANGUAGES.has(language)) return fail('VALIDATION_ERROR', 'language must be en-US or vi-VN');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(requestId)) return fail('VALIDATION_ERROR', 'requestId is invalid');
  if (!Number.isFinite(currentHeading)) return fail('VALIDATION_ERROR', 'currentHeading must be finite');
  if (!Number.isSafeInteger(tick) || tick < 0) return fail('VALIDATION_ERROR', 'tick must be a non-negative integer');
  return { ok: true, value: { transcript, language, requestId, currentHeading, tick } };
}

function sandboxJevQuestions() {
  return {
    action: {
      type: 'choice',
      instructions: 'Classify a single Sandbox action. Use unsupported for a multi-step mission; use attack_nearest only when the local simulation can select the nearest zombie.',
      criteria: {
        move: 'The player asks the robot to move, go, walk, advance, retreat, strafe, or head in a direction.',
        stop: 'The player asks the robot to stop, halt, stand still, or hold position.',
        fire: 'The player asks the robot to shoot, fire, blast, use the beam, or fire a laser in a direction.',
        aim: 'The player asks the robot to turn and face a direction without moving or firing.',
        attack_nearest: 'The player asks the robot to attack the nearest zombie.',
        unsupported: 'The command is multi-step, ambiguous, missing a direction, asks for unsupported behavior, or requests game-state mutation.',
      },
    },
    command: {
      type: 'choice',
      instructions: 'Choose the safest bounded mission matching the whole command. Never invent targets, damage or code.',
      criteria: {
        move: 'Move in one direction.',
        stop: 'Stop and hold position.',
        aim: 'Turn to face one direction.',
        fire: 'Fire in one direction.',
        move_then_fire: 'Move in a direction, then fire.',
        retreat_and_fire: 'Move backward relative to current heading, then fire.',
        hold_and_fire: 'Hold position, then fire.',
        patrol_square: 'Patrol a fixed four-side square and stop.',
        attack_move: 'Move in a direction, then attack the nearest zombie selected locally.',
        attack_nearest: 'Fire at the nearest zombie using local target selection.',
        unsupported: 'Ambiguous or unsafe command.',
      },
    },
    direction: {
      type: 'choice',
      instructions: 'Which direction is explicitly requested? Use absolute clock directions when present, otherwise relative directions. Choose none only for stop or when no direction is required.',
      criteria: {
        clock_12: '12 o’clock, north, straight ahead in the world.',
        clock_1: '1 o’clock or slightly northeast.',
        clock_2: '2 o’clock or northeast/east-northeast.',
        clock_3: '3 o’clock or east/right in the world.',
        clock_4: '4 o’clock or southeast/east-southeast.',
        clock_5: '5 o’clock or slightly southeast.',
        clock_6: '6 o’clock or south/behind in the world.',
        clock_7: '7 o’clock or slightly southwest.',
        clock_8: '8 o’clock or southwest/west-southwest.',
        clock_9: '9 o’clock or west/left in the world.',
        clock_10: '10 o’clock or northwest/west-northwest.',
        clock_11: '11 o’clock or slightly northwest.',
        relative_forward: 'Forward, ahead, or straight relative to the robot heading.',
        relative_right: 'Right relative to the robot heading.',
        relative_behind: 'Behind, backward, or back relative to the robot heading.',
        relative_left: 'Left relative to the robot heading.',
        none: 'No direction is required or the command is stop.',
      },
    },
    direction_2: {
      type: 'choice',
      instructions: 'Choose the second direction for a two-step mission. Use none when it should reuse the first direction.',
      criteria: {
        clock_12: '12 o’clock / north.', clock_1: '1 o’clock.', clock_2: '2 o’clock.', clock_3: '3 o’clock / east.',
        clock_4: '4 o’clock.', clock_5: '5 o’clock.', clock_6: '6 o’clock / south.', clock_7: '7 o’clock.',
        clock_8: '8 o’clock.', clock_9: '9 o’clock / west.', clock_10: '10 o’clock.', clock_11: '11 o’clock.',
        relative_forward: 'Forward.', relative_right: 'Right.', relative_behind: 'Behind.', relative_left: 'Left.', none: 'Reuse the first direction.',
      },
    },
  };
}

function pickSandboxChoice(command, action) {
  const commandOk = command?.type === 'choice' && SANDBOX_COMMANDS.has(command.choice) && command.choice !== 'unsupported';
  if (commandOk) return command;
  const actionOk = action?.type === 'choice' && SANDBOX_ACTIONS.has(action.choice) && action.choice !== 'unsupported';
  if (actionOk) return action;
  return command?.type === 'choice' ? command : action;
}

function createSandboxDecisionFromJev(payload, context) {
  const answers = payload?.answers || {};
  const action = answers.action;
  const command = answers.command;
  const direction = answers.direction;
  const direction2 = answers.direction_2;
  const selected = pickSandboxChoice(command, action);
  const choice = selected?.choice;
  const confidence = Number(selected?.confidence ?? 0);
  const directionConfidence = Number(direction?.confidence ?? 0);
  if (!selected || selected.type !== 'choice' || (!SANDBOX_ACTIONS.has(choice) && !SANDBOX_COMMANDS.has(choice))) return null;
  if (confidence < JEV_CONFIDENCE_THRESHOLD) throw new Error('JEV_LOW_CONFIDENCE');
  if (choice === 'unsupported') return null;
  if (choice === 'attack_nearest') {
    return {
      intent: createSandboxIntent({
        type: 'attack_target',
        targetId: 'nearest',
        source: SandboxIntentSource.AI,
        priority: confidence,
        createdAt: context.tick,
        expiresAt: context.tick + 60,
      }),
    };
  }
  const needsPrimaryDirection = !['stop', 'hold_and_fire'].includes(choice);
  const primaryDirection = direction?.type === 'choice' && SANDBOX_DIRECTIONS.has(direction.choice) ? direction : null;
  const secondaryDirection = direction2?.type === 'choice' && SANDBOX_DIRECTIONS.has(direction2.choice) ? direction2 : null;
  if (needsPrimaryDirection && !primaryDirection) return null;
  if (needsPrimaryDirection && primaryDirection.choice === 'none') return null;
  if (needsPrimaryDirection && directionConfidence < JEV_CONFIDENCE_THRESHOLD) throw new Error('JEV_LOW_CONFIDENCE');
  if (!['move', 'stop', 'aim', 'fire'].includes(choice)) {
    const plan = createSandboxPlanFromJev(choice, confidence, primaryDirection?.choice, secondaryDirection?.choice, context);
    return plan ? { plan } : null;
  }
  if (!primaryDirection) return null;

  const raw = {
    type: choice,
    source: SandboxIntentSource.AI,
    priority: Math.min(1, Math.max(0, confidence)),
    createdAt: context.tick,
    expiresAt: context.tick + ({ move: 60, stop: 18, aim: 60, fire: 12 }[choice] || 18),
  };
  if (choice !== 'stop') raw.angle = sandboxDirectionAngle(direction.choice, context.currentHeading);
  return { intent: createSandboxIntent(raw) };
}

function createSandboxPlanFromJev(choice, confidence, firstLabel, secondLabel, context) {
  const usableFirst = firstLabel && firstLabel !== 'none' ? firstLabel : null;
  const usableSecond = secondLabel && secondLabel !== 'none' ? secondLabel : usableFirst;
  if (!usableSecond && ['move_then_fire', 'retreat_and_fire', 'hold_and_fire', 'patrol_square'].includes(choice)) return null;
  const first = usableFirst ? sandboxDirectionAngle(usableFirst, context.currentHeading) : sandboxDirectionAngle(usableSecond, context.currentHeading);
  const second = sandboxDirectionAngle(usableSecond, context.currentHeading);
  const move = (angle, durationTicks = 90) => ({ type: 'move', angle, durationTicks });
  const fire = angle => ({ type: 'fire', angle, durationTicks: 24 });
  const stop = () => ({ type: 'stop', durationTicks: 36 });
  let steps;
  if (choice === 'move_then_fire') steps = [move(first), fire(second)];
  else if (choice === 'retreat_and_fire') steps = [move(sandboxDirectionAngle('relative_behind', context.currentHeading)), fire(second)];
  else if (choice === 'hold_and_fire') steps = [stop(), fire(second)];
  else if (choice === 'patrol_square') steps = [move(first, 72), move(first + Math.PI / 2, 72), move(first + Math.PI, 72), move(first - Math.PI / 2, 72), stop()];
  else if (choice === 'attack_move') steps = [move(first), { type: 'attack_target', targetId: 'nearest', durationTicks: 30 }];
  else return null;
  return createSandboxPlan({ source: SandboxIntentSource.AI, priority: confidence, createdAt: context.tick, steps });
}

function sandboxDirectionAngle(label, heading) {
  const clock = {
    clock_12: 0, clock_1: Math.PI / 6, clock_2: Math.PI / 3, clock_3: Math.PI / 2,
    clock_4: (2 * Math.PI) / 3, clock_5: (5 * Math.PI) / 6, clock_6: Math.PI,
    clock_7: (7 * Math.PI) / 6, clock_8: (4 * Math.PI) / 3, clock_9: (3 * Math.PI) / 2,
    clock_10: (5 * Math.PI) / 3, clock_11: (11 * Math.PI) / 6,
  };
  const relative = {
    relative_forward: 0,
    relative_right: Math.PI / 2,
    relative_behind: Math.PI,
    relative_left: -Math.PI / 2,
  };
  const angle = clock[label] ?? (heading + relative[label]);
  const normalized = angle % (Math.PI * 2);
  return normalized < 0 ? normalized + Math.PI * 2 : normalized;
}

function safeUsage(usage) {
  if (!usage || typeof usage !== 'object') return undefined;
  const result = {};
  for (const key of ['input_tokens', 'output_tokens', 'cost']) {
    if (Number.isFinite(Number(usage[key]))) result[key] = Number(usage[key]);
  }
  return Object.keys(result).length ? result : undefined;
}

async function handleTacticPatch(request, env) {
  if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } }, 405);
  const originResult = checkOrigin(request, env);
  if (!originResult.ok) return json({ error: originResult.error }, 403);
  let input;
  try { input = await readJson(request, 16384); } catch (error) {
    return json({ error: { code: error.code || 'INVALID_JSON', message: error.message } }, 400);
  }
  if (!input || typeof input !== 'object' || typeof input.transcript !== 'string' || input.transcript.trim().length < 1 || input.transcript.length > 256 ||
      !ALLOWED_LANGUAGES.has(input.language) || !/^[a-zA-Z0-9_-]{1,64}$/.test(input.requestId) || !Number.isInteger(input.baseRevision) || input.baseRevision < 0) {
    return json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid tactic patch request' } }, 422);
  }
  const base = input.tactic?.schemaVersion === 2 ? validateTacticV2(input.tactic) : validateTactic(input.tactic);
  if (!base.ok) return json({ error: { code: 'INVALID_BASE_TACTIC', message: 'Base tactic is invalid' } }, 422);
  if (!env.AI) return json({ error: { code: 'AI_UNAVAILABLE', message: 'No Workers AI binding configured', requestId: input.requestId } }, 503);
  try {
    const result = await env.AI.run(env.AI_MODEL || '@cf/meta/llama-3.2-3b-instruct', {
      messages: [
        { role: 'system', content: tacticPatchPrompt() },
        { role: 'user', content: JSON.stringify({ transcript: input.transcript, language: input.language, baseRevision: input.baseRevision, tactic: base.value }) },
      ],
      temperature: 0,
      max_tokens: 450,
    });
    const raw = extractModelText(result);
    const parsed = parseModelJson(raw);
    if (!parsed) return json({ error: { code: 'INVALID_MODEL_OUTPUT', message: 'Model returned malformed proposal', requestId: input.requestId } }, 502);
    const normalizedPatch = normalizeModelPatch(parsed.patch || parsed, input.baseRevision);
    const patch = validateTacticPatch(normalizedPatch, { baseRevision: input.baseRevision });
    if (!patch.ok) return json({ error: { code: 'INVALID_MODEL_PATCH', message: patch.error, requestId: input.requestId } }, 502);
    const preview = applyTacticPatch(base.value, patch.value);
    if (!preview.ok) return json({ error: { code: 'INVALID_PATCH_PREVIEW', message: 'Patch preview failed validation', requestId: input.requestId } }, 502);
    return json({ ok: true, requestId: input.requestId, source: 'workers_ai', patch: patch.value, previewTactic: preview.value });
  } catch (error) {
    console.error('Workers AI error in tactic patch:', error);
    return json({ error: { code: 'AI_REQUEST_FAILED', message: 'Tactic proposal unavailable', requestId: input.requestId } }, 502);
  }
}

function normalizeModelPatch(rawPatch, baseRevision) {
  if (!rawPatch || typeof rawPatch !== 'object') return null;
  const rawOps = Array.isArray(rawPatch.operations) ? rawPatch.operations : [];
  const operations = rawOps.map(op => {
    if (!op || typeof op !== 'object') return op;
    const type = op.type || op.op;
    const normalized = { ...op, type };
    delete normalized.op;
    if (type === 'set_trigger' && op.value && !op.actionId) normalized.actionId = op.value;
    if (type === 'replace_sequence' && op.value && !op.actionIds) {
      normalized.actionIds = Array.isArray(op.value) ? op.value : [op.value];
    }
    return normalized;
  });
  return { baseRevision, operations };
}

function tacticPatchPrompt() {
  return `You propose one bounded patch for a Robot Foundry Time-out tactic. Return JSON only:
{"patch":{"baseRevision":0,"operations":[{"type":"replace_sequence","actionIds":["hook_right"]}]}}
Allowed operation types:
- {"type":"set_name","value":"New Name"}
- {"type":"set_trigger","actionId":"jab"}
- {"type":"replace_sequence","actionIds":["parry_left","hook_right"]}
- {"type":"replace_intents","intents":[{"type":"counter","response":"parry","targetZone":"head"}]}
- {"type":"set_abort_near_edge","value":true}
- {"type":"set_repeat_limit","value":1}
- {"type":"set_timeout_ticks","value":180}
Only use registered actions: jab, cross, hook_left, hook_right, uppercut_left, uppercut_right, body_jab, body_cross, overhand, feint_jab, guard_high, guard_low, parry_left, parry_right, slip_left, slip_right, duck, roll.
Never commit. Do not return code or markdown outside the json.`;
}

async function readJson(request, maxBytes) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) { const error = new Error('Request body too large'); error.code = 'PAYLOAD_TOO_LARGE'; throw error; }
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { const error = new Error('Request body too large'); error.code = 'PAYLOAD_TOO_LARGE'; throw error; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function isAllowedOrigin(origin, configured) {
  if (!origin) return false;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  if (!configured) return false;
  if (origin === configured) return true;
  try {
    const originUrl = new URL(origin);
    const configuredUrl = new URL(configured);
    if (originUrl.protocol === configuredUrl.protocol &&
        (originUrl.hostname === configuredUrl.hostname || originUrl.hostname.endsWith('.' + configuredUrl.hostname))) {
      return true;
    }
  } catch {}
  return false;
}

function checkOrigin(request, env) {
  const configured = typeof env.ALLOWED_ORIGIN === 'string' ? env.ALLOWED_ORIGIN.trim().replace(/\/+$/, '') : '';
  const origin = (request.headers.get('origin') || '').trim().replace(/\/+$/, '');
  if (!origin) return { ok: true };
  const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (localOrigin) return { ok: true };
  if (configured) {
    return isAllowedOrigin(origin, configured)
      ? { ok: true }
      : { ok: false, error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin is not allowed' } };
  }
  const requestOrigin = new URL(request.url).origin;
  if (origin === requestOrigin) return { ok: true };
  return { ok: false, error: { code: 'ORIGIN_NOT_CONFIGURED', message: 'Set ALLOWED_ORIGIN before cross-origin use' } };
}
function fail(code, message) { return { ok: false, error: { code, message } }; }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }); }
function cors(response, request, env) {
  const headers = new Headers(response.headers);
  const configured = typeof env.ALLOWED_ORIGIN === 'string' && env.ALLOWED_ORIGIN
    ? env.ALLOWED_ORIGIN.trim().replace(/\/+$/, '')
    : '';
  const origin = (request.headers.get('origin') || '').trim().replace(/\/+$/, '');
  let allowOrigin = '*';
  if (origin && isAllowedOrigin(origin, configured)) {
    allowOrigin = origin;
  } else if (configured) {
    allowOrigin = configured;
  }
  headers.set('access-control-allow-origin', allowOrigin);
  headers.set('access-control-allow-methods', 'POST, GET, OPTIONS');
  headers.set('access-control-allow-headers', 'content-type, x-request-id');
  headers.set('vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}
