# Robot Foundry — Gameplay Source of Truth

> **Trạng thái:** Tài liệu gameplay chuẩn của repository.
>
> Khi tài liệu này xung đột với `docs/req.md` hoặc `docs/architecture.md`, gameplay trong file này được ưu tiên. `docs/req.md` lưu bối cảnh và định hướng từ mentor; `docs/architecture.md` mô tả cách hiện thực hóa kỹ thuật; `docs/IMPLEMENTATION_PLAN.md` mô tả thứ tự triển khai.

---

## 1. Tầm nhìn sản phẩm

Robot Foundry là game robot chiến đấu 3D trên trình duyệt, trong đó người chơi đóng vai trò **huấn luyện viên chiến thuật**, không phải người điều khiển từng khớp hoặc từng frame animation.

Robot phải có khả năng:

- tự quan sát tình hình;
- tự di chuyển và giữ khoảng cách;
- tự chọn đòn đánh, phòng thủ hoặc né tránh;
- tuân thủ luật combat cục bộ;
- tiếp tục chiến đấu khi người chơi im lặng, microphone không khả dụng hoặc dịch vụ AI mất kết nối.

Giọng nói giúp người chơi can thiệp vào ý định và chiến thuật của robot. Nó không thay thế simulation, combat legality hoặc local AI.

Sản phẩm sử dụng robot, tên gọi, hình ảnh, animation, UI, âm thanh và lore nguyên bản. Không sao chép nhân vật hoặc tài sản được bảo hộ từ các tác phẩm robot-boxing khác.

---

## 2. Hai trải nghiệm chính

### 2.1. Robot Boxing 1v1 — trải nghiệm chiến đấu cốt lõi

Hai robot tự động thi đấu trong võ đài. Người chơi huấn luyện robot của mình bằng:

- lệnh trực tiếp ngắn hạn trong Live Fight;
- chỉ đạo chiến thuật tạm thời qua Blackboard Override;
- chỉnh sửa playbook trong Time-out;
- quan sát điểm mạnh, điểm yếu và mức độ tuân thủ của từng robot.

Trải nghiệm cần tạo được nhịp đọc tình huống rõ ràng:

```text
quan sát → dự đoán → chỉ đạo → robot tự thực hiện → đánh giá kết quả → điều chỉnh
```

### 2.2. Zombie Survival Sandbox — vertical slice ưu tiên để kiểm chứng

Sandbox là môi trường 360 độ tối giản dùng để chứng minh nhanh và trực quan luồng:

```text
voice/text → validated domain intent → local robot controller → hành động 3D
```

Sandbox gồm:

- một robot người chơi;
- mặt phẳng di chuyển X-Z;
- mục tiêu hoặc zombie đơn giản;
- lệnh hướng theo đồng hồ, la bàn hoặc hướng tương đối;
- tự động nhắm/bắn mục tiêu gần;
- vũ khí beam theo hướng chỉ định;
- phản hồi HUD đủ rõ để đo độ chính xác và độ trễ cảm nhận.

Sandbox không thay thế Robot Boxing. Nó là vertical slice ưu tiên để kiểm chứng voice-to-action và có thể trở thành một mode độc lập nếu trải nghiệm đủ tốt.

---

## 3. Triết lý điều khiển: AI hai tầng

### 3.1. Tầng chiến lược vĩ mô

Tầng chiến lược được kích hoạt khi có input người chơi hoặc trong Time-out. Nó sử dụng Jev (semantic label classification qua OpenRouter Decisions API) để chuyển ngôn ngữ tự nhiên thành dữ liệu miền bị giới hạn. Tất cả voice/text đi qua Jev; không có local parser fallback.

Đầu ra hợp lệ gồm:

- `DirectCommand`: yêu cầu thực hiện một hành động ngắn hạn;
- `BlackboardOverride`: thay đổi ưu tiên làm việc hiện tại trong thời gian ngắn;
- `TacticProposal`: đề xuất chỉnh sửa playbook, chỉ được tạo và duyệt trong Time-out;
- lệnh nhiệm vụ Sandbox như move, stop, aim, fire, attack-move hoặc patrol.

Tầng này không được trực tiếp:

- gây damage;
- xác nhận hit/miss;
- thay đổi health, stamina hoặc posture;
- đặt transform authoritative;
- ép animation chạy như một kết quả combat;
- bỏ qua startup, active, recovery hoặc cooldown;
- sinh và thực thi JavaScript tùy ý.

### 3.2. Tầng phản xạ cục bộ

Tầng phản xạ chạy hoàn toàn cục bộ và liên tục. Nó sử dụng:

- trạng thái simulation;
- personality/capability của robot;
- playbook đã commit;
- Blackboard hiện tại;
- Direct Command còn hiệu lực;
- mission/order hiện tại trong Sandbox.

Tầng phản xạ tạo ra ý định hành động. Simulation vẫn là nơi quyết định ý định đó có hợp lệ và có được thực hiện hay không.

Robot không được chờ một network request hoặc LLM response để tiếp tục chiến đấu.

---

## 4. Live Fight và Time-out là hai bề mặt lệnh khác nhau

### 4.1. Live Fight

Trong Live Fight, người chơi được phép đưa ra hai loại ảnh hưởng:

#### Direct Command

Ví dụ:

- “móc phải”;
- “né trái”;
- “đỡ cao”;
- “jab”.

Direct Command là **yêu cầu ưu tiên cao**, không phải animation trigger. Robot có thể:

- thực hiện nếu hợp lệ;
- trì hoãn ngắn khi đang bận hoặc ngoài tầm;
- từ chối nếu không đủ stamina, không có capability hoặc trạng thái không cho phép;
- để lệnh hết hạn nếu cơ hội thực thi không xuất hiện.

#### Blackboard Override

Ví dụ:

- giữ khoảng cách;
- áp sát;
- đánh vào thân;
- bình tĩnh;
- tăng áp lực;
- tránh dùng jab.

Override chỉ thay đổi working state hiện tại và phải có thời hạn. Nó không được âm thầm ghi lại thành playbook vĩnh viễn.

### 4.2. Time-out

Mỗi trận có tối đa **3 Time-out**. Một lượt được tiêu thụ khi Time-out mở và không được hoàn lại khi hủy.

Trong Time-out:

1. simulation tạm dừng;
2. người chơi xem playbook hiện tại;
3. người chơi chỉnh sửa thủ công hoặc yêu cầu AI đề xuất patch;
4. patch được validate;
5. UI hiển thị preview/diff;
6. người chơi xác nhận commit;
7. playbook nhận revision mới;
8. simulation tiếp tục với playbook đã commit.

AI chỉ được tạo proposal. AI không được tự commit.

---

## 5. Quy tắc combat cốt lõi

### 5.1. Simulation authority

Combat simulation là nguồn sự thật duy nhất cho:

- vị trí combat;
- facing và arena constraints;
- startup, active và recovery;
- hit, miss, block, parry và evade;
- health, stamina và posture;
- stagger, guard break, knockdown và KO;
- round timer và kết quả trận.

Rendering, UI, voice và animation không được sở hữu các quy tắc này.

### 5.2. Vòng đời đòn đánh

Mỗi đòn có ba giai đoạn:

- `STARTUP`: chuẩn bị, chưa gây contact;
- `ACTIVE`: cửa sổ có thể gây contact;
- `RECOVERY`: robot đang thu hồi động tác và chưa thể hành động tự do.

Animation phải trình bày đúng trạng thái simulation. Animation blending không được dùng để hủy action bất hợp pháp.

### 5.3. Whiff và Punish

Một đòn tấn công bị hụt khi contact không thành công do ngoài tầm, sai hướng hoặc bị né. Đòn hụt vẫn đi qua recovery theo định nghĩa action.

Một tình huống punish hợp lệ xảy ra khi đối thủ thực hiện đòn hợp lệ trong cửa sổ recovery có thể khai thác sau whiff.

Gameplay cần cho người chơi và local AI nhận biết rõ:

- ai vừa whiff;
- nguyên nhân whiff;
- còn bao nhiêu thời gian recovery;
- tình huống phản công có được tính là punish hay không.

Whiff/punish phải là dữ liệu domain và event có thể test, không chỉ là hiệu ứng hình ảnh.

### 5.4. Guard, chip damage và posture

Block hợp lệ giảm phần lớn sát thương nhưng có thể gây:

- chip damage nhỏ;
- stamina drain;
- posture pressure.

Guard break hoặc posture break phải tạo cửa sổ dễ đọc và không được bypass simulation.

---

## 6. Robot identity, capability và sự tuân thủ không hoàn hảo

Mỗi robot có:

- capability vật lý khác nhau;
- behavior profile khác nhau;
- ưu tiên khoảng cách khác nhau;
- attack/defense weights khác nhau;
- tactical capacity khác nhau;
- mức adherence khác nhau.

Ví dụ archetype:

- robot hạng nặng: damage và guard cao, di chuyển chậm, commitment lớn;
- robot cơ động: startup/recovery nhanh, né và strafe tốt, guard yếu hơn;
- counter fighter: phản đòn và phòng thủ tốt nhưng ít chủ động gây áp lực;
- range fighter: tầm đánh dài nhưng yếu khi bị ép sát.

Robot không phải con rối tuyệt đối. Một tactic có thể không được tuân thủ hoàn hảo do:

- stamina thấp;
- đang stagger hoặc knockdown;
- vị trí sát mép;
- tactic quá phức tạp so với tactical capacity;
- nhiều tactic đang tranh chấp;
- action không hợp lệ trong tình huống hiện tại.

Sự không tuân thủ phải có lý do inspectable và không được biến thành hành vi ngẫu nhiên không thể giải thích.

---

## 7. Tactical playbook

Playbook là dữ liệu game bị giới hạn, có thể serialize, validate, version và replay.

Một tactic có thể mô tả:

- trigger;
- goal;
- phase;
- bounded sequence;
- branch;
- abort condition;
- repeat limit;
- timeout;
- priority;
- strategy intent như counter, move, wait hoặc set priority.

Playbook không được chứa:

- JavaScript sinh động;
- `eval` hoặc `Function`;
- shell command;
- model prompt thực thi trực tiếp;
- quyền thay đổi combat truth;
- quyền thao tác Three.js scene object.

Tactic definition phải tách khỏi runtime state. Runtime có thể active, waiting, aborted hoặc finished nhưng không tự sửa definition.

---

## 8. Sandbox command model

Lệnh Sandbox được chuẩn hóa theo hướng có thể mở rộng:

```text
Subject + Action + Target/Direction
```

Trong vertical slice đầu tiên, `Subject` mặc định là robot người chơi.

Các action tối thiểu:

- `MOVE_DIRECTION`;
- `STOP`;
- `AIM_DIRECTION`;
- `FIRE_BEAM`;
- `ATTACK_TARGET`;
- `ATTACK_MOVE`;
- `PATROL`.

Câu lệnh phức tạp được biên dịch thành `SandboxPlan`: chuỗi bước bị giới hạn, có thời lượng, có thể bị lệnh trực tiếp cắt ngang. JEV chỉ được chọn các mission allowlist; local simulation vẫn quyết định mục tiêu gần nhất, damage và thứ tự thực thi.

Hướng có thể là:

- giờ đồng hồ tuyệt đối;
- hướng la bàn tuyệt đối;
- hướng tương đối theo heading hiện tại;
- target entity cụ thể.

Quy ước mặt phẳng Three.js:

```text
12 giờ / Bắc = (0, -1)
3 giờ / Đông  = (1, 0)
6 giờ / Nam   = (0, 1)
9 giờ / Tây   = (-1, 0)
```

Di chuyển thân dưới và hướng ngắm thân trên có thể độc lập để hỗ trợ vừa lùi vừa bắn. Simulation Sandbox, không phải mesh, sở hữu vị trí, health và kết quả damage.

---

## 8b. Jev architecture và rule memory

### 8b.1. Jev-first command interpretation

Tất cả voice và text input đi thẳng tới Jev (OpenRouter Decisions API). Không có local command parser fallback. Jev classify đồng thời nhiều labels:

- `intent_type`: `immediate_command | add_rule | set_strategy | unclear`
- `action`: `move | stop | fire | attack_nearest | none`
- `directive`: `patrol | advance | retreat | hold_and_fire | kite | focus_nearest | focus_largest | flank | idle | none`
- `direction`: clock/relative/none

Confidence threshold: 0.72. Dưới ngưỡng → reject, robot tiếp tục autonomous.

### 8b.2. Rule memory (session-scoped)

Khi Jev classify `intent_type = add_rule`, transcript được lưu vào MemoryStore (client-side, tồn tại trong session). Các rule tích lũy được gửi kèm trong Jev state context ở mỗi lần gọi tiếp theo, giúp Jev "nhớ" và quyết định thông minh hơn theo thời gian.

Ví dụ:
- Người chơi nói: "khi zombie đến gần cổng thì phải lùi bắn"
- Jev classify: `add_rule` → lưu vào memory
- Lần gọi sau: Jev nhận rule này trong state → khi zombie gần → chọn `retreat`

Giới hạn: tối đa 30 rules, FIFO khi đầy. Người chơi có thể toggle/xóa rules. Reset khi bắt đầu session mới.

### 8b.3. Local reflex layer (SandboxBrain)

SandboxBrain chạy hoàn toàn cục bộ, mỗi 6 sim ticks (~100ms). Nó xử lý:

- Reflex: dodge khi zombie quá gần (< 2.5 units)
- Strategic behavior: thực thi directive từ Jev (patrol, retreat, kite, v.v.)
- Auto-fire: tự nhắm và bắn mục tiêu gần nhất/lớn nhất tùy directive

Bot KHÔNG chờ Jev response giữa các quyết định. Jev chỉ thay đổi directive; local brain tự thực thi liên tục.

---
## 9. Voice, network và failure behavior

Voice là input tùy chọn. Text input phải dùng cùng một domain contract và vẫn hoạt động khi microphone không khả dụng.

Mọi voice và text của Live Fight, Time-out và Sandbox đi qua Jev. Không có local parser fallback trong runtime.

Nếu Jev timeout, trả confidence thấp hoặc output không hợp lệ, lệnh hiện tại bị bỏ qua. UI báo lỗi không chặn trận đấu và local brain tiếp tục tự quyết định.

Yêu cầu:

- không gọi network trong simulation tick;
- request phải có id/version khi cần;
- kết quả trễ phải bị loại bỏ;
- model output phải được validate như dữ liệu không đáng tin cậy;
- không đưa secret provider vào browser bundle;
- không lưu audio/transcript mặc định nếu người chơi chưa đồng ý;
- provider cụ thể và giá API không phải gameplay invariant.

---

## 10. Game feel và presentation

Presentation cần làm cho quyết định simulation dễ đọc:

- animation phase rõ ràng;
- blending mượt nhưng không phá cancel rules;
- hit reaction đúng target và loại đòn;
- feedback cho block, parry, guard break, whiff và punish;
- camera shake có kiểm soát;
- hit-stop chỉ được thêm nếu vẫn giữ simulation nhất quán;
- HUD hiển thị trạng thái lệnh, confidence, expiry hoặc lý do từ chối khi hữu ích.

Ưu tiên thứ tự:

1. combat đúng và đọc được;
2. robot autonomy rõ ràng;
3. voice ảnh hưởng nhìn thấy được;
4. feedback và polish;
5. provider AI nâng cao.

---

## 11. Luồng nghiệm thu gameplay

### 11.1. Robot Boxing

- Hai robot tiếp tục chiến đấu khi không có input người chơi.
- Direct Command không bypass action legality.
- Blackboard Override hết hạn và không sửa playbook.
- Câu Live Fight có điều kiện không được âm thầm tạo tactic.
- Time-out pause trận, giới hạn 3 lượt và yêu cầu review trước commit.
- Tactic đã commit ảnh hưởng các quyết định combat sau đó.
- Network/model failure không dừng trận đấu.
- Replay có thể tái hiện các input/domain event cần thiết mà không gọi lại model.

### 11.2. Sandbox

- “Đi hướng 6 giờ” làm robot di chuyển về Nam theo quy ước.
- “Dừng lại” dừng movement intent hiện tại.
- “Bắn hướng 3 giờ” tạo fire intent theo hướng Đông.
- Robot có thể tự phát hiện và bắn mục tiêu gần theo luật local.
- Attack-Move xử lý mục tiêu rồi tiếp tục tới đích.
- Patrol xử lý mục tiêu rồi quay lại lộ trình.
- Text và voice đi qua cùng validated domain intent.
- Cloud bị tắt vẫn không làm robot mất khả năng di chuyển hoặc chiến đấu cục bộ.

---

## 12. Ngoài phạm vi trước khi Sandbox vertical slice hoàn tất

Không ưu tiên trước khi flow Sandbox cơ bản được chứng minh:

- điều khiển nhiều squad đầy đủ;
- base building RTS;
- pathfinding phức tạp;
- multiplayer/network authority;
- model-generated source code;
- provider-specific voice architecture bắt buộc;
- thay thế Three.js hoặc thêm physics engine chỉ vì có combat;
- tái thiết kế toàn bộ Robot Boxing để phục vụ Sandbox.

---

## 13. Các quyết định còn mở

Các vấn đề sau cần quyết định bằng playtest hoặc yêu cầu sản phẩm riêng, không tự suy diễn trong implementation:

- Sandbox là mode phát hành chính thức hay chỉ là lab/PoC lâu dài;
- camera cuối cùng của Sandbox;
- số lượng và archetype zombie;
- beam dùng cooldown, energy hay giới hạn charge;
- người chơi có được dùng Time-out trong Sandbox hay không;
- cloud voice provider cuối cùng;
- tiêu chí chính xác để một hit trong recovery được gắn nhãn `PUNISH!`;
- hit-stop có pause simulation tick hay chỉ pause presentation.




