// Jev Worker boundary tests. No Cloudflare account or model required.
import assert from 'node:assert/strict';
import worker from '../worker/coach-api.js';

let assertions = 0;
const expect = (value, message) => { assert.ok(value, message); assertions++; };
const request = (path, init = {}) => new Request(`https://example.test${path}`, init);

console.log('\n── Jev Worker boundary ──');

// Health endpoint
{
  const response = await worker.fetch(request('/health', { method: 'GET' }), {}, {});
  const body = await response.json();
  expect(response.status === 200 && body.ok === true && body.provider === 'openrouter_jev', 'health endpoint works');
}

// Boxing route remains available
{
  const response = await worker.fetch(request('/api/coach/interpret', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ transcript: 'jab', language: 'en-US', requestId: 'coach-1' }) }), {}, {});
  const body = await response.json();
  expect(response.status === 503 && body.error.code === 'OPENROUTER_UNAVAILABLE', 'fight route requires Jev key');
}
{
  const env = { OPENROUTER_API_KEY: 'test-key', OPENROUTER_FETCH: async () => new Response(JSON.stringify({ answers: { intent_type: { choice: 'direct_command', confidence: 0.95 }, action: { choice: 'hook_right', confidence: 0.93 }, override: { choice: 'none', confidence: 0.4 } } }), { status: 200 }) };
  const response = await worker.fetch(request('/api/coach/interpret', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ transcript: 'right hook', language: 'en-US', requestId: 'coach-2' }) }), env, {});
  const body = await response.json();
  expect(response.status === 200 && body.source === 'openrouter_jev' && body.intent.actionId === 'hook_right', 'fight command is a bounded Jev intent');
}
{
  const env = { OPENROUTER_API_KEY: 'test-key', OPENROUTER_FETCH: async () => new Response(JSON.stringify({ answers: { intent_type: { choice: 'live_tactic', confidence: 0.96 }, action: { choice: 'none', confidence: 0.4 }, override: { choice: 'none', confidence: 0.4 } } }), { status: 200 }) };
  const response = await worker.fetch(request('/api/coach/interpret', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ transcript: 'when he jabs always counter', language: 'en-US', requestId: 'coach-3' }) }), env, {});
  const body = await response.json();
  expect(response.status === 422 && body.error.code === 'JEV_INVALID_DECISION', 'persistent live tactic is rejected');
}
{
  const env = { OPENROUTER_API_KEY: 'test-key', OPENROUTER_FETCH: async () => new Response(JSON.stringify({ answers: { intent_type: { choice: 'unclear', confidence: 0.5 } } }), { status: 200 }) };
  const response = await worker.fetch(request('/api/coach/interpret', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ transcript: 'maybe', language: 'en-US', requestId: 'coach-4' }) }), env, {});
  const body = await response.json();
  expect(response.status === 422 && body.error.code === 'JEV_LOW_CONFIDENCE', 'low-confidence fight decision is rejected');
}
{
  const tactic = { schemaVersion: 2, id: 'strategic-counter', name: 'Strategic Counter', goal: 'Wait for the hook, then counter safely.', priority: .9, trigger: { type: 'enemy_attack_start', actionId: 'hook_right' }, phases: [{ id: 'counter', sequence: [{ intent: { type: 'counter', response: 'parry', targetZone: 'head' } }], branches: [] }], abort: [], repeatLimit: 1, timeoutTicks: 180 };
  const env = { OPENROUTER_API_KEY: 'test-key', OPENROUTER_FETCH: async () => new Response(JSON.stringify({ answers: { operation: { choice: 'replace_sequence_body_cross', confidence: 0.91 } } }), { status: 200 }) };
  const response = await worker.fetch(request('/api/coach/tactic-patch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ transcript: 'counter with a body cross', language: 'en-US', requestId: 'patch-1', baseRevision: 0, tactic }) }), env, {});
  const body = await response.json();
  expect(response.status === 200 && body.source === 'openrouter_jev' && body.patch.operations[0].actionIds[0] === 'body_cross', 'timeout proposal comes from Jev and stays reviewable');
}

// Sandbox interpret: method check
{
  const response = await worker.fetch(request('/api/sandbox/interpret', { method: 'GET' }), {}, {});
  expect(response.status === 405, 'GET is rejected');
}

// Sandbox interpret: bad JSON
{
  const response = await worker.fetch(request('/api/sandbox/interpret', { method: 'POST', body: '{bad' }), {}, {});
  expect(response.status === 400, 'malformed JSON is rejected');
}

// Sandbox interpret: bad language
{
  const response = await worker.fetch(request('/api/sandbox/interpret', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transcript: 'go', language: 'fr-FR', requestId: 'req-1', tick: 0 }),
  }), {}, {});
  const body = await response.json();
  expect(response.status === 422 && body.error.code === 'VALIDATION_ERROR', 'unsupported language rejected');
}

// CORS: Pages subdomain allowed, attacker rejected
{
  const env = { ALLOWED_ORIGIN: 'https://robot-foundry-7m7.pages.dev' };
  const preview = await worker.fetch(request('/api/sandbox/interpret', {
    method: 'OPTIONS',
    headers: { Origin: 'https://abc12345.robot-foundry-7m7.pages.dev' },
  }), env, {});
  expect(preview.status === 204 && preview.headers.get('access-control-allow-origin') === 'https://abc12345.robot-foundry-7m7.pages.dev', 'Pages preview subdomains allowed');

  const untrusted = await worker.fetch(request('/api/sandbox/interpret', {
    method: 'POST',
    headers: { Origin: 'https://attacker.pages.dev', 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript: 'go', language: 'en-US', requestId: 'r1', tick: 0 }),
  }), env, {});
  expect(untrusted.status === 403, 'untrusted domain rejected');
}

console.log(`\nPASS: ${assertions} assertions. Jev Worker boundary validated.\n`);
