import assert from 'node:assert/strict';
import { ROBOT_CATALOG } from '../src/robots/robotCatalog.js';
import { createRobotAnimations } from '../src/robots/RobotAnimations.js';
import { RobotFactory } from '../src/robots/RobotFactory.js';
import { Fighter } from '../src/combat/Fighter.js';
import * as THREE from 'three';

const required = ['idle','signature','walk_forward','walk_backward','strafe_left','strafe_right','pivot_left','pivot_right','step_in','step_out','jab','cross','hook_left','hook_right','uppercut_left','uppercut_right','body_jab','body_cross','overhand','feint_jab','guard_high','guard_low','parry_left','parry_right','slip_left','slip_right','duck','roll','hit_head_left','hit_head_right','hit_body','stagger','guard_break','knockdown','down','get_up'];
const variantSamples = new Map(required.map(id => [id, new Set()]));
for (const robot of ROBOT_CATALOG) {
  const clips = createRobotAnimations(robot);
  assert.equal(clips.length, 40, `${robot.id}: complete baseline`);
  const byId = new Map(clips.map(c => [c.userData.id, c]));
  assert.equal(byId.size, 40, 'unique semantic IDs');
  for (const id of required) assert.ok(byId.has(id), `missing ${id}`);
  for (const clip of clips) {
    assert.ok(clip.validate());
    assert.equal(clip.tracks.length, 16);
    assert.ok(!clip.tracks.some(t => t.name.includes('.rotation')), 'no Euler/quaternion binding conflict');
    assert.equal(clip.tracks.filter(t => t.name.endsWith('.quaternion')).length, 15);
    assert.ok(['cycle','repeatable','once','hold'].includes(clip.userData.playback));
    assert.ok(clip.userData.family && clip.userData.entry && clip.userData.exit);
    let previous = 0;
    for (const impact of clip.userData.impacts) {
      assert.ok(impact > previous && impact < 1); previous = impact;
    }
    for (const track of clip.tracks) {
      assert.ok(track.values.every(Number.isFinite));
      if (track.name.endsWith('.quaternion')) for (let i = 0; i < track.values.length; i += 4) {
        assert.ok(Math.abs(Math.hypot(...track.values.slice(i, i+4)) - 1) < 1e-5);
      }
    }
    if (variantSamples.has(clip.userData.id)) {
      variantSamples.get(clip.userData.id).add(JSON.stringify(clip.tracks.map(t => Array.from(t.createInterpolant().evaluate(clip.duration * .43)))));
    }
  }
  const fighter = Fighter.fromFactory(robot, RobotFactory.create(robot));
  for (const clip of clips) {
    fighter.playAnimation(clip.userData.id, { crossFade: 0 });
    assert.equal(fighter.currentMeta.id, clip.userData.id, 'semantic playback');
    fighter.scrubToTime(clip.duration * .43);
    const pose = () => Object.values(fighter.parts).flatMap(p => [...p.quaternion.toArray(), ...p.position.toArray()]);
    const snapshot = pose();
    fighter.scrubToTime(clip.duration * .9);
    fighter.scrubToTime(clip.duration * .43);
    assert.deepEqual(pose(), snapshot, 'seek independent of sample history');
    for (let i = 0; i <= 20; i++) {
      fighter.scrubToTime(clip.duration * i / 20);
      assert.ok(new THREE.Box3().setFromObject(fighter.root, true).min.y >= -.008, `${robot.id}/${clip.name} body penetrates ground`);
    }
  }
  for (const side of ['Left', 'Right']) {
    fighter.playAnimation(`hook_${side.toLowerCase()}`, { crossFade: 0 });
    fighter.scrubToTime(fighter.getDuration() * .4);
    const shoulder = fighter.parts[`${side}UpperArm`].getWorldPosition(new THREE.Vector3());
    const elbow = fighter.parts[`${side}LowerArm`].getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(elbow.y - shoulder.y) < .3, 'hook elbow stays near shoulder plane, not an overhead salute');
  }
  const sampleEnd = (id, fraction) => {
    fighter.playAnimation(id, { crossFade: 0 });
    fighter.scrubToTime(fighter.getDuration() * fraction);
    fighter.group.updateMatrixWorld(true);
    return Object.values(fighter.parts).flatMap(p => p.matrixWorld.elements);
  };
  const fallEnd = sampleEnd('knockdown', 1);
  for (const other of [sampleEnd('down', 0), sampleEnd('get_up', 0)]) {
    assert.ok(other.every((v,i) => Math.abs(v-fallEnd[i]) < 1e-5), 'down chain endpoint match');
  }
  fighter.setLoop(false);
  fighter.playAnimation('jab', { crossFade: 0 });
  fighter.scrubToTime(fighter.getDuration() - .01);
  fighter.resume();
  fighter.playAnimation('cross');
  fighter.update(.03);
  assert.equal(fighter.isPaused, false, 'outgoing one-shot finishing must not pause incoming action');
  fighter.setLoop(true);
  fighter.playAnimation('knockdown', { crossFade: 0 });
  fighter.update(fighter.getDuration() + .2);
  assert.ok(fighter.isPaused, 'fall must not loop even with repeat enabled');
  const torsoDown = fighter.parts.LowerTorso.getWorldQuaternion(new THREE.Quaternion());
  assert.ok(Math.abs(torsoDown.x) > .4, 'down is a genuine horizontal pose');
  fighter.dispose();
}
for (const [id, poses] of variantSamples) assert.equal(poses.size, 5, `${id}: pose variants, not duration-only`);
console.log('PASS: 200 clips; semantic coverage, unique pose variants, single rotation ownership, seek, ground and down/get-up endpoints.');
