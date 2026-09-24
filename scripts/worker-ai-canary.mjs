// Model-dependent production canary. Keep separate from deterministic Worker
// infrastructure smoke because provider availability and model output are not
// deterministic release infrastructure.
import assert from 'node:assert/strict';

if (process.env.RUN_AI_CANARY !== '1') {
  console.log('SKIP: AI canary disabled; set RUN_AI_CANARY=1 to exercise OpenRouter Jev output.');
  process.exit(0);
}

const workerUrl = (process.env.COACH_WORKER_URL || 'https://robot-foundry-coach.hieudo831.workers.dev').replace(/\/$/, '');
const origin = process.env.PRODUCTION_FRONTEND_ORIGIN || 'https://robot-foundry-7m7.pages.dev';
const requestId = `canary_${Date.now().toString(36)}`;

const response = await fetch(`${workerUrl}/api/sandbox/interpret`, {
  method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    transcript: 'Watch his right side and keep your distance.',
    language: 'en-US',
    requestId,
  }),
});
const payload = await response.json().catch(() => null);
assert.ok([200, 422].includes(response.status), `AI canary failed with ${response.status}: ${JSON.stringify(payload)}`);
assert.equal(payload?.source, 'openrouter_jev', 'canary must exercise the model path');
assert.equal(payload?.requestId, requestId, 'canary request id is preserved');
if (response.status === 200) {
  assert.ok(['direct_command', 'blackboard_override'].includes(payload?.intent?.kind), 'canary intent is constrained');
  assert.ok(Number.isFinite(payload?.intent?.confidence), 'canary confidence is numeric');
  console.log(`PASS: OpenRouter Jev canary returned a constrained ${payload.intent.kind} for ${workerUrl}.`);
} else {
  assert.equal(payload?.error?.code, 'MODEL_UNRECOGNIZED', 'unrecognized model output is a safe non-fatal result');
  console.log(`PASS: OpenRouter Jev canary exercised the model path; provider returned safe MODEL_UNRECOGNIZED for ${workerUrl}.`);
}

