# Implementation Plan — Voice-to-Action Sandbox & Whiff/Punish Upgrade

> **Trạng thái:** Kế hoạch triển khai chuẩn sau Bước 0.
>
> Gameplay requirements: `docs/GAMEPLAY.md`  
> Hiện trạng và gap analysis: `docs/CURRENT_STATE_AND_GAPS.md`  
> Kiến trúc chi tiết tham khảo: `docs/architecture.md`

---

## 1. Mục tiêu

Triển khai theo các vertical slice nhỏ, ưu tiên chứng minh luồng local/text-to-action trong Sandbox trước khi thêm provider voice streaming hoặc mở rộng RTS.

Kết quả cuối của roadmap này:

1. Có Zombie Survival Sandbox 360 độ chạy độc lập với Robot Boxing.
2. Text và voice cùng tạo validated domain intent.
3. Robot di chuyển, dừng, ngắm và bắn theo hướng rõ ràng.
4. Attack-Move và Patrol hoạt động bằng local autonomous behavior.
5. Network/model failure không làm Sandbox hoặc boxing ngừng hoạt động.
6. Boxing có explicit whiff/punish domain signals và deterministic tests.
7. Presentation hiển thị feedback từ domain event thay vì tự suy đoán.

---

## 2. Quyết định kiến trúc

### 2.1. Giữ hai simulation riêng theo mode

- Robot Boxing tiếp tục dùng `CombatSimulation`.
- Sandbox dùng simulation domain riêng vì movement, horde và ranged weapon khác đáng kể.
- Hai mode dùng chung nguyên tắc: fixed-step, validated intent, event log và renderer chỉ trình bày.

Không ép `CombatSimulation` xử lý zombie hoặc beam nếu điều đó làm suy yếu boundary hiện tại.

### 2.2. Contract-first

Trước scene và VFX, định nghĩa:

- hướng tuyệt đối/tương đối;
- command/intent Sandbox;
- simulation event;
- movement/fire legality;
- expiry và rejection reason.

Text, Web Speech và cloud adapter đều phải đi qua cùng contract.

### 2.3. Local-first

Thứ tự input:

```text
text/local transcript
    → deterministic parser
    → validated SandboxIntent
    → local simulation/controller
```

Cloud provider chỉ được thêm sau khi luồng trên đạt acceptance criteria.

### 2.4. Domain trước presentation

- Beam damage được tính trong simulation trước khi dựng beam mesh.
- Whiff/punish được xác định trong combat domain trước khi hiển thị label.
- Camera shake/hit-stop đọc event đã xác nhận.

### 2.5. Không thêm dependency nếu chưa cần

Dùng Three.js và repository utilities hiện tại. Không thêm physics engine, ECS hoặc framework UI mới cho roadmap này.

---

## 3. Dependency graph

```text
Sandbox intent contract
    ↓
Direction resolver + parser
    ↓
Pure sandbox simulation
    ↓
Robot movement/aim presentation
    ↓
Sandbox scene + app mode lifecycle
    ↓
Weapon feedback + HUD
    ↓
Attack-Move / Patrol
    ↓
Voice adapter reuse
    ↓
Optional cloud live provider gate

Combat whiff event contract
    ↓
CombatBrain perception + tactic condition
    ↓
Deterministic punish classification
    ↓
HUD/VFX/camera feedback
```

Sandbox foundation và whiff/punish domain có thể phát triển độc lập sau khi các contract tương ứng được chốt, nhưng mỗi nhánh phải giữ build xanh.

---

# 4. Task list

## Phase 0 — Documentation & source-of-truth consolidation

### Task 0.1: Tạo gameplay source of truth

**Trạng thái:** Hoàn tất.

**Acceptance criteria:**

- [x] `docs/GAMEPLAY.md` mô tả product loop, hai mode, autonomy, Live Fight, Time-out, tactical script và failure behavior.
- [x] Provider cụ thể không được coi là gameplay invariant.
- [x] Sandbox và Robot Boxing có acceptance flow riêng.

**Verification:**

- [x] Kiểm tra các link nội bộ và tên file.
- [x] Không thay đổi runtime code.

**Files:**

- `docs/GAMEPLAY.md`

### Task 0.2: Ghi lại hiện trạng và khoảng trống

**Trạng thái:** Hoàn tất.

**Acceptance criteria:**

- [x] Phân biệt phần đã có và chưa có trong source.
- [x] Ghi rõ các khác biệt giữa proposal và implementation.
- [x] Chốt các quyết định kiến trúc trước khi coding.

**Files:**

- `docs/CURRENT_STATE_AND_GAPS.md`

### Task 0.3: Chuẩn hóa vai trò tài liệu và roadmap

**Trạng thái:** Hoàn tất.

**Acceptance criteria:**

- [x] `req.md` được đánh dấu là discovery/mentor input.
- [x] `architecture.md` được đánh dấu là implementation architecture.
- [x] Có một roadmap chuẩn duy nhất với task, dependency và verification.

**Files:**

- `docs/req.md`
- `docs/architecture.md`
- `docs/IMPLEMENTATION_PLAN.md`

### Checkpoint 0

- [x] Gameplay source of truth tồn tại.
- [x] Không còn phải suy diễn thứ tự ưu tiên từ hai roadmap khác nhau.
- [x] Không thay đổi code hoặc dependency.

---

## Phase 1 — Sandbox intent contract và direction parser

### Task 1.1: Định nghĩa Sandbox intent contract

**Trạng thái:** Hoàn tất.

**Description:** Tạo module dữ liệu thuần cho các intent tối thiểu: move, stop, aim, fire và attack target. Validate enum, angle, entity id, timestamps và expiry.

**Acceptance criteria:**

- [x] Input không hợp lệ bị từ chối với reason ổn định.
- [x] Intent là serializable data, không chứa callback hoặc Three.js object.
- [x] Angle được normalize về `[0, 2π)`.

**Verification:**

- [x] `pnpm validate:sandbox-intents` — 10 assertions pass.
- [x] `pnpm build` — Vite production build pass.

**Dependencies:** Task 0.3.

**Files touched:**

- `src/sandbox/SandboxIntent.js`
- `scripts/validate-sandbox-intents.mjs`
- `package.json`

**Estimated scope:** Small.

### Task 1.2: Triển khai DirectionResolver

**Trạng thái:** Hoàn tất.

**Description:** Parse hướng theo 12 cung giờ, la bàn tiếng Anh/Việt và hướng tương đối theo current heading.

**Acceptance criteria:**

- [x] 12/3/6/9 giờ ánh xạ đúng quy ước trong `GAMEPLAY.md`.
- [x] “trái/phải/sau lưng” dùng current heading.
- [x] Câu không có hướng trả về unrecognized thay vì đoán.

**Verification:**

- [x] Test table cho toàn bộ 12 giờ.
- [x] Test tiếng Việt có dấu, không dấu và tiếng Anh.
- [x] `pnpm validate:sandbox-direction` — 7 assertion groups pass.
- [x] `pnpm build` — Vite production build pass.

**Dependencies:** Task 1.1.

**Files touched:**

- `src/sandbox/DirectionResolver.js`
- `scripts/validate-sandbox-direction.mjs`
- `package.json`

**Estimated scope:** Small.

### Task 1.3: Tạo local Sandbox command parser

**Trạng thái:** Hoàn tất.

**Description:** Chuyển câu text ngắn thành `SandboxIntent`, tái sử dụng normalization pattern của `LocalCommandParser` nhưng không làm thay đổi parser boxing.

**Acceptance criteria:**

- [x] Nhận diện move, stop, aim và fire.
- [x] Không trả về combat boxing action id cho command Sandbox.
- [x] Text input có deterministic output.

**Verification:**

- [x] `pnpm validate:sandbox-commands` — 9 assertions pass.
- [x] `pnpm validate:phase4` — existing boxing coaching contract passes.
- [x] `pnpm build` — Vite production build pass.
- [ ] Full `pnpm validate` remains blocked by the pre-existing missing `docs/ATTACK_DEFENSE_MATRIX.md` contract.

**Dependencies:** Tasks 1.1–1.2.

**Files touched:**

- `src/sandbox/SandboxCommandParser.js`
- `scripts/validate-sandbox-commands.mjs`
- `package.json`

**Estimated scope:** Small.

### Checkpoint 1 — Contract foundation

- [ ] Không cần Three.js để test parser.
- [ ] Tất cả Sandbox intent có schema/validation rõ ràng.
- [ ] Existing `pnpm validate` và `pnpm build` pass.

---

## Phase 2 — Pure Sandbox simulation

### Task 2.1: Fixed-step player movement state

**Trạng thái:** Hoàn tất.

**Description:** Tạo simulation thuần dữ liệu cho player position, heading, move intent, arena bounds và stop behavior.

**Acceptance criteria:**

- [x] Cùng seed/input/delta sequence tạo cùng kết quả.
- [x] Movement dùng simulation time, không dùng wall-clock trực tiếp.
- [x] Stop intent làm velocity về 0 mà không thay đổi vị trí đột ngột.

**Verification:**

- [x] `pnpm validate:sandbox-simulation` — 11 assertion groups pass.
- [x] Bounds, future/expired intent và reset tests pass.
- [x] `pnpm build` — Vite production build pass.
- [x] `pnpm validate:phase4` — existing boxing coaching contract passes.
- [ ] Full `pnpm validate` remains blocked by the pre-existing missing `docs/ATTACK_DEFENSE_MATRIX.md` contract.

**Dependencies:** Task 1.1.

**Files touched:**

- `src/sandbox/SandboxSimulation.js`
- `src/sandbox/SandboxRules.js`
- `scripts/validate-sandbox-simulation.mjs`
- `package.json`

**Estimated scope:** Medium.

### Task 2.2: Horde entities và contact damage

**Trạng thái:** Hoàn tất.

**Description:** Thêm zombie state, deterministic spawn API, movement tới player, contact cooldown và death removal.

**Acceptance criteria:**

- [x] Zombie state không chứa mesh.
- [x] Contact damage không nhân theo render FPS.
- [x] Spawn và update có thể tái lập trong test.

**Verification:**

- [x] `pnpm validate:sandbox-simulation` — 15 assertion groups pass.
- [x] Approach, contact, cooldown và death tests pass.
- [x] `pnpm build` — Vite production build pass.
- [x] `pnpm validate:phase4` — existing boxing coaching contract passes.

**Dependencies:** Task 2.1.

**Files touched:**

- `src/sandbox/SandboxSimulation.js`
- `scripts/validate-sandbox-simulation.mjs`
- `package.json`

**Estimated scope:** Medium.
- [ ] Existing validation pass.

**Dependencies:** Task 2.1.

**Files likely touched:**

- `src/sandbox/SandboxSimulation.js`
- `src/sandbox/SandboxRules.js`
- `scripts/validate-sandbox-horde.mjs`

**Estimated scope:** Medium.

### Task 2.3: Target selection và beam damage

**Trạng thái:** Hoàn tất.

**Description:** Thêm nearest-target query và beam contact bằng vector projection trong simulation.

**Acceptance criteria:**

- [x] Beam chỉ trúng entity phía trước và trong half-width.
- [x] Damage, death và score tạo domain event.
- [x] Fire cooldown/energy rule được centralize trong `SandboxRules`.

**Verification:**

- [x] Tests cho target trong tia, ngoài tia, sau lưng và ở biên.
- [x] Deterministic event ordering.
- [x] `pnpm validate:sandbox-weapons` — 7 assertion groups pass.
- [x] `pnpm validate:sandbox-simulation` — 15 assertion groups pass.
- [x] `pnpm build` — Vite production build pass.
- [ ] Full `pnpm validate` remains blocked by the pre-existing missing `docs/ATTACK_DEFENSE_MATRIX.md` contract.

**Dependencies:** Task 2.2.

**Files touched:**

- `src/sandbox/SandboxSimulation.js`
- `src/sandbox/SandboxRules.js`
- `scripts/validate-sandbox-weapons.mjs`
- `package.json`

**Estimated scope:** Medium.

### Checkpoint 2 — Headless playable rules

- [x] Có thể chạy scenario Sandbox movement, horde và beam trong Node không cần WebGL.
- [x] Move, stop, zombie contact và beam damage đều deterministic.
- [ ] Full `pnpm validate` vẫn bị chặn bởi tài liệu contract có sẵn nhưng còn thiếu; `pnpm build` pass.

---

## Phase 3 — Three.js Sandbox presentation

### Task 3.1: Robot movement và aim presentation adapter

**Description:** Đồng bộ player simulation state sang robot root và upper-body pivot. Presentation sử dụng interpolation/slerp nhưng không sở hữu authoritative position.

**Acceptance criteria:**

- [ ] Root mesh theo simulation position.
- [ ] Lower-body heading và aim heading có thể khác nhau.
- [ ] Không có damage hoặc gameplay rule trong presentation adapter.

**Verification:**

- [ ] Node validation cho transform math nếu có thể.
- [ ] Browser manual check với fixed intents.
- [ ] `pnpm build`.

**Dependencies:** Task 2.1.

**Files likely touched:**

- `src/sandbox/SandboxRobotView.js`
- `src/sandbox/SandboxRules.js`
- `scripts/validate-sandbox-view-math.mjs`

**Estimated scope:** Medium.

### Task 3.2: Sandbox scene lifecycle

**Description:** Tạo scene/controller sở hữu ground, player view, zombie views, update và dispose.

**Acceptance criteria:**

- [ ] Mode có setup/update/dispose rõ ràng.
- [ ] Zombie mesh phản ánh entity state theo id.
- [ ] Geometry/material được reuse hoặc dispose đúng.

**Verification:**

- [ ] Browser smoke mở/đóng Sandbox nhiều lần không throw.
- [ ] Console không có uncaught error.
- [ ] `pnpm build`.

**Dependencies:** Tasks 2.2 và 3.1.

**Files likely touched:**

- `src/sandbox/SandboxMode.js`
- `src/sandbox/SandboxRobotView.js`
- `src/sandbox/SandboxHordeView.js`
- `scripts/sandbox-smoke.mjs`

**Estimated scope:** Medium.

### Task 3.3: Tích hợp mode vào app lifecycle

**Description:** Thêm entry UI tối thiểu để chuyển giữa Showcase, Fight và Sandbox mà không làm thay đổi Fight Mode.

**Acceptance criteria:**

- [ ] Vào/thoát Sandbox không để lại scene object hoặc input listener.
- [ ] Fight Mode hiện tại vẫn hoạt động.
- [ ] Camera được cấu hình riêng cho Sandbox.

**Verification:**

- [ ] `pnpm test:browser`.
- [ ] `pnpm test:browser:fight`.
- [ ] Sandbox smoke test.
- [ ] `pnpm build`.

**Dependencies:** Task 3.2.

**Files likely touched:**

- `src/main.js`
- `src/ui/CombatHUD.js`
- `src/ui/style.css`
- `src/sandbox/SandboxMode.js`
- `src/camera/FightCameraController.js` hoặc camera module Sandbox mới

**Estimated scope:** Medium.

### Checkpoint 3 — First visual Sandbox

- [ ] Người dùng vào được Sandbox và thấy robot/zombie.
- [ ] Test hook có thể gửi intent không cần voice.
- [ ] Không regression Showcase/Fight.

---

## Phase 4 — End-to-end local text-to-action

### Task 4.1: Sandbox command console

**Description:** Kết nối text input tới `SandboxCommandParser`, submit intent và hiển thị interpreted command/rejection.

**Acceptance criteria:**

- [ ] “Đi hướng 6 giờ” di chuyển đúng hướng.
- [ ] “Dừng lại” dừng robot.
- [ ] “Bắn hướng 3 giờ” kích hoạt beam hợp lệ.
- [ ] Invalid command không làm hỏng intent trước đó ngoài rule đã định nghĩa.

**Verification:**

- [ ] Browser smoke qua QA hooks hoặc DOM.
- [ ] Console sạch.
- [ ] `pnpm build`.

**Dependencies:** Tasks 1.3, 2.3 và 3.3.

**Files likely touched:**

- `src/main.js`
- `src/ui/CombatHUD.js`
- `src/sandbox/SandboxMode.js`
- `scripts/sandbox-command-smoke.mjs`

**Estimated scope:** Medium.

### Task 4.2: Compass HUD và intent telemetry

**Description:** Hiển thị heading, aim direction, command status và local parse latency cho debug/playtest.

**Acceptance criteria:**

- [ ] HUD phản ánh simulation state, không đọc rotation mesh làm truth.
- [ ] Có feedback accepted/rejected/expired.
- [ ] Telemetry không ghi audio hoặc transcript dài hạn.

**Verification:**

- [ ] Visual browser smoke.
- [ ] Responsive/touch smoke.

**Dependencies:** Task 4.1.

**Files likely touched:**

- `src/ui/CombatHUD.js`
- `src/ui/style.css`
- `src/sandbox/SandboxMode.js`
- `scripts/sandbox-visual-smoke.mjs`

**Estimated scope:** Medium.

### Checkpoint 4 — Voice-to-action value proven without cloud

- [ ] Local text command hoàn thành flow end-to-end.
- [ ] Hướng và beam dễ kiểm chứng bằng mắt.
- [ ] Có latency measurement cho parser local.
- [ ] Build và existing browser tests pass.

---

## Phase 5 — Autonomous mission orders

### Task 5.1: Auto-target local reflex

**Description:** Robot tự chọn zombie gần nhất trong sensor radius và bắn theo cooldown khi không có aim/fire override ưu tiên hơn.

**Acceptance criteria:**

- [ ] Hoạt động không cần input người chơi.
- [ ] Target selection deterministic.
- [ ] Direct fire command có priority rõ ràng và expiry.

**Verification:**

- [ ] Headless scenario.
- [ ] Browser observation fixture.

**Dependencies:** Task 2.3.

**Files likely touched:**

- `src/sandbox/SandboxBrain.js`
- `src/sandbox/SandboxMode.js`
- `scripts/validate-sandbox-brain.mjs`

**Estimated scope:** Medium.

### Task 5.2: Attack-Move

**Description:** Robot di chuyển tới destination, tạm xử lý threat trong sensor radius rồi tiếp tục mission.

**Acceptance criteria:**

- [ ] Mission progress được giữ khi chuyển sang combat.
- [ ] Hết target robot tiếp tục tới destination.
- [ ] Stop/superseding order hủy hoặc thay mission theo rule rõ ràng.

**Verification:**

- [ ] Deterministic scenario có ít nhất hai zombie trên đường.
- [ ] Browser smoke.

**Dependencies:** Task 5.1.

**Files likely touched:**

- `src/sandbox/SandboxBrain.js`
- `src/sandbox/SandboxIntent.js`
- `src/sandbox/SandboxCommandParser.js`
- `scripts/validate-sandbox-orders.mjs`

**Estimated scope:** Medium.

### Task 5.3: Patrol

**Description:** Robot di chuyển qua lại giữa hai điểm, xử lý threat rồi quay về route.

**Acceptance criteria:**

- [ ] Patrol cursor/route state nằm trong domain runtime.
- [ ] Combat interruption không xóa route.
- [ ] Lệnh mới supersede patrol có event/reason rõ ràng.

**Verification:**

- [ ] Deterministic patrol-interrupt-resume test.
- [ ] Browser smoke.

**Dependencies:** Task 5.2.

**Files likely touched:**

- `src/sandbox/SandboxBrain.js`
- `src/sandbox/SandboxIntent.js`
- `src/sandbox/SandboxCommandParser.js`
- `scripts/validate-sandbox-orders.mjs`

**Estimated scope:** Medium.

### Checkpoint 5 — Sandbox autonomy

- [ ] Robot tự hoạt động khi người chơi im lặng.
- [ ] Attack-Move và Patrol không cần cloud.
- [ ] Mission state inspectable và testable.

---

## Phase 6 — Voice adapter reuse

### Task 6.1: Kết nối Web Speech với Sandbox parser

**Description:** Tái sử dụng `VoiceCoachController` làm input adapter; route final transcript tới parser theo active mode.

**Acceptance criteria:**

- [ ] Text và voice tạo cùng domain intent cho cùng transcript.
- [ ] Voice unavailable vẫn dùng text bình thường.
- [ ] Không route Sandbox command vào Fight coaching hoặc ngược lại.

**Verification:**

- [ ] Browser mock/QA hook cho transcript final.
- [ ] Existing Fight voice/text flow không regression.
- [ ] `pnpm test:browser:fight` và Sandbox smoke.

**Dependencies:** Checkpoint 4.

**Files likely touched:**

- `src/main.js`
- `src/coaching/VoiceCoachController.js`
- `src/sandbox/SandboxMode.js`
- `scripts/sandbox-command-smoke.mjs`

**Estimated scope:** Medium.

### Task 6.2: Đo latency local và acceptance playtest

**Description:** Ghi timestamp tạm thời từ transcript final đến intent accepted/presentation response để tạo p50/p95 trong phiên QA, không persistence transcript.

**Acceptance criteria:**

- [ ] Metric phân biệt speech recognition latency và local parse/dispatch latency nếu đo được.
- [ ] Không gửi telemetry ra ngoài mặc định.
- [ ] Có fixture/report format dùng cho QA.

**Verification:**

- [ ] QA script xuất summary.
- [ ] Security smoke không phát hiện transcript persistence.

**Dependencies:** Task 6.1.

**Files likely touched:**

- `src/sandbox/SandboxTelemetry.js`
- `src/sandbox/SandboxMode.js`
- `scripts/sandbox-latency-smoke.mjs`

**Estimated scope:** Small.

### Checkpoint 6 — Local voice vertical slice

- [ ] Voice và text dùng chung parser/intent.
- [ ] Microphone/cloud failure không ngăn chơi Sandbox.
- [ ] Có số liệu latency thực tế của local path.

---

## Phase 7 — Boxing whiff/punish domain

### Task 7.1: Định nghĩa whiff event và public recovery signal

**Description:** Nâng `missed` contact thành domain event/state đủ để phân biệt whiff và thời gian recovery còn lại.

**Acceptance criteria:**

- [ ] Có lý do whiff ổn định: out-of-range, bad-facing hoặc dodged.
- [ ] Event chứa action id, target id và recovery boundary.
- [ ] Không thay đổi damage/contact authority.

**Verification:**

- [ ] Mở rộng `validate:attack-defense` hoặc validation domain phù hợp.
- [ ] Replay determinism pass.
- [ ] `pnpm validate`.

**Dependencies:** Không phụ thuộc Sandbox; thực hiện sau Checkpoint 2 hoặc song song có kiểm soát.

**Files likely touched:**

- `src/combat/CombatSimulation.js`
- `src/combat/CombatTypes.js`
- `scripts/validate-attack-defense.mjs`
- `scripts/validate-phase2.mjs`

**Estimated scope:** Medium.

### Task 7.2: Expose whiff perception và tactic condition

**Description:** Thêm `isEnemyWhiffing`/`punishWindowTicksRemaining` vào public perception và condition `enemy_whiff` vào tactic schema/runtime.

**Acceptance criteria:**

- [ ] CombatBrain không đọc private plan của đối thủ.
- [ ] Tactic có thể trigger khi enemy whiff.
- [ ] Schema validation vẫn bounded và version-compatible.

**Verification:**

- [ ] Tests cho condition activation, expiry và invalid schema.
- [ ] `pnpm validate:phase5` và `pnpm validate`.

**Dependencies:** Task 7.1.

**Files likely touched:**

- `src/ai/CombatBrain.js`
- `src/tactics/TacticSchema.js`
- `src/tactics/TacticRuntime.js`
- `scripts/validate-phase5.mjs`

**Estimated scope:** Medium.

### Task 7.3: Deterministic punish classification

**Description:** Gắn nhãn punish khi một hit hợp lệ kết nối trong punishable recovery window sau whiff.

**Acceptance criteria:**

- [ ] Punish là event domain, không do UI suy đoán.
- [ ] Không gắn punish cho hit ngoài window.
- [ ] Replay giữ được classification mà không gọi model.

**Verification:**

- [ ] Tests boundary đầu/cuối window.
- [ ] Tests miss không punishable nếu product rule loại trừ.
- [ ] `pnpm validate`.

**Dependencies:** Tasks 7.1–7.2 và quyết định product về punish window.

**Files likely touched:**

- `src/combat/CombatSimulation.js`
- `src/combat/EventLog.js` hoặc combat event contract hiện tại
- `scripts/validate-attack-defense.mjs`

**Estimated scope:** Medium.

### Checkpoint 7 — Whiff/Punish domain complete

- [ ] AI và tactic dùng được whiff signal.
- [ ] Punish được xác định deterministic.
- [ ] Không có presentation logic trong domain tests.

---

## Phase 8 — Combat feedback và polish

### Task 8.1: WHIFF/PUNISH/GUARD BREAK indicators

**Description:** Hiển thị transient labels dựa trên confirmed combat events.

**Acceptance criteria:**

- [ ] Label không tự suy đoán từ animation.
- [ ] Reduced-motion mode vẫn truyền tải thông tin.
- [ ] Label không che HUD hoặc fighter quan trọng trên mobile.

**Verification:**

- [ ] `pnpm test:browser:visual`.
- [ ] `pnpm test:browser:touch`.

**Dependencies:** Checkpoint 7.

**Files likely touched:**

- `src/ui/CombatHUD.js`
- `src/ui/style.css`
- `src/combat/FightMode.js`
- `scripts/visual-qa.mjs`

**Estimated scope:** Medium.

### Task 8.2: Camera trauma và hit-stop contract

**Description:** Kết nối confirmed heavy-hit/knockdown/punish events với presentation feedback. Chốt hit-stop là presentation-only hay simulation pause trước implementation.

**Acceptance criteria:**

- [ ] Camera shake không thay đổi simulation.
- [ ] Reduced-motion giảm/tắt shake.
- [ ] Hit-stop không làm replay diverge.

**Verification:**

- [ ] Deterministic replay test.
- [ ] Performance smoke.
- [ ] Visual QA.

**Dependencies:** Product decision trong `GAMEPLAY.md` và Task 8.1.

**Files likely touched:**

- `src/combat/FightMode.js`
- `src/camera/FightCameraController.js`
- `src/main.js`
- `scripts/fight-mode-smoke.mjs`

**Estimated scope:** Medium.

### Checkpoint 8 — Boxing feedback complete

- [ ] Whiff/punish dễ đọc bằng mắt.
- [ ] Feedback không phá simulation, replay hoặc accessibility.
- [ ] Full validation và browser smoke pass.

---

## Phase 9 — Optional cloud live provider decision gate

### Task 9.1: Benchmark và quyết định provider

**Description:** So sánh Web Speech + HTTP fallback hiện tại với ít nhất một live streaming option bằng benchmark có ngày, nguồn, latency, chi phí và browser constraints.

**Acceptance criteria:**

- [ ] Có benchmark p50/p95 trên command set thực tế.
- [ ] Có cost model ghi rõ giả định.
- [ ] Có quyết định go/no-go; không mặc định phải tích hợp.

**Verification:**

- [ ] Review tài liệu benchmark.
- [ ] Không đổi runtime trước khi quyết định.

**Dependencies:** Checkpoint 6.

**Files likely touched:**

- `docs/VOICE_PROVIDER_EVALUATION.md`

**Estimated scope:** Small documentation/experiment task.

### Task 9.2: Provider adapter contract nếu được duyệt

**Description:** Nếu benchmark chứng minh lợi ích, tạo adapter trả về cùng validated domain intent; secret và provider session nằm server-side.

**Acceptance criteria:**

- [ ] Core game không import provider-specific SDK.
- [ ] Disconnect/reconnect không dừng simulation.
- [ ] Stale response bị drop.
- [ ] Browser không chứa provider secret.

**Verification:**

- [ ] Worker validation/security smoke.
- [ ] Offline fallback test.
- [ ] Production canary nếu có credential hợp lệ.

**Dependencies:** Task 9.1 được duyệt.

**Files likely touched:** Chỉ xác định sau provider evaluation; cần spec riêng trước implementation.

**Estimated scope:** Tách thành các task nhỏ sau khi có quyết định.

---

# 5. Verification strategy

## 5.1. Domain tests

Ưu tiên test không cần renderer cho:

- direction parsing;
- intent validation;
- fixed-step movement;
- zombie movement/contact;
- beam geometry/contact;
- mission state;
- whiff event;
- punish window;
- tactic condition;
- deterministic replay.

## 5.2. Browser tests

Dùng browser smoke cho:

- mode lifecycle;
- text command flow;
- voice adapter routing;
- camera và HUD;
- responsive/touch;
- console errors;
- visual feedback;
- performance smoke.

## 5.3. Existing commands

Chỉ dùng script thực sự tồn tại tại thời điểm chạy. Baseline hiện tại:

```bash
pnpm validate
pnpm build
pnpm test:browser
pnpm test:browser:fight
pnpm test:browser:touch
pnpm test:browser:performance
pnpm test:browser:visual
pnpm security:smoke
```

Các `validate:sandbox` hoặc smoke script nêu trong task là script **sẽ được thêm trong chính task tương ứng**, không phải command hiện đang tồn tại.

---

# 6. Release gates

Sandbox chỉ được xem là đạt vertical slice khi:

- [ ] Text command acceptance flow chạy end-to-end.
- [ ] Voice sử dụng cùng intent contract.
- [ ] Robot tiếp tục local autonomy khi không có input.
- [ ] Không cần cloud để move, stop hoặc fire.
- [ ] Mode switching không gây leak/error rõ ràng.
- [ ] Build, domain validation và browser smoke pass.
- [ ] Latency local được đo trên môi trường QA.

Whiff/Punish chỉ được xem là hoàn tất khi:

- [ ] Có domain event/state rõ ràng.
- [ ] Có deterministic tests cho window boundaries.
- [ ] CombatBrain/tactic dùng được signal.
- [ ] UI chỉ hiển thị confirmed event.
- [ ] Replay không diverge.

---

# 7. Open questions cần quyết định trước task liên quan

1. Sandbox sẽ là menu mode chính thức hay QA/lab mode trong lần phát hành đầu?
2. Beam dùng cooldown, energy hay charge count?
3. Player health và game-over loop của Sandbox cần ở vertical slice đầu hay sau?
4. Punish window có phải toàn bộ recovery sau whiff hay chỉ một phần?
5. Miss do out-of-range có luôn punishable không?
6. Hit-stop pause simulation hay chỉ presentation?
7. Camera Sandbox là fixed isometric, follow-camera hay orbit có giới hạn?
8. Có cần replay cho Sandbox vertical slice đầu tiên không?
9. Provider live có giá trị đủ lớn so với Web Speech + local parser hay không?

Không tự động chọn phương án phức tạp nhất. Khi chưa có quyết định, dùng safe/default behavior nhỏ nhất phù hợp với `GAMEPLAY.md`.
