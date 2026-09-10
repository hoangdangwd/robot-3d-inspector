// ─── Phase 8 validation: match lifecycle and deterministic replay ─────
import assert from 'node:assert/strict';
import { CombatSimulation } from '../src/combat/CombatSimulation.js';
import { MatchReplay, REPLAY_LOG_VERSION } from '../src/match/MatchReplay.js';
import { MatchPersistence } from '../src/persistence/MatchPersistence.js';
import { createActionIntent } from '../src/combat/CombatTypes.js';
import * as R from '../src/combat/CombatRules.js';

let assertions = 0;
const ok = (condition, message) => { assert.ok(condition, message); assertions++; };
const intent = (fighterId, actionId, tick = 0) => createActionIntent({
  actionId, source: 'ai', priority: .8, createdAt: tick, expiresAt: tick + 120,
  targetId: fighterId === 'fighter_a' ? 'fighter_b' : 'fighter_a', reason: 'phase8_fixture',
});
const step = (sim, ticks) => { for (let i = 0; i < ticks; i++) sim.update(1 / R.TICK_RATE); };

console.log('\n── Match lifecycle: KO ──');
{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral', roundDurationTicks: 120 });
  sim.fighterA.z = -.5; sim.fighterB.z = .5;
  sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;
  sim.fighterB.health = 5;
  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab'));
  step(sim, 10);
  ok(sim.matchStatus === 'ko', 'health zero ends match by KO');
  ok(sim.winnerId === 'fighter_a', 'attacker wins KO');
  ok(sim.matchResult?.reason === 'ko', 'KO result has reason');
  ok(sim.update(1) === 0, 'finished match does not advance');
}

console.log('\n── Match lifecycle: timed decision ──');
{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral', roundDurationTicks: 3 });
  sim.fighterA.health = 70;
  sim.fighterB.health = 40;
  step(sim, 3);
  ok(sim.matchStatus === 'time', 'timer ends match');
  ok(sim.winnerId === 'fighter_a', 'higher health wins timed decision');
  ok(sim.matchResult?.reason === 'time', 'timed result has reason');
  ok(sim.getRoundTicksRemaining() === 0, 'remaining ticks clamp to zero');
}

console.log('\n── Match lifecycle: draw ──');
{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral', roundDurationTicks: 2 });
  step(sim, 2);
  ok(sim.matchStatus === 'draw', 'equal health at timer produces draw');
  ok(sim.winnerId === null, 'draw has no winner');
  ok(sim.matchResult?.reason === 'draw', 'draw result has reason');
}

console.log('\n── Reset clears terminal state ──');
{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral', roundDurationTicks: 1 });
  step(sim, 1);
  ok(sim.matchStatus !== 'fighting', 'fixture reaches terminal state');
  sim.reset();
  ok(sim.matchStatus === 'fighting' && sim.matchResult === null && sim.winnerId === null, 'reset clears result and resumes match');
  ok(sim.getRoundTicksRemaining() === 1, 'reset restores round timer');
}

console.log('\n── Replay export and version guard ──');
{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral', seed: 88, roundDurationTicks: 120 });
  sim.fighterA.z = -.5; sim.fighterB.z = .5;
  sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;
  sim.captureInitialState();
  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab'));
  step(sim, 40);
  const log = MatchReplay.exportLog(sim, { defIdA: 'test_neutral', defIdB: 'test_neutral' });
  ok(log.version === REPLAY_LOG_VERSION, 'replay export has version');
  ok(log.events.length > 0 && log.seed === 88, 'replay includes events and seed');
  const replay = new MatchReplay(log);
  replay.stepToTick(40);
  const replayState = replay.getState();
  ok(replayState.tick === 40, 'replay advances to requested tick');
  ok(replayState.a.health === sim.fighterA.health && replayState.b.health === sim.fighterB.health, 'replay reproduces health at same tick');
  ok(replayState.matchStatus === sim.matchStatus, 'replay reproduces match status');
  ok(replay._sim.getReplayInputs().some(input => input.type === 'intent_submitted'), 'replay log contains authoritative intent input');
  ok(log.initialState.fighter_a.z === -.5, 'replay captures post-setup initial state');
  assert.throws(() => new MatchReplay({ ...log, version: 999 }), /incompatible log version/);
  ok(true, 'incompatible replay version is rejected');
  assert.throws(() => new MatchReplay({ ...log, defIdA: 'unknown_robot' }), /defIdA is unknown/);
  ok(true, 'unknown replay fighter is rejected');
}

console.log('\n── Replay deterministic final state ──');
{
  const sim = new CombatSimulation({ defIdA: 'test_neutral', defIdB: 'test_neutral', seed: 99, roundDurationTicks: 30 });
  sim.fighterA.z = -.5; sim.fighterB.z = .5;
  sim.fighterA.facing = 0; sim.fighterB.facing = Math.PI;
  sim.submitIntentFor('fighter_a', intent('fighter_a', 'jab'));
  step(sim, 30);
  const log = MatchReplay.exportLog(sim, { defIdA: 'test_neutral', defIdB: 'test_neutral' });
  const r1 = new MatchReplay(log); r1.stepToEnd();
  const r2 = new MatchReplay(log); r2.stepToEnd();
  ok(JSON.stringify(r1.getState()) === JSON.stringify(r2.getState()), 'same replay log produces same final state');
}

console.log('\\n── Local persistence: results/settings/corruption ──');
{
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const persistence = new MatchPersistence({ storage });
  ok(persistence.loadSettings().speed === 1, 'settings default safely');
  ok(persistence.saveSettings({ speed: 1.5, reducedMotion: true }).ok, 'settings commit succeeds');
  const loaded = persistence.loadSettings();
  ok(loaded.speed === 1.5 && loaded.reducedMotion === true, 'settings reloads');
  const savedResult = persistence.saveResult({ reason: 'ko', winnerId: 'fighter_a', tick: 10, finalHealth: { fighter_a: 80, fighter_b: 0 } });
  ok(savedResult.ok && savedResult.value.id, 'result commit succeeds with match id');
  ok(persistence.listResults().length === 1, 'result list reloads');
  data.set('robot-foundry.settings.v1', '{bad');
  ok(persistence.loadSettings().speed === 1, 'corrupt settings fall back');
  data.set('robot-foundry.results.v1', '{bad');
  ok(persistence.listResults().length === 0, 'corrupt results fall back empty');
}

console.log('\\n── Local persistence: replay export/import/retention ──');
{
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const persistence = new MatchPersistence({ storage });
  const sampleReplay = {
    version: 1,
    defIdA: 'forge-titan',
    defIdB: 'aegis-prime',
    seed: 42,
    roundDurationTicks: 100,
    totalTicks: 0,
    initialState: {
      fighter_a: { x: 0, z: -1.2, facing: 0, health: 100, stamina: 100, posture: 100, status: 'ready', actionId: 'none', actionPhase: 'idle', actionTick: 0 },
      fighter_b: { x: 0, z: 1.2, facing: Math.PI, health: 100, stamina: 100, posture: 100, status: 'ready', actionId: 'none', actionPhase: 'idle', actionTick: 0 },
    },
    inputs: [],
    replayMeta: [],
    events: [],
  };

  ok(persistence.saveReplay(sampleReplay, { matchId: 'm1' }).ok, 'saveReplay succeeds');
  ok(persistence.listReplays().length === 1, 'listReplays returns saved item');
  ok(persistence.listReplays()[0].matchId === 'm1', 'saved replay preserves matchId association');
  ok(persistence.saveReplay({ ...sampleReplay, seed: 43 }, { matchId: 'm2' }).ok, 'second replay saves independently');

  const jsonExport = persistence.exportReplay(sampleReplay);
  ok(jsonExport.ok && typeof jsonExport.value === 'string', 'exportReplay returns valid string');

  const imported = persistence.importReplay(jsonExport.value);
  ok(imported.ok && imported.replay.version === 1, 'importReplay succeeds with exported string');
  ok(persistence.listReplays().length === 3, 'imported replay added to storage list');

  ok(persistence.importReplay('{malformed json').ok === false, 'importReplay rejects malformed JSON');
  ok(persistence.importReplay(JSON.stringify({ version: 99 })).ok === false, 'importReplay rejects incompatible version');
  ok(persistence.importReplay(JSON.stringify({ version: 1 })).ok === false, 'importReplay rejects missing replay fields');
  ok(persistence.importReplay(JSON.stringify({ ...sampleReplay, initialState: { fighter_a: { health: 'oops' }, fighter_b: sampleReplay.initialState.fighter_b } })).ok === false, 'importReplay rejects malformed initial state');
  ok(persistence.importReplay(JSON.stringify({ ...sampleReplay, inputs: 'not-an-array' })).ok === false, 'importReplay rejects malformed input stream');
  ok(persistence.listReplays().some(entry => entry.matchId === null), 'imported replay remains explicitly unassociated');

  ok(persistence.clearReplays().ok, 'clearReplays succeeds');
  ok(persistence.listReplays().length === 0, 'listReplays is empty after clear');
}

console.log(`\nPASS: ${assertions} assertions. Phase 8 lifecycle/replay validated.\n`);
