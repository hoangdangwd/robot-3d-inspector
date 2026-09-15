import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FightMode } from '../src/combat/FightMode.js';
import { createActionIntent } from '../src/combat/CombatTypes.js';
import { ROBOT_CATALOG } from '../src/robots/robotCatalog.js';
import { RobotFactory } from '../src/robots/RobotFactory.js';
import { Fighter } from '../src/combat/Fighter.js';
import { R15_PART_NAMES } from '../src/robots/robotCatalog.js';
import bakedClips from '../src/robots/motions/quaternius-clips.json' with { type: 'json' };

// Validate the shipped asset itself, not just the derived clips. No test or
// runtime path is allowed to require the removed demo directory.
assert.deepEqual(Object.keys(bakedClips).sort(), ['Heavy punch', 'Hook', 'Jab', 'Walk']);
for (const clip of Object.values(bakedClips)) {
  assert.match(clip.source, /Quaternius UAL[12]/);
  assert.ok(Number.isFinite(clip.duration) && clip.duration > 0);
  assert.ok(clip.times.length > 1 && clip.times[0] === 0);
  assert.ok(clip.times.every((t, i) => Number.isFinite(t) && (i === 0 || t > clip.times[i - 1])));
  assert.ok(Math.abs(clip.times.at(-1) - clip.duration) < .0001);
  assert.deepEqual(Object.keys(clip.rotations).sort(), [...R15_PART_NAMES].sort());
  assert.equal(clip.positions.length, clip.times.length * 3);
  assert.ok(clip.positions.every(Number.isFinite));
  for (const values of Object.values(clip.rotations)) {
    assert.equal(values.length, clip.times.length * 4);
    assert.ok(values.every(Number.isFinite));
    for (let i = 0; i < values.length; i += 4) assert.ok(Math.abs(Math.hypot(...values.slice(i, i + 4)) - 1) < .0001);
  }
}

const mode = new FightMode(new THREE.Scene(), { defIdA: 'volt-kestrel', defIdB: 'forge-titan' });
try {
  mode.sim.submitIntentFor('fighter_a', createActionIntent({ actionId: 'cross', source: 'ai', priority: 1,
    createdAt: 0, expiresAt: 60, targetId: 'fighter_b', reason: 'motion regression' }));
  let previous = -1;
  const phases = new Set();
  for (let tick = 1; tick < 40; tick++) {
    mode.sim.update(1 / 60);
    mode._syncPresentation(0);
    const state = mode.sim.fighterA;
    if (state.actionId !== 'cross') continue;
    const fighter = mode.fighterA;
    const fraction = fighter.getCurrentTime() / fighter.getDuration();
    assert.ok(fraction >= previous, `phase must not restart clip: ${state.actionPhase} ${fraction} < ${previous}`);
    if (state.actionPhase === 'active') assert.ok(fraction >= .39, 'contact uses extension, not a restarted windup');
    if (state.actionPhase === 'recovery') assert.ok(fraction >= .47, 'recovery begins at follow-through');
    previous = fraction;
    phases.add(state.actionPhase);
    const pose = Object.values(fighter.parts).flatMap(p => p.quaternion.toArray());
    mode._syncPresentation(.03);
    assert.deepEqual(Object.values(fighter.parts).flatMap(p => p.quaternion.toArray()), pose, 'same simulation tick gives the same pose regardless of render delta');
  }
  assert.equal(phases.size, 3);
} finally { mode.dispose(); }

for (const definition of ROBOT_CATALOG) {
  const fighter = Fighter.fromFactory(definition, RobotFactory.create(definition));
  try {
    for (const id of ['jab', 'cross', 'hook_left', 'hook_right', 'walk_forward']) {
      fighter.playAnimation(id, { crossFade: 0 });
      assert.equal(Boolean(fighter.currentMeta.reference), true, `${id} actually uses the reference motion data`);
    }
    const headX = (id, fraction) => {
      fighter.playAnimation(id, { crossFade: 0 });
      fighter.scrubToTime(fighter.getDuration() * fraction);
      const head = fighter.parts.Head.getWorldPosition(new THREE.Vector3());
      const hip = fighter.parts.LowerTorso.getWorldPosition(new THREE.Vector3());
      return head.x - hip.x;
    };
    const leftSlip = headX('slip_left', .3);
    const rightSlip = headX('slip_right', .3);
    assert.ok(leftSlip > headX('idle', 0) + .025, 'anatomical left slip moves toward +X');
    assert.ok(rightSlip < headX('idle', 0) - .025, 'anatomical right slip moves toward -X');
    for (const id of ['jab', 'cross', 'hook_left', 'hook_right', 'uppercut_left', 'uppercut_right']) {
      fighter.playAnimation(id, { crossFade: 0 });
      const side = fighter.currentMeta.support;
      assert.ok(side === 'LeftFoot' || side === 'RightFoot');
      const positions = [];
      for (const t of [0, .18, .3, .4, .48, .7, 1]) {
        fighter.scrubToTime(t * fighter.getDuration());
        const point = new THREE.Vector3(0, 0, definition.proportions.foot[2] * .3);
        fighter.parts[side].localToWorld(point);
        positions.push(point);
      }
      assert.ok(positions.every(p => Math.hypot(p.x - positions[0].x, p.z - positions[0].z) < 1e-5), `${definition.id}/${id}: planted toe must not slide`);
    }
  } finally { fighter.dispose(); }
}
console.log('PASS: reference-backed clips, anatomical slips, planted support, combat phase sync and render-rate independence.');
