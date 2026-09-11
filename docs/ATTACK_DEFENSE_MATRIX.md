# Attack–Defense Matrix v2 — combat và animation

Tài liệu làm việc chung cho gameplay programmer, animator và QA. Đây là **luật boxing cách điệu của game**, không phải mô phỏng mọi tình huống boxing ngoài đời.

- Product intent: [GAMEPLAY.md](GAMEPLAY.md).
- Contract thực thi: `src/combat/AttackDefenseMatrix.js`.
- Timing/cost/damage: `src/combat/CombatRules.js`; tra bản đã áp dụng capability bằng `applyCapability()` trong `ActionRegistry.js`.
- Rig/clip contract: [ANIMATION_LIBRARY.md](ANIMATION_LIBRARY.md).
- Kiểm tra: `npm run validate:attack-defense`.

## 1. Quy ước bắt buộc trước khi animate

1. Tất cả fighter hiện dùng **left lead / tay trái trước**. Không có stance switch/southpaw trong v2.
2. `left` / `right` luôn là **bên giải phẫu của robot đang thực hiện action**, không phải trái/phải màn hình. Camera quay không đổi tên action.
3. Facing chuẩn của model là local **+Z**, lên là **+Y**. Theo rig hiện tại, bên trái giải phẫu là **+X**, bên phải là **−X**. Không dùng quy ước của camera/DCC để đoán bên; kiểm tra pivot `LeftHand` / `RightHand` khi import.
4. Khi hai fighter đối diện: tay trái attacker ở phía tay phải defender. Vì vậy jab trái bị chặn bởi **parry_right** (tay phải defender), cross phải bởi **parry_left**.
5. `slip_left/right` mô tả hướng đầu/thân trên nghiêng của defender, **không** mô tả tay attacker. Cả hai slip có thể né straight giữa mặt. Không ép một bên slip thất bại chỉ để tạo tương phản giả; chúng để lại vị trí hồi phục khác nhau về animation, chưa có bonus counter theo bên trong simulation.
6. Matrix giả định đã ở trong reach và đúng hướng, với defense đúng phase. Không có action nào được cấp bất tử toàn thân chỉ vì đang chơi clip né.

## 2. Ma trận kết quả

| Attack ID | guard_high | guard_low | parry_left | parry_right | slip_left | slip_right | duck | roll |
|---|---|---|---|---|---|---|---|---|
| jab | B | H | H | P | E | E | E | H |
| cross | B | H | P | H | E | E | E | H |
| hook_left | B | H | H | H | H | H | E | E |
| hook_right | B | H | H | H | H | H | E | E |
| uppercut_left | B | H | H | H | E | E | H | H |
| uppercut_right | B | H | H | H | E | E | H | H |
| body_jab | H | B | H | H | H | H | H | H |
| body_cross | H | B | H | H | H | H | H | H |
| overhand | B | H | H | H | E | H | H | H |
| feint_jab | N | N | N | N | N | N | N | N |

### Legend và kết quả simulation

- **H — Hit:** defense không che được đường đòn; clean damage + posture damage theo action/capability. Không tự thêm critical damage khi chọn sai defense.
- **B — Block:** đúng vùng guard; nhận chip damage và mất stamina. Giữ guard còn tiêu stamina theo thời gian. Guard break khi stamina bị đòn chặn làm cạn. Guard không phải miễn damage.
- **P — Parry:** không mất health/posture vì contact này; attacker chịu `PARRY_STUN_TICKS` (hiện 12 tick). Defender vẫn trả chi phí của action. Không tự nối counter hay gây counter damage.
- **E — Evade:** contact phát `result: missed`, `reason: dodged`; không mất health/posture vì contact này. Chi phí action vẫn áp dụng, không teleport.
- **N — No contact:** feint không có active hit window, không sinh hit/block/parry và không stun đối phương. Nó vẫn có startup/recovery và stamina cost.

**Các đánh đổi có chủ đích:**
- High guard bao phủ head nhưng mở body; low guard làm ngược lại. Sai vùng = H, không phải chip nhẹ.
- Parry hiện là **high straight hand-check**, không phải universal deflect. Tay không đúng, hook, uppercut, overhand và body shot đều xuyên qua lựa chọn parry này.
- Slip là chuyển đầu ra khỏi đường straight/rising hẹp; hook quét ngang vẫn chạm. Overhand phải đi chéo xuống phía trái defender: slip trái ra ngoài đường đòn, slip phải đi vào vùng kết thúc của nó.
- Duck là hạ đầu xuống và ở thấp qua contact: tránh straight/head hook, nhưng uppercut đi lên và overhand đi xuống vẫn đe dọa; không che torso trước body shot.
- Roll là weave **chuyên đi dưới hook ngang**, không phải duck giữ thấp. V2 không cấp tránh straight vì đầu đi ngang qua centerline trong chuyển động; nếu cần một biến thể roll-low né straight, phải tạo contract mới và sửa matrix/test trước.
- Đòn body không có stationary dodge/parry trong tập hiện tại. Dùng low guard hoặc di chuyển ra ngoài reach. Không mặc định thêm low parry/backstep invulnerability.

## 3. Gates trước matrix — animation không được bypass

Thứ tự trong `CombatSimulation._resolveContacts()`:

1. Attack đã đăng ký, có active window > 0 và đang ACTIVE.
2. Contact chưa resolve cho action/target này (mỗi action chỉ resolve một lần).
3. Khoảng cách tâm fighter ≤ reach sau capability; attacker quay về target trong ±60°.
4. Defense đang ACTING + ACTIVE và defender quay về attacker trong ±60°.
5. Tra ô attack × defense; defense không hợp lệ hoặc không nhận diện = H.
6. Simulation áp damage/resources/stun, phát event; renderer chỉ trình bày kết quả.

Startup/recovery không có quyền block/parry/evade. Đúng clip nhưng sai timing vẫn trúng. Ra ngoài reach hoặc attacker quay sai hướng luôn MISS trước khi xét defense. Không có roll/slip invulnerability từ phía sau.

Contact hiện được chốt tại lần resolve đầu trong active window, kể cả miss; không sweep thử lại ở các frame sau. Đó là contract của simulation hiện tại, không phải quyền damage ở mọi frame active.

`contact_resolved` sau gates có thêm `defenseId`, `defenseOutcome` (`hit/block/parry/evade`). Range/facing miss giữ reason riêng. Các field này hỗ trợ QA/debug; chưa có bảng phân tích trận trong HUD.

## 4. Brief cho từng attack clip

Tất cả clip: load → extension/contact → follow-through → recoil → ready. Giữ tay không đánh ở guard, thể hiện chuyển lực chân–hông–vai, không animate root tiến vào đối thủ để bù reach.

| ID | Tay | Đích | Quỹ đạo bắt buộc | Pose tại contact / lưu ý |
|---|---|---|---|---|
| jab | Trái | Head | Straight | Tay trước duỗi dọc line đến mặt; vai che cằm; thu nhanh |
| cross | Phải | Head | Straight | Vai/hông sau xoay, tay phải đến mặt; tay trái giữ guard |
| hook_left | Trái | Head | Horizontal arc | Khuỷu gập, nắm đấm quét ngang thái dương/jaw, không biến thành straight |
| hook_right | Phải | Head | Horizontal arc | Mirror theo giải phẫu của left hook, không mirror camera |
| uppercut_left | Trái | Head | Rising | Load thấp, tay đi lên dưới cằm; không tự đổi target thành body |
| uppercut_right | Phải | Head | Rising | Cùng corridor rising, bên phải; không có đòn vòng ngang |
| body_jab | Trái | Body | Straight | Hạ trọng tâm vừa đủ; đích torso/core, không đầu |
| body_cross | Phải | Body | Straight | Xoay vai sau và đấm torso; không animate thành uppercut |
| overhand | Phải | Head | Descending diagonal | Tay phải nạp cao rồi vòng xuống phía trái defender; silhouette phân biệt hook ngang |
| feint_jab | Trái | Không contact | Feint | Gợi startup jab rồi rút trước vùng tiếp xúc; không impact flash/sound hit |

Không yêu cầu mọi robot có cùng biên độ: silhouette/khối lượng/nhịp load có thể khác, nhưng **tay, đích, quỹ đạo và coverage phải giữ nguyên**.

## 5. Brief cho từng defense clip

| ID | Chuyển động phải thấy | Pose trong effective window | Recovery / sai lầm cần tránh |
|---|---|---|---|
| guard_high | Hai cẳng tay dựng che mặt/cằm | Vùng head được che, torso còn lộ | Không kéo tay xuống body nhưng vẫn khai báo high guard |
| guard_low | Hạ khuỷu/cẳng tay che core | Torso được che, head còn lộ | Không che cả mặt lẫn bụng như một khiên toàn thân |
| parry_left | Tay trái defender hand-check cross phải | Chạm/đẩy straight ra ngoài bằng tay trái; tay phải giữ guard | Ngắn, trả về guard; không phải ôm/chụp hook |
| parry_right | Tay phải defender hand-check jab trái | Chạm/đẩy bằng tay phải | Không đổi tay do góc camera |
| slip_left | Đầu + vai lệch trái (+X local), gối/hông bù trọng tâm | Head ra khỏi centerline; torso vẫn trong vùng body shot | Chuyển thân trên, không root strafe; quay về ready |
| slip_right | Đầu + vai lệch phải (−X local) | Tương tự bên phải | Không dùng cùng pose trái chỉ đổi tên |
| duck | Gập gối/hông để hạ head | Head nằm dưới đường straight/hook, cằm không chìa lên | Không chỉ gập cổ; không lùi root giả |
| roll | U-shaped weave dưới đường hook | Thể hiện đường xuống–ngang–lên, không biến thành duck hold | Chỉ bảo vệ hook theo v2; review paired contact để tránh hình nhìn né được nhưng sim vẫn hit |

Attack và defense nên được review **theo cặp**, không chỉ preview đơn lẻ. Với ô H, không diễn hoạt như một đòn né/chặn hoàn hảo rồi vẫn trừ HP.

## 6. Timing sheet — base ticks @ 60 Hz

Timing base lấy từ `CombatRules.js`. `hold` = ACTIVE đến lúc nhả guard/cạn stamina. Clip duration preview không phải duration authoritative.

| Action | Startup | Active | Recovery | Stamina |
|---|---:|---:|---:|---:|
| jab | 8 | 4 | 10 | 8 |
| cross | 10 | 4 | 14 | 12 |
| hook_left | 12 | 5 | 16 | 14 |
| hook_right | 12 | 5 | 16 | 14 |
| uppercut_left | 14 | 4 | 18 | 16 |
| uppercut_right | 14 | 4 | 18 | 16 |
| body_jab | 9 | 4 | 11 | 10 |
| body_cross | 12 | 4 | 15 | 14 |
| overhand | 16 | 5 | 22 | 20 |
| feint_jab | 6 | 0 | 8 | 4 |
| guard_high | 3 | hold | 6 | 0; drain 12/s |
| guard_low | 4 | hold | 7 | 0; drain 14/s |
| parry_left | 3 | 6 | 8 | 6 |
| parry_right | 3 | 6 | 8 | 6 |
| slip_left | 4 | 8 | 10 | 5 |
| slip_right | 4 | 8 | 10 | 5 |
| duck | 5 | 10 | 12 | 6 |
| roll | 6 | 12 | 16 | 8 |

- Đổi sang giây: ticks / 60. Ví dụ jab base: 0.133s startup + 0.067s active + 0.167s recovery.
- Robot capability đổi startup/recovery/cost; exhaustion có thể kéo dài startup. Animator không hardcode thời lượng này trong luật damage.
- Bàn giao tối thiểu: semantic ID, rig version, ready pose, startup-end pose, contact/effective-window pose, active-end pose, recovery-end pose, planted-foot notes, paired preview.
- `impacts` của clip là marker trình bày. Không dùng nó để gọi damage hoặc tính parry.

### Giới hạn tích hợp hiện tại — không coi là đã xong animation

`FightMode._syncFighterAnim()` hiện chọn/play clip theo phase, **chưa phase-warp clip theo clock simulation**. Thư viện procedural cũ cũng chưa được re-author/duyệt hết theo ma trận v2. Vì vậy matrix PASS không chứng minh nắm đấm, đầu né và thời điểm contact đã khớp hình.

Bước tiếp theo cho animation integration: đồng bộ playback theo phase simulation, sau đó review từng cặp dưới đây. Chưa thêm IK, hitbox mesh, root motion hoặc animation mới trong thay đổi matrix này.

## 7. Checklist bàn giao và QA

### Programmer
- [ ] ID tồn tại trong registry, profile, matrix; không fallback khi thêm attack mới.
- [ ] Mọi ô có expected outcome; thay đổi code + bảng + test cùng lúc.
- [ ] Range/facing/phase vẫn là gates; direct command/tactic không override matrix.
- [ ] Resource/stun/contact-dedup test pass; autonomous fight và replay mới pass.

### Animator / reviewer
- [ ] Left/right đúng giải phẫu; đúng head/body và quỹ đạo.
- [ ] Startup đọc được ở camera fight; pose contact khớp effective window sau tích hợp phase sync.
- [ ] H/B/P/E đọc được bằng hình, không cần nhìn HP để đoán.
- [ ] Chân trụ không trượt, armor không xuyên nghiêm trọng, không root teleport.
- [ ] Preview 1× và frame-step, góc trước + bên + camera gameplay, trên robot nhẹ/nặng.
- [ ] Cặp bắt buộc: jab/parry_right (P), jab/parry_left (H), cross/parry_left (P), hook/slip (H), hook/roll (E), uppercut/duck (H), uppercut/slip (E), body_jab/duck (H), body_jab/guard_low (B), body_jab/guard_high (H), overhand/slip_left (E), overhand/slip_right (H), feint/parry (N).
- [ ] Thử đúng defense nhưng sớm/muộn/quay lưng: không được thể hiện như một phòng thủ thành công.

## 8. Compatibility và scope

- Replay log nâng lên **v2** vì luật contact đã đổi. Replay v1 bị báo incompatible, không tự migrate hoặc phát bằng luật mới rồi giả vờ deterministic. Không chủ động xóa dữ liệu cũ.
- Playbook IDs/schema không đổi; tactic cũ có thể kém hiệu quả nếu trước đây dựa vào universal dodge/parry. Người chơi sửa trong Time-out; không âm thầm rewrite playbook.
- AI base giảm ưu tiên defense không cover attack đã nhận biết, nhưng không được miễn timing/legality, không tự sửa tactic/Direct Command sai.
- Chưa có damage bonus từ duck sai, counter guarantee, limb damage, stance switching, kick/clinch hay combo mới.
