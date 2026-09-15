// Phase 4B Worker boundary tests. No Cloudflare account or model required.
import assert from 'node:assert/strict';
import worker from '../worker/coach-api.js';

let assertions = 0;
const expect = (value, message) => { assert.ok(value, message); assertions++; };
const request = (path, init = {}) => new Request(`https://example.test${path}`, init);

console.log('\n── Coach Worker boundary ──');
{
  const response = await worker.fetch(request('/api/coach/interpret', { method: 'GET' }), {}, {});
  expect(response.status === 405, 'GET is rejected');
}
{
  const response = await worker.fetch(request('/api/coach/interpret', { method: 'POST', body: '{bad' }), {}, {});
  expect(response.status === 400, 'malformed JSON is rejected');
}
{
  const response = await worker.fetch(request('/api/coach/interpret', {
    method: 'POST', body: JSON.stringify({ transcript: 'When he hooks, counter body', language: 'en-US', requestId: 'req-1' }),
  }), {}, {});
  const body = await response.json();
  expect(response.status === 422 && body.error.code === 'LIVE_TACTIC_NOT_ALLOWED', 'live tactic mutation is rejected');
}
{
  const response = await worker.fetch(request('/api/coach/interpret', {
    method: 'POST', body: JSON.stringify({ transcript: 'do something complicated', language: 'en-US', requestId: 'req-2' }),
  }), {}, {});
  const body = await response.json();
  expect(response.status === 503 && body.error.code === 'AI_UNAVAILABLE', 'unconfigured AI returns structured fallback error');
  expect(body.error.requestId === 'req-2', 'request id is preserved without transcript persistence');
}
{
  const response = await worker.fetch(request('/api/coach/interpret', {
    method: 'POST', body: JSON.stringify({ transcript: 'jab', language: 'fr-FR', requestId: 'req-3' }),
  }), {}, {});
  const body = await response.json();
  expect(response.status === 422 && body.error.code === 'VALIDATION_ERROR', 'unsupported language is rejected');
}
{
  const response = await worker.fetch(request('/health', { method: 'GET' }), {}, {});
  const body = await response.json();
  expect(response.status === 200 && body.ok === true, 'health endpoint works');
}
{
  const env = {
    AI_MODEL: '@cf/test/model',
    AI: { run: async () => ({ response: JSON.stringify({ kind: 'direct_command', actionId: 'hook_right', confidence: .91, expiresInTicks: 18 }) }) },
  };
  const response = await worker.fetch(request('/api/coach/interpret', {
    method: 'POST', body: JSON.stringify({ transcript: 'hit him with the angle', language: 'en-US', requestId: 'req-ai' }),
  }), env, {});
  const body = await response.json();
  expect(response.status === 200 && body.intent.actionId === 'hook_right' && body.source === 'workers_ai', 'valid Workers AI intent is accepted');
}
{
  const env = { AI: { run: async () => ({ response: JSON.stringify({ kind: 'direct_command', actionId: 'delete_game', confidence: 1, expiresInTicks: 18 }) }) } };
  const response = await worker.fetch(request('/api/coach/interpret', {
    method: 'POST', body: JSON.stringify({ transcript: 'do the secret move', language: 'en-US', requestId: 'req-bad-ai' }),
  }), env, {});
  const body = await response.json();
  expect(response.status === 422 && body.error.code === 'MODEL_UNRECOGNIZED', 'invalid model action is rejected safely');
}
{
  const outputs = [
    '```json\n{"kind":"direct_command","actionId":"cross","confidence":0.9,"expiresInTicks":18}\n```',
    'Here is the JSON: {"kind":"blackboard_override","changes":{"preferredDistance":"far"},"confidence":0.9,"expiresInTicks":60}',
  ];
  for (const [index, modelOutput] of outputs.entries()) {
    const env = { AI: { run: async () => ({ response: modelOutput }) } };
    const response = await worker.fetch(request('/api/coach/interpret', {
      method: 'POST', body: JSON.stringify({ transcript: `ambiguous ${index}`, language: 'en-US', requestId: `req-shape-${index}` }),
    }), env, {});
    const body = await response.json();
    expect(response.status === 200 && body.intent, `model JSON shape ${index + 1} is safely extracted`);
  }
}
{
  const env = { AI: { run: async () => ({ response: '{"kind":"direct_command","actionId":"jab"' }) } };
  const response = await worker.fetch(request('/api/coach/interpret', {
    method: 'POST', body: JSON.stringify({ transcript: 'truncated output', language: 'en-US', requestId: 'req-truncated' }),
  }), env, {});
  const body = await response.json();
  expect(response.status === 422 && body.error.code === 'MODEL_UNRECOGNIZED', 'truncated model JSON becomes a bounded non-fatal result');
}
{
  const env = { AI: { run: async () => ({ response: 'x'.repeat(5000) }) } };
  const response = await worker.fetch(request('/api/coach/interpret', {
    method: 'POST', body: JSON.stringify({ transcript: 'oversized output', language: 'en-US', requestId: 'req-large-output' }),
  }), env, {});
  const body = await response.json();
  expect(response.status === 422 && body.error.code === 'MODEL_UNRECOGNIZED', 'oversized model output is rejected without parsing risk');
}
{
  const tactic = { schemaVersion: 1, id: 'hook-plan', name: 'Hook Plan', goal: '', trigger: { type: 'enemy_attack_start', actionId: 'hook_right' }, phases: [{ id: 'p1', sequence: [{ actionId: 'jab' }], branches: [] }], abort: [], repeatLimit: 1, timeoutTicks: 120 };
  const env = { AI: { run: async () => ({ response: JSON.stringify({ patch: { baseRevision: 2, operations: [{ type: 'replace_sequence', actionIds: ['slip_left', 'body_cross'] }] } }) }) } };
  const response = await worker.fetch(request('/api/coach/tactic-patch', { method: 'POST', body: JSON.stringify({ transcript: 'Use a slip then body cross', language: 'en-US', requestId: 'patch-1', baseRevision: 2, tactic }) }), env, {});
  const body = await response.json();
  expect(response.status === 200 && body.patch.operations[0].type === 'replace_sequence', 'Worker returns reviewed patch proposal');
  expect(body.previewTactic.phases[0].sequence[1].actionId === 'body_cross', 'Worker includes validated preview without auto-commit');
}
{
  const tactic = { schemaVersion: 2, id: 'strategy-plan', name: 'Strategy Plan', goal: 'Counter safely', trigger: { type: 'enemy_attack_start', actionId: 'hook_right' }, phases: [{ id: 'p1', sequence: [{ intent: { type: 'action', actionId: 'jab' } }], branches: [] }], abort: [], repeatLimit: 1, timeoutTicks: 120 };
  const env = { AI: { run: async () => ({ response: JSON.stringify({ patch: { baseRevision: 3, operations: [{ type: 'replace_intents', intents: [{ type: 'counter', response: 'parry', targetZone: 'head' }] }] } }) }) } };
  const response = await worker.fetch(request('/api/coach/tactic-patch', { method: 'POST', body: JSON.stringify({ transcript: 'counter with a parry', language: 'en-US', requestId: 'patch-v2', baseRevision: 3, tactic }) }), env, {});
  const body = await response.json();
  expect(response.status === 200 && body.previewTactic.schemaVersion === 2 && body.previewTactic.phases[0].sequence[0].intent.type === 'counter', 'Worker validates strategy-level v2 proposals');
}
{
  const env = { ALLOWED_ORIGIN: 'https://robot-foundry-7m7.pages.dev' };
  const preview = await worker.fetch(request('/api/coach/interpret', { method: 'OPTIONS', headers: { Origin: 'https://abc12345.robot-foundry-7m7.pages.dev' } }), env, {});
  expect(preview.status === 204 && preview.headers.get('access-control-allow-origin') === 'https://abc12345.robot-foundry-7m7.pages.dev', 'Pages preview subdomains are allowed by CORS');
  const untrusted = await worker.fetch(request('/api/coach/interpret', { method: 'POST', headers: { Origin: 'https://attacker.pages.dev', 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: 'jab', language: 'en-US' }) }), env, {});
  expect(untrusted.status === 403, 'untrusted domain is rejected');
}

console.log(`\nPASS: ${assertions} assertions. Coach Worker boundary validated.\n`);
