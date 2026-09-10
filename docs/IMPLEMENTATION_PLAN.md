# Robot Foundry — Implementation Plan

## 1. Mục tiêu và phạm vi

Robot Foundry là game đấu robot trong đó người chơi đóng vai **coach**, không trực tiếp puppeteer từng frame.

```text
Robot definition + personality + capability
+ local combat AI
+ tactical playbook
+ blackboard state
+ optional direct command
        ↓
legal action intent
        ↓
combat simulation
        ↓
animation / VFX / audio / UI
```

Gameplay loop trung tâm:

```text
observe → hypothesize → coach → test → program → adapt
```

## 1.1. Những gì đã có

- Three.js procedural hard-surface robots.
- 5 fighter definitions: Forge Titan, Aegis Prime, Vanta Razor, Volt Kestrel, Solstice Mantis.
- Exactly 15 rigid articulated parts/robot.
- Showcase camera, studio lighting, roster, dossier và animation browser.
- 40 presentation clips/robot, gồm shared combat vocabulary và robot-specific variants.
- No bones, skinning, imported runtime fighter model dependency.

## 1.2. Trạng thái hiện tại sau Phase 6

- Phase 0 foundation đã có: contracts, fixed-step clock, seeded RNG, bounded event log và exportable debug events.
- Phase 1 vertical slice đã có: arena/facing/movement, jab/guard FSM, contact, resources, KO/reset và Fight Mode harness.
- Phase 2 đã có: shared boxing moveset, capability modifiers cho 5 robots, guard variants, parry/dodge và deterministic presentation event cursor.
- Phase 3 đã có: local CombatBrain, perception, range/edge spacing, archetype behavior profiles, utility scoring, action commitment, seeded choices và offline Fight Mode.
- Phase 3.4 automated balance gate đã pass: 45 deterministic bouts across 15 pairings và 3 seeds, với action/contact diversity và arena invariants.
- Phase 4 đã có: DirectCommand queue/lifecycle, bilingual local parser, temporary Blackboard overrides, Fight Mode coaching HUD, text fallback, Web Speech adapter và optional Cloudflare Worker/Workers AI fallback.
- Phase 5 đã có: bounded tactical schema/runtime, deterministic cost/capacity, priority/arbitration, versioned local PlaybookStore và CombatBrain integration.
- Phase 6 đã có: three-use Time-out lifecycle, simulation pause, manual editor, diff/review, atomic commit, proposal-only conversational patches và stale-request invalidation.
- Live Fight chỉ tạo DirectCommand/BlackboardOverride; persistent playbook mutation chỉ xảy ra qua Time-out commit.
- Browser Web Speech là optional; khi unavailable, text input và autonomous combat vẫn hoạt động.

## 1.3. Những gì chưa có trước Phase 7 (historical roadmap note)

- Final multi-round/scoring rules and result persistence — deferred beyond Phase 8 v1; current lifecycle uses one timed round with KO/time/draw.
- Replay download/share UI and settings persistence were historical release follow-ups; they are implemented for the current local slice. Cloud sharing remains deferred.
- Physical microphone permission/device matrix and broad real-device performance — manual release QA scope.
- Production frontend deployment and Worker `ALLOWED_ORIGIN` configuration were historical deployment tasks and are now complete for the current `pages.dev` deployment.

Các Phase 0–6 contracts và blocking vertical slices đã hoàn thành; các mục trên không được giả định là đã có.

Animation hiện tại là **presentation preview**, không được xem là combat authority.

---

# 2. Source-of-truth và invariant bắt buộc

Thứ tự ưu tiên:

1. User request hiện tại.
2. `docs/GAMEPLAY.md`.
3. Implementation hiện tại.
4. `AGENTS.md` và skill liên quan.

Các invariant không được phá:

- Robot vẫn chiến đấu được khi voice/network/model offline.
- Live Fight chỉ tạo `DirectCommand` hoặc `BlackboardOverride`.
- Live Fight không sửa persistent tactical script.
- Time-out mới được inspect/edit/review/commit playbook.
- Model output là untrusted data, không được quyết định damage, transform, physics hoặc legality.
- Direct Command là request, không phải animation trigger.
- Tactic mô tả intent/plan, không micromanage joints hoặc hit frames.
- Local simulation là authority cho state, contact, damage và resource.
- Tactical scripts là data có schema, không phải code; cấm `eval`, `Function`, generated JS hoặc shell execution.
- Mỗi robot có personality, capability và adherence riêng; tactic không làm mọi robot hành xử giống nhau.
- Animation/VFX/audio/UI là consumer của state/event, không sở hữu combat truth.

---

# 3. Kiến trúc đích

## 3.1. Các module đề xuất

Đây là **sơ đồ trách nhiệm đề xuất**, không phải file/API đã tồn tại hay yêu cầu tạo đủ ngay. Repo hiện dùng JavaScript ES modules + Three.js + Vite + pnpm. Ưu tiên JSDoc ở boundary; không migrate TypeScript/ECS/framework chỉ để làm roadmap. `src/combat/Fighter.js` hiện là presentation wrapper, không phải simulation entity.

```text
src/
  combat/
    CombatSimulation.js       authoritative fixed-step match state
    CombatTypes.js             action/state/event contracts
    CombatResolver.js          hit, block, posture, knockdown resolution
    Fighter.js                 render/animation presentation wrapper
    HitboxSystem.js            named contacts and per-hit deduplication
    ResourceSystem.js          stamina/energy/cooldown rules
  robots/
    robotCatalog.js            immutable authored definitions
    RobotFactory.js             rigid presentation assembly
    RobotAnimations.js         presentation clips / semantic clip map
    combatMoves.js              legal move definitions and timing
    robotCapabilities.js        speed, reach, guard, adherence, capacity
  ai/
    CombatBrain.js              local autonomous decision loop
    UtilityScorer.js             action scoring
    SpacingController.js         distance/facing/navigation intent
    TacticalRuntime.js           playbook evaluation
    AdherenceModel.js            imperfect execution / stress effects
  tactics/
    TacticalSchema.js            constrained data contract
    TacticalValidator.js         validation and capacity cost
    PlaybookStore.js              committed definitions
    TacticalInterpreter.js        model/text proposal boundary
    TacticalPatchReview.js        review/commit flow
  commands/
    LiveCommandParser.js          direct/blackboard only
    TimeoutCommandParser.js       tactic proposal only
    CommandSchema.js              validated intent types
    StaleRequestGuard.js           async version/cancellation
  match/
    MatchState.js                 rounds, timeout economy, result
    MatchDirector.js              phase orchestration
    ReplayLog.js                  deterministic validated events
  ui/
    CombatHUD.js                  presentation and input
    TimeoutPanel.js               inspect/review/commit only
```

## 3.2. Stable boundary contracts

### Robot definition

Authored, immutable:

- `id`, `series`, `archetype`.
- proportions/scale/facing.
- stats và capabilities.
- personality tendencies.
- move set IDs.
- animation semantic IDs.
- tactical capacity.
- adherence baseline.
- feedback hook IDs.

Không lưu timer, current health, current action hoặc runtime blackboard trong definition.

### Runtime fighter state

Mutable instance:

- instance ID.
- position, facing, velocity.
- health, posture, stamina, energy.
- action ID và phase clock.
- cooldowns, status effects.
- target ID.
- current intent.
- blackboard overrides.
- adherence/stress state.

### Action intent

AI/command chỉ tạo intent:

```text
{
  actionId: 'hook_right',
  source: 'ai' | 'direct_command' | 'tactic',
  priority: 0..1,
  createdAt: simulationTick,
  expiresAt: simulationTick,
  targetId: string | null,
  reason: string
}
```

Simulation kiểm tra lại range, facing, stamina, cooldown, recovery, posture và arena legality.

### Combat event

Simulation phát event immutable:

```js
{
  type: 'hit_confirmed',
  tick,
  actionId,
  attackerId,
  targetId,
  contactId,
  result: 'hit' | 'blocked' | 'parried' | 'missed',
  damage,
  postureDamage,
  impulse,
}
```

Animation/VFX/audio/UI không tự tạo event authoritative.

---

# 4. Definition of Ready chung cho một task

Một task được bắt đầu khi:

- Có acceptance criteria kiểm thử được.
- Xác định rõ module sở hữu state.
- Có input/output contract.
- Biết failure mode và fallback.
- Không mâu thuẫn với `docs/GAMEPLAY.md`.
- Không yêu cầu secret/provider chưa được cấp.
- Có test strategy trước khi sửa code.

# 5. Definition of Done chung

Một task chỉ Done khi phù hợp:

- Behavior đáp ứng acceptance criteria.
- Không phá autonomous offline combat.
- Không phá Live Fight/Time-out boundary.
- Data model được validate ở boundary.
- Unit/integration test liên quan pass.
- `pnpm build` pass.
- Browser smoke phù hợp pass.
- Không có console error mới.
- Không có secret hoặc arbitrary code execution.
- Tài liệu/telemetry được cập nhật nếu contract thay đổi.
- Giới hạn còn lại được ghi rõ.

---

# 6. Phase roadmap

## Phase 0 — Baseline, contracts và observability

### Mục tiêu

Đóng băng các boundary trước khi thêm combat thật, tránh việc UI/animation trở thành combat authority.

### Tasks

#### P0.1. Chốt domain types và event vocabulary

Tạo contracts cho:

- `FighterRuntimeState`.
- `ActionIntent`.
- `ActionDefinition`.
- `CombatEvent`.
- `BlackboardOverride`.
- `DirectCommand`.
- `TacticalScript`.
- `MatchState`.

**Test:** schema accepts valid data, rejects unknown enum, NaN, Infinity, negative duration, invalid IDs và collection quá lớn.

#### P0.2. Fixed-step simulation clock

- Tách simulation time khỏi render time.
- Fixed timestep, accumulator và max catch-up.
- Pause/frame-step chỉ tác động simulation preview khi được yêu cầu.
- Không gọi network/model trong tick.

**Test:** cùng seed/input/event sequence tạo cùng state; render FPS khác nhau không đổi kết quả.

#### P0.3. Event log và debug inspector

- Log validated intent, action phase, hit result, state transition.
- Giới hạn buffer để không tăng bộ nhớ vô hạn.
- Có mode debug local, không đưa debug data vào gameplay authority.

**Test:** serialize/deserialize event log; replay ngắn cho ra cùng state.

### Checkpoint 0 — DoD

- Có contract test.
- Fixed-step deterministic fixture pass.
- UI showcase hiện tại vẫn build/smoke pass.
- Chưa có gameplay action nào mutate Three.js object trực tiếp từ AI/command.

---

## Phase 1 — Combat simulation tối thiểu

### Mục tiêu

Robot có thể đứng trong arena, chọn và thực thi action hợp lệ, nhận kết quả hit/block/stagger mà không cần AI/voice.

### Tasks

#### P1.1. Arena transform và movement constraints

- Bounds ring/arena.
- Facing và khoảng cách.
- Movement intent: advance, retreat, strafe, pivot.
- Tốc độ theo capability và stamina.
- Không teleport do animation.

**Test:** không vượt bounds; facing được normalize; movement bị từ chối khi down/stunned; fixed-step ổn định.

#### P1.2. Action definition schema

Mỗi action có:

- stable ID, tags, range, angle.
- startup, active windows, recovery.
- stamina/energy cost.
- cooldown/minimum commitment.
- cancel/preempt rules.
- animation semantic ID.
- contact socket/shape.
- posture/impulse metadata.

**Test:** startup/active/recovery boundaries; invalid move definition bị reject; action thiếu animation mapping bị reject.

#### P1.3. Hitbox/hurtbox và contact resolver

- Named contact volumes độc lập với mesh render.
- Per-action/per-target hit deduplication.
- Block, parry, miss, out-of-range.
- Authoritative damage/posture/impulse.

**Test:** early/late contact, wrong direction, out of range, blocked, parried, multiple targets, repeated contact trong cùng active window.

#### P1.4. Health, posture, stamina, knockdown

- Resource drain/recovery.
- Stagger threshold.
- Guard break.
- Down/get-up state.
- Match reset.

**Test:** resource boundary, zero health, posture threshold, knockdown recovery, no action while invalid state.

#### P1.5. Animation adapter

- Simulation phase chọn semantic animation.
- Simulation không gọi animation track trực tiếp để apply damage.
- Contact event đi ngược về presentation.
- One-shot action không loop sai.

**Test:** animation phase phù hợp state; clip missing fallback; interrupted action không để stale event apply damage.

### Checkpoint 1 — DoD

- Hai fighter dummy có thể đánh nhau bằng scripted intents.
- Damage chỉ đến từ resolver.
- Không cần model/voice.
- Deterministic fixture kiểm tra jab, block, parry, recovery, knockdown.
- Browser debug match chạy được ở desktop và reduced-motion.

---

## Phase 2 — Shared moveset và robot capability variants

### Mục tiêu

Cùng một chiến thuật có thể dùng cho 5 robot nhưng execution khác nhau theo capability/personality.

### Tasks

#### P2.1. Hoàn thiện semantic move map

Map 40 preview clips vào combat intent IDs. Bổ sung combat timing hợp lệ:

- `jab`, `cross`, `hook_left`, `hook_right`.
- `uppercut_left`, `uppercut_right`.
- body attacks, overhand, feint.
- high/low guard, parry, slip, duck, roll.
- movement verbs.
- hit reactions, stagger, guard break, knockdown, get-up.

**Test:** mọi legal action có animation, timing và feedback hooks.

#### P2.2. Capability profile

Tách:

- reach/range.
- startup/recovery modifier.
- turn rate.
- movement speed.
- guard strength.
- stamina efficiency.
- action preference.
- allowed defensive options.

**Test:** cùng `right_hook` produces different timing/spacing nhưng vẫn cùng semantic result; không robot nào bypasses legality.

#### P2.3. Personality profile

Ví dụ:

- pressure bias.
- counter bias.
- retreat bias.
- preferred distance.
- risk tolerance.
- target preference.
- tempo.

**Test:** seeded choice distribution khác nhau giữa robot; personality không override invalid action.

#### P2.4. Animation transition matrix

- action → action.
- action → hit reaction.
- hit reaction → guard.
- down → get-up.
- invalid transition fallback.

**Test:** no frozen pose, no double rotation ownership, no stale old action completion pausing new action.

### Checkpoint 2 — DoD

- 5 robots cùng shared moveset nhưng nhìn và timing khác nhau.
- Không copy một pose set rồi chỉ đổi duration.
- Có deterministic comparison report.
- 200 preview clips vẫn pass validation.

---

## Phase 3 — Autonomous local combat AI

### Mục tiêu

Robot tự đánh liên tục không cần player input, network hoặc LLM.

### Tasks

#### P3.1. Combat brain state machine

State tối thiểu:

- observe.
- approach.
- preferred range.
- pressure.
- defend.
- evade.
- recover.
- staggered/down.

State machine chỉ tạo intent; simulation quyết định legal execution.

#### P3.2. Targeting và spacing

- target selection.
- range bands: close/mid/far.
- facing/line of attack.
- arena edge awareness.
- corner escape.

**Test:** robot không cố đánh ngoài range mãi; không đi xuyên arena; tránh tự dồn vào góc nếu profile không cho phép.

#### P3.3. Utility/action scoring

Score dựa trên:

```text
legality
+ personality
+ capability
+ range
+ enemy threat
+ stamina
+ current tactic
+ blackboard
+ direct command
```

- deterministic seeded tie-break.
- action commitment để tránh spam.
- cooldown/recovery respect.

**Test:** legal action luôn thắng illegal action; low stamina giảm heavy moves; cooldown ngăn spam; same seed same choice.

#### P3.4. Telegraph và readable timing

- startup/telegraph phản ánh phase.
- defender có đủ thời gian đọc ở camera gameplay.
- không có unavoidable attack ngoài thiết kế.

**Test:** screenshot/video fixture ở camera distance; startup/impact/recovery đúng contract.

### Checkpoint 3 — DoD

- Hai robot autonomous chiến đấu tối thiểu một round.
- Match tiếp tục nếu không có input hoặc provider offline.
- Không network/model call trong hot loop.
- Có AI decision reason trong debug log.
- Test deterministic cho approach, attack, defend, recovery.

---

## Phase 4 — Live Fight coaching

### Trạng thái hiện tại

**Phase 4A + 4B đã triển khai.** Local parser là đường nhanh; Cloudflare Worker là fallback tùy chọn cho câu không nhận diện. Cả hai đều chỉ trả structured Live Fight intent và không có quyền sửa persistent playbook.

### Mục tiêu

Người chơi steer robot trong trận mà không sửa permanent playbook.

### Tasks

#### P4.1. Direct Command schema

Các command mẫu:

- jab, cross, hook, block, dodge.
- advance, back, circle.
- stop chasing.
- target body/head.

Fields:

- intent type.
- confidence.
- priority.
- expiry.
- target/focus.
- source transcript.

**Test:** unknown command, low confidence, expired command, duplicate command, command khi robot down.

#### P4.2. Blackboard override

Fields có lifecycle rõ: expiry, cancel, decay hoặc tồn tại đến khi bị thay, tùy loại; không bắt buộc mọi override có TTL:

- preferred distance.
- aggression.
- tempo.
- target part.
- guard bias.
- risk.
- attention focus.
- action preference/avoidance.

**Test:** override expires; command mới thay command cũ; blackboard không mutate playbook; invalid values clamp/reject.

#### P4.3. Fast local command path

- **Done:** Recognize deterministic English/Vietnamese phrases locally khi confidence đủ cao.
- **Done:** Cloudflare Worker `/api/coach/interpret` là fallback tùy chọn; Workers AI binding server-side.
- **Done:** Provider/model không block combat; frontend timeout 2.5s, request IDs và stale-result rejection.
- **Done:** Worker validate payload, origin, model output và chỉ cho phép combat action/blackboard fields hợp lệ.

**Test:** delayed result không ghi đè command mới; malformed provider output giữ last valid state; provider unavailable match vẫn chạy.

#### P4.4. Live coaching UI

- **Done for current slice:** text input, raw transcript boundary, language selector, microphone state, interpreted action/override feedback và non-blocking errors.
- **Done:** Không có nút “save tactic” trong Live Fight; temporal tactic phrase bị từ chối.

### Checkpoint 4 — DoD

- **Đạt cho Phase 4A/4B:** player command ảnh hưởng action selection trong thời gian ngắn.
- **Đạt:** robot defer/reject/expire command bất khả thi mà không teleport hit.
- **Đạt:** Live utterance không tạo/edit persistent tactic.
- **Đạt:** network/model latency không stall simulation; fallback lỗi vẫn giữ autonomous combat.
- **Đạt:** Worker model output bị validate trước khi frontend đưa vào domain.
- **Done:** Worker đã deploy tại `robot-foundry-coach.hieudo831.workers.dev`; `ALLOWED_ORIGIN` vẫn cần đặt thành origin frontend trước khi bật cross-origin production. Local Vite proxy không cần CORS.

---

## Phase 5 — Tactical playbook và constrained scripts

### Trạng thái hiện tại

**Phase 5A và Phase 6 đã triển khai:** bounded schema/validator/cost, tactic runtime, trigger/sequence/branch/abort/repeat, priority/arbitration, capacity-aware local playbook store, Time-out lifecycle, editor, diff/review và proposal-only patch flow.

### Mục tiêu

Tạo plan có trigger/sequence/branch/abort, nhưng vẫn là data an toàn và portable giữa robot.

### Tasks

#### P5.1. Tactical DSL/schema

**Done for v1:** schema versioned, inspectable và bounded. Tactic là data; không có `eval`, `Function` hoặc generated code.

Schema versioned, inspectable:

```js
{
  id,
  version,
  name,
  goal,
  priority,
  conditions: [],
  phases: [],
  triggers: [],
  branches: [],
  abortConditions: [],
  repeatLimit,
  timeout,
  capacityCost
}
```

Chỉ dùng enum/operator game-domain đã whitelist.

#### P5.2. Validator và capacity

**Done for v1:** Validate IDs, enum, ranges, depth, branch count, repeat count, registered actions và deterministic cost; enforce capacity profile của robot.

- Validate IDs, enum, ranges, depth, branch count, repeat count.
- Phát hiện lỗi cấu trúc và mâu thuẫn tĩnh đã biết. Không tự sửa/reject giả thuyết sai của người chơi chỉ vì hệ thống biết đối thủ không có pattern đó; bad reads phải có hậu quả gameplay.
- Tính tactical memory cost.
- Enforce robot capacity.

**Test:** reject cycles vô hạn, deep nesting, unknown action, impossible timing, oversized text/collections, cost vượt capacity.

#### P5.3. Tactical runtime

**Done for v1:** Evaluate plan trên snapshot game state, tạo intent request và giữ execution state riêng. Trigger false không chạy; abort/timeout/repeat dừng runtime.

- Evaluate plan trên snapshot game state.
- Tạo tactical intent, không mutate scene.
- Tactic có priority và conflict resolution.
- Abort/timeout/repeat.

**Test:** trigger, branch, abort, expiry, repeat limit, simultaneous tactic priority, failed action fallback.

#### P5.4. Playbook store

**Done for local v1:** Definition immutable sau commit, revision conflict protection, atomic validated commit, storage reload và runtime state tách riêng.

- Definition immutable sau commit.
- Runtime execution state riêng.
- Add/edit/delete/version tactic.
- Replay event ghi tactic commit.

**Test:** reload giữ committed tactic; runtime state không ghi ngược definition; version migration.

### Checkpoint 5 — DoD

- Tactic “bait hook → slip → body punish” chạy được bằng local runtime.
- Cùng tactic cho robot khác tạo action sequence khác theo profile.
- Không arbitrary code path tồn tại.
- Capacity validator hoạt động; runtime adherence thuộc Phase 7, chưa phải điều kiện qua checkpoint này.

---

## Phase 6 — Time-out economy và tactical editor

### Mục tiêu

Time-out trở thành quyết định chiến thuật hữu hạn, không phải pause menu bình thường.

### Tasks

#### P6.1. Match timeout state

**Done:** tối đa 3 lần/match; consume ngay khi mở; cancel không hoàn; double-open/KO/empty lượt bị reject; simulation clock pause thật; match reset trả lại 3 lượt. Combat/UI request cũ bị vô hiệu khi mở/cancel/đổi mode.

**Test:** `validate:phase6` và Fight Mode browser smoke kiểm tra biên lượt 1/2/3, lần thứ 4 bị từ chối, consume một lần khi mở, cancel không hoàn, playbook không đổi khi cancel/reject, reset trả về 3 và click lặp không double-consume.

#### P6.2. Playbook inspection UI

**Done for v1:** editor một tactic với trigger, sequence, abort-near-edge, review diff, invalid draft feedback, Cancel no refund và Commit atomic. Capacity/cost được validate trước commit.

#### P6.3. Conversational patch proposal

**Done for v1:** Worker trả `TacticalPatchProposal` + validated preview; frontend chỉ sửa draft. Chỉ nút Commit mới ghi playbook. Stale/malformed proposal bị reject.

**Test:** malformed proposal giữ playbook cũ; reject không mutate; commit tạo version; stale proposal không overwrite edit mới.

#### P6.4. No hidden Live Fight mutation

**Done:** Live parser không có commit capability; temporal tactic trong Live bị từ chối; Time-out editor là surface riêng; stale async request bị invalidate khi đổi mode.

### Checkpoint 6 — DoD

- Người chơi inspect → propose → review → commit tactic trong Time-out.
- Có đúng tối đa 3 Time-outs.
- Commit ảnh hưởng các decision tick sau khi resume.
- Cancel/reject không làm hỏng playbook.
- Không thể tạo tactic bằng Live Fight.

---

## Phase 7 — Imperfect adherence, learning và progression

### Mục tiêu

Robot là character có giới hạn, không phải executor hoàn hảo.

### Tasks

#### P7.1. Adherence model

Baseline theo robot, giảm theo:

- stun.
- low stamina.
- stress.
- tactic complexity.
- quá nhiều active rules.

**Test:** adherence có seed; cùng state có thể miss step theo xác suất đã kiểm soát; không skip simulation legality.

#### P7.2. Tactical capacity progression

- capacity/memory stat.
- tactic cost.
- active tactic limit.
- UI readable meter.

**Test:** tactic cost vượt capacity bị block hoặc degrade rõ ràng; không âm/NaN; upgrade thay đổi capacity deterministic.

#### P7.3. Playbook evolution

- tactic version history.
- old tactic có thể sửa trong Time-out.
- replay biết tactic version nào đã được dùng.

#### P7.4. Match learning feedback

- Show trigger fired/failed.
- Show adherence miss reason.
- Phân biệt tactic sai với robot không đủ khả năng thực thi.

### Checkpoint 7 — DoD

- Player có thể hiểu robot thất bại vì bad read, capacity hoặc adherence.
- Failures không bị trình bày như bug ngẫu nhiên.
- Robot khác nhau vẫn giữ identity khi dùng cùng playbook.

---

## Phase 8 — Hoàn thiện match director, rounds và replay

### Trạng thái hiện tại

**P8.1/P8.2 đã triển khai cho v1:** một timed round mặc định 180 giây, KO/time/draw result, terminal simulation, reset/retry và `MatchReplay` versioned export/playback từ seed + initial state + validated events. Replay không gọi model/network. Time-out vẫn match-scoped và reset sạch runtime state.

**P8.3 đã triển khai cho current slice:** result/timer HUD, local result/settings persistence, replay download/import/retention, 3D replay playback và Match History đã có. Cloud sharing, accounts và cross-device persistence vẫn deferred.

### Mục tiêu

Đóng vòng lặp trận đấu đầy đủ theo ruleset v1, không tự giả định multi-round/scoring khi GAMEPLAY.md chưa chốt.

**Test:** `validate:phase8` PASS (46 assertions); production-preview browser acceptance PASS.

---

## Phase C — Strategy-level tactics và bounded playbook editor

- Tactical Schema v2 adds goals plus bounded `counter`, `move`, `wait_for`, `set_priority` and concrete `action` intents.
- `TacticalIntentResolver` maps strategy intent to robot/profile-dependent action or movement requests. Simulation remains authoritative.
- Schema v1 remains readable. Explicit `migrateTacticToV2` and `migratePlaybookToV2` helpers preserve a safe migration path.
- Time-out editor now supports a bounded multi-tactic draft: list/select/create/delete, goal, priority, v1/v2 method mode, repeats, timeouts, capacity validation, preview/review and atomic commit.
- Worker tactic proposals validate both schema versions and support bounded strategy-intent replacement proposals.

**Test:** `validate:phase5` PASS (34 assertions); Worker boundary PASS (16 assertions); production-preview browser acceptance PASS.

### Remaining Phase C limitations

- Branch editing is still represented by bounded validated data rather than a visual branch graph.
- The compact UI method syntax exposes the supported strategy intents but does not provide a separate drag-and-drop tactical canvas.
- Full multi-robot matchup selection remains outside the current Fight Mode scope.

---

## Phase 9 — Browser QA, performance và release

### Tasks

### P9.1. Functional QA

- Desktop keyboard/mouse.
- Mobile portrait/touch.
- Reduced motion.
- Live command offline.
- Time-out review/commit/cancel.
- invalid command/proposal.
- autonomous action/contact/health progression.
- complete knockdown → down → impossible command → recovery lifecycle.
- stale Worker response and provider failure.
- malformed replay import, settings hydration and explicit matchId History association.
- repeated rounds và robot switching.

### P9.2. Visual QA

- telegraph readable ở gameplay camera.
- hit/block/parry feedback.
- knockdown/get-up framing.
- UI không che canvas.
- scroll canvas không drift.
- no horizontal overflow.

### P9.3. Performance QA

- Không model/network trong render/tick.
- fixed-step budget.
- draw calls/triangles/memory.
- animation mixer/action count.
- avoid allocations in hot loops.
- profile trước khi tối ưu.

### P9.4. Security QA

- No secrets in browser bundle.
- Validate all model/parser output, including bounded/truncated model JSON extraction.
- No eval/Function/generated code.
- request timeout/cancellation/stale guards.
- separate deterministic Worker infrastructure smoke from opt-in model AI canary.
- escape generated/player-facing text.

### QA result

Phase 9 browser/release QA is complete for the available environment. Added deterministic QA hooks gated behind `?qa=1`, active-play canvas inspection, mobile touch smoke, active-scene performance sampling, a favicon to remove the preview 404, and a consolidated report at `artifacts/qa/release-report.md`.

Evidence:

- `artifacts/qa/active-desktop/`
- `artifacts/qa/active-mobile/`
- `artifacts/qa/performance.json`
- `artifacts/qa/release-report.md`

The remaining release blockers are physical Android/iOS testing, Safari/Firefox compatibility, hardware frame-time/memory profiling and expert visual combat sign-off. SwiftShader timing is not used as a hardware performance claim.

### Release DoD

- `pnpm validate:robots` pass.
- All combat unit/integration tests pass.
- Browser smoke pass with 0 new console/runtime errors.
- Production build pass.
- Desktop/mobile/reduced-motion evidence saved.
- No P0/P1 bugs.
- Known limitations and performance baseline documented.
- Gameplay docs match shipped behavior.

---

# 7. Test matrix tổng hợp

| Area | High-value tests |
|---|---|
| Fixed-step | same seed/input → same state; varying render FPS |
| Action legality | range, facing, startup, recovery, stamina, cooldown, down state |
| Contact | hit, block, parry, miss, per-target dedupe, multiple targets |
| Resources | stamina/energy bounds, posture, guard break, KO |
| Animation | semantic mapping, phase, transition, one-shot, down/get-up, grounding |
| AI | autonomous offline, spacing, legal choices, deterministic seed, no spam |
| Direct command | accepted/deferred/rejected/expired, no animation bypass, exhausted-resource rejection |
| Blackboard | override priority, decay, expiry, cancel, no playbook mutation |
| Async | stale result rejected, timeout, malformed output fallback, cancellation |
| Tactics | schema, depth, loops, capacity, trigger, branch, abort, repeat |
| Time-out | exactly 3, cancel/reject, atomic commit, resume state |
| Adherence | stress/stun/stamina/complexity effects, explainable failure |
| Replay | deterministic validated event replay without model |
| UI | keyboard/touch, filters, transcript separation, accessibility, overflow |
| Release | build, console, memory, draw calls, mobile, reduced motion |

---

# 8. Suggested implementation order for the next work sessions

Do not start with voice or LLM integration. The recommended vertical slices are:

1. **Fixed-step + action contracts + deterministic test fixture.**
2. **One complete jab/block/hit/recovery slice with two dummy robots.**
3. **Movement + arena bounds + stamina.**
4. **Shared moveset mapped to all five robot capability profiles.**
5. **Autonomous two-robot loop offline.**
6. **Direct Command + Blackboard Override, with explicit Live Fight boundary test.**
7. **One constrained tactic end-to-end in a local playbook.**
8. **Time-out inspect/review/commit with 3-use economy.**
9. **Adherence/capacity/progression.**
10. **Rounds, replay, QA and release hardening.**

Every slice must leave the browser build playable and must not make model/network availability a requirement for the fight loop.

---

# 9. Explicit non-goals for the first playable combat milestone

The first combat milestone does **not** need:

- voice recognition;
- LLM-generated tactic text;
- multiplayer/networking;
- full ragdoll physics;
- every possible robot move;
- procedural IK for all limbs;
- production-quality cinematic entrances;
- persistent cloud accounts.

It does need:

- autonomous local combat;
- authoritative legal actions and contact;
- at least one complete defense/counter loop;
- deterministic tests;
- clear animation state and feedback;
- graceful offline behavior.
