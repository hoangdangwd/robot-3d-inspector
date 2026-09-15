import * as THREE from 'three';
import bakedClips from './motions/quaternius-clips.json' with { type: 'json' };

// The reference already bakes Quaternius onto the same +Z, arms-down R15
// coordinate contract. Do NOT multiply its rotations by a new rest-pose delta:
// that would rotate straight punches sideways on this rig.
const SOURCES = {
  jab: 'Jab', cross: 'Heavy punch', body_jab: 'Jab', body_cross: 'Heavy punch',
  hook_left: 'Hook', hook_right: 'Hook', walk_forward: 'Walk', walk_backward: 'Walk',
};
const smooth = t => t * t * (3 - 2 * t);
const envelope = t => smooth(Math.min(1, t / .16)) * smooth(Math.min(1, (1 - t) / .18));
const mirroredName = name => name.startsWith('Left') ? name.replace('Left', 'Right') : name.startsWith('Right') ? name.replace('Right', 'Left') : name;

function sourceTime(t, source) {
  // Preserve the source's acceleration, but put its extension at our .40
  // marker. UAL2 Hook is an open-ended melee swing; its return is authored.
  const contact = source === 'Jab' ? .25 : source === 'Hook' ? .55 : .33;
  const knots = [[0, 0], [.16, .13], [.29, .17], [.4, contact], [.48, source === 'Hook' ? .64 : .48], [.76, .82], [1, 1]];
  const i = Math.max(1, knots.findIndex(k => k[0] >= t));
  const a = knots[i - 1], b = knots[i];
  return THREE.MathUtils.lerp(a[1], b[1], (t - a[0]) / (b[0] - a[0]));
}

/** Offline clip construction only: no sampling/allocation in the frame loop. */
export function applyReferenceMotion(clip, spec, definition) {
  const sourceName = SOURCES[spec.id];
  if (!sourceName) return clip;
  const data = bakedClips[sourceName];
  const walk = sourceName === 'Walk';
  const hook = sourceName === 'Hook';
  const mirror = spec.id === 'hook_left';
  const body = spec.id.startsWith('body_');
  const side = spec.id.includes('jab') || spec.id === 'hook_left' ? 'Left' : 'Right';
  const styleWeight = { forge: .86, aegis: .80, vanta: .96, volt: .93, mantis: .90 }[definition.featureStyle];
  const q = new THREE.Quaternion(), authored = new THREE.Quaternion();
  const first = new THREE.Quaternion(), delta = new THREE.Quaternion();
  const correction = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), .35);
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.quaternion')) continue;
    const name = track.name.split('.')[0];
    const sourcePart = mirror ? mirroredName(name) : name;
    const interpolant = new THREE.QuaternionKeyframeTrack('source', data.times, data.rotations[sourcePart]).createInterpolant();
    first.fromArray(data.rotations[sourcePart]).normalize();
    if (mirror) first.set(first.x, -first.y, -first.z, first.w);
    for (let i = 0; i < track.times.length; i++) {
      const t = track.times[i] / clip.duration;
      const sample = walk ? (spec.id === 'walk_backward' ? 1 - t : t) : sourceTime(t, sourceName);
      q.fromArray(interpolant.evaluate(sample * data.duration)).normalize();
      if (mirror) q.set(q.x, -q.y, -q.z, q.w);
      authored.fromArray(track.values, i * 4);
      let weight = styleWeight * (walk ? 1 : envelope(t));
      if (walk) {
        // Keep boxing guard, not the source's relaxed swinging arms.
        if (/Arm|Hand|Head/.test(name)) weight = 0;
        else if (name.includes('Torso')) weight *= .22;
      } else if (hook) {
        // UAL2 is a lunging melee swing, not a legal boxing hook. Retain its
        // pelvis/shoulder counter-rotation but author the bent-elbow arc and
        // guard explicitly. Never import its deep forward lunge or open end.
        if (name.includes('Torso')) {
          delta.copy(first).invert().multiply(q);
          q.copy(authored).multiply(delta);
          weight *= .20;
        } else weight = 0;
      } else {
        if ((/Arm|Hand/.test(name)) && !name.startsWith(side)) weight = 0;
        if (body && name === `${side}UpperArm`) q.premultiply(correction);
        if (body && name.includes('Torso')) weight *= .45;
      }
      authored.slerp(q, weight).normalize().toArray(track.values, i * 4);
    }
  }
  // Relative pelvis sway, scaled by the destination leg lengths. The source
  // translation never moves the authoritative fighter group.
  const positionTrack = clip.tracks.find(t => t.name === 'LowerTorso.position');
  const position = new THREE.VectorKeyframeTrack('source', data.times, data.positions).createInterpolant();
  const hipHeight = definition.proportions.upperLegLength + definition.proportions.lowerLegLength;
  for (let i = 0; i < positionTrack.times.length; i++) {
    const t = positionTrack.times[i] / clip.duration;
    const sample = walk ? (spec.id === 'walk_backward' ? 1 - t : t) : sourceTime(t, sourceName);
    const p = position.evaluate(sample * data.duration);
    const weight = (hook ? .15 : .5) * (walk ? 1 : envelope(t));
    for (let axis = 0; axis < 3; axis++) positionTrack.values[i * 3 + axis] += (p[axis] - data.positions[axis]) * hipHeight * weight;
  }
  clip.userData.source = `${data.source}${hook ? ' / boxing adaptation' : ' / retargeted'}`;
  return clip;
}
