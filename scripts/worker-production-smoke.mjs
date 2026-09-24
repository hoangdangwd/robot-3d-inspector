import assert from 'node:assert/strict';

const workerUrl = (process.env.COACH_WORKER_URL || 'https://robot-foundry-coach.hieudo831.workers.dev').replace(/\/$/, '');
const frontendOrigin = process.env.PRODUCTION_FRONTEND_ORIGIN || 'https://robot-foundry-7m7.pages.dev';

const healthResponse = await fetch(`${workerUrl}/health`);
assert.equal(healthResponse.status, 200, 'production health is 200');
const health = await healthResponse.json();
assert.equal(health.ok, true, 'production health is ok');
assert.equal(health.aiConfigured, true, 'OpenRouter key is configured');

const options = await fetch(`${workerUrl}/api/sandbox/interpret`, {
  method: 'OPTIONS',
  headers: { Origin: frontendOrigin, 'Access-Control-Request-Method': 'POST' },
});
assert.equal(options.status, 204, 'CORS preflight is accepted');
assert.equal(options.headers.get('access-control-allow-origin'), frontendOrigin, 'CORS returns exact frontend origin');

const valid = await fetch(`${workerUrl}/api/sandbox/interpret`, {
  method: 'POST',
  headers: { Origin: frontendOrigin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ transcript: 'jab', language: 'en-US', requestId: 'p9_valid_1' }),
});
assert.equal(valid.status, 200, 'valid production coaching request succeeds');
const validPayload = await valid.json();
assert.equal(validPayload.source, 'local_worker_fast_path', 'infrastructure smoke uses deterministic local fast path');
assert.equal(validPayload.intent?.kind, 'direct_command', 'valid request returns constrained direct command');
assert.equal(validPayload.intent?.actionId, 'jab', 'valid request returns expected action');

const invalid = await fetch(`${workerUrl}/api/sandbox/interpret`, {
  method: 'POST',
  headers: { Origin: frontendOrigin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ transcript: '', language: 'en-US', requestId: 'p9_invalid_1' }),
});
assert.equal(invalid.status, 422, 'invalid payload is rejected');

const blocked = await fetch(`${workerUrl}/api/sandbox/interpret`, {
  method: 'POST',
  headers: { Origin: 'https://not-the-frontend.example', 'Content-Type': 'application/json' },
  body: JSON.stringify({ transcript: 'jab', language: 'en-US', requestId: 'p9_blocked_1' }),
});
assert.equal(blocked.status, 403, 'untrusted origin is rejected');

console.log(`PASS: production Worker smoke; health, CORS, valid command, invalid payload and origin guard (${workerUrl}).`);

