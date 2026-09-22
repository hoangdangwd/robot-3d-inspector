// OpenRouter Jev Sandbox command boundary tests. No real key or network required.
import assert from 'node:assert/strict';
import worker from '../worker/coach-api.js';

let assertions = 0;
const expect = (value, message) => { assert.ok(value, message); assertions++; };
const request = (body, headers = {}) => new Request('https://example.test/api/sandbox/interpret', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});
const baseBody = {
  transcript: 'advance toward the morning light',
  language: 'en-US',
  requestId: 'sandbox-1',
  currentHeading: 0,
  tick: 120,
};

console.log('\n── OpenRouter Jev Sandbox boundary ──');

{
  const response = await worker.fetch(request({ ...baseBody, transcript: 'move east' }), {}, {});
  const body = await response.json();
  expect(response.status === 200, 'known Sandbox commands use the worker local fast path');
  expect(body.source === 'local_worker_fast_path' && body.intent.type === 'move', 'local worker output is a Sandbox intent');
}

{
  const response = await worker.fetch(request(baseBody), {}, {});
  const body = await response.json();
  expect(response.status === 503 && body.error.code === 'OPENROUTER_UNAVAILABLE', 'missing OpenRouter key returns a non-fatal structured error');
}

{
  let captured;
  const env = {
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_JEV_MODEL: 'typesafe/jev-1.13',
    OPENROUTER_SITE_URL: 'https://robot-foundry.example',
    OPENROUTER_APP_NAME: 'Robot Foundry',
    OPENROUTER_FETCH: async (url, init) => {
      captured = { url, init, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({
        id: 'gen-dec-test',
        model: 'typesafe/jev-1.13-20260917',
        provider: 'TypeSafe',
        answers: {
          action: { type: 'choice', choice: 'move', confidence: 0.96, probabilities: { move: 0.96, stop: 0.01, fire: 0.01, unsupported: 0.02 } },
          direction: { type: 'choice', choice: 'clock_3', confidence: 0.94, probabilities: { clock_3: 0.94, none: 0.06 } },
        },
        usage: { input_tokens: 320, output_tokens: 20, cost: 0.000014 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  };
  const response = await worker.fetch(request(baseBody), env, {});
  const body = await response.json();
  expect(response.status === 200 && body.source === 'openrouter_jev', 'Jev decision is accepted through OpenRouter');
  expect(body.intent.type === 'move' && Math.abs(body.intent.angle - Math.PI / 2) < 1e-9, 'Jev labels are converted to a validated eastward move intent');
  expect(captured.url === 'https://openrouter.ai/api/alpha/decisions', 'worker calls the OpenRouter Decisions endpoint');
  expect(captured.init.headers.Authorization === 'Bearer test-key', 'OpenRouter key stays in the server-side Authorization header');
  expect(captured.body.model === 'typesafe/jev-1.13' && captured.body.questions.action.type === 'choice', 'request uses the configured Jev model and typed choice questions');
}

{
  const env = {
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_FETCH: async () => new Response(JSON.stringify({
      answers: {
        action: { type: 'choice', choice: 'fire', confidence: 0.51, probabilities: { fire: 0.51, unsupported: 0.49 } },
        direction: { type: 'choice', choice: 'clock_12', confidence: 0.99, probabilities: { clock_12: 0.99 } },
      },
      model: 'typesafe/jev-1.13-20260917',
      usage: { input_tokens: 200, output_tokens: 10, cost: 0.00001 },
    }), { status: 200 }),
  };
  const response = await worker.fetch(request(baseBody), env, {});
  const body = await response.json();
  expect(response.status === 422 && body.error.code === 'JEV_LOW_CONFIDENCE', 'low-confidence Jev action never reaches the simulation');
}

{
  const env = {
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_FETCH: async () => new Response(JSON.stringify({
      answers: {
        action: { type: 'choice', choice: 'delete_game', confidence: 1, probabilities: { delete_game: 1 } },
        direction: { type: 'choice', choice: 'clock_12', confidence: 1, probabilities: { clock_12: 1 } },
      },
      model: 'typesafe/jev-1.13-20260917',
      usage: { input_tokens: 200, output_tokens: 10, cost: 0.00001 },
    }), { status: 200 }),
  };
  const response = await worker.fetch(request(baseBody), env, {});
  const body = await response.json();
  expect(response.status === 422 && body.error.code === 'JEV_INVALID_DECISION', 'unknown Jev labels are rejected at the boundary');
}

{
  const env = {
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_FETCH: async () => new Response(JSON.stringify({
      answers: {
        action: { type: 'choice', choice: 'unsupported', confidence: 0.9, probabilities: { unsupported: 0.9 } },
        command: { type: 'choice', choice: 'move_then_fire', confidence: 0.93, probabilities: { move_then_fire: 0.93 } },
        direction: { type: 'choice', choice: 'clock_3', confidence: 0.95, probabilities: { clock_3: 0.95 } },
        direction_2: { type: 'choice', choice: 'clock_12', confidence: 0.94, probabilities: { clock_12: 0.94 } },
      },
      model: 'typesafe/jev-1.13-20260917',
      usage: { input_tokens: 280, output_tokens: 18, cost: 0.000012 },
    }), { status: 200 }),
  };
  const response = await worker.fetch(request({ ...baseBody, transcript: 'go toward the morning light then blast whatever is ahead' }), env, {});
  const body = await response.json();
  expect(response.status === 200 && body.plan?.steps?.length === 2, 'compound Jev command becomes a bounded plan');
  expect(body.plan.steps[0].type === 'move' && body.plan.steps[1].type === 'fire', 'plan keeps move then fire order');
  expect(Math.abs(body.plan.steps[0].angle - Math.PI / 2) < 1e-9, 'first plan direction is east');
  expect(body.plan.steps[1].angle === 0, 'second plan direction is north');
  expect(body.intent === undefined, 'compound Jev output is a plan, not a raw intent');
}

{
  const env = {
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_FETCH: async () => new Response(JSON.stringify({
      answers: {
        action: { type: 'choice', choice: 'unsupported', confidence: 0.88 },
        command: { type: 'choice', choice: 'attack_move', confidence: 0.91 },
        direction: { type: 'choice', choice: 'relative_forward', confidence: 0.92 },
        direction_2: { type: 'choice', choice: 'none', confidence: 0.8 },
      },
      model: 'typesafe/jev-1.13-20260917',
    }), { status: 200 }),
  };
  const response = await worker.fetch(request({ ...baseBody, transcript: 'push forward and take out the closest one' }), env, {});
  const body = await response.json();
  expect(response.status === 200 && body.plan?.steps?.[0]?.type === 'move', 'attack-move starts with a local movement step');
  expect(body.plan.steps[1].type === 'attack_target' && body.plan.steps[1].targetId === 'nearest', 'attack-move defers target selection to the simulation');
}

{
  const response = await worker.fetch(request({ ...baseBody, transcript: 'move east, then fire north' }), {}, {});
  const body = await response.json();
  expect(response.status === 200 && body.source === 'local_worker_fast_path' && body.plan?.steps?.length === 2, 'compound local commands skip Jev');
}

console.log(`PASS: ${assertions} assertions. OpenRouter Jev Sandbox boundary validated.\n`);
