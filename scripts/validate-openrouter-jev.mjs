// Jev-only Sandbox worker boundary tests.
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
  playerRules: '',
  gameState: { playerHealth: 100, playerEnergy: 80, zombieCount: 5, nearestZombieDistance: 4.2, score: 200 },
};

console.log('\n── Jev-only Sandbox boundary ──');

// No API key → 503
{
  const response = await worker.fetch(request(baseBody), {}, {});
  const body = await response.json();
  expect(response.status === 503 && body.error.code === 'OPENROUTER_UNAVAILABLE', 'missing key returns structured error');
}

// Jev immediate command (move east)
{
  const env = {
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_JEV_MODEL: 'typesafe/jev-1.13',
    OPENROUTER_FETCH: async (url, init) => {
      env.OPENROUTER_FETCH.lastBody = init.body;
      return new Response(JSON.stringify({
        model: 'typesafe/jev-1.13-20260917',
        answers: {
          intent_type: { type: 'choice', choice: 'immediate_command', confidence: 0.95 },
          action: { type: 'choice', choice: 'move', confidence: 0.94 },
          directive: { type: 'choice', choice: 'none', confidence: 0.5 },
          direction: { type: 'choice', choice: 'clock_3', confidence: 0.93 },
        },
        usage: { input_tokens: 320, output_tokens: 20, cost: 0.000014 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  };
  const response = await worker.fetch(request({ ...baseBody, transcript: 'move east' }), env, {});
  const body = await response.json();
  expect(response.status === 200 && body.source === 'openrouter_jev', 'Jev decision accepted');
  expect(body.type === 'immediate' && body.intent.type === 'move', 'immediate move intent');
  expect(Math.abs(body.intent.angle - Math.PI / 2) < 1e-9, 'direction is east');
  const sent = JSON.parse(env.OPENROUTER_FETCH.lastBody);
  expect(sent.state.current_heading_radians === 0, 'heading reaches Jev state');
}

{
  const env = { OPENROUTER_API_KEY: 'test-key', OPENROUTER_FETCH: async () => new Response(JSON.stringify({ answers: { intent_type: { choice: 'immediate_command', confidence: 0.95 }, action: { choice: 'stop', confidence: 0.94 }, directive: { choice: 'none', confidence: 0.4 }, direction: { choice: 'none', confidence: 0.4 } } }), { status: 200 }) };
  const response = await worker.fetch(request({ ...baseBody, transcript: 'stop' }), env, {});
  const body = await response.json();
  expect(body.type === 'immediate' && body.intent.type === 'stop', 'stop is bounded');
}

{
  const env = { OPENROUTER_API_KEY: 'test-key', OPENROUTER_FETCH: async () => new Response(JSON.stringify({ answers: { intent_type: { choice: 'unclear', confidence: 0.9 }, action: { choice: 'none', confidence: 0.4 } } }), { status: 200 }) };
  const response = await worker.fetch(request(baseBody), env, {});
  const body = await response.json();
  expect(response.status === 200 && body.type === 'no_action', 'unclear becomes no_action');
}

{
  const env = { OPENROUTER_API_KEY: 'test-key', OPENROUTER_FETCH: async () => new Response('not-json', { status: 200 }) };
  const response = await worker.fetch(request(baseBody), env, {});
  const body = await response.json();
  expect(response.status === 422 && body.error.code === 'JEV_INVALID_DECISION', 'malformed Jev response rejected');
}

{
  const env = { OPENROUTER_API_KEY: 'test-key', OPENROUTER_FETCH: async () => new Response(JSON.stringify({ answers: { intent_type: { choice: 'immediate_command', confidence: 0.95 }, action: { choice: 'teleport', confidence: 0.99 } } }), { status: 200 }) };
  const response = await worker.fetch(request(baseBody), env, {});
  const body = await response.json();
  expect(response.status === 422 && body.error.code === 'JEV_INVALID_DECISION', 'unknown action rejected');
}

{
  const response = await worker.fetch(request({ ...baseBody, playerRules: 'x'.repeat(4097) }), { OPENROUTER_API_KEY: 'test-key' }, {});
  const body = await response.json();
  expect(response.status === 422 && body.error.code === 'VALIDATION_ERROR', 'oversized rules rejected');
}

{
  const response = await worker.fetch(request({ ...baseBody, gameState: { playerHealth: 'bad' } }), { OPENROUTER_API_KEY: 'test-key' }, {});
  const body = await response.json();
  expect(response.status === 422 && body.error.code === 'VALIDATION_ERROR', 'invalid game state rejected');
}

{
  const env = {
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_FETCH: async () => new Response(JSON.stringify({
      answers: {
        intent_type: { choice: 'immediate_command', confidence: 0.96 },
        action: { choice: 'fire_nearest', confidence: 0.94 },
        directive: { choice: 'none', confidence: 0.4 },
        direction: { choice: 'none', confidence: 0.4 },
      },
    }), { status: 200 }),
  };
  const response = await worker.fetch(request({ ...baseBody, transcript: 'shoot the zombie' }), env, {});
  const body = await response.json();
  expect(body.type === 'immediate' && body.intent.type === 'fire_nearest', 'nearest fire is bounded');
}

{
  const env = {
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_FETCH: async () => new Response(JSON.stringify({
      answers: {
        intent_type: { choice: 'set_strategy', confidence: 0.9 },
        action: { choice: 'none', confidence: 0.4 },
        directive: { choice: 'retreat', confidence: 0.88 },
        direction: { choice: 'none', confidence: 0.4 },
      },
    }), { status: 200 }),
  };
  const event = { type: 'zombie_entered_zone', zoneId: 'gate', zombieId: 'zombie_1', distance: 1.2 };
  const response = await worker.fetch(request({ ...baseBody, transcript: '', mode: 'rule_event', event }), env, {});
  const body = await response.json();
  expect(body.type === 'set_directive' && body.directive === 'retreat', 'gate event can set retreat');
}

// Jev add_rule
{
  const env = {
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_FETCH: async () => new Response(JSON.stringify({
      model: 'typesafe/jev-1.13-20260917',
      answers: {
        intent_type: { type: 'choice', choice: 'add_rule', confidence: 0.91 },
        action: { type: 'choice', choice: 'none', confidence: 0.6 },
        directive: { type: 'choice', choice: 'none', confidence: 0.5 },
        direction: { type: 'choice', choice: 'none', confidence: 0.8 },
      },
      usage: { input_tokens: 200, output_tokens: 10, cost: 0.00001 },
    }), { status: 200 }),
  };
  const response = await worker.fetch(request({ ...baseBody, transcript: 'when zombies get close retreat and fire' }), env, {});
  const body = await response.json();
  expect(response.status === 200 && body.type === 'add_rule', 'add_rule intent recognized');
}

// Jev set_strategy
{
  const env = {
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_FETCH: async () => new Response(JSON.stringify({
      model: 'typesafe/jev-1.13-20260917',
      answers: {
        intent_type: { type: 'choice', choice: 'set_strategy', confidence: 0.88 },
        action: { type: 'choice', choice: 'none', confidence: 0.4 },
        directive: { type: 'choice', choice: 'kite', confidence: 0.85 },
        direction: { type: 'choice', choice: 'none', confidence: 0.7 },
      },
      usage: { input_tokens: 200, output_tokens: 10, cost: 0.00001 },
    }), { status: 200 }),
  };
  const response = await worker.fetch(request({ ...baseBody, transcript: 'kite them, keep distance' }), env, {});
  const body = await response.json();
  expect(response.status === 200 && body.type === 'set_directive' && body.directive === 'kite', 'kite strategy set');
}

// Low confidence rejected
{
  const env = {
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_FETCH: async () => new Response(JSON.stringify({
      answers: {
        intent_type: { type: 'choice', choice: 'immediate_command', confidence: 0.51 },
        action: { type: 'choice', choice: 'fire', confidence: 0.51 },
        directive: { type: 'choice', choice: 'none', confidence: 0.5 },
        direction: { type: 'choice', choice: 'clock_12', confidence: 0.99 },
      },
      model: 'typesafe/jev-1.13-20260917',
    }), { status: 200 }),
  };
  const response = await worker.fetch(request(baseBody), env, {});
  const body = await response.json();
  expect(response.status === 422 && body.error.code === 'JEV_LOW_CONFIDENCE', 'low confidence rejected');
}

// Health endpoint
{
  const response = await worker.fetch(new Request('https://example.test/health', { method: 'GET' }), {}, {});
  const body = await response.json();
  expect(body.ok === true && body.provider === 'openrouter_jev', 'health endpoint works');
}

console.log(`PASS: ${assertions} assertions. Jev-only Sandbox boundary validated.\n`);
