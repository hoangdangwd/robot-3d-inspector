// ─── Session-scoped player rule memory ──────────────────────────────
// Accumulates natural-language rules the player teaches the bot during
// a session. Rules are plain text descriptions stored in an array;
// Jev reads them as part of the game state and classifies actions
// accordingly. No rule engine, no code generation.

const MAX_RULES = 30;
const MAX_RULE_LENGTH = 256;

export class MemoryStore {
  constructor() {
    /** @type {Array<{ text: string, addedAt: number, active: boolean }>} */
    this.rules = [];
    this.nextId = 1;
  }

  /**
   * Add a player rule. Newest rules take priority (appended last).
   * If at capacity, the oldest rule is dropped (FIFO).
   * @param {string} text  Natural-language rule.
   * @param {number} tick  Simulation tick when added.
   * @returns {{ ok: true, index: number } | { ok: false, error: string }}
   */
  add(text, tick = 0) {
    const trimmed = typeof text === 'string' ? text.trim().slice(0, MAX_RULE_LENGTH) : '';
    if (!trimmed) return { ok: false, error: 'empty_rule' };
    const safeTick = Number.isSafeInteger(tick) && tick >= 0 ? tick : 0;
    if (this.rules.length >= MAX_RULES) this.rules.shift();
    const index = this.rules.push({ id: 'rule_' + this.nextId++, text: trimmed, addedAt: safeTick, active: true }) - 1;
    return { ok: true, index };
  }

  /** Toggle a rule on/off without removing it. */
  toggle(index) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.rules.length) return false;
    this.rules[index].active = !this.rules[index].active;
    return true;
  }

  /** Remove a rule by index. */
  remove(index) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.rules.length) return false;
    this.rules.splice(index, 1);
    return true;
  }

  /** Active rules as a newline-joined string for Jev state context. */
  toStateString() {
    const active = this.rules.filter(r => r.active);
    if (!active.length) return '';
    return active.map((r, i) => `${i + 1}. ${r.text}`).join('\n');
  }

  /** Serializable snapshot for debugging / UI. */
  snapshot() {
    return this.rules.map((r, i) => ({ ...r, index: i }));
  }

  /** Clear all rules (new session). */
  reset() {
    this.rules.length = 0;
    this.nextId = 1;
  }
}
