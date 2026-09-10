// ─── Versioned local playbook store ────────────────────────────────
// Browser persistence is optional; the domain store is usable in Node tests.
// Version history: keeps up to MAX_HISTORY past revisions for rollback/replay.

import { validatePlaybook } from './TacticSchema.js';

const STORE_VERSION = 1;
const MAX_HISTORY = 10;

export class PlaybookStore {
  constructor({ storage = null, key = 'robot-foundry.playbook.v1', capacity = Infinity } = {}) {
    this.storage = storage;
    this.key = key;
    this.capacity = capacity;
    this._revision = 0;
    this._tactics = [];
    /** @type {Array<{revision: number, tactics: object[], totalCost: number, committedAt: number}>} */
    this._history = [];
  }

  load() {
    if (!this.storage) return this.snapshot();
    let raw;
    try { raw = JSON.parse(this.storage.getItem(this.key) || 'null'); } catch { raw = null; }
    if (!raw || raw.storeVersion !== STORE_VERSION) return this.snapshot();
    const result = validatePlaybook(raw.tactics, { capacity: this.capacity });
    if (!result.ok) return this.snapshot();
    this._revision = Number.isInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0;
    this._tactics = [...result.value];
    this._history = this._validateHistory(raw.history);
    return this.snapshot();
  }

  commit(tactics, expectedRevision = this._revision) {
    if (expectedRevision !== this._revision) return { ok: false, error: 'revision_conflict' };
    const result = validatePlaybook(tactics, { capacity: this.capacity });
    if (!result.ok) return { ok: false, error: 'validation_failed', details: result.errors };
    const nextRevision = this._revision + 1;
    // Build candidate state first; no in-memory mutation before persistence
    // succeeds, preserving atomic commit semantics on quota/storage failure.
    const nextHistory = this._history.map(entry => ({ ...entry, tactics: [...entry.tactics] }));
    if (this._tactics.length > 0 || this._revision > 0) {
      nextHistory.push({
        revision: this._revision,
        tactics: [...this._tactics],
        totalCost: _sumCost(this._tactics),
        committedAt: Date.now(),
      });
      if (nextHistory.length > MAX_HISTORY) nextHistory.shift();
    }
    const next = {
      storeVersion: STORE_VERSION,
      revision: nextRevision,
      tactics: result.value,
      totalCost: result.totalCost,
      history: nextHistory,
    };
    if (this.storage) {
      try {
        this.storage.setItem(this.key, JSON.stringify(next));
      } catch {
        return { ok: false, error: 'storage_failed' };
      }
    }
    this._revision = nextRevision;
    this._tactics = [...result.value];
    this._history = nextHistory;
    return { ok: true, revision: this._revision, totalCost: result.totalCost, tactics: [...this._tactics] };
  }

  _validateHistory(history) {
    if (!Array.isArray(history)) return [];
    const valid = [];
    for (const entry of history) {
      if (!entry || !Number.isInteger(entry.revision) || entry.revision < 1 || !Array.isArray(entry.tactics)) continue;
      const result = validatePlaybook(entry.tactics, { capacity: this.capacity });
      if (!result.ok) continue;
      valid.push({
        revision: entry.revision,
        tactics: [...result.value],
        totalCost: result.totalCost,
        committedAt: Number.isFinite(entry.committedAt) ? entry.committedAt : 0,
      });
    }
    return valid.slice(-MAX_HISTORY);
  }

  /**
   * Roll back to a specific previous revision (explicit operation, not silent).
   * Returns { ok, tactics, revision } or { ok: false, error }.
   * The rollback itself creates a new commit, so revision still increments.
   * @param {number} targetRevision
   * @param {number} expectedRevision - current revision (conflict guard)
   */
  rollback(targetRevision, expectedRevision = this._revision) {
    const entry = this._history.find(h => h.revision === targetRevision);
    if (!entry) return { ok: false, error: 'revision_not_in_history' };
    return this.commit(entry.tactics, expectedRevision);
  }

  /**
   * Return the retained history entries (read-only copies).
   * @returns {Array<{revision: number, tactics: object[], totalCost: number, committedAt: number}>}
   */
  history() {
    return this._history.map(h => ({ ...h, tactics: [...h.tactics] }));
  }

  snapshot() {
    return {
      storeVersion: STORE_VERSION,
      revision: this._revision,
      totalCost: _sumCost(this._tactics),
      tactics: [...this._tactics],
      historyDepth: this._history.length,
    };
  }
}

function _sumCost(tactics) {
  let cost = 0;
  for (const tactic of tactics) {
    cost += 1 + (tactic.abort?.length || 0) + (tactic.repeatLimit > 1 ? 1 : 0);
    for (const phase of tactic.phases || []) cost += phase.sequence.length + (phase.branches?.length || 0) * 2;
  }
  return cost;
}
