# Phân Tích Hiện Trạng, Khoảng Trống & Quyết Định Kiến Trúc

> **Mục đích:** Ghi lại kết quả đối chiếu `docs/req.md`, `docs/architecture.md` và repository tại thời điểm thực hiện Bước 0.
>
> **Không phải gameplay source of truth.** Gameplay chuẩn nằm tại `docs/GAMEPLAY.md`; kế hoạch triển khai nằm tại `docs/IMPLEMENTATION_PLAN.md`.

---

## 1. Tóm tắt điều hành

Hai tài liệu ban đầu thống nhất ở định hướng quan trọng nhất:

- robot phải tự chủ cục bộ;
- LLM/voice chỉ tác động cấp chiến lược hoặc tạo yêu cầu hành động;
- simulation giữ quyền quyết định combat;
- Live Fight không được âm thầm sửa playbook;
- Time-out là bề mặt review và commit chiến thuật;
- Sandbox 360 độ là vertical slice ưu tiên để chứng minh voice-to-action trước khi tiếp tục mở rộng combat phức tạp.

Repository hiện tại đã hoàn thiện đáng kể phần Robot Boxing 1v1, bao gồm simulation tất định, local AI, coaching, tactical playbook, Time-out, persistence và replay. Phần thiếu lớn nhất so với tài liệu là Sandbox và hệ thống whiff/punish hạng nhất.

---

## 2. Vai trò của từng tài liệu

| Tài liệu | Vai trò sau Bước 0 |
|---|---|
| `docs/GAMEPLAY.md` | Nguồn sự thật gameplay và product behavior |
| `docs/req.md` | Bối cảnh, ghi chú mentor, ý tưởng và số liệu tham khảo |
| `docs/architecture.md` | Kiến trúc kỹ thuật, module boundaries và đề xuất triển khai |
| `docs/CURRENT_STATE_AND_GAPS.md` | Snapshot đối chiếu tài liệu với source hiện tại |
| `docs/IMPLEMENTATION_PLAN.md` | Roadmap chuẩn, task, acceptance criteria và verification |

Khi có xung đột:

1. yêu cầu hiện tại của người dùng;
2. `docs/GAMEPLAY.md`;
3. source code hiện tại đối với implementation fact;
4. `docs/architecture.md`;
5. `docs/req.md`.

---

## 3. Kiến trúc hiện tại đã được xác nhận

### 3.1. Combat authority

`src/combat/CombatSimulation.js` hiện là simulation authority:

- fixed-step 60 Hz qua `SimClock`;
- không phụ thuộc Three.js, network hoặc model;
- xác thực capability, stamina và trạng thái fighter;
- quản lý startup, active và recovery;
- giải quyết range, facing, block, parry, evade và hit;
- sở hữu health, stamina, posture, stagger, knockdown và KO;
- tạo event log và replay input.

`src/combat/FightMode.js` là bridge sang presentation. Nó đồng bộ transform và animation từ simulation state thay vì dùng animation làm nguồn combat truth.

**Đánh giá:** Phù hợp với invariant trong `architecture.md`.

### 3.2. Local autonomous AI

`src/ai/CombatBrain.js`:

- đọc public simulation state;
- chọn movement và `ActionIntent`;
- sử dụng behavior profile, Blackboard, playbook và robot pattern;
- không gọi network;
- không trực tiếp gây damage;
- có seeded RNG và decision interval;
- hỗ trợ tactical capacity và imperfect adherence.

Simulation chạy 60 Hz nhưng AI không cần ra quyết định mới 60 lần/giây. `decisionInterval = 6` tương ứng khoảng 10 decision/giây, trong khi action timing vẫn được simulation xử lý từng tick.

**Đánh giá:** Kiến trúc đúng; không nên ép LLM hoặc utility decision chạy mỗi render frame.

### 3.3. Live coaching

Luồng hiện tại:

```text
VoiceCoachController hoặc text input
    ↓
OpenRouter Jev
    ↓
DirectCommandQueue hoặc CombatBlackboard
    ↓
CombatBrain / FightMode
    ↓
CombatSimulation
```

Nếu Jev không hiểu:

```text
HTTP POST /api/coach/interpret
    ↓
Cloudflare Worker + OpenRouter Jev
    ↓
validated DirectCommand hoặc BlackboardOverride
```

Đã có:

- tiếng Anh và tiếng Việt;
- Jev request;
- timeout 2.5 giây cho cloud fallback;
- request version để loại stale response;
- confidence threshold;
- schema/domain validation;
- fallback không chặn combat.

**Đánh giá:** Đáp ứng local determinism. Đây chưa phải AudioWorklet/WebSocket/Gemini Live pipeline như mô tả trong `req.md`.

### 3.4. Live Fight vs Time-out

`OpenRouter Jev` chủ động từ chối câu có cấu trúc tactic dài hạn trong Live Fight. `DirectCommandQueue` chứa lệnh ngắn hạn; `CombatBlackboard` chứa override có expiry.

Time-out hiện có:

- tối đa 3 lượt;
- trừ lượt khi mở;
- cancel không hoàn lượt;
- pause/resume simulation clock;
- editor nhiều tactic;
- validate trước preview;
- review bắt buộc trước commit;
- revision conflict guard;
- `PlaybookStore` có persistence, history và rollback domain API;
- model chỉ đề xuất `TacticPatch`, không tự commit.

**Đánh giá:** Phù hợp với boundary được yêu cầu và đã vượt mức pseudocode trong `req.md`.

### 3.5. Tactical playbook

Đã có:

- schema v1 dựa trên action;
- schema v2 dựa trên bounded strategy intent;
- trigger, phase, branch, abort, repeat, timeout và priority;
- intent `action`, `counter`, `move`, `wait_for`, `set_priority`;
- validation action id, collection bounds và capacity;
- runtime tách khỏi tactic definition;
- resolver chuyển strategy intent thành concrete domain request.

**Đánh giá:** Đúng yêu cầu tactical script là dữ liệu bị giới hạn, không phải generated code.

---

## 4. Những phần đã có trong source

| Hệ thống | Trạng thái |
|---|---|
| Three.js browser renderer | Đã có |
| Robot catalog và rigid animation | Đã có |
| Fixed-step combat simulation | Đã có |
| Startup/active/recovery | Đã có |
| Range và facing validation | Đã có |
| Block, chip damage, parry, evade | Đã có |
| Stamina, posture, guard break | Đã có |
| Knockdown, get-up, KO, timer | Đã có |
| Local autonomous CombatBrain | Đã có |
| Robot behavior profiles | Đã có |
| RobotPatternRuntime | Đã có |
| CombatBlackboard | Đã có |
| DirectCommandQueue | Đã có |
| Local bilingual parser | Đã có |
| Web Speech adapter | Đã có |
| OpenRouter Jev fallback | Đã có |
| Tactical schema v1/v2 | Đã có |
| Tactic patch validation | Đã có |
| Playbook persistence/revision/history | Đã có |
| 3 Time-outs | Đã có |
| Review-before-commit UI | Đã có |
| Replay và persistence | Đã có |
| Camera shake capability | Đã có nền tảng |
| Sandbox intent contract | Đã có `src/sandbox/SandboxIntent.js` và validation script |
| Sandbox direction resolver | Đã có `src/sandbox/DirectionResolver.js` và validation script |
| Sandbox local command parser | Đã có `src/sandbox/SandboxCommandParser.js` và validation script |
| Sandbox fixed-step movement simulation | Đã có `src/sandbox/SandboxSimulation.js`, `SandboxRules.js` và validation script |
| Sandbox horde/zombie entities | Đã có `spawnZombie`, `damageZombie`, contact cooldown và death removal |
| Sandbox beam weapon | Đã có vector-projection target selection, energy/cooldown, damage, score và events |
| Sandbox Three.js presentation | Đã có `src/sandbox/SandboxMode.js`, horde visuals, beam effect, HUD và lifecycle trong `main.js` |
| OpenRouter Jev command fallback | Đã có `/api/sandbox/interpret`, typed Decisions request, `typesafe/jev-1.13`, server-side key và boundary tests |
| Sandbox multi-step plans | Đã có `SandboxPlan`, local compound parser, JEV mission allowlist, interruptible runtime và validation |

---

## 5. Khoảng trống so với tài liệu

### 5.1. Sandbox đã có domain contracts, movement, horde và beam simulation

Đã có:

- `src/sandbox/SandboxIntent.js`;
- `src/sandbox/DirectionResolver.js`;
- `src/sandbox/SandboxCommandParser.js`;
- `src/sandbox/SandboxSimulation.js`;
- `src/sandbox/SandboxRules.js`;
- các validation script cho intent, direction, command và movement;
- fixed-step player movement ở 60 Hz;
- circular arena bounds;
- smooth bounded heading turn;
- future/expired movement intent;
- stop không teleport và không phụ thuộc wall-clock;
- deterministic headless movement fixture;
- `pnpm validate:sandbox-intents`, `pnpm validate:sandbox-direction`, `pnpm validate:sandbox-commands`, `pnpm validate:sandbox-simulation` và `pnpm validate:sandbox-weapons`;
- các intent `move`, `stop`, `aim`, `fire`, `attack_target`;
- validation source, priority, tick, expiry, angle và target id;
- normalization angle về `[0, 2π)`;
- output chỉ chứa serializable domain data.

Chưa có:

- controller di chuyển 360 độ ở presentation layer;
- upper-body/turret aiming độc lập;
- Compass HUD;
- Attack-Move;
- Patrol;
- ~~mode Sandbox trong `main.js`~~ — đã có lifecycle `showcase` ↔ `sandbox`, camera, robot/zombie presentation và HUD;
- kết nối provider thật cần secret OpenRouter trong Worker (`OPENROUTER_API_KEY`); tests hiện dùng fetch seam, không gọi cloud.

Các đoạn code Sandbox trong `architecture.md` hiện là proposal/pseudocode, không phải source đã tồn tại.

### 5.2. Voice live streaming chưa tồn tại

Chưa có:

- AudioWorklet PCM 16 kHz;
- voice WebSocket client;
- bidirectional streaming proxy;
- Gemini Live integration;
- multimodal tool-calling live session;
- latency telemetry p50/p95 cho voice pipeline.

Kiến trúc hiện tại dùng Web Speech API và HTTP fallback. Fight fallback và Sandbox natural-language đều gọi OpenRouter `typesafe/jev-1.13`. Không còn Cloudflare Workers AI. Provider không phải dependency của core gameplay; Jev và simulation tiếp tục chạy khi provider lỗi.

### 5.3. Whiff/Punish chưa là tín hiệu hạng nhất

Simulation hiện emit `contact_resolved` với `result: 'missed'` và lý do như:

- `out_of_range`;
- `bad_facing`;
- `dodged`.

Nhưng chưa có:

- `attack_whiffed` domain event riêng;
- `hasMissed` trong active action state;
- `recoveryUntil`/`punishWindowTicksRemaining` public signal;
- `enemy_whiff` condition trong `TacticSchema`;
- perception field `isEnemyWhiffing` trong `CombatBrain`;
- deterministic classification của successful punish;
- HUD labels `WHIFF` và `PUNISH!`.

### 5.4. Game feel còn thiếu một số hạng mục

Đã có animation phase sync và camera shake capability, nhưng tài liệu chưa được đáp ứng đầy đủ ở:

- hit-stop có contract rõ ràng;
- feedback riêng cho whiff/punish;
- guard-break label;
- kết nối event combat với camera trauma theo rule rõ ràng;
- paired visual sign-off cho toàn bộ action matrix.

### 5.5. Multi-unit RTS mới là tầm nhìn

Cấu trúc `Who + Action + Target/Direction` chưa được triển khai thành contract dùng chung. Chưa có squad selection, production command hoặc reinforcement logic.

Không nên triển khai multi-unit trước khi command model một robot và Sandbox vertical slice ổn định.

---

## 6. Điểm không nhất quán giữa tài liệu và source

### 6.1. Tactic patch không được áp trực tiếp vào một object tham số

`req.md` minh họa `RobotReflexScript.applyTacticPatch()` bằng `Object.assign`. Cách này chỉ phù hợp để giải thích ý tưởng, không phải contract production.

Luồng production hiện tại và cần tiếp tục giữ là:

```text
model/manual edit
  → TacticPatch proposal
  → validate
  → preview/review
  → PlaybookStore.commit
  → CombatBrain.setPlaybook
```

### 6.2. Voice architecture trong `req.md` là mục tiêu tùy chọn

`req.md` đề xuất Gemini Live WebSocket. Source hiện tại dùng OpenRouter Jev qua HTTP. Không nên coi tên provider hoặc transport là gameplay requirement.

### 6.3. Chi phí và latency model không phải invariant

Các con số giá và latency trong tài liệu có thể thay đổi. Khi lựa chọn provider cần benchmark lại và ghi ngày/nguồn. Không hard-code quyết định sản phẩm dựa trên số liệu chưa xác minh.

### 6.4. “Script chạy 60 FPS” cần hiểu đúng

Simulation/reflex legality chạy fixed-step 60 Hz. High-level action selection có thể chạy chậm hơn để bảo toàn commitment và tránh decision spam. Không yêu cầu mọi lớp AI tạo quyết định mới mỗi frame.

### 6.5. Hai runtime chiến thuật có vai trò khác nhau

- `RobotPatternRuntime`: pattern nhân vật được author sẵn.
- `TacticRuntime`: tactic/playbook người chơi có thể chỉnh sửa.
- `CombatBrain`: arbitration và base utility.
- `CombatBlackboard`: working state tạm thời.

Tài liệu tương lai phải giữ rõ bốn vai trò này, không gộp tất cả thành một “script engine” duy nhất.

---

## 7. Quyết định được chốt ở Bước 0

1. `docs/GAMEPLAY.md` là gameplay source of truth.
2. Sandbox là vertical slice triển khai tiếp theo nhưng không xóa hoặc thay thế Robot Boxing hiện có.
3. Text input được triển khai và test trước; voice dùng cùng domain intent contract.
4. Jev là đường diễn giải duy nhất cho voice và text.
5. Jev chỉ tạo dữ liệu miền đã validate và không phải combat dependency.
6. Live Fight không được sửa playbook.
7. Direct Command là request có expiry, không phải animation trigger.
8. Time-out giữ giới hạn 3 lượt và cancel không hoàn lượt theo behavior hiện tại.
9. Tactical scripts tiếp tục là validated bounded data.
10. WebSocket/Gemini Live được hoãn đến sau khi Sandbox local/text vertical slice đạt acceptance criteria.
11. Whiff/Punish phải được xây ở domain/simulation trước khi thêm visual label.
12. Không thêm physics engine hoặc framework mới cho Sandbox nếu chưa có nhu cầu đo được.

---

## 8. Rủi ro cần theo dõi

| Rủi ro | Mức độ | Cách giảm thiểu |
|---|---:|---|
| Sandbox tạo một architecture song song hoàn toàn | Cao | Dùng chung domain intent, event và fixed-step principles; tách mode-specific simulation |
| Voice provider làm game phụ thuộc mạng | Cao | Timeout, stale response drop, optional adapter |
| Mesh trở thành combat truth trong Sandbox | Cao | Simulation sở hữu transform/health/damage, renderer chỉ trình bày |
| Tactic proposal bypass review | Cao | Chỉ `PlaybookStore.commit` sau validation và user confirmation |
| Scope tăng sang full RTS quá sớm | Cao | Hoàn tất một-robot Sandbox trước multi-unit |
| Whiff/Punish chỉ là visual effect | Trung bình | Định nghĩa event/state/test domain trước presentation |
| Số liệu giá provider lỗi thời | Trung bình | Benchmark và ghi ngày/nguồn khi chọn provider |
| Quyết định AI quá thường xuyên gây jitter | Trung bình | Giữ decision interval và action commitment |
| Hai mode làm tăng bundle/performance cost | Trung bình | Lazy setup/dispose mode, profile trước tối ưu |

---

## 9. Kết quả kiểm tra repository tại Bước 0

Đã chạy:

```bash
pnpm build
```

Kết quả: **pass** với Vite production build.

Đã chạy:

```bash
pnpm validate
```

Kết quả: các validation robot, animation, motion và combat phase 0–2 chạy pass; lệnh tổng dừng tại `validate-attack-defense.mjs` vì thiếu file đã được script/README tham chiếu:

```text
docs/ATTACK_DEFENSE_MATRIX.md
```

Ngoài ra README còn tham chiếu một số tài liệu không có trong snapshot `docs/` hiện tại:

- `docs/ANIMATION_LIBRARY.md`;
- `docs/ROBOT_SHOWCASE.md`;
- `docs/ROBOT_PATTERNS.md`.

Đây là khoảng trống tài liệu có sẵn của repository, không phải lỗi phát sinh từ nội dung Bước 0. Không tạo placeholder giả vì validator có thể cần contract nội dung thực. Việc phục hồi hoặc tái tạo các tài liệu này cần một task riêng, đối chiếu với source và validation script.

---

## 10. Tiêu chí hoàn tất Bước 0

- [x] Có `docs/GAMEPLAY.md` làm gameplay source of truth.
- [x] Vai trò của `req.md` và `architecture.md` được ghi rõ.
- [x] Hiện trạng source và khoảng trống được ghi lại.
- [x] Live Fight/Time-out boundary được chốt.
- [x] Sandbox được xác định là vertical slice tiếp theo.
- [x] Provider live được xác định là tùy chọn, không phải dependency.
- [x] Có implementation plan với task và verification cụ thể.
- [x] Không thay đổi gameplay/runtime code trong Bước 0.






