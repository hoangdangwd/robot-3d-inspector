// Local Sandbox parser latency. No network, no transcript log.

import { parseSandboxCommand } from '../src/sandbox/SandboxCommandParser.js';

const commands = [
  'Đi hướng 6 giờ',
  'Dừng lại',
  'Bắn hướng 3 giờ',
  'tấn công hướng 6 giờ',
  'tuần tra hướng 6 giờ',
  'move north',
  'attack-move south',
  'patrol south',
];

const samples = [];
for (let i = 0; i < 2000; i++) {
  const text = commands[i % commands.length];
  const started = performance.now();
  const parsed = parseSandboxCommand(text, { tick: i, currentHeading: 0 });
  const elapsed = performance.now() - started;
  if (parsed.kind !== 'sandbox_intent') throw new Error(`unparsed: ${text}`);
  samples.push(elapsed);
}
samples.sort((a, b) => a - b);
const at = p => samples[Math.min(samples.length - 1, Math.max(0, Math.ceil(p * samples.length) - 1))];
console.log(JSON.stringify({
  n: samples.length,
  p50: Number(at(0.5).toFixed(4)),
  p95: Number(at(0.95).toFixed(4)),
  max: Number(samples.at(-1).toFixed(4)),
}));
