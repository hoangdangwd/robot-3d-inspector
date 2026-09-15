// ─── Robot Foundry Coach Worker ────────────────────────────────────
// Optional Phase 4B fallback. The browser/local parser remains the fast path.
// This endpoint returns constrained intent data only; it never touches combat.

import { parseCoachText } from '../src/coaching/LocalCommandParser.js';
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
