# Tài Liệu Đặc Tả Kiến Trúc & Triển Khai: Voice-Driven Robot Architecture

> **Vai trò của tài liệu:** Đây là bản đặc tả kiến trúc kỹ thuật và đề xuất triển khai. Các đoạn code Sandbox/voice provider chưa có trong `src/` là pseudocode hoặc target architecture, không phải implementation fact.
>
> **Tài liệu chuẩn liên quan:**
> - Gameplay source of truth: `docs/GAMEPLAY.md`
> - Hiện trạng/gap analysis: `docs/CURRENT_STATE_AND_GAPS.md`
> - Roadmap/task: `docs/IMPLEMENTATION_PLAN.md`
> - Yêu cầu/bối cảnh mentor: `docs/req.md`
>
> Source code hiện tại được ưu tiên khi mô tả trạng thái đã triển khai.

---

## Chương 1: Bối Cảnh, Giải Mã Định Hướng Mentor & Định Vị Trọng Tâm

### 1.1. Bóc Tách Toàn Bộ Nội Dung Ghi Âm Từ Mentor

Trong buổi thảo luận kỹ thuật, mentor đưa ra các nhận định chiến lược, ví dụ ẩn dụ và yêu cầu kỹ thuật xoay quanh việc nhóm đang bị cuốn vào hội chứng "One-shot" (cố gắng hoàn thiện ngay một tựa game đối kháng 3D phức tạp dẫn đến trải nghiệm tổng thể bị rời rạc, chưa tạo được cảm giác "ăn" giữa giọng nói và hành động của robot):

- **Công nghệ AI & Tối ưu hóa chi phí vận hành:**
- Khuyến nghị tiếp cận các dòng mô hình Multimodal Live độ trễ thấp như Gemini Flash Live (trong trao đổi nhắc tới 3.8 Flash Live) với chi phí khoảng **$0.84 / giờ** nói liên tục (chỉ tính phí khi có tín hiệu âm thanh thực, bỏ qua khoảng lặng).
- Đối chiếu với mô hình OpenAI Realtime có chi phí cao hơn đáng kể (khoảng **$5.00 / giờ**).
- Đề xuất mô hình ra quyết định chuyên biệt (Decision-making / Classification): đưa vào danh sách nhãn hành động (action labels), mô hình trả về phân bố xác suất (%) và chọn nhãn cao nhất mà không sinh văn bản giải thích. Hướng đi này giúp tối ưu hóa chi phí cực đại (khoảng **$0.04 / 1 triệu token input**, hoàn toàn không tốn phí token output) và đạt tốc độ phản hồi tức thì (_split-second_).
- Gợi ý khai thác các mô hình phụ trợ chi phí thấp thông qua OpenRouter cho các tác vụ phân loại logic thứ cấp.

- **Triết lý vận động sinh học (Hai tầng AI):**
- Con người khi di chuyển chỉ lập kế hoạch vĩ mô từ trước (đi tuyến đường nào, rẽ ngã nào), chứ không tính toán từng bước chân hay suy nghĩ co duỗi cơ nào ở mỗi mili-giây.
- Tương tự trong game: tầng chiến lược (Voice/LLM) chỉ định hướng cấp cao, còn tầng phản xạ nội tại (Script cục bộ) phải tự động vận hành ở chu kỳ khung hình cao nhằm duy trì tính liên tục của trận đấu.

- **Các cơ chế game tham chiếu:**
- **Robocode (2000s):** Mô hình kinh điển về robot tự hành, nơi mỗi thực thể sở hữu cảm biến (Sensors - radar quét môi trường) và cơ quan thực thi (Actuators - nòng súng, bánh xích), vận hành tự động theo kịch bản được nạp sẵn mà không cần người chơi can thiệp từng frame.
- **RTS (StarCraft, WarCraft) & MOBA (LoL, Dota):** Cơ chế điều khiển gián tiếp thông qua lệnh **Attack-Move** (phím `A` chỉ đất thì vừa đi vừa quét mục tiêu tự đánh; chỉ vào mục tiêu thì đuổi ráp) và **Patrol** (phím `P` tuần tra giữa 2 mốc, tự động công kích khi kẻ thù lọt vào tầm đánh).
- **Fighting 3D / Hero Combat:** Tham chiếu các cơ chế của _Rakion_ (Softnyx), _Gunbound/Gunny_ (hệ tọa độ góc hướng), _Overwatch_, _Valorant_, _Marvel Rivals_ (chuyển đổi trạng thái nhân vật cận chiến/đánh xa).

- **Game Feel & Động lực học đối kháng (Fighting Game Dynamics):**
- Cảm giác kích thích (dopamine) đến từ việc trừng phạt sai lầm của đối phương: né một cú đấm uy lực khiến đối thủ hụt đòn (**Whiff**) rơi vào thời gian khựng (**Recovery Time**), sau đó lao vào phản công (**Punish**) khiến đối thủ mất lượng máu lớn.
- Hoạt cảnh cử động phải có sự pha trộn mượt mà (**Animation Blending**): khi robot đang thực hiện dở một động tác mà chuyển trạng thái, chuyển động phải được nội suy tự nhiên, không ngắt giật khung hình đột ngột.
- Sự phân hóa đặc tính nhân vật (Archetypes): Robot hạng nặng (chậm chạp, thủ chắc, sát thương cực lớn) đối đầu Robot hạng nhẹ (cơ động, liên tục nhảy nhót rỉa máu, né tránh linh hoạt).

- **Quy chế 3 lần Time-out:** Robot tự động thi đấu theo kịch bản nhưng luôn có điểm mù; người chơi đóng vai trò Huấn luyện viên (Coach), sử dụng tối đa 3 lần tạm dừng trận đấu để chỉ đạo chiến thuật bằng giọng nói, qua đó cập nhật kịch bản thi đấu cho robot.

---

### 1.2. Đối Soát Hiện Trạng Repository & Các Bất Biến Kiến Trúc (Invariants)

Repository hiện tại (`hoangdangwd/robot-3d-inspector`) đã sở hữu một nền tảng mô phỏng tất định (deterministic simulation) hoàn chỉnh hơn rất nhiều so với hình dung sơ khởi. Do đó, việc triển khai không được phép phá vỡ 3 rào chắn an toàn sẵn có:

```text
                  ┌────────────────────────────────────────┐
                  │          COMBAT AUTHORITY              │
                  │       (src/combat/CombatSimulation.js) │
                  └───────────────────┬────────────────────┘
                                      │ Invariant 1: Nguồn chân lý duy nhất,
                                      │ không bypass qua UI/Animation.
                                      ▼
                  ┌────────────────────────────────────────┐
                  │          TACTICAL PERSISTENCE          │
                  │        (src/tactics/PlaybookStore.js)  │
                  └───────────────────┬────────────────────┘
                                      │ Invariant 2: Tactic vĩnh viễn bắt buộc
                                      │ qua Proposal -> Review -> Commit.
                                      ▼
                  ┌────────────────────────────────────────┐
                  │           LOCAL DETERMINISM            │
                  │    (src/coaching/OpenRouter Jev.js)│
                  └────────────────────────────────────────┘
                                        Invariant 3: Game loop không bao giờ
                                        await mạng; local brain tiếp tục khi Jev lỗi.

```

- **Invariant 1 - Combat Authority Tuyệt Đối:** Mọi quyết định gây sát thương, trúng/trượt, va chạm, trạng thái `STARTUP`, `ACTIVE`, `RECOVERY`, `BLOCK`, `PARRY`, `EVADE` đều do `CombatSimulation.js` định đoạt theo nhịp xung đồng hồ cố định 60 Hz (`SimClock.js`). Tuyệt đối không cho phép mô hình AI hay luồng Three.js animation tự ý thay đổi máu hay vị trí nhân vật.

- **Invariant 2 - Ranh Giới Biến Đổi Kịch Bản (Playbook Mutation Boundary):** Trong lúc trận đấu đang diễn ra (_Live Fight_), giọng nói chỉ được phát ra các lệnh ngắn hạn tạm thời thông qua `DirectCommandQueue.js` hoặc `CombatBlackboard.js`. Mọi thay đổi kịch bản mang tính dài hạn bắt buộc phải diễn ra trong **Time-out** (`TimeOutManager.js`), được đóng gói dưới dạng bản nháp đề xuất (`TacticPatch.js`), vượt qua kiểm tra tính hợp lệ (`TacticSchema.js`), hiển thị trên giao diện cho người chơi duyệt trước khi chính thức ghi nhận vào `PlaybookStore.js`.

- **Invariant 3 - Độc Lập Tính Toán Cục Bộ (Local Fast-Path Fallback):** Vòng lặp mô phỏng game không bao giờ được phép phụ thuộc (`await`) vào bất kỳ kết nối mạng hay phản hồi LLM nào. `OpenRouter Jev.js` đóng vai trò bộ phân giải tức thì; các yêu cầu gửi ra bên ngoài (như Cloudflare Worker `coach-api.js` hoặc các dịch vụ AI khác) chỉ là lớp dự phòng thứ cấp có cài đặt thời gian ngắt kết nối (timeout $\le 2.5\text{ s}$) và cơ chế tự động hủy bỏ kết quả trễ hạn (stale response drop).

---

### 1.3. Định Hướng Chiến Lược: Tách Hai Chế Độ Chơi Độc Lập

Để giải quyết triệt để sự giằng co giữa yêu cầu hoàn thiện game đối kháng phức tạp và nhu cầu kiểm chứng nhanh luồng giọng nói của mentor, hệ thống được cấu trúc thành hai chế độ chơi độc lập:

- **Chế độ 1 - Zombie Survival Sandbox Mode (Ưu tiên số 1):** Môi trường thử nghiệm sinh tồn mở 360 độ. Giảm thiểu các ràng buộc tính toán tương khắc đòn đánh cận chiến; tập trung hoàn thiện trải nghiệm: hô lệnh qua mic $\rightarrow$ robot lập tức xoay người, di chuyển mượt mà khắp mặt phẳng $\rightarrow$ tự động quét bắn quái hoặc xả chùm tia năng lượng theo hướng chỉ định.
- **Chế độ 2 - Robot Boxing 1v1 Core Mode (Bảo toàn & Tinh chỉnh sau):** Đấu trường đối kháng tay đôi chuyên sâu. Giữ nguyên toàn bộ cấu trúc quy tắc chiến đấu, hoàn thiện tín hiệu nhận diện hụt đòn (`whiff`) và cửa sổ phản công (`punish window`), nâng cao chất lượng phản hồi hình ảnh/âm thanh và tích hợp quy chế 3 lần Time-out.

---

## Chương 2: Bản Chất Của "Script" & Kiến Trúc AI Hai Tầng

### 2.1. "Script" Trong Game Loop Là Gì?

Trong lập trình game thực chiến, "script" của robot không phải là một chuỗi văn bản prompt gửi lên máy chủ AI, cũng không phải đoạn mã do LLM tự động viết ra khi đang chơi. Script là **một lớp điều khiển logic tất định (Deterministic Behavior Logic)** được biên dịch sẵn bằng TypeScript/JavaScript, chạy cục bộ với tần số quét 60 lần mỗi giây bên trong vòng lặp game.

```
┌────────────────────────────────────────────────────────────────────────┐
│               VÒNG LẶP ĐIỀU KHIỂN ROBOT NỘI TẠI (60 HZ)                │
│                                                                        │
│  ┌───────────────────────┐              ┌───────────────────────────┐  │
│  │   CẢM BIẾN (SENSORS)  │              │  BỘ LẬP LUẬN CỤC BỘ       │  │
│  │ - Cự ly mục tiêu      │─────────────►│ - Đánh giá Utility/State  │  │
│  │ - Trạng thái đòn đánh │              │ - Tham chiếu Playbook     │  │
│  │ - Tọa độ không gian   │              │ - Kiểm tra Blackboard     │  │
│  └───────────────────────┘              └─────────────┬─────────────┘  │
│                                                       │                │
│                                                       ▼                │
│                                         ┌───────────────────────────┐  │
│                                         │  CHẤP HÀNH (ACTUATORS)    │  │
│                                         │ - Tạo ActionIntent hợp lệ │  │
│                                         │ - Di chuyển 3D / Đổi hướng│  │
│                                         │ - Kích hoạt Animation     │  │
│                                         └───────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘

```

Mỗi robot mang trong mình một kịch bản với các thông số đặc trưng (tỷ lệ giữ cự ly, thiên hướng né đòn, mức độ hung hăng). Những thông số này tạo ra phong cách chiến đấu nhưng đồng thời tạo ra **điểm mù chiến thuật**. Người chơi lắng nghe và quan sát để can thiệp điều chỉnh các thông số này qua giọng nói.

---

### 2.2. Phân Tầng Xử Lý: Chiến Lược (Macro) vs. Phản Xạ (Reflex)

| Đặc tính         | Tầng 1: Chiến lược vĩ mô (Strategic Macro Layer) | Tầng 2: Phản xạ nội tại (Deterministic Reflex Layer) |
| ---------------- | ------------------------------------------------ | ---------------------------------------------------- |
| **Đơn vị xử lý** | Mô hình ngôn ngữ (LLM) / Bộ giải mã giọng nói    |

| Máy ảo logic cục bộ (`CombatBrain.js`, `TacticRuntime.js`)

|
| **Chu kỳ thực thi** | Thấp (chỉ khi có khẩu lệnh hoặc trong quãng nghỉ Time-out)

| Cực cao (xung nhịp 60 Hz đồng bộ với game loop)

|
| **Độ trễ chấp nhận** | $250\text{ ms} - 2500\text{ ms}$<br> | Tức thì trong từng khung hình ($\le 16.6\text{ ms}$)

|
| **Dữ liệu đầu ra** | Bản vá cấu hình (`TacticPatch`) hoặc lệnh ngắn hạn (`DirectCommand`)

| Ý định hành động cụ thể (`ActionIntent`) được xác thực

|
| **Tác động trực tiếp** | Không tác động trực tiếp lên vị trí vật lý hay lượng máu

| Gửi yêu cầu qua `CombatSimulation` để trừ máu/phát sinh va chạm

|

---

### 2.3. Quy Trình Cập Nhật Chiến Thuật An Toàn Trong Time-out

Để ngăn chặn nguy cơ mô hình AI trả về dữ liệu sai lệch làm gián đoạn trò chơi, chu trình áp dụng chiến thuật mới trong thời gian Time-out bắt buộc phải tuân theo sơ đồ khép kín:

```text
[Bật Mic trong Time-out]
          │
          ▼
[Thu âm & Giải mã Intent] ──► (OpenRouter Jev trả về JSON đề xuất)
          │
          ▼
[validateTacticPatch()]   ──► (Kiểm tra Schema, Action ID hợp lệ, xung đột revision)
          │
          ▼
[Tạo Bản Nháp Preview]    ──► (Hiển thị visual diff trên UI để người chơi xem)
          │
          ▼
[Người Chơi Xác Nhận]     ──► (Bấm nút Commit trên giao diện Pattern Review)
          │
          ▼
[PlaybookStore.commit()]  ──► (Lưu trữ lịch sử, cấp số hiệu revision mới)
          │
          ▼
[CombatBrain.setPlaybook] ──► (Nạp vào runtime, robot bước vào hiệp đấu mới)

```

---

## Chương 3: Voice Pipeline & Mô Hình Ngôn Ngữ Thời Gian Thực

### 3.1. Thiết Kế Đường Truyền Giọng Nói Hai Tốc Độ (Dual-Track Voice Pipeline)

Hệ thống xử lý giọng nói tích hợp hai tuyến xử lý song song nhằm cân bằng giữa tốc độ phản hồi tức thì và khả năng hiểu ngôn ngữ tự nhiên phức tạp:

```text
                               ┌─────────────────────────────┐
                               │   Microphone Audio Input    │
                               └──────────────┬──────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
      [Tuyến Nhanh - Fast Path Local]                [Tuyến Mở Rộng - Cloud Fallback]
      - Web Speech API (Client Transcript)        - Stream qua Cloudflare Worker Proxy
      - OpenRouter Jev.js                      - Trích xuất Intent bằng LLM
      - Regex & Khớp từ khóa đa ngữ                - Hỗ trợ câu nói ngữ cảnh phức tạp
      - Độ trễ xử lý: ≤ 20 ms                        - Độ trễ xử lý: 300 ms - 1500 ms
                      │                                               │
                      │ (Khớp lệnh thành công)                        │ (Fallback khi local không hiểu)
                      ▼                                               ▼
      ┌───────────────────────────────────────────────────────────────────────────────┐
      │                   Chuẩn Hóa Dữ Liệu Miền (Domain Intent)                      │
      │   - DIRECT_COMMAND (Thực thi ngay nếu thỏa mãn điều kiện)                    │
      │   - BLACKBOARD_OVERRIDE (Ghi đè mục tiêu ngắn hạn trong 1.5s - 3s)          │
      │   - TACTIC_PROPOSAL (Đưa vào màn hình duyệt trong Time-out)                 │
      └───────────────────────────────────────────────────────────────────────────────┘

```

---

### 3.2. Cấu Trúc Câu Lệnh Chuẩn Hóa 3 Thành Phần (Who - Action - Direction/Target)

Để chuẩn bị cho khả năng mở rộng điều khiển đa đơn vị (RTS) mà vẫn tương thích hoàn hảo với chế độ một robot hiện tại, mọi câu lệnh giọng nói sau khi phân tích đều được quy chuẩn về cấu trúc:

$$\text{Command} = \langle \text{Subject (Who)}, \text{Action (Verb)}, \text{Parameter (Direction/Target/Zone)} \rangle$$

- **Thành phần Đối tượng (`Who`):** Mặc định là `self` (robot của người chơi); trong chế độ nhiều đơn vị sẽ là định danh nhóm lính (ví dụ: `squad_alpha`, `barracks_1`).
- **Thành phần Hành động (`Action`):** Danh mục động tác được kiểm soát (`MOVE`, `STOP`, `ATTACK`, `PATROL`, `BLOCK`, `FIRE_BEAM`).

- **Thành phần Tham số (`Parameter`):** Góc hướng tuyệt đối (radian/giờ), góc tương đối, hoặc định danh mục tiêu cụ thể.

---

## Chương 4: Đặc Tả Sandbox Mode: Zombie Survival 360° (Ưu Tiên 1)

### 4.1. Mục Tiêu Kỹ Thuật Của Chế Độ Sandbox

- **Môi trường:** Một mặt phẳng không gian 3 chiều rộng mở, không bị giới hạn bởi vách võ đài hay trục khoảng cách 1 chiều.

- **Kẻ địch (Zombie Horde):** Các thực thể di chuyển tự động từ mép bản đồ dồn về phía người chơi với vận tốc ổn định.
- **Mục tiêu nghiệm thu:** Chứng minh được chuỗi liên kết: Người chơi nói qua mic $\rightarrow$ robot lập tức chuyển hướng di chuyển mượt mà khắp 360 độ $\rightarrow$ súng phụ tự động bắn tỉa quái gần nhất $\rightarrow$ hô lệnh xả chùm laser đại bác tiêu diệt hàng loạt mục tiêu theo góc chỉ định.

---

### 4.2. Mô Hình Toán Học Định Hướng 360 Độ Liên Tục

Hệ tọa độ quy ước trong Three.js: Trục $Y$ hướng lên trên (Up), mặt phẳng di chuyển là $X-Z$. Hướng Bắc (12 giờ) tương ứng với vector $(0, 0, -1)$, hướng Đông (3 giờ) là $(1, 0, 0)$, hướng Nam (6 giờ) là $(0, 0, 1)$, hướng Tây (9 giờ) là $(-1, 0, 0)$.

Mỗi giờ đồng hồ tương ứng với một góc quét $\Delta \theta = \frac{2\pi}{12} = \frac{\pi}{6}\text{ rad}$ ($30^\circ$).

```
                         12h (0 rad / 0°)
                                ▲
                 11h            │            1h
                    \           │           /
        9h (3π/2 rad) ──────────┼────────── (π/2 rad) 3h
                    /           │           \
                  7h            │            5h
                                ▼
                         6h (π rad / 180°)

```

Bảng quy đổi các giá trị chuẩn:

| Giờ đồng hồ | Góc Độ      | Góc Radian                       | Vector Di Chuyển Chuẩn $(x, z)$ |
| ----------- | ----------- | -------------------------------- | ------------------------------- |
| **12 giờ**  | $0^\circ$   | $0$                              | $(0, -1)$                       |
| **1 giờ**   | $30^\circ$  | $\frac{\pi}{6} \approx 0.5236$   | $(0.5, -0.866)$                 |
| **2 giờ**   | $60^\circ$  | $\frac{\pi}{3} \approx 1.0472$   | $(0.866, -0.5)$                 |
| **3 giờ**   | $90^\circ$  | $\frac{\pi}{2} \approx 1.5708$   | $(1, 0)$                        |
| **4 giờ**   | $120^\circ$ | $\frac{2\pi}{3} \approx 2.0944$  | $(0.866, 0.5)$                  |
| **5 giờ**   | $150^\circ$ | $\frac{5\pi}{6} \approx 2.6180$  | $(0.5, 0.866)$                  |
| **6 giờ**   | $180^\circ$ | $\pi \approx 3.1416$             | $(0, 1)$                        |
| **7 giờ**   | $210^\circ$ | $\frac{7\pi}{6} \approx 3.6652$  | $(-0.5, 0.866)$                 |
| **8 giờ**   | $240^\circ$ | $\frac{4\pi}{3} \approx 4.1888$  | $(-0.866, 0.5)$                 |
| **9 giờ**   | $270^\circ$ | $\frac{3\pi}{2} \approx 4.7124$  | $(-1, 0)$                       |
| **10 giờ**  | $300^\circ$ | $\frac{5\pi}{3} \approx 5.2360$  | $(-0.866, -0.5)$                |
| **11 giờ**  | $330^\circ$ | $\frac{11\pi}{6} \approx 5.7596$ | $(-0.5, -0.866)$                |

---

### 4.3. Kiến Trúc Tách Rời Thân Dưới (Chân) & Thân Trên (Tháp Pháo)

Robot trong sandbox mode áp dụng mô hình điều khiển độc lập hai trục:

- **Hệ thống Chân (Omni-Locomotion):** Chịu trách nhiệm di chuyển tịnh tiến theo vector vận tốc $\vec{v}_{\text{move}}$. Thân dưới xoay dần theo hướng di chuyển thông qua phép nội suy hình cầu (_Quaternion Slerp_).
- **Hệ thống Thân Trên & Vũ Khí (Turret Aiming):** Chịu trách nhiệm xoay độc lập để hướng vũ khí về phía mục tiêu nguy hiểm nhất hoặc góc xả súng được người chơi chỉ định bằng giọng nói, cho phép robot vừa lùi vừa xả đạn (_kite/strafe shooting_).

---

### 4.4. Mã Nguồn Cốt Lõi Của Chế Độ Sandbox

#### 4.4.1. Bộ Giải Mã Hướng Đa Năng (`DirectionResolver.js`)

```javascript
// src/sandbox/DirectionResolver.js
export class DirectionResolver {
    static CLOCK_MAP = {
        12: 0,
        1: Math.PI / 6,
        2: Math.PI / 3,
        3: Math.PI / 2,
        4: (2 * Math.PI) / 3,
        5: (5 * Math.PI) / 6,
        6: Math.PI,
        7: (7 * Math.PI) / 6,
        8: (4 * Math.PI) / 3,
        9: (3 * Math.PI) / 2,
        10: (5 * Math.PI) / 3,
        11: (11 * Math.PI) / 6,
    };

    static COMPASS_MAP = {
        bắc: 0,
        north: 0,
        "đông bắc": Math.PI / 4,
        northeast: Math.PI / 4,
        đông: Math.PI / 2,
        east: Math.PI / 2,
        "đông nam": (3 * Math.PI) / 4,
        southeast: (3 * Math.PI) / 4,
        nam: Math.PI,
        south: Math.PI,
        "tây nam": (5 * Math.PI) / 4,
        southwest: (5 * Math.PI) / 4,
        tây: (3 * Math.PI) / 2,
        west: (3 * Math.PI) / 2,
        "tây bắc": (7 * Math.PI) / 4,
        northwest: (7 * Math.PI) / 4,
    };

    /**
     * Trích xuất góc radian từ chuỗi lệnh giọng nói
     * @param {string} text - Văn bản khẩu lệnh từ người chơi
     * @param {number} currentHeading - Hướng mặt hiện tại của robot (Radian)
     * @returns {{ angle: number, isRelative: boolean } | null}
     */
    static parse(text, currentHeading = 0) {
        if (!text || typeof text !== "string") return null;
        const clean = text.toLowerCase().trim();

        // 1. Nhận diện góc theo giờ đồng hồ (VD: "hướng 3 giờ", "góc 6h", "9 giờ rưỡi")
        const clockMatch = clean.match(
            /(?:hướng|góc)?\s*(\d{1,2})(?:\s*giờ|\s*h)?(?:\s*(rưỡi|30))?/
        );
        if (clockMatch) {
            const hourStr = clockMatch[1];
            const isHalf = Boolean(clockMatch[2]);
            if (this.CLOCK_MAP[hourStr] !== undefined) {
                let angle = this.CLOCK_MAP[hourStr];
                if (isHalf) angle = (angle + Math.PI / 12) % (2 * Math.PI);
                return { angle, isRelative: false };
            }
        }

        // 2. Nhận diện theo hướng la bàn
        for (const [name, angle] of Object.entries(this.COMPASS_MAP)) {
            if (clean.includes(name)) {
                return { angle, isRelative: false };
            }
        }

        // 3. Nhận diện góc tương đối so với hướng hiện tại
        if (clean.includes("sau lưng") || clean.includes("quay đầu") || clean.includes("lùi lại")) {
            return { angle: (currentHeading + Math.PI) % (2 * Math.PI), isRelative: true };
        }
        if (clean.includes("sang phải") || clean.includes("bên phải")) {
            return { angle: (currentHeading + Math.PI / 2) % (2 * Math.PI), isRelative: true };
        }
        if (clean.includes("sang trái") || clean.includes("bên trái")) {
            return {
                angle: (currentHeading - Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI),
                isRelative: true,
            };
        }

        return null;
    }
}
```

#### 4.4.2. Bộ Điều Khiển Xoay & Di Chuyển 360° (`OmniRobotController.js`)

```javascript
// src/sandbox/OmniRobotController.js
import * as THREE from "three";

export class OmniRobotController {
    constructor(rootMesh, upperBodyMesh = null, options = {}) {
        this.root = rootMesh;
        this.upperBody = upperBodyMesh || rootMesh;

        this.moveSpeed = options.moveSpeed || 5.5;
        this.turnSpeed = options.turnSpeed || 8.0;

        this.desiredMoveAngle = null;
        this.desiredAimAngle = null;
        this.isMoving = false;

        this.velocity = new THREE.Vector3();
        this.currentHeading = 0;
    }

    setMoveDirection(angleRadian) {
        this.desiredMoveAngle = angleRadian;
        this.isMoving = true;
    }

    stop() {
        this.isMoving = false;
        this.desiredMoveAngle = null;
        this.velocity.set(0, 0, 0);
    }

    setAimDirection(angleRadian) {
        this.desiredAimAngle = angleRadian;
    }

    clearAim() {
        this.desiredAimAngle = null;
    }

    update(deltaTime) {
        // 1. Cập nhật góc quay thân dưới theo hướng di chuyển
        if (this.isMoving && this.desiredMoveAngle !== null) {
            const targetQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                this.desiredMoveAngle
            );
            this.root.quaternion.slerp(targetQuat, this.turnSpeed * deltaTime);

            // Tính vector vận tốc theo góc radian Three.js (Sin là X, -Cos là Z)
            const vx = Math.sin(this.desiredMoveAngle) * this.moveSpeed;
            const vz = -Math.cos(this.desiredMoveAngle) * this.moveSpeed;
            this.velocity.set(vx, 0, vz);

            this.root.position.addScaledVector(this.velocity, deltaTime);
            this.currentHeading = this.desiredMoveAngle;
        }

        // 2. Cập nhật góc quay thân trên (nếu có nhắm bắn mục tiêu cụ thể)
        if (this.desiredAimAngle !== null && this.upperBody !== this.root) {
            const aimQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                this.desiredAimAngle
            );
            this.upperBody.quaternion.slerp(aimQuat, this.turnSpeed * 1.5 * deltaTime);
        }
    }
}
```

#### 4.4.3. Động Cơ Mô Phỏng Đàn Quái 2D (`SpatialHordeSimulation.js`)

```javascript
// src/sandbox/SpatialHordeSimulation.js
export class SpatialHordeSimulation {
    constructor(bounds = 40) {
        this.bounds = bounds;
        this.zombies = [];
        this.nextId = 1;
        this.playerHealth = 100;
        this.score = 0;
    }

    spawnZombie(x, z, speed = 1.8, health = 30) {
        const zombie = {
            id: this.nextId++,
            x,
            z,
            speed,
            health,
            maxHealth: health,
            radius: 0.6,
        };
        this.zombies.push(zombie);
        return zombie;
    }

    update(playerPos, deltaTime) {
        const contacts = [];

        for (let i = this.zombies.length - 1; i >= 0; i--) {
            const z = this.zombies[i];

            // Đẩy zombie di chuyển thẳng về tọa độ người chơi
            const dx = playerPos.x - z.x;
            const dz = playerPos.z - z.z;
            const dist = Math.hypot(dx, dz);

            if (dist > 0.8) {
                z.x += (dx / dist) * z.speed * deltaTime;
                z.z += (dz / dist) * z.speed * deltaTime;
            } else {
                // Gây sát thương tiếp xúc trực tiếp
                this.playerHealth = Math.max(0, this.playerHealth - 10 * deltaTime);
                contacts.push(z.id);
            }
        }

        return { contacts, remainingHealth: this.playerHealth };
    }

    findNearestZombie(playerPos, maxRadius = 12.0) {
        let nearest = null;
        let minDist = maxRadius;

        for (const z of this.zombies) {
            const dist = Math.hypot(z.x - playerPos.x, z.z - playerPos.z);
            if (dist < minDist) {
                minDist = dist;
                nearest = z;
            }
        }
        return nearest;
    }

    applyLinearBeamDamage(origin, angleRadian, length = 25.0, halfWidth = 1.2, damage = 100) {
        const killed = [];
        // Vector chỉ hướng của chùm tia laser
        const dirX = Math.sin(angleRadian);
        const dirZ = -Math.cos(angleRadian);

        for (let i = this.zombies.length - 1; i >= 0; i--) {
            const z = this.zombies[i];
            const toZx = z.x - origin.x;
            const toZz = z.z - origin.z;

            // Chiếu tọa độ zombie lên trục chùm tia (Dot product)
            const projection = toZx * dirX + toZz * dirZ;

            if (projection >= 0 && projection <= length) {
                // Tính khoảng cách vuông góc từ zombie đến tâm tia laser
                const perpDist = Math.abs(toZx * -dirZ + toZz * dirX);
                if (perpDist <= halfWidth + z.radius) {
                    z.health -= damage;
                    if (z.health <= 0) {
                        killed.push(this.zombies.splice(i, 1)[0]);
                        this.score += 10;
                    }
                }
            }
        }
        return killed;
    }
}
```

---

## Chương 5: Đặc Tả Core Mode: Robot Boxing 1v1 (Phase 2)

### 5.1. Nâng Cấp Tín Hiệu Whiff & Cửa Sổ Punish (First-Class Tactical Signals)

Trong chế độ đấu võ đài 1v1 hiện tại, đòn đánh đã được kiểm soát chặt chẽ qua 3 giai đoạn: `STARTUP` (chuẩn bị), `ACTIVE` (chạm đích tính hit) và `RECOVERY` (khựng hồi chiêu). Để hiện thực hóa lối chơi phản công trừng phạt theo đúng phân tích của mentor, hai thực thể cần được bổ sung các tín hiệu sau vào hệ thống cảm biến:

```javascript
// Bổ sung vào src/ai/CombatBrain.js - Hàm perceive()
const enemyActiveAction = enemyFighter.getActiveAction();
const isEnemyWhiffing = (
  enemyActiveAction &&
  enemyActiveAction.phase === 'RECOVERY' &&
  enemyActiveAction.hasMissed === true
);

const punishWindowTicksRemaining = isEnemyWhiffing
  ? enemyActiveAction.remainingRecoveryTicks
  : 0;

```

- Khi đối thủ tung đòn nặng bị hụt (Whiff), `CombatSimulation` gửi sự kiện `contact_resolved` với kết quả `missed`.

- Bộ não của robot nhận biết `punishWindowTicksRemaining > 0` và lập tức kích hoạt đòn phản công nhanh theo quy định của kịch bản chiến thuật.

---

### 5.2. Hoạt Cảnh Chuyển Tiếp Hợp Lệ & Nâng Cao Game Feel

- **Nguyên tắc ngắt đòn đánh (Cancel Rule):** Không được phép sử dụng animation blending để tự ý ngắt ngang một đòn đánh khi `CombatSimulation` chưa cho phép. Động tác chỉ được chuyển tiếp mượt mà giữa các animation khi trạng thái bên trong của simulation chuyển đổi thành công từ `RECOVERY` sang `IDLE` hoặc khi kích hoạt các chiêu thức combo được cấp phép.

- **Gia tăng hiệu ứng va chạm (Juice & Feedback):**
- **Hit-Stop (Khựng khung hình):** Tạm dừng cập nhật chuyển động từ 3 đến 5 ticks mô phỏng ngay khi một đòn đấm hạng nặng kết nối trúng đích để tạo độ đầm chắc cho đòn đánh.
- **Camera Shake:** Rung nhẹ góc quay camera khi có sát thương chí mạng hoặc khi robot bị đánh ngã sàn (_knockdown_).

- **Chỉ báo chữ trên sàn đấu:** Hiển thị trực tiếp các nhãn trạng thái nổi trên đầu robot: `WHIFF` (khi đấm hụt), `PUNISH!` (khi trừng phạt thành công đối thủ đang khựng), và `GUARD BREAK` (khi phá vỡ thế thủ).

---

## Chương 6: Bản Đồ Khớp Mã Nguồn & Kế Hoạch Triển Khai

### 6.1. Bảng Đối Soát Module Giữa Hai Chế Độ

| Module Trong Repository | Chế độ Zombie Survival Sandbox (Phase 1)  | Chế độ Robot Boxing 1v1 Core (Phase 2)          |
| ----------------------- | ----------------------------------------- | ----------------------------------------------- |
| `src/main.js`<br>       | Thêm nút chuyển đổi chế độ tại menu chính | Khởi tạo giao diện sàn đấu đối kháng tiêu chuẩn |

|
| `src/robots/RobotFactory.js`<br> | Dùng sinh Robot người chơi & clone zombie | Dựng 2 đấu thủ hoàn chỉnh từ catalog

|
| `src/coaching/OpenRouter Jev.js`<br> | Tích hợp `DirectionResolver` (360 độ, la bàn, giờ) | Nhận diện khẩu lệnh đối kháng & Time-out

|
| `src/coaching/DirectCommandQueue.js`<br> | Nhận lệnh di chuyển tức thời & xả laser | Nhận các lệnh can thiệp ngắn hạn trong trận

|
| `src/combat/CombatSimulation.js`<br> | **Bỏ qua** (sử dụng `SpatialHordeSimulation`) | Giữ vai trò thẩm quyền duy nhất điều hành đối kháng

|
| `src/match/TimeOutManager.js`<br> | Không sử dụng (sinh tồn liên tục) | Kiểm soát quy chế 3 lần tạm dừng chỉ đạo

|
| `src/tactics/PlaybookStore.js`<br> | Không sử dụng | Quản lý lưu trữ và commit kịch bản chiến thuật

|
| `src/arena/FightingStage.js`<br> | Mở rộng biên độ sàn đấu thành bãi đất trống | Sàn đấu lôi đài hình vuông có dây đài

|

---

### 6.2. Kế Hoạch Triển Khai 5 Giai Đoạn (Implementation Roadmap)

#### Giai Đoạn 0: Củng Cố Tài Liệu & Chốt Source of Truth

> Giai đoạn này đã được thực hiện. Roadmap/task chuẩn hiện tại nằm tại `docs/IMPLEMENTATION_PLAN.md`. Việc tạo `src/sandbox/` được chuyển sang Phase 1, cùng với Sandbox intent contract, để tránh tạo thư mục/code trước khi contract được chốt.

- [x] Tạo `docs/GAMEPLAY.md` làm gameplay source of truth.
- [x] Ghi lại hiện trạng và khoảng trống trong `docs/CURRENT_STATE_AND_GAPS.md`.
- [x] Chuẩn hóa roadmap trong `docs/IMPLEMENTATION_PLAN.md`.
- [x] Phân biệt Live Fight, Blackboard, Direct Command và Time-out Playbook.

#### Giai Đoạn 1: Hoàn Thiện Sandbox Di Chuyển 360° & Bắn Súng Tự Động

- Tích hợp `DirectionResolver.js` vào bộ phân giải lệnh giọng nói.

- Gắn `OmniRobotController.js` vào thực thể Robot chính, cho phép điều khiển di chuyển theo 12 cung giờ đồng hồ và các hướng la bàn.
- Xây dựng cơ chế cảm biến quét zombie gần nhất và tự động kích hoạt animation bắn súng tỉa.

#### Giai Đoạn 2: Vũ Khí Laser Đại Bác & Hiển Thị Phản Hồi Trực Quan

- Hiện thực hóa lệnh xả năng lượng: _"Bắn hướng X giờ"_, dựng hình chùm laser (`CylinderGeometry`) quét qua các tọa độ và trừ máu hàng loạt zombie trúng tia.
- Bổ sung Compass HUD (vòng la bàn định hướng trên màn hình) để người chơi kiểm chứng ngay độ trễ và độ chính xác khi hệ thống bắt được khẩu lệnh giọng nói.

#### Giai Đoạn 3: Nâng Cấp Cơ Chế Phản Công (Whiff & Punish) Trong Mode 1v1

- Xuất các thuộc tính `isEnemyWhiffing` và `punishWindowTicksRemaining` từ `CombatSimulation` sang `CombatBrain`.

- Bổ sung điều kiện kích hoạt chiến thuật mới: `TRIGGER_ENEMY_WHIFF` vào `TacticSchema.js`.

- Kiểm thử tính năng trừng phạt thông qua kịch bản kiểm thử mẫu `validate-attack-defense.mjs`.

#### Giai Đoạn 4: Hoàn Thiện Trải Nghiệm Time-Out & Đánh Giá Độc Lập

- Đồng bộ hóa giao diện dừng trận đấu của `TimeOutManager.js` với mic thu âm.

- Đảm bảo đề xuất chiến thuật từ AI bắt buộc phải hiển thị dạng bản nháp diff để người chơi bấm nút duyệt trước khi nạp vào `PlaybookStore.js`.

- Đo đạc và ghi nhận các chỉ số độ trễ thực tế ($p50 \le 50\text{ ms}$ cho Jev, $p95 \le 2.5\text{ s}$ cho cloud worker) để làm báo cáo khoa học.

