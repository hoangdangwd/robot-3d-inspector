// ─── Local match/result/settings persistence ───────────────────────
// Best-effort browser storage. Domain callers keep working when storage is
// unavailable, corrupt, or quota-limited.

import { tryValidateReplayLog } from '../match/ReplaySchema.js';

const SETTINGS_KEY = 'robot-foundry.settings.v1';
const RESULTS_KEY = 'robot-foundry.results.v1';
const REPLAYS_KEY = 'robot-foundry.replays.v1';
const MAX_RESULTS = 20;
const MAX_REPLAYS = 5;
const MAX_REPLAY_JSON_CHARS = 2 * 1024 * 1024;

function storageOrNull(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
}

function readJson(storage, key, fallback) {
  try {
    const raw = storage?.getItem(key);
    const value = raw ? JSON.parse(raw) : fallback;
    return value ?? fallback;
  } catch { return fallback; }
}

export class MatchPersistence {
  constructor({ storage = null } = {}) {
    this.storage = storageOrNull(storage);
  }

  loadSettings() {
    const raw = readJson(this.storage, SETTINGS_KEY, {});
    return {
      speed: Number.isFinite(raw.speed) ? Math.max(.25, Math.min(2, raw.speed)) : 1,
      loop: raw.loop !== false,
      gridVisible: raw.gridVisible !== false,
      language: raw.language === 'vi-VN' ? 'vi-VN' : 'en-US',
      reducedMotion: raw.reducedMotion === true,
    };
  }

  saveSettings(patch) {
    const next = { ...this.loadSettings(), ...patch };
    try { this.storage?.setItem(SETTINGS_KEY, JSON.stringify(next)); return { ok: true, value: next }; }
    catch { return { ok: false, error: 'storage_failed' }; }
  }

  saveResult(result) {
    if (!result || typeof result !== 'object') return { ok: false, error: 'invalid_result' };
    const current = this.listResults();
    const id = result.id || `match_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const entry = { ...result, id, savedAt: Date.now() };
    const next = [entry, ...current].slice(0, MAX_RESULTS);
    try { this.storage?.setItem(RESULTS_KEY, JSON.stringify(next)); return { ok: true, value: entry }; }
    catch { return { ok: false, error: 'storage_failed' }; }
  }

  listResults() {
    const raw = readJson(this.storage, RESULTS_KEY, []);
    return Array.isArray(raw) ? raw.filter(item => item && typeof item === 'object').slice(0, MAX_RESULTS) : [];
  }

  clearResults() {
    try { this.storage?.removeItem(RESULTS_KEY); return { ok: true }; }
    catch { return { ok: false, error: 'storage_failed' }; }
  }

  saveReplay(replay, { matchId = null } = {}) {
    const validation = tryValidateReplayLog(replay);
    if (!validation.ok) return { ok: false, error: 'invalid_replay', details: validation.errors };
    const normalized = validation.value;
    const current = this.listReplays();
    const next = [{ savedAt: Date.now(), matchId, replay: normalized }, ...current].slice(0, MAX_REPLAYS);
    try {
      this.storage?.setItem(REPLAYS_KEY, JSON.stringify(next));
      return { ok: true, value: next[0] };
    }
    catch { return { ok: false, error: 'storage_failed' }; }
  }

  importReplay(input) {
    let raw = input;
    if (typeof input === 'string') {
      if (input.length > MAX_REPLAY_JSON_CHARS) return { ok: false, error: 'replay_too_large' };
      try { raw = JSON.parse(input); }
      catch { return { ok: false, error: 'invalid_json' }; }
    }
    const saved = this.saveReplay(raw);
    if (!saved.ok) return saved;
    return { ok: true, replay: saved.value?.replay || raw };
  }

  clearReplays() {
    try { this.storage?.removeItem(REPLAYS_KEY); return { ok: true }; }
    catch { return { ok: false, error: 'storage_failed' }; }
  }

  listReplays() {
    const raw = readJson(this.storage, REPLAYS_KEY, []);
    if (!Array.isArray(raw)) return [];
    return raw.map(item => {
      if (!item?.replay || typeof item.replay !== 'object') return null;
      const validation = tryValidateReplayLog(item.replay);
      if (!validation.ok) return null;
      return {
        savedAt: Number.isFinite(item.savedAt) ? item.savedAt : 0,
        matchId: typeof item.matchId === 'string' ? item.matchId : null,
        replay: validation.value,
      };
    }).filter(Boolean).slice(0, MAX_REPLAYS);
  }

  exportReplay(replay) {
    const validation = tryValidateReplayLog(replay);
    if (!validation.ok) return { ok: false, error: 'invalid_replay', details: validation.errors };
    return { ok: true, value: JSON.stringify(validation.value, null, 2) };
  }
}

export const persistenceKeys = Object.freeze({ SETTINGS_KEY, RESULTS_KEY, REPLAYS_KEY });
