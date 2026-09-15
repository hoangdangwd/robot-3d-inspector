// ─── MatchSetup domain module ─────────────────────────────────────────
// Defines the contract and identity mapping for combat matchups.
// Pure functions, zero DOM/Three.js dependencies.

import { ROBOT_CATALOG, getRobotDefinition } from '../robots/robotCatalog.js';

export const PLAYER_ROLE = 'fighter_a';
export const OPPONENT_ROLE = 'fighter_b';

/**
 * Checks if a given robot definition ID is present in the catalog.
 * @param {string} id
 * @param {Array} [catalog=ROBOT_CATALOG]
 * @returns {boolean}
 */
export function isValidRobotId(id, catalog = ROBOT_CATALOG) {
  if (typeof id !== 'string' || !id.trim()) return false;
  return catalog.some(robot => robot.id === id);
}

/**
 * Picks a random opponent from the catalog, optionally excluding one robot ID.
 * @param {string|null} [excludeDefId=null]
 * @param {Array} [catalog=ROBOT_CATALOG]
 * @param {Function} [rng=Math.random]
 * @returns {string} robot definition ID
 */
export function pickRandomOpponent(excludeDefId = null, catalog = ROBOT_CATALOG, rng = Math.random) {
  const candidates = catalog.filter(robot => robot.id !== excludeDefId);
  const pool = candidates.length > 0 ? candidates : catalog;
  const index = Math.floor(rng() * pool.length);
  return pool[index].id;
}

/**
 * Creates an authoritative, frozen match setup record.
 * @param {Object} [options={}]
 * @param {string} [options.playerDefId='forge-titan']
 * @param {string} [options.opponentDefId]
 * @param {Array} [catalog=ROBOT_CATALOG]
 * @returns {Readonly<{ playerDefId: string, opponentDefId: string, playerRole: string, opponentRole: string, timestamp: number }>}
 */
export function createMatchSetup({ playerDefId = 'forge-titan', opponentDefId } = {}, catalog = ROBOT_CATALOG) {
  if (!isValidRobotId(playerDefId, catalog)) {
    throw new Error(`Invalid player robot ID: "${playerDefId}". Must be one of: ${catalog.map(r => r.id).join(', ')}`);
  }

  let resolvedOpponentId = opponentDefId;
  if (!resolvedOpponentId) {
    // If not specified, pick a default opponent that differs from playerDefId
    const alternate = catalog.find(robot => robot.id !== playerDefId);
    resolvedOpponentId = alternate ? alternate.id : playerDefId;
  }

  if (!isValidRobotId(resolvedOpponentId, catalog)) {
    throw new Error(`Invalid opponent robot ID: "${resolvedOpponentId}". Must be one of: ${catalog.map(r => r.id).join(', ')}`);
  }

  return Object.freeze({
    playerDefId,
    opponentDefId: resolvedOpponentId,
    playerRole: PLAYER_ROLE,
    opponentRole: OPPONENT_ROLE,
    timestamp: Date.now(),
  });
}

/**
 * Converts a hex color integer (e.g. 0xffae21) to CSS hex string ('#ffae21').
 * @param {number} hexInt
 * @returns {string}
 */
function toHexColor(hexInt) {
  if (typeof hexInt !== 'number' || Number.isNaN(hexInt)) return '#ffffff';
  return `#${hexInt.toString(16).padStart(6, '0')}`;
}

/**
 * Resolves UI-friendly labels, tags, and accent colors for both fighters.
 * @param {Object} setup - object containing playerDefId, opponentDefId
 * @param {Array} [catalog=ROBOT_CATALOG]
 * @returns {Object}
 */
export function resolveFighterLabels(setup, catalog = ROBOT_CATALOG) {
  const defPlayer = catalog.find(r => r.id === setup.playerDefId) || getRobotDefinition(setup.playerDefId);
  const defOpponent = catalog.find(r => r.id === setup.opponentDefId) || getRobotDefinition(setup.opponentDefId);

  return Object.freeze({
    player: Object.freeze({
      role: PLAYER_ROLE,
      tag: 'YOU',
      defId: defPlayer.id,
      name: defPlayer.name,
      shortName: defPlayer.shortName,
      archetype: defPlayer.archetype,
      accentHex: toHexColor(defPlayer.colors?.accent),
      primaryHex: toHexColor(defPlayer.colors?.primary),
      raw: defPlayer,
    }),
    opponent: Object.freeze({
      role: OPPONENT_ROLE,
      tag: 'CPU',
      defId: defOpponent.id,
      name: defOpponent.name,
      shortName: defOpponent.shortName,
      archetype: defOpponent.archetype,
      accentHex: toHexColor(defOpponent.colors?.accent),
      primaryHex: toHexColor(defOpponent.colors?.primary),
      raw: defOpponent,
    }),
  });
}

/**
 * Resolves the final match outcome from the player's perspective.
 * @param {Object} matchResult - { winnerId: 'fighter_a' | 'fighter_b' | null, reason: 'ko' | 'time' | 'draw' }
 * @param {Object} setup - { playerDefId, opponentDefId, playerRole, opponentRole }
 * @param {Array} [catalog=ROBOT_CATALOG]
 * @returns {Readonly<{ outcome: 'victory'|'defeat'|'draw', title: string, headline: string, subtext: string, isPlayerWinner: boolean, winnerRole: string|null, winnerDefId: string|null }>}
 */
export function resolveMatchOutcome(matchResult, setup, catalog = ROBOT_CATALOG) {
  const winnerId = matchResult?.winnerId;
  const reason = matchResult?.reason;
  const playerRole = setup?.playerRole || PLAYER_ROLE;
  const opponentRole = setup?.opponentRole || OPPONENT_ROLE;

  let outcome = 'draw';
  let title = 'DRAW';
  let headline = 'HÒA';
  let isPlayerWinner = false;
  let winnerRole = null;
  let winnerDefId = null;
  let subtext = 'SPLIT DECISION / TIME LIMIT';

  if (winnerId === playerRole) {
    outcome = 'victory';
    title = 'VICTORY';
    headline = 'CHIẾN THẮNG';
    isPlayerWinner = true;
    winnerRole = playerRole;
    winnerDefId = setup.playerDefId;
    subtext = reason === 'ko' ? 'KNOCKOUT VICTORY · ĐO VÁN' : 'DECISION VICTORY · TÍNH ĐIỂM THẮNG';
  } else if (winnerId === opponentRole) {
    outcome = 'defeat';
    title = 'DEFEAT';
    headline = 'THẤT BẠI';
    isPlayerWinner = false;
    winnerRole = opponentRole;
    winnerDefId = setup.opponentDefId;
    subtext = reason === 'ko' ? 'KNOCKOUT DEFEAT · BỊ ĐO VÁN' : 'DECISION DEFEAT · TÍNH ĐIỂM THUA';
  }

  return Object.freeze({
    outcome,
    title,
    headline,
    subtext,
    isPlayerWinner,
    winnerRole,
    winnerDefId,
    reason: reason || (winnerId ? 'decision' : 'draw'),
  });
}
