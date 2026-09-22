// ─── Sandbox direction resolver validation ──────────────────────────
// Tests clock, compass and relative direction parsing without Three.js.
// Run: node scripts/validate-sandbox-direction.mjs

import assert from 'node:assert/strict';
import { DirectionResolver } from '../src/sandbox/DirectionResolver.js';

const TAU = Math.PI * 2;
let pass = 0;
function ok(label) { pass++; console.log(`  ✓ ${label}`); }
function close(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: expected ${expected}, got ${actual}`);
}
function parsed(text, heading = 0) {
  const result = DirectionResolver.parse(text, heading);
  assert.ok(result, `expected direction for: ${text}`);
  return result;
}
function noDirection(text) {
  assert.equal(DirectionResolver.parse(text), null, `expected no direction for: ${text}`);
}

console.log('\n── DirectionResolver: clock directions ──');
const clockAngles = {
  12: 0,
  1: Math.PI / 6,
  2: Math.PI / 3,
  3: Math.PI / 2,
  4: (2 * Math.PI) / 3,
  5: (5 * Math.PI) / 6,
  6: Math.PI,
  7: (7 * Math.PI) / 6,
  8: (4 * Math.PI) / 3,
  9: (3 * Math.PI) / 2,
  10: (5 * Math.PI) / 3,
  11: (11 * Math.PI) / 6,
};
for (const [hour, angle] of Object.entries(clockAngles)) {
  const result = parsed(`hướng ${hour} giờ`);
  close(result.angle, angle, `${hour} giờ angle`);
  assert.equal(result.isRelative, false);
}
ok('all 12 clock positions map to the Three.js X-Z convention');

const halfHour = parsed('góc 9 giờ rưỡi');
close(halfHour.angle, (19 * Math.PI) / 12, '9:30 angle');
assert.equal(halfHour.isRelative, false);
const numericHalfHour = parsed('hướng 3h30');
close(numericHalfHour.angle, (7 * Math.PI) / 12, '3:30 angle');
ok('half-hour clock directions add 15 degrees');

console.log('\n── DirectionResolver: compass directions ──');
const compassCases = [
  ['bắc', 0], ['BAC', 0], ['north', 0],
  ['đông bắc', Math.PI / 4], ['dong bac', Math.PI / 4], ['northeast', Math.PI / 4],
  ['đông', Math.PI / 2], ['east', Math.PI / 2],
  ['đông nam', (3 * Math.PI) / 4], ['dong nam', (3 * Math.PI) / 4], ['southeast', (3 * Math.PI) / 4],
  ['nam', Math.PI], ['south', Math.PI],
  ['tây nam', (5 * Math.PI) / 4], ['tay nam', (5 * Math.PI) / 4], ['southwest', (5 * Math.PI) / 4],
  ['tây', (3 * Math.PI) / 2], ['tay', (3 * Math.PI) / 2], ['west', (3 * Math.PI) / 2],
  ['tây bắc', (7 * Math.PI) / 4], ['tay bac', (7 * Math.PI) / 4], ['northwest', (7 * Math.PI) / 4],
];
for (const [text, angle] of compassCases) {
  const result = parsed(`đi về ${text}`);
  close(result.angle, angle, `${text} compass angle`);
  assert.equal(result.isRelative, false);
}
ok('Vietnamese accented, Vietnamese unaccented and English compass phrases work');

console.log('\n── DirectionResolver: relative directions ──');
const heading = Math.PI / 3;
const right = parsed('sang phải', heading);
close(right.angle, (5 * Math.PI) / 6, 'relative right angle');
assert.equal(right.isRelative, true);
const left = parsed('bên trái', heading);
close(left.angle, (11 * Math.PI) / 6, 'relative left angle');
assert.equal(left.isRelative, true);
const behind = parsed('sau lưng', heading);
close(behind.angle, (4 * Math.PI) / 3, 'relative behind angle');
assert.equal(behind.isRelative, true);
const englishRight = parsed('move to the right', heading);
close(englishRight.angle, (5 * Math.PI) / 6, 'English relative right angle');
const englishLeft = parsed('strafe left', heading);
close(englishLeft.angle, (11 * Math.PI) / 6, 'English relative left angle');
const englishBehind = parsed('behind me', heading);
close(englishBehind.angle, (4 * Math.PI) / 3, 'English relative behind angle');
ok('left, right and behind resolve from the current heading');

const wrapped = parsed('sang trái', 0);
close(wrapped.angle, (3 * Math.PI) / 2, 'wrapped left angle');
ok('relative angles wrap into [0, 2π)');

console.log('\n── DirectionResolver: rejection and safety ──');
noDirection('dừng lại');
noDirection('bắn zombie');
noDirection('đi nhanh lên');
noDirection('hướng 13 giờ');
noDirection('hướng 3');
assert.equal(DirectionResolver.parse(null), null);
assert.equal(DirectionResolver.parse(undefined), null);
assert.equal(DirectionResolver.parse('hướng 3 giờ', NaN).angle, Math.PI / 2);
assert.equal(DirectionResolver.parse('hướng 3 giờ', Infinity).angle, Math.PI / 2);
ok('missing, malformed and non-string directions are rejected without throwing');

console.log('\n── DirectionResolver: output contract ──');
const result = parsed('north');
assert.deepEqual(Object.keys(result).sort(), ['angle', 'isRelative']);
assert.equal(result.angle >= 0 && result.angle < TAU, true);
assert.equal(Object.isFrozen(result), true);
ok('result is a minimal frozen serializable direction value');

console.log(`\nPASS: ${pass} assertions. Sandbox direction resolver validated.\n`);
