// ─── MatchSetup domain contract validation ───────────────────────────
// Tests for createMatchSetup, resolveFighterLabels, resolveMatchOutcome, pickRandomOpponent.
// Run: node scripts/validate-match-setup.mjs

import assert from 'node:assert/strict';
import {
  PLAYER_ROLE,
  OPPONENT_ROLE,
  isValidRobotId,
  createMatchSetup,
  resolveFighterLabels,
  resolveMatchOutcome,
  pickRandomOpponent,
} from '../src/match/MatchSetup.js';
import { ROBOT_CATALOG } from '../src/robots/robotCatalog.js';

let pass = 0;
function ok(label) {
  pass++;
  console.log(`  ✓ ${label}`);
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── MatchSetup: Constants and ID validation ──');
// ═══════════════════════════════════════════════════════════════════

assert.equal(PLAYER_ROLE, 'fighter_a');
assert.equal(OPPONENT_ROLE, 'fighter_b');
ok('roles are strictly bound (player = fighter_a, opponent = fighter_b)');

assert.equal(isValidRobotId('forge-titan'), true);
assert.equal(isValidRobotId('aegis-prime'), true);
assert.equal(isValidRobotId('vanta-razor'), true);
assert.equal(isValidRobotId('volt-kestrel'), true);
assert.equal(isValidRobotId('solstice-mantis'), true);
assert.equal(isValidRobotId('non-existent-bot'), false);
assert.equal(isValidRobotId(''), false);
assert.equal(isValidRobotId(null), false);
ok('isValidRobotId correctly validates catalog members');

// ═══════════════════════════════════════════════════════════════════
console.log('\n── MatchSetup: createMatchSetup ──');
// ═══════════════════════════════════════════════════════════════════

// Default creation
const defaultSetup = createMatchSetup();
assert.equal(defaultSetup.playerDefId, 'forge-titan');
assert.equal(defaultSetup.opponentDefId, 'aegis-prime');
assert.equal(defaultSetup.playerRole, 'fighter_a');
assert.equal(defaultSetup.opponentRole, 'fighter_b');
assert.ok(Object.isFrozen(defaultSetup));
ok('default setup produces frozen object with forge-titan vs aegis-prime');

// Custom valid creation
const customSetup = createMatchSetup({
  playerDefId: 'volt-kestrel',
  opponentDefId: 'vanta-razor',
});
assert.equal(customSetup.playerDefId, 'volt-kestrel');
assert.equal(customSetup.opponentDefId, 'vanta-razor');
assert.equal(customSetup.playerRole, 'fighter_a');
assert.equal(customSetup.opponentRole, 'fighter_b');
assert.ok(Object.isFrozen(customSetup));
ok('custom valid setup creates expected matchup');

// Automatic fallback opponent when opponentDefId is omitted
const autoOpponentSetup = createMatchSetup({ playerDefId: 'aegis-prime' });
assert.equal(autoOpponentSetup.playerDefId, 'aegis-prime');
assert.notEqual(autoOpponentSetup.opponentDefId, 'aegis-prime', 'auto opponent chooses a different fighter');
assert.ok(isValidRobotId(autoOpponentSetup.opponentDefId));
ok('omitted opponent selects an alternate valid robot');

// Mirror match support
const mirrorSetup = createMatchSetup({
  playerDefId: 'solstice-mantis',
  opponentDefId: 'solstice-mantis',
});
assert.equal(mirrorSetup.playerDefId, 'solstice-mantis');
assert.equal(mirrorSetup.opponentDefId, 'solstice-mantis');
ok('mirror match (player == opponent) is explicitly supported');

// Error on invalid player ID
assert.throws(
  () => createMatchSetup({ playerDefId: 'cyber-demon' }),
  /Invalid player robot ID/,
  'throws on invalid playerDefId'
);
ok('rejects unknown player robot ID');

// Error on invalid opponent ID
assert.throws(
  () => createMatchSetup({ playerDefId: 'forge-titan', opponentDefId: 'alien-boss' }),
  /Invalid opponent robot ID/,
  'throws on invalid opponentDefId'
);
ok('rejects unknown opponent robot ID');

// ═══════════════════════════════════════════════════════════════════
console.log('\n── MatchSetup: resolveFighterLabels ──');
// ═══════════════════════════════════════════════════════════════════

const labels = resolveFighterLabels(customSetup, ROBOT_CATALOG);
assert.equal(labels.player.tag, 'YOU');
assert.equal(labels.player.role, 'fighter_a');
assert.equal(labels.player.defId, 'volt-kestrel');
assert.equal(labels.player.shortName, 'KESTREL');
assert.ok(labels.player.accentHex.startsWith('#'));

assert.equal(labels.opponent.tag, 'CPU');
assert.equal(labels.opponent.role, 'fighter_b');
assert.equal(labels.opponent.defId, 'vanta-razor');
assert.equal(labels.opponent.shortName, 'VANTA');
assert.ok(labels.opponent.accentHex.startsWith('#'));
ok('resolveFighterLabels provides clean YOU and CPU labels and accent colors');

// ═══════════════════════════════════════════════════════════════════
console.log('\n── MatchSetup: resolveMatchOutcome ──');
// ═══════════════════════════════════════════════════════════════════

// Case 1: Player (fighter_a) wins by KO
const victoryKO = resolveMatchOutcome(
  { winnerId: 'fighter_a', reason: 'ko' },
  customSetup
);
assert.equal(victoryKO.outcome, 'victory');
assert.equal(victoryKO.title, 'VICTORY');
assert.equal(victoryKO.headline, 'CHIẾN THẮNG');
assert.equal(victoryKO.isPlayerWinner, true);
assert.equal(victoryKO.winnerRole, 'fighter_a');
assert.equal(victoryKO.winnerDefId, 'volt-kestrel');
assert.match(victoryKO.subtext, /KNOCKOUT/);
assert.ok(Object.isFrozen(victoryKO));
ok('resolveMatchOutcome correctly identifies Player KO victory');

// Case 2: Player (fighter_a) wins by Decision (time)
const victoryDecision = resolveMatchOutcome(
  { winnerId: 'fighter_a', reason: 'time' },
  customSetup
);
assert.equal(victoryDecision.outcome, 'victory');
assert.equal(victoryDecision.isPlayerWinner, true);
assert.match(victoryDecision.subtext, /DECISION/);
ok('resolveMatchOutcome correctly identifies Player Decision victory');

// Case 3: Opponent (fighter_b) wins by KO (Player defeat)
const defeatKO = resolveMatchOutcome(
  { winnerId: 'fighter_b', reason: 'ko' },
  customSetup
);
assert.equal(defeatKO.outcome, 'defeat');
assert.equal(defeatKO.title, 'DEFEAT');
assert.equal(defeatKO.headline, 'THẤT BẠI');
assert.equal(defeatKO.isPlayerWinner, false);
assert.equal(defeatKO.winnerRole, 'fighter_b');
assert.equal(defeatKO.winnerDefId, 'vanta-razor');
assert.match(defeatKO.subtext, /KNOCKOUT/);
assert.ok(Object.isFrozen(defeatKO));
ok('resolveMatchOutcome correctly identifies Player defeat');

// Case 4: Draw / Time limit expired
const drawResult = resolveMatchOutcome(
  { winnerId: null, reason: 'draw' },
  customSetup
);
assert.equal(drawResult.outcome, 'draw');
assert.equal(drawResult.title, 'DRAW');
assert.equal(drawResult.headline, 'HÒA');
assert.equal(drawResult.isPlayerWinner, false);
assert.equal(drawResult.winnerRole, null);
assert.equal(drawResult.winnerDefId, null);
assert.ok(Object.isFrozen(drawResult));
ok('resolveMatchOutcome correctly identifies Draw');

// ═══════════════════════════════════════════════════════════════════
console.log('\n── MatchSetup: pickRandomOpponent ──');
// ═══════════════════════════════════════════════════════════════════

const random1 = pickRandomOpponent('forge-titan');
assert.ok(isValidRobotId(random1));
assert.notEqual(random1, 'forge-titan', 'random opponent excludes active player fighter');

// Deterministic test with injected RNG
const fixedRng = () => 0.0;
const pickedFirst = pickRandomOpponent('forge-titan', ROBOT_CATALOG, fixedRng);
assert.equal(pickedFirst, 'aegis-prime');
ok('pickRandomOpponent selects valid alternate fighter with deterministic RNG');

console.log(`\nPASS: All ${pass} MatchSetup contract assertions passed successfully.\n`);
