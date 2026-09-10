export const R15_PART_NAMES = Object.freeze([
  'Head', 'UpperTorso', 'LowerTorso',
  'LeftUpperArm', 'LeftLowerArm', 'LeftHand',
  'RightUpperArm', 'RightLowerArm', 'RightHand',
  'LeftUpperLeg', 'LeftLowerLeg', 'LeftFoot',
  'RightUpperLeg', 'RightLowerLeg', 'RightFoot'
]);

function shared(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(shared);
    Object.freeze(value);
  }
  return value;
}

export const ROBOT_CATALOG = Object.freeze([
  shared({
    id: 'forge-titan', name: 'FORGE // TITAN', shortName: 'TITAN', series: 'F-09',
    archetype: 'HEAVY BRAWLER', tagline: 'Built to walk through the hit.',
    description: 'A low-center foundry bruiser with a furnace chest, flywheel gauntlets and reinforced legs made to turn every step into pressure.',
    personality: 'Relentless, stubborn, close-range', signature: 'Furnace Breaker',
    signatureDetail: 'Loads both flywheel fists, dips under the guard, then detonates a rising double hammer.',
    traits: ['POWER', 'PRESSURE', 'ARMOR'],
    stats: { power: 96, speed: 42, guard: 71, range: 38, mobility: 34, armor: 91 },
    colors: { primary: 0xb83e17, secondary: 0x22272d, accent: 0xffae21, trim: 0x9ca7af, light: 0xffd27a },
    proportions: { height: 2.28, shoulderWidth: 1.26, hipWidth: 0.64, upperTorsoHeight: 0.54, lowerTorsoHeight: 0.34, torsoDepth: 0.49, head: [0.44, 0.36, 0.40], upperArmLength: 0.46, lowerArmLength: 0.42, armWidth: 0.25, hand: [0.38, 0.32, 0.42], upperLegLength: 0.51, lowerLegLength: 0.46, legWidth: 0.30, foot: [0.37, 0.21, 0.50] },
    featureStyle: 'forge'
  }),
  shared({
    id: 'aegis-prime', name: 'AEGIS // PRIME', shortName: 'AEGIS', series: 'A-12',
    archetype: 'DEFENSIVE SENTINEL', tagline: 'Hold the line. Own the exchange.',
    description: 'A tall championship sentinel with tower shoulders, layered chest armor and a long central line built for patient counters.',
    personality: 'Patient, disciplined, counter-heavy', signature: 'Bastion Counter',
    signatureDetail: 'Closes both shield plates, lets the strike glance away, then spears the opening with a straight counter.',
    traits: ['GUARD', 'COUNTER', 'REACH'],
    stats: { power: 68, speed: 59, guard: 98, range: 87, mobility: 48, armor: 86 },
    colors: { primary: 0xcbd3d8, secondary: 0x253846, accent: 0x2d8cff, trim: 0x9dafbc, light: 0x72c7ff },
    proportions: { height: 2.52, shoulderWidth: 1.24, hipWidth: 0.58, upperTorsoHeight: 0.60, lowerTorsoHeight: 0.34, torsoDepth: 0.43, head: [0.37, 0.39, 0.35], upperArmLength: 0.54, lowerArmLength: 0.50, armWidth: 0.22, hand: [0.29, 0.26, 0.34], upperLegLength: 0.60, lowerLegLength: 0.54, legWidth: 0.26, foot: [0.32, 0.20, 0.47] },
    featureStyle: 'aegis'
  }),
  shared({
    id: 'vanta-razor', name: 'VANTA // RAZOR', shortName: 'VANTA', series: 'V-31',
    archetype: 'EVASIVE COUNTER', tagline: 'Make them miss. Make it hurt.',
    description: 'A narrow black-frame duelist with swept sensor fins, razor vanes and a high hip line that makes every dodge look predatory.',
    personality: 'Elusive, calculating, opportunistic', signature: 'Razor Feint',
    signatureDetail: 'Fakes the shoulder, slips outside the line and returns a cross from an impossible angle.',
    traits: ['SPEED', 'FEINT', 'PRECISION'],
    stats: { power: 61, speed: 97, guard: 53, range: 62, mobility: 99, armor: 29 },
    colors: { primary: 0x121620, secondary: 0x353a4a, accent: 0xe5288f, trim: 0x818898, light: 0xff4eae },
    proportions: { height: 2.44, shoulderWidth: 0.88, hipWidth: 0.40, upperTorsoHeight: 0.50, lowerTorsoHeight: 0.27, torsoDepth: 0.30, head: [0.30, 0.35, 0.31], upperArmLength: 0.57, lowerArmLength: 0.54, armWidth: 0.15, hand: [0.21, 0.22, 0.29], upperLegLength: 0.62, lowerLegLength: 0.57, legWidth: 0.17, foot: [0.27, 0.17, 0.45] },
    featureStyle: 'vanta'
  }),
  shared({
    id: 'volt-kestrel', name: 'VOLT // KESTREL', shortName: 'KESTREL', series: 'K-88',
    archetype: 'TECHNICAL STRIKER', tagline: 'Fast data. Faster hands.',
    description: 'An athletic teal-and-yellow technician with exposed capacitors and split-toe stabilizers that turn rhythm into damage.',
    personality: 'Adaptive, energetic, combination-focused', signature: 'Arc Combination',
    signatureDetail: 'A jab-cross-uppercut chain that accelerates with every clean connection.',
    traits: ['TEMPO', 'COMBOS', 'ADAPTIVE'],
    stats: { power: 65, speed: 89, guard: 64, range: 70, mobility: 82, armor: 49 },
    colors: { primary: 0x087f83, secondary: 0x203039, accent: 0xf2cf2f, trim: 0x8ca6a8, light: 0x57fff1 },
    proportions: { height: 2.36, shoulderWidth: 1.02, hipWidth: 0.48, upperTorsoHeight: 0.51, lowerTorsoHeight: 0.29, torsoDepth: 0.36, head: [0.34, 0.34, 0.35], upperArmLength: 0.50, lowerArmLength: 0.47, armWidth: 0.19, hand: [0.25, 0.24, 0.31], upperLegLength: 0.56, lowerLegLength: 0.53, legWidth: 0.22, foot: [0.30, 0.18, 0.46] },
    featureStyle: 'volt'
  }),
  shared({
    id: 'solstice-mantis', name: 'SOLSTICE // MANTIS', shortName: 'MANTIS', series: 'S-44',
    archetype: 'RANGE DUELIST', tagline: 'Own the angle. Own the ring.',
    description: 'A long-limbed solar duelist with a split visor, blade shoulders and heel stabilizers built to attack from the edge of range.',
    personality: 'Elegant, patient, angle-focused', signature: 'Solar Scissor',
    signatureDetail: 'Cuts laterally, lifts the knee line and snaps a cross through the opened guard.',
    traits: ['RANGE', 'ANGLES', 'FOOTWORK'],
    stats: { power: 57, speed: 84, guard: 47, range: 99, mobility: 92, armor: 36 },
    colors: { primary: 0x6536aa, secondary: 0x171a2d, accent: 0xff8a35, trim: 0xaaa6d5, light: 0xffd36a },
    proportions: { height: 2.58, shoulderWidth: 0.96, hipWidth: 0.40, upperTorsoHeight: 0.47, lowerTorsoHeight: 0.26, torsoDepth: 0.30, head: [0.30, 0.38, 0.30], upperArmLength: 0.61, lowerArmLength: 0.58, armWidth: 0.14, hand: [0.22, 0.23, 0.30], upperLegLength: 0.67, lowerLegLength: 0.61, legWidth: 0.16, foot: [0.25, 0.16, 0.50] },
    featureStyle: 'mantis'
  })
]);

export function getRobotDefinition(id) {
  return ROBOT_CATALOG.find((robot) => robot.id === id) || ROBOT_CATALOG[0];
}
