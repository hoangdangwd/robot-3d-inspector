# Robot patterns — đợt 1: Volt Kestrel / one-two

## Trạng thái và phạm vi

**Đã triển khai:** một thói quen base AI cho Volt Kestrel: **jab trái → cross phải**. Forge, Aegis, Vanta và Solstice chưa có pattern đặc trưng trong đợt này; vẫn dùng utility AI/playbook hiện có. Không thêm đòn mới hoặc thay matrix.

- Definition: `src/ai/RobotPatterns.js` (`volt_one_two`).
- Sequence: dùng schema và `TacticRuntime` hiện có; coordinator `RobotPatternRuntime` theo dõi hành động thực sự bắt đầu/kết thúc, xác nhận execution trước khi xin bước kế tiếp.
- Contract đòn/defense: [ATTACK_DEFENSE_MATRIX.md](ATTACK_DEFENSE_MATRIX.md).
- Rig/clip: [ANIMATION_LIBRARY.md](ANIMATION_LIBRARY.md).
- Product: [GAMEPLAY.md](GAMEPLAY.md).

## 1. Luật hành vi

### Bắt đầu

Volt đang ready, không có action đang chạy, không ở sát mép sân, nhìn đúng đối thủ, đối thủ không down/getting-up/KO và không đang startup/active attack. Khoảng cách phải nằm trong reach của cả jab và cross sau capability. Stamina ít nhất 35% và đủ chi phí của cả hai đòn.

Khi đủ điều kiện: roll seeded **65%** để chọn pattern. Nếu không chọn, base utility AI tiếp tục đánh; tối thiểu **36 tick** mới thử roll lại. Đây không phải xác suất cho mỗi frame và không ép mọi jab phải có cross.

### Tiến trình

1. Xin jab qua intent bình thường.
2. Chờ `action_started`, rồi **toàn bộ startup + active + recovery**, rồi `action_ended`.
3. Kiểm tra lại tầm, hướng, stamina, vị trí mép sân và khả năng hành động.
4. Xin cross nếu vẫn hợp lệ. Không cancel recovery jab, không tăng damage vì đang trong pattern.
5. Chờ cross kết thúc; nhường **18 tick** nghỉ chọn đòn mới, movement vẫn do base AI. Có playbook/Direct Command thì ưu tiên của chúng vẫn cao hơn khoảng nghỉ này.
6. Pattern không được bắt đầu lại trong **150 tick** sau khi kết thúc/hủy. Trong cooldown, base AI vẫn hoạt động.

### Hủy

- Fighter down/staggered/getting-up/KO hoặc target không còn đánh được.
- Hết tổng budget **120 tick**.
- Parry thành công vào đòn của Volt.
- Hành động bị simulation từ chối; request chưa bắt đầu sau 12 tick; action khác được thực thi xen vào.
- Trước follow-up: mất tầm, quay sai hướng, không đủ stamina, gần mép sân.
- Player tactic nhận quyền quyết định; Direct Command được lease; Blackboard yêu cầu tránh jab/cross, giữ xa hoặc giảm aggression dưới 0.

Hủy pattern chỉ bỏ **kế hoạch nối đòn**, không cắt ngang animation/recovery đang được simulation thực thi. Sau hủy quay về base AI, không im lặng thay cross bằng một đòn "đúng đáp án".

### Ranh giới với coaching

Pattern là thói quen personality có sẵn, **không phải entry tự ghi vào playbook**. Không tiêu tactical capacity của playbook, không tự sửa tactics đã lưu và không thêm Live-Fight programming. Tactic do người chơi viết vẫn qua adherence model; pattern dùng roll chọn thói quen riêng, không áp adherence một lần nữa cho từng bước.

Thứ tự: Direct Command theo queue hiện có → tactic của người chơi → pattern Volt → base utility. Blackboard vẫn có thể ngăn/hủy thói quen tạm thời. Đây là scope một pattern, chưa phải hệ thống robot tự học/counter-adapt.

## 2. Mở cảnh cho animator — không cần console

Chạy `npm run dev`, mở:

**http://127.0.0.1:5173/?qa&pattern=volt**

- A = Volt Kestrel; B = Aegis Prime.
- Fixture cố định khoảng cách ban đầu **1.70 m**, đối diện nhau, seed chọn pattern = 1.
- Pattern dùng chính `CombatBrain` và simulation thật. B chỉ thực hiện response scripted phục vụ review; không giả damage hoặc đặt kết quả contact.
- Fixture chỉ cho **một lần thử**; sau finish/abort không cho utility AI chen đòn mới làm rối storyboard. Vì thế không dùng cảnh này đánh giá độ vui/cân bằng trận đấu.
- Không lưu playbook/history và không gọi model. Nút Exit tải lại app thường.

### Điều khiển

| Control | Công dụng |
|---|---|
| Response | Chọn một trong 5 tình huống bên dưới; reset staging |
| Reset | Quay về tick 0 với cùng response/seed |
| Play / Pause | Phát/dừng cả tiến trình review |
| +1 tick | Một simulation tick (1/60 giây) |
| +6 ticks | Nhảy 0.1 giây simulation, vẫn chạy từng tick |
| Speed 0.25× / 1× | Chậm để kiểm tra hoặc tốc độ bình thường |
| Chuột orbit/zoom | Dùng camera controls hiện có để xem trước/bên/góc gameplay |

Cảnh dừng ở tick 120. **Không tự lặp**; bấm Reset/Play để lặp chính xác. Panel ghi action/phase, tick, HP, khoảng cách, started/finished/aborted và contact outcome. Panel là ground truth của simulation.

Muốn xem Volt trong **trận autonomous thực**, thay vì fixture:

**http://127.0.0.1:5173/?qa&opponent=volt**

Đây là Forge vs Volt với coaching/Time-out bình thường. Playbook đã lưu có thể ảnh hưởng hành vi; pattern không được ghi đè nó. Match mặc định không có query vẫn giữ Forge vs Aegis. Chưa thêm màn chọn matchup tổng quát.

## 3. Storyboard — nhìn gì ở mỗi nhịp?

**Trái/phải theo giải phẫu, không phải bên màn hình.** Volt dùng tay trái jab, tay phải cross; B dùng tay trái để parry cross của Volt.

Baseline seed 1 / không phòng thủ, timing sau capability của Volt:

| Tick | Sự kiện simulation | Animator cần thấy |
|---|---|---|
| 0 | Ready, cách 1.70m | Hai fighter đối diện; tay ở guard, chân ổn định |
| 1–7 | Jab startup | Vai/tay trái chuẩn bị jab; tay phải giữ guard, không tung cross sớm |
| 8 | Jab contact | Tay trái đi straight đến head corridor của B |
| 8–11 | Jab active | Extension/follow-through ngắn, không tạo hit thứ hai |
| 12–20 | Jab recovery | Tay trái thu về, trọng tâm chuẩn bị chuyển cho tay phải |
| 21 | Jab ended | Không còn jab active; không giữ tay trái xuyên qua đầu B |
| 22–30 | Cross startup | Vai/hông phải nạp, tay trái trở lại bảo vệ |
| 31 | Cross contact | Tay phải đi straight đến head corridor; không biến thành hook |
| 31–34 | Cross active | Follow-through của cross, contact chỉ resolve một lần |
| 35–46 | Cross recovery | Tay phải thu về, cân bằng lại stance |
| 47 | Cross ended | Về ready |
| 48 | Pattern finished được brain quan sát | Kết thúc kế hoạch; fixture không phát thêm utility attack |

Đây là timing của **fixture cụ thể**, không hardcode vào animator hoặc mọi matchup. Trong trận thật, thời điểm bắt đầu, decision slot, exhaustion, parry stun và capability có thể thay đổi nhịp.

## 4. Năm cặp review bắt buộc

| Response | Sự kiện / kết quả mong đợi | Kiểm tra bằng mắt |
|---|---|---|
| `none` | Jab hit tick 8; cross hit tick 31 | Đọc được trái → phải và khoảng thu tay giữa hai đòn |
| `parry_left` | B bắt đầu parry tick 28, active đúng tick 31; cross **parried**, pattern abort quan sát tick 32 | Tay trái B gạt đường cross phải; không diễn hoạt như B bị clean hit bởi cross |
| `parry_right` | Cùng timing nhưng cross **hit** | Tay phải B không được dựng một pose nhìn như đã chặn hoàn hảo cross rồi vẫn mất HP |
| `too_early` | Parry trái bắt đầu tick 13, effective window hết trước cross; cross **hit** | B đã thu tay/qua cửa sổ parry khi cross đến; minh họa đúng tay nhưng sai nhịp |
| `out_of_range` | B lùi bằng movement thật từ jab recovery; trước follow-up đã vượt reach; pattern abort tick 22, **không có cross của pattern** | Khoảng trống tăng; Volt không kéo dài tay hoặc teleport để ép nối đòn |

Ở các case parry, jab đầu vẫn trúng. So sánh health loss: correct parry giảm mất HP do cross; sai tay/quá sớm không được tự sửa. Đây chưa phải đảm bảo phản công hoặc thắng trận, và chưa phải thử nghiệm người chơi dùng Time-out để tạo counter.

## 5. Giới hạn hình ảnh hiện tại — cần animator đánh dấu fail nếu thấy

**Clip hiện chưa phase-sync/phase-warp theo clock simulation.** `FightMode` vẫn chọn/play semantic clip theo phase; thư viện procedural chưa được re-author cho one-two. Cảnh review giúp phát hiện sai lệch, không che nó bằng một demo khác luật.

Vì vậy:

- Tick 31 là contact authoritative nhưng nắm đấm có thể chưa ở pose contact đúng frame.
- Clip có thể restart khi đổi phase; đây là lỗi tích hợp cần xử lý, không được sửa bảng combat để hợp thức hóa.
- Hit reaction/crossfade có thể che silhouette phòng thủ hoặc recoil.
- Chưa có IK hoặc contact mesh matching. Reach simulation là khoảng cách tâm, không suy ra chính xác khoảng cách mesh nắm đấm–đầu.

**Không ký duyệt animation chỉ vì test PASS.** Browser smoke xác nhận panel/control/events và lưu screenshot; chưa có human visual sign-off. Bước tiếp theo: phase-sync và paired pose/contact review.

### Phiếu kiểm tra animator

Với từng case, review ở 1×, 0.25× và từng tick; góc gameplay, phía trước, bên hông:

- [ ] Đúng tay, đúng target head, straight không thành hook.
- [ ] Jab đọc được trước cross, không hai tay đánh đồng thời vô cớ.
- [ ] Tay không đánh giữ guard; vai/hông chuyển lực, chân không trượt.
- [ ] Pose contact khớp tick 8/31; nếu lệch ghi tick và pose thực tế.
- [ ] Parry đúng/sai tay khác nhau rõ ràng, không chỉ khác text/HP.
- [ ] Parry sớm nhìn đã hết hiệu lực trước cross.
- [ ] Ra ngoài tầm không có nối đòn giả hoặc root teleport.
- [ ] Recovery về ready liền mạch; không restart load ở mỗi phase.
- [ ] Ghi lỗi theo mẫu: `case / góc camera / tick / expected / observed / screenshot`.

## 6. QA và regression

- `npm run validate:robot-patterns`: sequence hoàn tất recovery, deterministic, cooldown, fallback, reset, tactic precedence; correct/wrong/early parry và hủy do range/stamina/facing/down/override/command.
- `npm run test:browser:patterns`: cần server chạy, dùng Edge qua Playwright; kiểm tra năm scenario, pause/step/play/reset, không ghi localStorage, không page error. `SHOWCASE_URL` đổi URL server.
- Screenshot: `artifacts/qa/patterns/*.png` (automated captures, không phải approved visual baselines).
- Pattern thay đổi **AI input selection**, không thay contact rules/replay simulation; replay vẫn v2, dùng recorded inputs, không chạy lại brain.
