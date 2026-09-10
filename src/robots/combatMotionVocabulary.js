// Original shared boxing choreography, adapted to each robot's mechanics.
// Timing markers are presentation data, never damage or legality rules.
const v = (x = 0, y = 0, z = 0) => [x, y, z];
const PROFILES = Object.freeze({
  forge:  { tempo: 1.25, reach: 1.30, twist: .46, load: .40, slip: .14, stride: .22, guard: -.95, spread: .26, recoil: .18 },
  aegis:  { tempo: 1.12, reach: 1.43, twist: .23, load: .22, slip: .18, stride: .25, guard: -1.72, spread: .10, recoil: .10 },
  vanta:  { tempo: .78, reach: 1.48, twist: .52, load: .27, slip: .38, stride: .39, guard: -1.30, spread: .18, recoil: .30 },
  volt:   { tempo: .84, reach: 1.46, twist: .35, load: .34, slip: .27, stride: .34, guard: -1.48, spread: .20, recoil: .22 },
  mantis: { tempo: 1.04, reach: 1.57, twist: .40, load: .18, slip: .32, stride: .45, guard: -1.38, spread: .14, recoil: .14 },
});

export function foundationClips(definition, base) {
  const p = PROFILES[definition.featureStyle];
  const result = [];
  const beat = (t, pose = {}, shift = v()) => ({ t, pose, shift, turn: 0 });
  const add = (id, name, family, duration, description, beats, extra = {}) => {
    result.push({ id, name, family, duration: duration * p.tempo, description, beats,
      playback: 'repeatable', entry: 'ready', exit: 'ready', impacts: [], grounding: 'feet', ...extra });
  };
  const load = {
    LeftUpperLeg: v(-p.load, 0, p.spread * .3), LeftLowerLeg: v(p.load * 1.7), LeftFoot: v(-p.load * .7),
    RightUpperLeg: v(-p.load * .7, 0, -p.spread * .3), RightLowerLeg: v(p.load * 1.4), RightFoot: v(-p.load * .7),
  };
  const closed = {
    LeftUpperArm: v(-.78, -.15, p.spread * .25), RightUpperArm: v(-.78, .15, -p.spread * .25),
    LeftLowerArm: v(p.guard), RightLowerArm: v(p.guard), Head: v(.10),
  };

  // In-place gait: no arena translation. The simulator will match stride to velocity.
  for (const [id, name, dx, dz] of [
    ['walk_forward','Advance shuffle',0,1], ['walk_backward','Retreat shuffle',0,-1],
    ['strafe_left','Circle left',1,0], ['strafe_right','Circle right',-1,0],
  ]) {
    const gait = (side) => {
      const pose = { UpperTorso: v(.05, p.twist * .10 * side, -.025 * side) };
      for (const [prefix, sign] of [['Left',1],['Right',-1]]) {
        const swing = side * sign;
        pose[`${prefix}UpperLeg`] = v(-.12 - dz * p.stride * swing, 0, sign * .06 + dx * p.stride * swing * .55);
        pose[`${prefix}LowerLeg`] = v(.24 + (swing > 0 ? p.load : .02));
        pose[`${prefix}Foot`] = v(-.12 + dz * p.stride * swing * .45, dx * .10, -sign * .05);
        pose[`${prefix}UpperArm`] = v(base[`${prefix}UpperArm`][0] + swing * .09, 0, sign * p.spread);
      }
      return pose;
    };
    add(id, name, 'MOVEMENT', 1.05, 'Bước tại chỗ: đổi chân trụ, nhấc gót, tay giữ guard. Di chuyển trong arena do simulation điều khiển.',
      [beat(0),beat(.25,gait(1)),beat(.5),beat(.75,gait(-1)),beat(1)], { playback: 'cycle' });
  }
  for (const [side, sign] of [['left',1],['right',-1]]) {
    add(`pivot_${side}`, `Pivot ${side}`, 'MOVEMENT', .8, 'Bước đổi hướng trên mũi chân, vai theo hông rồi ổn định. Preview không đổi facing của simulation.', [
      beat(0), beat(.24, { ...load, Head: v(0, sign * .28) }),
      beat(.48, { LowerTorso: v(0, sign * p.twist), UpperTorso: v(.04, sign * .16),
        LeftUpperLeg: v(-.18, sign * .28, .10), RightUpperLeg: v(.08, sign * .28,-.10),
        LeftFoot: v(-.15,sign * .32),RightFoot: v(-.20,sign * .32) }), beat(.75, load), beat(1),
    ]);
  }
  for (const [id, name, sign] of [['step_in','Step in',1],['step_out','Step out',-1]]) {
    add(id, name, 'MOVEMENT', .65, 'Một bước ngắn có nạp gối và thu chân, giữ guard trong khi thay khoảng cách.', [
      beat(0), beat(.18,load), beat(.42, { LeftUpperLeg:v(-sign*p.stride,0,.07), LeftLowerLeg:v(.55), LeftFoot:v(-.15),
        UpperTorso:v(.08,sign*p.twist*.3), RightUpperLeg:v(sign*p.stride*.5,0,-.08) }),
      beat(.67,{ RightUpperLeg:v(-sign*p.stride*.6),RightLowerLeg:v(.45),UpperTorso:v(.10) }), beat(1),
    ]);
  }

  // Side-dependent strike chain: knees load → pelvis → shoulder → elbow → recoil.
  const strike = (side, kind, body = false) => {
    const sign = side === 'Left' ? -1 : 1;
    const other = side === 'Left' ? 'Right' : 'Left';
    const chamber = {
      ...load, LowerTorso:v(.04,-sign*p.twist*.55), UpperTorso:v(.09,-sign*p.twist*.65), Head:v(0,sign*.15),
      [`${side}UpperArm`]:v(kind === 'uppercut' ? .18 : -.30,-sign*.15, -sign*p.spread),
      [`${side}LowerArm`]:v(kind === 'uppercut' ? -1.1 : -1.5),
      [`${other}LowerArm`]:v(p.guard),
    };
    const extension = {
      LowerTorso:v(body ? .20 : -.025,sign*p.twist*.48), UpperTorso:v(body ? .26 : .035,sign*p.twist*.58), Head:v(body ? -.14 : -.04,-sign*.18),
      [`${side}UpperArm`]:v(-p.reach,sign*.07,-sign*.07), [`${side}LowerArm`]:v(-.08),
      [`${side}Hand`]:v(0,sign*.15), [`${other}UpperArm`]:v(-.64,-sign*.1,sign*p.spread), [`${other}LowerArm`]:v(p.guard),
      RightUpperLeg:v(.05,sign*.20,-.08),RightLowerLeg:v(.12),RightFoot:v(-.17,sign*.18),
      LeftUpperLeg:v(-.18,sign*.08,.08),LeftLowerLeg:v(.27),LeftFoot:v(-.09,sign*.08),
    };
    if (kind === 'hook') Object.assign(extension, {
      [`${side}UpperArm`]:v(-.18, sign*.30, -sign*(1.25+p.spread)),
      [`${side}LowerArm`]:v(-1.32), UpperTorso:v(.05,sign*p.twist*.95,-sign*.08),
    });
    if (kind === 'uppercut') Object.assign(extension, {
      [`${side}UpperArm`]:v(-1.42,sign*.12,-sign*.18), [`${side}LowerArm`]:v(-1.42),
      UpperTorso:v(-.16,sign*p.twist*.6,-sign*.08), Head:v(.06,-sign*.18),
    });
    if (body) extension[`${side}UpperArm`] = v(-1.06, sign*.08, -sign*.08);
    const follow = { ...extension, UpperTorso:v(body ? .24 : -.04,sign*p.twist*.8,-sign*.05),
      [`${side}LowerArm`]:v(kind === 'straight' ? -.23 : -1.12) };
    const retract = { ...chamber, UpperTorso:v(.05,-sign*p.recoil), [`${side}UpperArm`]:v(-.65,0,-sign*p.spread) };
    return [beat(0),beat(.28,chamber),beat(.40,extension),beat(.47,follow),beat(.69,retract),beat(1)];
  };
  for (const [id,name,side,kind,body,duration] of [
    ['jab','Lead jab','Left','straight',false,.55],['cross','Rear cross','Right','straight',false,.72],
    ['hook_left','Left hook','Left','hook',false,.78],['hook_right','Right hook','Right','hook',false,.84],
    ['uppercut_left','Left uppercut','Left','uppercut',false,.8],['uppercut_right','Right uppercut','Right','uppercut',false,.88],
    ['body_jab','Body jab','Left','straight',true,.65],['body_cross','Body cross','Right','straight',true,.85],
  ]) add(id,name,'ATTACK',duration,'Nạp trọng tâm → bật đòn ngắn → follow-through → thu về guard. Marker chỉ dùng để xem động tác.',strike(side,kind,body),{ impacts:[.40] });

  add('overhand','Overhand right','ATTACK',.95,'Nạp vai sau, đưa găng vượt guard rồi bổ chéo xuống, thu tay có độ nặng.',[
    beat(0),beat(.28,{...load,UpperTorso:v(.12,-p.twist),RightUpperArm:v(-1.8,-.2,-.75),RightLowerArm:v(-1.7)}),
    beat(.41,{UpperTorso:v(.24,p.twist,.12),RightUpperArm:v(-p.reach,.18,-.28),RightLowerArm:v(-.20),LeftLowerArm:v(p.guard)}),
    beat(.49,{UpperTorso:v(.30,p.twist*.8),RightUpperArm:v(-1.1,.24,-.25),RightLowerArm:v(-.4)}),beat(.74,closed),beat(1),
  ],{impacts:[.41]});
  add('feint_jab','Jab feint','ATTACK',.6,'Giả nạp và duỗi nửa jab, hủy sớm về guard; không có impact marker.',[
    beat(0),beat(.25,{UpperTorso:v(.06,-p.twist*.4),LeftUpperArm:v(-p.reach*.65),LeftLowerArm:v(-.8)}),
    beat(.4,{Head:v(0,.12),LeftUpperArm:v(-.55,0,p.spread),LeftLowerArm:v(-1.3)}),beat(1),
  ]);

  add('guard_high','High guard','DEFENSE',1.1,'Khép khuỷu, che đầu, chịu lực rồi về stance.',[beat(0),beat(.18,closed),beat(.72,closed),beat(1)]);
  const low = {...closed,...load,LeftUpperArm:v(-.24,0,p.spread),RightUpperArm:v(-.24,0,-p.spread),LeftLowerArm:v(-1.35),RightLowerArm:v(-1.35),UpperTorso:v(.18)};
  add('guard_low','Body guard','DEFENSE',1.05,'Hạ khuỷu che sườn và core, không phải một phiên bản high guard chỉ đổi tên.',[beat(0),beat(.2,low),beat(.7,low),beat(1)]);
  for (const [side,sign] of [['Left',1],['Right',-1]]) {
    add(`parry_${side.toLowerCase()}`,`${side} parry`,'DEFENSE',.60,'Gạt một bên bằng cẳng tay, tay còn lại giữ guard.',[
      beat(0),beat(.18,closed),beat(.32,{...closed,[`${side}UpperArm`]:v(-.9,-sign*.55,sign*(.25+p.spread)),[`${side}LowerArm`]:v(-1.05),UpperTorso:v(.04,-sign*p.twist*.35)}),beat(.55,closed),beat(1),
    ]);
    add(`slip_${side.toLowerCase()}`,`Slip ${side.toLowerCase()}`,'DEFENSE',.72,'Né khỏi đường đấm bằng eo, cổ và gối; không dịch vị trí authoritative.',[
      beat(0),beat(.30,{...load,UpperTorso:v(.18,-sign*p.twist*.5,sign*p.slip),Head:v(-.12,sign*.18,-sign*p.slip*.3)}),
      beat(.48,{...load,UpperTorso:v(.12,-sign*p.twist*.45,sign*p.slip*.9)}),beat(1),
    ]);
  }
  const crouch = {...closed,LeftUpperLeg:v(-.65-p.load*.4),RightUpperLeg:v(-.65-p.load*.4),LeftLowerLeg:v(1.3+p.load*.8),RightLowerLeg:v(1.3+p.load*.8),LeftFoot:v(-.65-p.load*.4),RightFoot:v(-.65-p.load*.4),UpperTorso:v(.22),Head:v(-.12)};
  add('duck','Duck','DEFENSE',.85,'Hạ cả trọng tâm bằng gối, guard che đầu; không chỉ cúi cổ.',[beat(0),beat(.32,crouch),beat(.53,crouch),beat(1)]);
  add('roll','Roll under','DEFENSE',1.1,'Đi vòng dưới đòn móc: nghiêng → hạ gối → đi qua phía đối diện → đứng lại.',[
    beat(0),beat(.22,{...load,UpperTorso:v(.16,-p.twist,-p.slip)}),beat(.43,crouch),beat(.65,{...load,UpperTorso:v(.13,p.twist,p.slip)}),beat(1),
  ]);

  for (const [side,sign] of [['left',1],['right',-1]]) {
    add(`hit_head_${side}`,`Head hit · ${side}`,'REACTION',.65,'Giật đầu và vai theo hướng lực, tay mất guard ngắn rồi tái lập. Không tự áp damage.',[
      beat(0),beat(.09,{Head:v(-.16,sign*.3,sign*(.15+p.recoil)),UpperTorso:v(-.08,sign*p.twist*.4,sign*.12)}),
      beat(.24,{Head:v(.1,-sign*.12),UpperTorso:v(.13,-sign*p.twist*.2)}),beat(.68,closed),beat(1),
    ]);
  }
  add('hit_body','Body hit','REACTION',.85,'Core gập, khuỷu khép bảo vệ thân; đầu không giật như trúng mặt.',[
    beat(0),beat(.1,{...load,UpperTorso:v(.35+p.recoil),Head:v(-.20),LeftUpperArm:v(-.2),RightUpperArm:v(-.2)}),beat(.4,low),beat(1),
  ]);
  add('stagger','Stagger recovery','REACTION',1.3,'Mất thăng bằng, bước chống đỡ rồi lấy lại guard.',[
    beat(0),beat(.12,{UpperTorso:v(-.22,0,p.recoil),LeftUpperArm:v(.15,0,.6),RightUpperArm:v(.15,0,-.6)}),
    beat(.36,{...load,RightUpperLeg:v(-.5),RightLowerLeg:v(.8),UpperTorso:v(.18,0,-p.recoil)}),beat(.68,closed),beat(1),
  ]);
  add('guard_break','Guard break','REACTION',1.2,'Hai giáp tay bật mở, thân ngửa và chậm tái lập phòng thủ.',[
    beat(0),beat(.14,{UpperTorso:v(-.20),Head:v(-.16),LeftUpperArm:v(-.6,0,.85+p.spread),RightUpperArm:v(-.6,0,-.85-p.spread),LeftLowerArm:v(-.6),RightLowerArm:v(-.6)}),
    beat(.45,{...load,UpperTorso:v(.1),LeftUpperArm:v(0,0,.4),RightUpperArm:v(0,0,-.4)}),beat(.80,closed),beat(1),
  ]);

  // These are explicit state transitions, not loops returning instantly to standing.
  const down = Object.fromEntries(Object.keys(base).map(n => [n,v()]));
  Object.assign(down, {LowerTorso:v(-Math.PI/2),UpperTorso:v(.05+p.recoil*.2),Head:v(.10),
    LeftUpperArm:v(.12,0,.42+p.spread),RightUpperArm:v(.10,0,-.42-p.spread),LeftLowerArm:v(-.35),RightLowerArm:v(-.42),
    LeftUpperLeg:v(-.08,0,.10),RightUpperLeg:v(-.05,0,-.12),LeftLowerLeg:v(.14),RightLowerLeg:v(.1)});
  const seated = {...down,LowerTorso:v(-.6),UpperTorso:v(.42),Head:v(.12),LeftUpperLeg:v(-1.1),RightUpperLeg:v(-1.1),LeftLowerLeg:v(1.25),RightLowerLeg:v(1.25),
    LeftUpperArm:v(.2,0,.25+p.spread),RightUpperArm:v(.2,0,-.25-p.spread),LeftLowerArm:v(-.20),RightLowerArm:v(-.20)};
  add('knockdown','Knockdown back','RECOVERY',1.35,'Guard bật mở → mất chân trụ → ngã ra sau. Giữ pose nằm, không loop về đứng.',[
    beat(0),beat(.12,{...closed,UpperTorso:v(-.25)}),beat(.36,{...down,LowerTorso:v(-.72),UpperTorso:v(-.12),LeftUpperLeg:v(-.35),RightUpperLeg:v(-.25)}),
    beat(.68,down),beat(.80,{...down,UpperTorso:v(.13)}),beat(1,down),
  ],{playback:'once',exit:'down',grounding:'body'});
  add('down','Down hold','RECOVERY',2,'Pose nằm sau knockdown; không bật trở về stance khi hết clip.',[beat(0,down),beat(1,down)],{playback:'hold',entry:'down',exit:'down',grounding:'body'});
  add('get_up','Get up','RECOVERY',2.2,'Từ cùng pose nằm: chống tay → ngồi co chân → squat → dựng guard. Chưa phải IK/physics.',[
    beat(0,down),beat(.20,{...down,Head:v(.35),UpperTorso:v(.3)}),beat(.43,seated),beat(.70,crouch),beat(.87,closed),beat(1),
  ],{playback:'once',entry:'down',grounding:'body'});
  return result;
}
