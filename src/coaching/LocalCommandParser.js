// ─── Offline Live Fight command parser ─────────────────────────────
// Converts short English/Vietnamese coaching phrases into constrained data.
// It never creates tactics and never mutates simulation or scene state.

const LANGUAGES = Object.freeze(['en-US', 'vi-VN']);

const ACTION_PHRASES = Object.freeze([
  ['right hook', 'hook_right'], ['left hook', 'hook_left'],
  ['đấm móc phải', 'hook_right'], ['móc phải', 'hook_right'],
  ['đấm móc trái', 'hook_left'], ['móc trái', 'hook_left'],
  ['body cross', 'body_cross'], ['đấm thân phải', 'body_cross'],
  ['body jab', 'body_jab'], ['đấm thân', 'body_jab'],
  ['uppercut right', 'uppercut_right'], ['uppercut phải', 'uppercut_right'],
  ['uppercut left', 'uppercut_left'], ['uppercut trái', 'uppercut_left'],
  ['overhand', 'overhand'], ['đấm vòng', 'overhand'],
  ['cross', 'cross'], ['đấm thẳng phải', 'cross'],
  ['jab', 'jab'], ['đấm thẳng', 'jab'], ['đấm thẳng đi', 'jab'],
  ['feint', 'feint_jab'], ['giả đòn', 'feint_jab'],
  ['guard low', 'guard_low'], ['đỡ thấp', 'guard_low'],
  ['block', 'guard_high'], ['block him', 'guard_high'],
  ['guard high', 'guard_high'], ['high guard', 'guard_high'],
  ['đỡ cao', 'guard_high'], ['phòng thủ', 'guard_high'], ['đỡ', 'guard_high'],
  ['parry left', 'parry_left'], ['đỡ gạt trái', 'parry_left'],
  ['parry right', 'parry_right'], ['đỡ gạt phải', 'parry_right'],
  ['slip left', 'slip_left'], ['né trái', 'slip_left'],
  ['slip right', 'slip_right'], ['né phải', 'slip_right'],
  ['duck', 'duck'], ['cúi xuống', 'duck'],
  ['roll', 'roll'], ['lăn né', 'roll'], ['dodge', 'roll'], ['né', 'roll'],
]);

const OVERRIDE_PHRASES = Object.freeze([
  [['stay outside', 'keep distance', 'back up', 'stay back', 'back', 'giữ khoảng cách', 'lùi lại', 'đứng ngoài'],
    { preferredDistance: 'far' }],
  [['close in', 'get inside', 'move in', 'advance', 'press forward', 'áp sát', 'tiến lên', 'ép vào'],
    { preferredDistance: 'close', aggression: .25 }],
  [['circle', 'circle out', 'move sideways', 'đi vòng', 'di chuyển ngang'],
    { attention: 'movement', tempo: 'patient' }],
  [['be aggressive', 'pressure him', 'push forward', 'đánh chủ động', 'ép đối thủ', 'tấn công mạnh'],
    { aggression: .45, tempo: 'high' }],
  [['calm down', 'be patient', 'stop chasing', 'bình tĩnh', 'đừng đuổi', 'chậm lại'],
    { aggression: -.4, tempo: 'patient' }],
  [['target the body', 'attack the body', 'body shots', 'đánh vào thân', 'nhắm vào thân'],
    { targetZone: 'body' }],
  [['target the head', 'head shots', 'đánh vào đầu', 'nhắm vào đầu'],
    { targetZone: 'head' }],
  [['stop jabbing', 'no jabs', 'đừng đấm thẳng', 'ngừng đấm thẳng'],
    { avoidActions: ['jab', 'body_jab'] }],
]);

const normalize = value => value
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ').trim();

const phraseMatches = (text, phrase) => {
  const needle = normalize(phrase);
  return text === needle || new RegExp(`(?:^|\\s)${needle.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(?:$|\\s)`).test(text);
};

function commandId(prefix, options) {
  const supplied = typeof options.requestId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(options.requestId)
    ? options.requestId
    : globalThis.crypto?.randomUUID?.();
  return `${prefix}_${supplied || `${Date.now().toString(36)}_${normalize(options.fallbackText || '')}`}`;
}

function baseResult(kind, raw, options) {
  const language = LANGUAGES.includes(options.language) ? options.language : 'en-US';
  const tick = Number.isFinite(options.tick) ? Math.max(0, options.tick) : 0;
  return {
    kind,
    commandId: commandId(kind === 'direct_command' ? 'command' : 'override', { ...options, fallbackText: raw }),
    fighterId: options.fighterId || 'fighter_a',
    language,
    transcript: String(raw).slice(0, 256),
    createdAt: tick,
    expiresAt: tick + (kind === 'direct_command' ? 18 : 360),
    priority: kind === 'direct_command' ? .9 : .75,
    confidence: .98,
  };
}

export function parseCoachText(raw, options = {}) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  const normalized = normalize(text);
  if (!normalized) return { kind: 'unrecognized', reason: 'empty_transcript', transcript: '' };

  // Live Fight must never turn a temporal/conditional sentence into a tactic.
  if (/\b(when|if|after|then|counter|whenever)\b/.test(normalized) ||
      /\b(khi|neu|sau khi|roi|phan|bat cu khi nao)\b/.test(normalized)) {
    return { kind: 'unrecognized', reason: 'persistent_tactic_not_allowed_live', transcript: text.slice(0, 256) };
  }

  for (const [phrase, actionId] of ACTION_PHRASES) {
    if (phraseMatches(normalized, phrase)) {
      return { ...baseResult('direct_command', text, options), actionId };
    }
  }

  for (const [phrases, changes] of OVERRIDE_PHRASES) {
    if (phrases.some(phrase => phraseMatches(normalized, phrase))) {
      return { ...baseResult('blackboard_override', text, options), changes: { ...changes } };
    }
  }

  return { kind: 'unrecognized', reason: 'unsupported_phrase', transcript: text.slice(0, 256) };
}

export { LANGUAGES };
