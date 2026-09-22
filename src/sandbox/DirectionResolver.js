// ─── Sandbox direction resolver ────────────────────────────────────
// Resolves absolute clock/compass directions and relative directions into
// normalized radians. It is pure domain logic: no Three.js or scene access.

const TAU = Math.PI * 2;

const CLOCK_MAP = Object.freeze({
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
});

// These names are public documentation data. Parsing normalizes accents and
// punctuation, so both accented and unaccented Vietnamese phrases work.
const COMPASS_MAP = Object.freeze({
  'bắc': 0,
  bac: 0,
  north: 0,
  'đông bắc': Math.PI / 4,
  'dong bac': Math.PI / 4,
  northeast: Math.PI / 4,
  'north east': Math.PI / 4,
  'đông': Math.PI / 2,
  dong: Math.PI / 2,
  east: Math.PI / 2,
  'đông nam': (3 * Math.PI) / 4,
  'dong nam': (3 * Math.PI) / 4,
  southeast: (3 * Math.PI) / 4,
  'south east': (3 * Math.PI) / 4,
  nam: Math.PI,
  south: Math.PI,
  'tây nam': (5 * Math.PI) / 4,
  'tay nam': (5 * Math.PI) / 4,
  southwest: (5 * Math.PI) / 4,
  'south west': (5 * Math.PI) / 4,
  'tây': (3 * Math.PI) / 2,
  tay: (3 * Math.PI) / 2,
  west: (3 * Math.PI) / 2,
  'tây bắc': (7 * Math.PI) / 4,
  'tay bac': (7 * Math.PI) / 4,
  northwest: (7 * Math.PI) / 4,
  'north west': (7 * Math.PI) / 4,
});

const COMPASS_PHRASES = Object.freeze(
  Object.entries(COMPASS_MAP)
    .map(([phrase, angle]) => ({ phrase: normalizeText(phrase), angle }))
    .sort((a, b) => b.phrase.length - a.phrase.length),
);

const RELATIVE_PHRASES = Object.freeze([
  ['sang ben trai', -Math.PI / 2],
  ['di sang trai', -Math.PI / 2],
  ['move to the left', -Math.PI / 2],
  ['to the left', -Math.PI / 2],
  ['strafe left', -Math.PI / 2],
  ['sang trai', -Math.PI / 2],
  ['ben trai', -Math.PI / 2],
  ['left', -Math.PI / 2],
  ['sang ben phai', Math.PI / 2],
  ['di sang phai', Math.PI / 2],
  ['move to the right', Math.PI / 2],
  ['to the right', Math.PI / 2],
  ['strafe right', Math.PI / 2],
  ['sang phai', Math.PI / 2],
  ['ben phai', Math.PI / 2],
  ['right', Math.PI / 2],
  ['sau lung', Math.PI],
  ['phia sau', Math.PI],
  ['quay dau', Math.PI],
  ['lui lai', Math.PI],
  ['behind me', Math.PI],
  ['behind', Math.PI],
  ['turn around', Math.PI],
  ['backward', Math.PI],
].map(([phrase, delta]) => ({ phrase, delta })));

/**
 * Resolve a direction phrase into an absolute heading.
 *
 * Coordinate convention:
 * - 0 radians is 12 o'clock / north, vector (0, -1) on X-Z.
 * - positive angles rotate clockwise when viewed from above;
 *   3 o'clock / east is +π/2.
 *
 * Relative phrases are resolved against currentHeading immediately and are
 * marked with isRelative so callers can retain the source semantics.
 */
export class DirectionResolver {
  static CLOCK_MAP = CLOCK_MAP;
  static COMPASS_MAP = COMPASS_MAP;

  /**
   * @param {unknown} raw
   * @param {number} [currentHeading=0]
   * @returns {{ angle: number, isRelative: boolean } | null}
   */
  static parse(raw, currentHeading = 0) {
    if (typeof raw !== 'string') return null;
    const text = normalizeText(raw);
    if (!text) return null;

    const clock = parseClock(text);
    if (clock) return freezeResult(clock.angle, false);

    for (const item of COMPASS_PHRASES) {
      if (phraseMatches(text, item.phrase)) return freezeResult(item.angle, false);
    }

    const heading = Number.isFinite(currentHeading) ? normalizeAngle(currentHeading) : 0;
    for (const item of RELATIVE_PHRASES) {
      if (phraseMatches(text, item.phrase)) {
        return freezeResult(normalizeAngle(heading + item.delta), true);
      }
    }

    return null;
  }
}

function parseClock(text) {
  // Require an hour marker (`gio`, `h`, `o'clock`) or explicit `:30` so an
  // unrelated number in a sentence is never interpreted as a direction.
  const match = text.match(
    /(?:^|\s)(1[0-2]|[1-9])(?:(?:\s*(?:gio|h)\s*(ruoi|30)?)|(?:\s*:\s*30)|(?:\s+o\s*clock))(?!\s+\d)(?=$|\s)/,
  );
  if (!match) return null;

  const hour = Number(match[1]);
  const base = CLOCK_MAP[hour];
  if (base === undefined) return null;
  const isHalf = Boolean(match[2] || /:\s*30/.test(match[0]));
  return { angle: normalizeAngle(base + (isHalf ? Math.PI / 12 : 0)) };
}

function normalizeText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function phraseMatches(text, phrase) {
  return text === phrase || text.startsWith(`${phrase} `) ||
    text.endsWith(` ${phrase}`) || text.includes(` ${phrase} `);
}

function normalizeAngle(angle) {
  const normalized = angle % TAU;
  if (Object.is(normalized, -0) || normalized === 0) return 0;
  return normalized < 0 ? normalized + TAU : normalized;
}

function freezeResult(angle, isRelative) {
  return Object.freeze({ angle: normalizeAngle(angle), isRelative });
}
