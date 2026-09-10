// ─── Adherence Model ─────────────────────────────────────────────────
// Computes effective adherence probability for a tactic step given current
// robot state.  Returns a value 0..1.  The brain uses a seeded RNG roll
// to decide whether to follow the intended step or fall back to base
// utility scoring.
//
// Invariants:
//   - Never creates illegal actions or bypasses simulation legality.
//   - Never consumes RNG from the renderer path.
//   - Same seed + same state → same roll every time (deterministic).
//   - Result is a data-only calculation; no Three.js / DOM access.

/** Weights for each stress factor (sum must produce sensible 0..1 range). */
const STRESS_WEIGHTS = Object.freeze({
  lowStamina:        .18,   // stamina < 30 %
  staggered:         .30,   // currently staggered
  tacticComplexity:  .14,   // cost per point above baseline
  multiActiveTactics:.10,   // each additional active tactic beyond 1
  nearEdge:          .10,   // near arena boundary
});

const COMPLEXITY_BASELINE = 3; // cost at or below → no penalty

/**
 * Compute effective adherence (0..1) for this fighter at this tick.
 *
 * @param {object} params
 * @param {number}  params.baseAdherence    - robot profile adherence (0..1)
 * @param {number}  params.staminaRatio     - current stamina / maxStamina (0..1)
 * @param {boolean} params.isStaggered      - fighter is in STAGGERED state
 * @param {number}  params.tacticCost       - cost of the tactic being attempted
 * @param {number}  params.activeTactics    - how many tactics are currently active
 * @param {boolean} params.nearEdge         - fighter near arena boundary
 * @returns {number} effective adherence probability (clamped 0..1)
 */
export function computeAdherence({
  baseAdherence,
  staminaRatio,
  isStaggered,
  tacticCost,
  activeTactics,
  nearEdge,
}) {
  const base = Math.max(0, Math.min(1, baseAdherence ?? .8));

  let stress = 0;

  if (staminaRatio < .30) {
    // Scale: 0 stamina → full weight; 30% → 0 weight.
    stress += STRESS_WEIGHTS.lowStamina * (1 - staminaRatio / .30);
  }
  if (isStaggered) {
    stress += STRESS_WEIGHTS.staggered;
  }
  const complexityOver = Math.max(0, (tacticCost ?? 0) - COMPLEXITY_BASELINE);
  stress += STRESS_WEIGHTS.tacticComplexity * complexityOver;

  const extraTactics = Math.max(0, (activeTactics ?? 1) - 1);
  stress += STRESS_WEIGHTS.multiActiveTactics * extraTactics;

  if (nearEdge) {
    stress += STRESS_WEIGHTS.nearEdge;
  }

  return Math.max(0, Math.min(1, base - stress));
}

/**
 * Roll whether a tactic step is followed given effective adherence.
 * Uses the brain's seeded RNG so the result is deterministic per seed.
 *
 * @param {number}   effectiveAdherence   - output of computeAdherence
 * @param {import('../combat/SeededRNG.js').SeededRNG} rng
 * @returns {{ follows: boolean, roll: number, adherence: number }}
 */
export function rollAdherence(effectiveAdherence, rng) {
  const roll = rng.next();            // 0..1 uniform from seeded source
  const follows = roll < effectiveAdherence;
  return { follows, roll, adherence: effectiveAdherence };
}

/**
 * Human-readable reason string for an adherence miss.
 * Used by the coach-feedback layer (P7.4).
 *
 * @param {object} params   - same shape as computeAdherence
 * @returns {string}
 */
export function adherenceMissReason({
  staminaRatio,
  isStaggered,
  tacticCost,
  activeTactics,
  nearEdge,
}) {
  if (isStaggered)                         return 'staggered';
  if (staminaRatio < .15)                  return 'exhausted';
  if (staminaRatio < .30)                  return 'low_stamina';
  if ((tacticCost ?? 0) > COMPLEXITY_BASELINE + 3) return 'tactic_too_complex';
  if ((activeTactics ?? 1) > 2)            return 'overloaded';
  if (nearEdge)                            return 'near_edge_disruption';
  return 'random_miss';
}
