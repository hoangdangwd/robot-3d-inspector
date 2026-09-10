# Execution backlog — Robot Foundry

Đọc cùng [roadmap](IMPLEMENTATION_PLAN.md) và [gameplay](GAMEPLAY.md). Đây là **kế hoạch**, không phải mô tả hệ thống đã triển khai. Trạng thái được cập nhật trong quá trình triển khai; các ticket chưa đánh dấu Done vẫn là TODO.

## Cách sử dụng

- Mỗi hàng là một ticket; nếu chạm nhiều hơn khoảng 5 file hoặc hơn một behavior độc lập thì tách subticket.
- `Depends` là gate trước khi triển khai; các task độc lập có thể chạy song song sau khi chốt contract.
- `AC/DoD riêng` phải đạt **cộng với DoD chung trong roadmap**. Có code hoặc build xanh chưa có nghĩa Done.
- `S/M/L` là độ lớn tương đối, không phải cam kết số ngày. L phải tách trước khi nhận.
- Chủ sở hữu là trách nhiệm hệ thống, chưa gán cá nhân.

## 1. Milestone và thứ tự gate

| Gate | Kết quả nhìn thấy được | Phase |
|---|---|---|
| M0 — Reproducible lab | Fixed tick, seed, inspector; cùng input cho cùng state | 0 |
| M1 — Combat slice | Hai robot: bước vào tầm → jab → block/hit → recovery → end/reset | 1 + một phần 2 |
| M2 — Autonomous match | Hai robot tự đánh không input; năm profile khác biệt; match kết thúc được | 2–3 + match harness sớm |
| M3 — Live coach | Text/voice steer ngắn hạn; provider offline không dừng trận; playbook không bị sửa | 4 |
| M4 — Tactical coaching loop | Quan sát → dùng Time-out → review diff → commit → resume → tactic chạy locally | 5–6 |
| M5 — Robot limitations | Capacity/adherence giải thích được; bad read khác execution failure | 7 |
| M6 — Release candidate | Match lifecycle/replay hoàn chỉnh, QA/browser/security/performance gates | 8–9 |

Không đợi Phase 8 mới có end/reset: match harness tối thiểu phải có ở M1/M2 để kiểm chứng game loop. Không đợi voice mới test chiến thuật: dùng text và scripted fixtures trước.

## 2. Trạng thái triển khai

- [x] M0 / Phase 0: contracts, fixed-step clock, seeded RNG, bounded event log — `validate:phase0` PASS (58 assertions).
- [x] M1 / Phase 1: arena, jab/guard FSM, contact, resources, KO/reset, browser Fight Mode — `validate:phase1` PASS (46 assertions); fight browser smoke PASS.
- [x] Phase 2: shared boxing moveset, five capability profiles, guard variants, parry/dodge, deterministic presentation event cursor — `validate:phase2` PASS (27 assertions).
- [x] Phase 3: local CombatBrain with perception, spacing, archetype profiles, utility choices, commitment, deterministic seeds and offline Fight Mode — `validate:phase3` PASS (15 assertions); Fight Mode browser smoke PASS.
- [x] Phase 3.4 balance/telegraph pass: 15 robot pairings (10 unique + 5 mirrors) × 3 seeds, 45 deterministic KO bouts, 5,241 action starts, 2,467 contacts, 15 action kinds, arena/separation/invariant checks — `validate-ai-balance` PASS (374 assertions).
- [x] Phase 4A: bilingual local text + browser Web Speech adapter, DirectCommand queue, Blackboard overrides and Fight Mode coach HUD — `validate:phase4` PASS (20 assertions); browser Fight Mode smoke PASS.
- [x] Phase 4B: optional Cloudflare Worker fallback at `/api/coach/interpret`, Wrangler config, Workers AI response validation, CORS/origin guard, payload bounds, request IDs, bounded model JSON extraction and frontend timeout/stale-result handling — `validate:coach-worker` PASS (16 assertions); Worker deployed at `robot-foundry-coach.hieudo831.workers.dev`.
- [x] Phase 5A/C1: bounded tactic schema v1, strategy-level schema v2, v1→v2 migration, wait/counter/move/priority intents, TacticalIntentResolver, capacity-aware runtime and CombatBrain integration — `validate:phase5` PASS (34 assertions).
- [x] Phase 6: Time-out lifecycle, manual editor, diff/review, atomic local commit and proposal-only conversational patching — `validate:phase6` PASS (17 assertions); Fight Mode browser smoke PASS.
- [x] Phase 7: Seeded adherence/stress model, version history, capacity meter UI and coach feedback — `validate:phase7` PASS (40 assertions); Fight Mode browser smoke PASS.
- [x] Phase 8: match timer/result lifecycle, KO/time/draw outcomes, reset/retry, replay import/export/persistence and deterministic playback — `validate:phase8` PASS (46 assertions); browser acceptance PASS.

Fight Mode hiện có local autonomous CombatBrain, local coaching, bounded tactical playbooks, Time-out editor, match lifecycle, replay/history persistence and settings hydration. Voice dùng browser Web Speech API nếu khả dụng; text fallback luôn hoạt động. Cloudflare Worker/Workers AI fallback đã triển khai optional; production `pages.dev` origin đã được cấu hình.

## 2. Decision backlog — cần người dùng chốt trước task phụ thuộc

| ID | Quyết định | Đã chốt / chưa chốt | Block |
|---|---|---|---|
| D-01 | Ruleset combat | Boxing-oriented là giả định hiện tại; đá/gối/clinch chưa thành luật chỉ vì có clip preview. Chốt health, stagger/posture, stamina/energy có cần hệ riêng, knockdown/get-up, số round/scoring/win/draw | P1.2–P1.4, P8.1 |
| D-02 | Time-out lifecycle | Đã chốt tối đa 3/match. Chưa chốt consume khi vào hay commit, thời lượng, cooldown, quyền cancel, lúc nào được yêu cầu, pause settings có lộ thông tin chiến thuật không | P6.1 |
| D-03 | Deployment/model/voice | **Đã chốt Phase 4:** Web Speech API, `en-US` + `vi-VN`, Cloudflare Worker + optional Workers AI fallback, no app audio/transcript persistence, no browser secrets. Workers AI quota/pricing vẫn phụ thuộc Cloudflare account | P4.3b, P4.5 |
| D-04 | Capacity/adherence tuning | Có mechanic này là yêu cầu. Điểm cost, mức stress và cách feedback chưa chốt. Skill unlock/currency/campaign progression không mặc định là scope | P5.2, P7.1–P7.2 |
| D-05 | Persistence scope | Local playbook/replay trước; account, cloud save, campaign/cross-device là scope bổ sung cần duyệt | P5.4, P8.3 |

Các đề xuất trong roadmap không tự thay đổi GAMEPLAY.md. Khi quyết định sản phẩm được duyệt và materially đổi gameplay, cập nhật GAMEPLAY.md trước hoặc cùng implementation.

## 3. Tickets: foundation và combat

| ID | Việc cần làm / owner | Depends | AC/DoD riêng | Tests/evidence | Size |
|---|---|---|---|---|---|
| P0.1 | Contracts tối thiểu: state/action/event — domain | D-01 ở mức vertical slice | JS/JSDoc, đơn vị/time/facing rõ; chỉ schema dùng ngay, không dựng hết DSL từ đầu | Valid/invalid fixtures; reject NaN/enum/ID sai | M |
| P0.2 | Fixed-step clock + seeded RNG — simulation | P0.1 | Tick không phụ thuộc render; có bounded catch-up policy; RNG tách khỏi Math.random | Render schedules khác nhau cùng tick count cho cùng hash state; pause/tab recovery | M |
| P0.3 | Ring-buffer log + fixture runner — debug | P0.2 | Giới hạn dung lượng; action reasons/seed/tick có thể export; chưa cần full replay architecture | Buffer eviction, serialization, fixture lặp lại | S |
| P1.1 | Arena/facing/movement — simulation | P0.2, D-01 | Không vượt arena/chồng collider; movement là sim state, không animation root teleport | Bounds/corner/two-body contact/turn limit/down state | M |
| P1.2a | Jab action FSM — domain | P0.1, D-01 | Startup → active → recovery → ready; không re-enter khi chưa hợp lệ | Chính xác tick trước/ở/sau mỗi boundary; illegal intent không mutate | M |
| P1.2b | Guard action + cancellation table — domain | P1.2a | Guard và jab cancellation explicit; không bypass recovery | Cancel hợp lệ/sai, simultaneous requests, minimum commitment | S |
| P1.3 | Jab vs block/hurt volume resolver — domain | P1.1, P1.2b | Contact một lần/action/target; mesh render không authoritative | Range/facing/active/miss/block/duplicate contact; deterministic event order | M |
| P1.4 | Resources + stagger/down rules — domain | D-01, P1.3 | Clamp resource; knockdown/get-up legality; zero-health terminal state | Exhaustion, thresholds, repeated hits, no action while down/dead | L |
| P1.5 | Sim-to-animation adapter — rendering | P1.2a | Clock phase/move ID do sim cung cấp; missing clip fallback; không damage từ marker | Speed sync, interruption, state-chain, missing mapping; real browser contact frames | M |
| P1.6 | Start/end/reset match harness — match/UI | P1.3–P1.5 | Một fixture đánh được từ start tới end; retry dọn hết state; giữ showcase route/mode để inspect | Start/reset nhiều lần, stale timers/events, end condition D-01 | M |
| P2.1 | Expand move definitions — content/domain | M1 | Mỗi move được enable có contract/range/cost/cancel/contact/mapping; không bật đủ 40 chỉ vì clip tồn tại | Action matrix, registry references, contact frames | L |
| P2.2 | Five capability profiles — content | P2.1 | Stats dossier phân biệt design rating với sim tuning; reach dựa convention rõ | 5-profile fixtures, same semantic action respects each legality | M |
| P2.3 | Personality data — AI/content | P0.1 | Preference không ghi đè legality; không bắt buộc mọi robot dùng mọi move | Bias data bounds và later seeded decision distribution | S |
| P2.4 | Transition/contact visual tuning — rendering | P1.5, P2.2 | Representative hit/block/down transitions dễ đọc; lỗi armor/foot slip ghi severity | Video/frame sequences, multiple angles, missing clip fallback | L |

## 4. Tickets: autonomous fighting và coaching

| ID | Việc cần làm / owner | Depends | AC/DoD riêng | Tests/evidence | Size |
|---|---|---|---|---|---|
| P3.1 | Brain lifecycle + intent interface — AI | M1 | **Done:** `CombatBrain` chỉ perception → state → intent/movement; không mutate scene; tick callback local/synchronous | `validate:phase3`: offline fixture, invalid state, commitment | M |
| P3.2 | Spacing/threat/edge awareness — AI | P3.1, P1.1 | **Done:** range bands, facing, edge avoidance, separation constraint | `validate:phase3`: approach closes distance; edge changes movement; bounds | M |
| P3.3 | Action scoring/commitment — AI | P3.2, P2.2–P2.3 | **Done:** utility score uses range/threat/stamina/profile; commitment and seeded selection; event reason logging | `validate:phase3`: threat, low stamina, same/different seeds, action spam | M |
| P3.4 | Balance + telegraph pass — design/rendering | P3.3 | **Done for automated gate:** all 15 pairings across 3 seeds produce bounded KO outcomes, varied actions, legal telegraph timing, arena-safe positions and deterministic traces | `validate-ai-balance`: 374 assertions; Fight Mode browser smoke: 0 errors. Future tuning can still adjust feel without blocking Phase 3 | L |
| P4.1 | Direct command queue/lifecycle — commands | M2 | **Done for local slice:** bounded queue, lease, executed/rejected/expired/superseded history; commands remain requests and simulation owns legality | `validate:phase4`; Fight Mode direct-command browser smoke | M |
| P4.2 | Blackboard override layer — domain/AI | P4.1 | **Done for local slice:** validated temporary values, expiry/cancel, base return; no persistent playbook mutation | `validate:phase4`; Fight Mode temporary spacing smoke | M |
| P4.3a | Local text fast path — interpretation | P4.1–P4.2 | **Done:** English/Vietnamese phrase table outputs only DirectCommand/BlackboardOverride; unknown and temporal tactic phrases rejected | `validate:phase4`: 20 assertions; Fight Mode text smoke | M |
| P4.3b | Model fallback qua backend — integration | P4.3a, D-03 | **Done for Cloudflare Worker slice:** server-only AI binding, validated constrained output, payload/origin guards, request IDs, frontend timeout/stale protection, structured provider failure | `validate-coach-worker`: 9 assertions; Wrangler deploy dry-run; browser local fallback path | M |
| P4.4 | Live coaching HUD — UI | P4.3a | **Done for local slice:** text input, language selector, mic state, feedback, queue/outcome messaging; không blocking simulation | Fight Mode browser smoke; playbook boundary covered by local parser tests | M |
| P4.5 | Voice capture/recognition — input | P4.4, D-03 | **Done for free browser slice:** Web Speech API adapter, English/Vietnamese selector, mic states, no audio persistence, text fallback; voice is optional | `VoiceCoachController`; browser smoke validates text fallback and no errors. Physical microphone permission/device matrix remains manual follow-up | M |

Worker fallback đã triển khai theo dạng optional. Voice là giao diện chính của sản phẩm, nhưng không phải dependency để làm hoặc test combat.

## 5. Tickets: tactics và Time-out

| ID | Việc cần làm / owner | Depends | AC/DoD riêng | Tests/evidence | Size |
|---|---|---|---|---|---|
| P5.1 | DSL v1 tối thiểu — tactics | M2 | **Done for v1:** bounded schema with trigger, phases, sequence, branches, abort, repeat and timeout; only registered actions/conditions; no executable code | `validate:phase5`: valid, unknown action/operator and bounded-structure fixtures | M |
| P5.2 | Structural validator + cost — tactics | P5.1, D-04 | **Done for v1:** bounded names/text/phases/steps/branches/abort/repeat/timeout, registered action checks and deterministic cost; capacity overflow rejected | `validate:phase5`: malicious schema and capacity boundaries | M |
| P5.3a | One tactic end-to-end — tactics/AI | P5.2, P3.3 | **Done for v1:** trigger → bounded sequence/branch → tactic intent; runtime state separate; abort and repeat limit stop execution | `validate:phase5`: false/true trigger, sequence, abort and offline brain boundary | M |
| P5.3b | Conflict arbitration — tactics/AI | P5.3a, P4.2 | **Done:** tactic priority order, active tactic ownership, direct-command supersession và simulation legality boundary | `validate:phase5` multi-tactic priority; `validate:phase4` command supersession; Fight Mode smoke | M |
| P5.4 | Versioned playbook store — persistence | P5.2, D-05 | **Done for current slice:** atomic validated commit, revision conflict protection, storage reload and separate runtime state; v1 data remains readable and has explicit v1→v2 migration helpers | `validate:phase5`: 34 assertions; stale revision, capacity, reload and migration fixtures | M |
| P6.1 | Time-out lifecycle — match | D-02, P1.6 | **Done:** max 3/match, consume on open, deterministic pause/resume, cancel no refund, KO/double-open rejection, reset refill | `validate:phase6`: 17 assertions; Fight Mode browser Time-out pause/resume smoke | M |
| P6.2 | Inspect + manual edit/review UI — UI/tactics | P6.1, P5.4 | **Done for current slice:** bounded multi-tactic playbook editor with list/create/select/delete, goals, priorities, schema v1/v2 methods, repeats/timeouts, capacity validation, preview/review and atomic commit/cancel | Fight Mode browser smoke; `validate:phase6` review/atomic tests | M |
| P6.3 | Conversational patch proposal — integration | P6.2, P4.3b | **Done for v1:** Worker `/api/coach/tactic-patch` returns validated proposal + preview only; frontend applies only to draft, never auto-commits | `validate:phase6`; Worker valid/stale/malicious patch tests; timeout/manual fallback | M |
| P6.4 | Capability boundary hardening — commands/tactics | P4.3a, P6.3 | **Done for v1:** Live parser rejects temporal/persistent tactic requests; Time-out commit is a separate UI callback; stale async responses invalidated on mode change | Phase 4/6 parser tests, frontend request-version guard, Worker patch validation | M |

## 6. Tickets: limitations, match finish và release

| ID | Việc cần làm / owner | Depends | AC/DoD riêng | Tests/evidence | Size |
|---|---|---|---|---|---|
| P7.1 | Seeded adherence/stress — AI | P5.3b, D-04 | **Done:** `AdherenceModel.js` computes effective adherence from base profile, stamina ratio, stagger, tactic cost, active tactics and edge proximity; seeded RNG roll; miss resets tactic sequence and records event; does not create illegal action | `validate:phase7`: 40 assertions covering compute, determinism, miss as game event, no-NaN invariant | M |
| P7.2 | Capacity/readability UI — UI | P5.2, P7.1 | **Done (P1.3):** posture bar on both fighters; detailed capacity meter with exact cost/capacity ratio (`CAPACITY 3/5 COST`), active tactic count, remaining allowance, base adherence % and over-capacity alert; adherence miss feedback strip with cause label (`[ADHERENCE MISS]`) and auto-dismiss | Fight Mode browser smoke | M |
| P7.3 | Version history integration — tactics/replay | P5.4, P6.3 | **Done:** PlaybookStore retains up to 10 past revisions; explicit `rollback(rev, expected)` creates a new commit; history persists across storage reload | `validate:phase7`: history depth, rollback, reload | S |
| P7.4 | Coach feedback — UI/domain | P7.1 | **Done:** `adherenceMissReason()` maps stress state to one of 7 human-readable cause labels; `lastAdherenceMiss` exposed in brain debug snapshot; HUD renders cause in `#adherence-feedback` strip | `validate:phase7` reason labels; HUD `_updateCapacityMeter` | M |
| P8.1 | Final match lifecycle — match | M2, D-01, P6.1 | **Done for v1:** one timed round (180 s default), KO/time/draw outcomes, result snapshot, terminal simulation, reset/retry; Time-out counter remains match-scoped | `validate:phase8`: KO, timed decision, draw, terminal pause, reset | M |
| P8.2 | Deterministic replay — tooling | P0.3, P8.1, P7.3 | **Done for v1:** versioned `MatchReplay`, seed + initial state + authoritative intent/movement inputs + validated events/meta, no model/network, incompatible/malformed logs rejected | `validate:phase8`: export/playback, same-log deterministic final state, input capture/validation | M |
| P8.3 | Local save/settings/result & Replay playback — UI/persistence | P8.1, D-05 | **Done (P1.1 & P1.2):** `ReplayPlayer` 3D transport playback, step/pause/seek/speed, replay import/export, Match History modal with explicit match-linked watch/export buttons, clear history, corrupt-storage fallback | `validate:phase8`: 46 assertions; browser acceptance smoke with replay/history/settings hydration | M |
| P9.1 | E2E acceptance suite — QA | M4–M5, P8.1 | **Complete for current browser scope:** deterministic contracts exercise autonomous action/contact/health changes, knockdown/impossible-command flow, stamina rejection and reset continuation; production-preview acceptance covers stale responses, provider failure, malformed replay, matchId-only History association, settings, desktop/mobile/reduced motion, mobile touch and active-scene performance sampling | `pnpm test:phase9` PASS; `validate:phase9`: 25 assertions; `pnpm test:acceptance` PASS | L |
| P9.2 | Combat presentation QA — QA/design | P2.4, P8.1 | **Browser evidence complete:** active Fight Mode canvas captured on desktop/mobile with deterministic state acknowledgement, nonblank-pixel metrics and zero console/page errors; touch journey, replay/history UI, 5 fighters, 200 clips, overflow and reduced-motion verified. Physical devices and expert visual sign-off remain open | `artifacts/qa/active-desktop/*`; `artifacts/qa/active-mobile/*`; `artifacts/qa/release-report.md` | M |
| P9.3 | Profile + targeted performance & Code-splitting — engineering | P9.1 | **Code-splitting and active-scene sampling complete; hardware gate partial:** Vite isolates `vendor-three`; active Fight Mode sample records 332 renderer calls, 61,918 triangles, 146 geometries and 4 textures. The software harness observed 6.5 FPS and is explicitly not a hardware benchmark; renderer-call target and real Android/iOS profiling remain follow-ups | `artifacts/qa/performance.json`; `pnpm test:browser:performance`; `pnpm build` | M |
| P9.4 | Security/release gate — engineering/QA | All release tasks | **Automated gate complete for current scope:** bundle scan, replay-boundary validation, stale-result guards, production Worker health/CORS/invalid-origin smoke, model canary and release report; favicon/preview 404 fixed. Physical device/browser matrix, model quality and production visual sign-off remain | `pnpm test:phase9` PASS; `pnpm security:smoke` PASS; `artifacts/qa/release-report.md` | M |

## 7. Acceptance journeys bắt buộc

1. **Autonomy:** start → không input → hai robot đánh hợp lệ → result → retry sạch.
2. **Live request bất khả thi:** robot đang down → “hook” → deferred/rejected/expired rõ ràng → robot không bị ép đứng/đánh.
3. **Temporary steer:** “stay outside” → preferred spacing đổi → cancel/expiry → về base behavior → playbook hash không đổi.
4. **Boundary:** trong Live Fight yêu cầu “when he hooks, counter body” → không persistent rewrite; mời vào Time-out.
5. **Tactical loop:** observe → Time-out → propose/edit → diff review → reject (definition unchanged) → commit valid patch → resume → local tactic trigger.
6. **Bad read:** tactic hợp lệ về schema nhưng giả thuyết sai → không magically sửa → failure feedback không làm lộ hidden system truth.
7. **Economy:** request theo policy D-02 tới ba lần → lần thứ tư bị chặn → round reset không refill → match reset refill.
8. **Async:** request A chậm → request B mới → đổi mode → A trả về → không overwrite state mới hoặc sai mode.
9. **Provider failure:** mất mạng/mic permission/model output sai → simulation tiếp tục; text/manual editor vẫn dùng được.
10. **Robot identity:** cùng tactic trên fighter nhẹ/heavy → khác execution nhưng cùng intent và legality; overload/adherence có explanation.
11. **Replay:** seed + validated log tái tạo trận mà không cần mic/network/model.

## 8. Test layers và Definition of Done

### Unit/domain (phần lớn tests)

Không renderer/browser/network; tick/seed cụ thể. Test cả biên trước/đúng/sau thời điểm và outcome, không chỉ gọi hàm. Dùng Node built-in test/assert hiện có nếu đủ; script mới chỉ ghi vào tài liệu lệnh sau khi thực sự thêm vào package.json.

### Integration

Brain → intent → simulation → events; parser → validator → runtime; editor → diff → versioned commit. Fake provider có delays/reordering/errors, không dùng secret thật trong tests.

### Browser/manual

Kiểm chứng click/keyboard/touch, render pose, transcript/status, diff/focus, console/network failures. Headless SwiftShader là bằng chứng chức năng, **không phải benchmark FPS phần cứng**. Record video ở 1× để đánh giá tính dứt khoát, không suy ra motion quality từ một screenshot.

### DoD mỗi ticket

- [ ] AC của ticket đạt; assumptions/product decisions đã duyệt.
- [ ] Có test fail trước fix cho bug hoặc test expected behavior cho feature.
- [ ] Unit/integration mới pass; regression liên quan pass; không skip để xanh.
- [ ] Gameplay invariants không bị phá; không simulation authority ở UI/LLM/animation.
- [ ] Error/cancel/reset/stale paths kiểm tra khi liên quan.
- [ ] Browser evidence nếu user-visible; giới hạn chưa verify được ghi rõ.
- [ ] Docs/contracts/release notes cập nhật; không thay unrelated user work.
- [ ] Build và diff checks pass; review correctness/security/performance.

### DoD một milestone

- [ ] Tất cả ticket blocking của gate Done; không chỉ tính tổng phần trăm task.
- [ ] Acceptance journey của gate chạy trên bản production.
- [ ] Các gate trước không regress; offline autonomy vẫn đạt.
- [ ] Người dùng playtest/duyệt cảm giác combat hoặc coach loop; ghi issue cho tuning còn lại.

### DoD release

Tất cả invariants trong GAMEPLAY.md được trace tới implementation/test; không còn critical/high bugs. Device/browser matrix và performance budget do đội chọn trước khi đo. Network/voice/model fail gracefully. Đã kiểm tra production deploy, replay compatibility, rollback và limitations. Không gọi showcase hoặc build xanh là “game hoàn chỉnh”.

## 9. Lệnh kiểm tra hiện có (đã tồn tại trong package.json)

```bash
pnpm validate:robots
pnpm validate:phase4
pnpm build
# Terminal 1: start server, sau đó terminal 2 chạy browser suite
pnpm dev --port 5188
pnpm test:browser
git diff --check
```

Dùng `SHOWCASE_URL` nếu server chạy port khác. `test:browser` hiện kiểm tra showcase/animation, **chưa kiểm tra combat, AI, voice hay tactics**. Chưa có `pnpm test`, `pnpm lint`, `pnpm typecheck`; không ghi nhận chúng pass hoặc giả định đã tồn tại.

## 10. Risks / mitigation / deferred scope

| Risk | Hậu quả | Cách xử lý |
|---|---|---|
| Animation đẹp nhưng contact sai | Người chơi không đọc được combat | M1 một jab/block thật trước; sim phase/contact authority; tune tại camera gameplay |
| Tăng action count quá sớm | Không balance/debug được | Enable từng vertical slice, không dùng 200 clips làm definition of done gameplay |
| Tactic conflict/loops | Robot stall hoặc spam | Bounded DSL, priority/abort/timeout, rejection feedback, deterministic fixtures |
| “AI sửa giúp” bad read | Phá skill loop | Tách structural validity khỏi player hypothesis correctness |
| Consume Time-out khi commit | Pause/inspect miễn phí vô hạn | Chốt D-02 và test exploit; không tự quyết bằng implementation |
| Latency/stale result | Intent mới bị ghi đè | Request/version/mode guards; cancellation; local fast path |
| Chỉ đo headless FPS | Tối ưu sai hướng | Đo hardware thật trước performance claim |
| Scope cloud/progression mở rộng | Trễ core loop | Local-first; account/multiplayer/currency/campaign là scope riêng |

Song song an toàn: domain fixture + UI mock theo contract; capability data + animation review sau move schema. Không làm song song tùy tiện resolver/timing/animation adapter nếu chưa thống nhất phase clock. Ưu tiên M0 → M1 → M2 trước mọi tích hợp provider trả phí.
