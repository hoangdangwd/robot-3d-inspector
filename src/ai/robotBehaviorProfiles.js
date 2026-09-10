// ─── Robot behavior profiles ────────────────────────────────────────
// Decision preferences only. Simulation legality remains authoritative.
// IDs use the underscore form used by the combat domain.

const profile = (value) => Object.freeze({
  preferredDistance: 1.25,
  distanceTolerance: .25,
  pressureBias: .5,
  counterBias: .5,
  retreatBias: .5,
  defenseBias: .5,
  evadeBias: .5,
  riskTolerance: .5,
  tempo: .5,
  edgeAvoidance: .7,
  tacticalCapacity: 7,
  adherence: .8,
  strafeBias: 0,
  attackWeights: Object.freeze({
    jab: 1, cross: 1, hook_left: 1, hook_right: 1,
    uppercut_left: 1, uppercut_right: 1,
    body_jab: 1, body_cross: 1, overhand: 1, feint_jab: .5,
  }),
  defenseWeights: Object.freeze({
    guard_high: 1, guard_low: 1, parry_left: 1, parry_right: 1,
    slip_left: 1, slip_right: 1, duck: 1, roll: 1,
  }),
  ...value,
});

export const ROBOT_BEHAVIOR_PROFILES = Object.freeze({
  forge_titan: profile({
    preferredDistance: 1.05, distanceTolerance: .3,
    pressureBias: .92, counterBias: .3, retreatBias: .12,
    defenseBias: .32, evadeBias: .15, riskTolerance: .88,
    tempo: .52, edgeAvoidance: .55, tacticalCapacity: 6, adherence: .72, strafeBias: -.1,
    attackWeights: Object.freeze({
      jab: .8, cross: 1.05, hook_left: 1.35, hook_right: 1.35,
      uppercut_left: 1.15, uppercut_right: 1.15,
      body_jab: 1.15, body_cross: 1.3, overhand: 1.4, feint_jab: .25,
    }),
    defenseWeights: Object.freeze({
      guard_high: 1.35, guard_low: 1.2, parry_left: .45, parry_right: .45,
      slip_left: .3, slip_right: .3, duck: .35, roll: .2,
    }),
  }),
  aegis_prime: profile({
    preferredDistance: 1.5, distanceTolerance: .3,
    pressureBias: .25, counterBias: .9, retreatBias: .55,
    defenseBias: .9, evadeBias: .5, riskTolerance: .28,
    tempo: .38, edgeAvoidance: .86, tacticalCapacity: 8, adherence: .90, strafeBias: .18,
    attackWeights: Object.freeze({
      jab: 1.2, cross: 1.45, hook_left: .55, hook_right: .55,
      uppercut_left: .35, uppercut_right: .35,
      body_jab: .7, body_cross: .85, overhand: .3, feint_jab: .8,
    }),
    defenseWeights: Object.freeze({
      guard_high: 1.7, guard_low: 1.55, parry_left: 1.35, parry_right: 1.35,
      slip_left: .65, slip_right: .65, duck: .5, roll: .25,
    }),
  }),
  vanta_razor: profile({
    preferredDistance: 1.4, distanceTolerance: .3,
    pressureBias: .34, counterBias: .86, retreatBias: .78,
    defenseBias: .72, evadeBias: 1.0, riskTolerance: .22,
    tempo: .84, edgeAvoidance: .98, tacticalCapacity: 7, adherence: .78, strafeBias: .8,
    attackWeights: Object.freeze({
      jab: 1.45, cross: 1.4, hook_left: .75, hook_right: .75,
      uppercut_left: .35, uppercut_right: .35,
      body_jab: .8, body_cross: .7, overhand: .18, feint_jab: 1.25,
    }),
    defenseWeights: Object.freeze({
      guard_high: .55, guard_low: .45, parry_left: .9, parry_right: .9,
      slip_left: 1.65, slip_right: 1.65, duck: 1.15, roll: .95,
    }),
  }),
  volt_kestrel: profile({
    preferredDistance: 1.28, distanceTolerance: .24,
    pressureBias: .68, counterBias: .58, retreatBias: .4,
    defenseBias: .55, evadeBias: .62, riskTolerance: .58,
    tempo: .98, edgeAvoidance: .85, tacticalCapacity: 8, adherence: .84, strafeBias: -.55,
    attackWeights: Object.freeze({
      jab: 1.4, cross: 1.35, hook_left: 1.05, hook_right: 1.05,
      uppercut_left: .9, uppercut_right: .9,
      body_jab: 1.1, body_cross: 1.1, overhand: .5, feint_jab: .9,
    }),
    defenseWeights: Object.freeze({
      guard_high: .8, guard_low: .8, parry_left: 1.0, parry_right: 1.0,
      slip_left: 1.05, slip_right: 1.05, duck: .8, roll: .55,
    }),
  }),
  solstice_mantis: profile({
    preferredDistance: 1.75, distanceTolerance: .32,
    pressureBias: .38, counterBias: .72, retreatBias: .74,
    defenseBias: .62, evadeBias: .82, riskTolerance: .3,
    tempo: .66, edgeAvoidance: .95, tacticalCapacity: 9, adherence: .86, strafeBias: .65,
    attackWeights: Object.freeze({
      jab: 1.55, cross: 1.55, hook_left: .45, hook_right: .45,
      uppercut_left: .2, uppercut_right: .2,
      body_jab: .75, body_cross: .55, overhand: .25, feint_jab: 1.15,
    }),
    defenseWeights: Object.freeze({
      guard_high: .55, guard_low: .45, parry_left: .75, parry_right: .75,
      slip_left: 1.25, slip_right: 1.25, duck: .8, roll: .7,
    }),
  }),
});

export function getBehaviorProfile(definitionId) {
  return ROBOT_BEHAVIOR_PROFILES[definitionId] || profile({});
}
