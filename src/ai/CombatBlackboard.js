// ─── Temporary combat blackboard ───────────────────────────────────
// Current working memory only. It is not a persistent tactical playbook.

const DEFAULTS = Object.freeze({
  aggression: 0,
  preferredDistance: 'mid',
  targetZone: 'any',
  tempo: 'normal',
  risk: 0,
  guardBias: 0,
  attention: 'center',
  avoidActions: Object.freeze([]),
});

const DISTANCES = new Set(['close', 'mid', 'far']);
const ZONES = new Set(['any', 'head', 'body']);
const TEMPOS = new Set(['patient', 'normal', 'high']);
const ATTENTION = new Set(['center', 'movement']);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export class CombatBlackboard {
  constructor({ fighterId, base = {} } = {}) {
    this.fighterId = fighterId;
    this.base = Object.freeze({ ...DEFAULTS, ...base });
    this.overrides = new Map();
  }

  apply(override) {
    if (!override || override.kind !== 'blackboard_override' || override.fighterId !== this.fighterId) {
      return { status: 'rejected', reason: 'invalid_override' };
    }
    const changes = validateChanges(override.changes);
    if (!changes) return { status: 'rejected', reason: 'invalid_changes' };
    // New coaching input supersedes older values for the same fields while
    // preserving unrelated temporary guidance.
    const changedKeys = new Set(Object.keys(changes));
    for (const [id, active] of this.overrides) {
      if (Object.keys(active.changes).some(key => changedKeys.has(key))) this.overrides.delete(id);
    }
    this.overrides.set(override.commandId, {
      ...override,
      changes,
      status: 'active',
    });
    return { status: 'active', commandId: override.commandId };
  }

  cancel(commandId) {
    return this.overrides.delete(commandId);
  }

  snapshot(tick) {
    const result = { ...this.base, avoidActions: [...(this.base.avoidActions || [])] };
    for (const [id, override] of this.overrides) {
      if (tick >= override.expiresAt) {
        this.overrides.delete(id);
        continue;
      }
      mergeChanges(result, override.changes);
    }
    return result;
  }

  active(tick) {
    this.snapshot(tick);
    return [...this.overrides.values()].map(item => ({ ...item, changes: { ...item.changes } }));
  }

  reset() { this.overrides.clear(); }

  // Stable identity for the persistent playbook boundary. Blackboard changes
  // must never alter this value.
  definitionHash() { return `base:${this.fighterId}:v1`; }
}

function validateChanges(changes) {
  if (!changes || typeof changes !== 'object') return null;
  const output = {};
  if (changes.preferredDistance !== undefined) {
    if (!DISTANCES.has(changes.preferredDistance)) return null;
    output.preferredDistance = changes.preferredDistance;
  }
  if (changes.targetZone !== undefined) {
    if (!ZONES.has(changes.targetZone)) return null;
    output.targetZone = changes.targetZone;
  }
  if (changes.tempo !== undefined) {
    if (!TEMPOS.has(changes.tempo)) return null;
    output.tempo = changes.tempo;
  }
  if (changes.attention !== undefined) {
    if (!ATTENTION.has(changes.attention)) return null;
    output.attention = changes.attention;
  }
  for (const key of ['aggression', 'risk', 'guardBias']) {
    if (changes[key] !== undefined) {
      if (typeof changes[key] !== 'number' || !Number.isFinite(changes[key])) return null;
      output[key] = clamp(changes[key], -1, 1);
    }
  }
  if (changes.avoidActions !== undefined) {
    if (!Array.isArray(changes.avoidActions) || changes.avoidActions.length > 12 ||
        changes.avoidActions.some(id => typeof id !== 'string' || !/^[a-z][a-z0-9_-]*$/.test(id))) return null;
    output.avoidActions = [...new Set(changes.avoidActions)];
  }
  return output;
}

function mergeChanges(target, changes) {
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'avoidActions') target.avoidActions = [...new Set([...target.avoidActions, ...value])];
    else if (typeof value === 'number') target[key] = clamp(target[key] + value, -1, 1);
    else target[key] = value;
  }
}
