# Tài Liệu Định Hướng & Yêu Cầu Ban Đầu: Voice-Driven AI Robot System

> **Vai trò của tài liệu:** Đây là bản tổng hợp bối cảnh, ý tưởng mentor và yêu cầu khám phá ban đầu. Nó không phải gameplay source of truth và không phải cam kết rằng mọi pseudocode/provider trong tài liệu đã tồn tại trong source.
>
> **Tài liệu chuẩn liên quan:**
> - Gameplay: `docs/GAMEPLAY.md`
> - Hiện trạng/gap analysis: `docs/CURRENT_STATE_AND_GAPS.md`
> - Kế hoạch triển khai: `docs/IMPLEMENTATION_PLAN.md`
> - Kiến trúc kỹ thuật: `docs/architecture.md`
>
> Khi có xung đột, ưu tiên `docs/GAMEPLAY.md`, implementation fact trong source và plan đã được chốt.

Tài liệu này tổng hợp toàn bộ các phân tích kỹ thuật, yêu cầu kiến trúc và định hướng phát triển được rút ra từ phiên thảo luận định hướng với mentor, đối soát trực tiếp với hiện trạng mã nguồn trong kho lưu trữ Git hiện tại.

---

## 1. Bản Chất Vấn Đề & Triết Lý Cốt Lõi Từ Định Hướng Của Mentor

### 1.1. Hiện trạng: Bẫy "One-Shot" và Hiện tượng Game "Chưa Ăn"

Nhóm phát triển đang mắc phải hội chứng **"One-Shot"**: cố gắng hoàn thiện ngay lập tức một tựa game đối kháng 3D đầy đủ tính năng (Animation, Combo, AI Blackboard, Voice Coaching, Replay, Cloudflare Worker API) dẫn đến việc các mắt xích kỹ thuật không gắn kết mượt mà với nhau.

- **Hiện tượng "Chưa ăn":** Cảm giác điều khiển bị đứt quãng, phản hồi giọng nói chưa tác động trực quan và tức thì lên hành vi của robot trong không gian 3D.
- **Định hướng chỉnh sửa:** Lập tức thu hẹp phạm vi kỹ thuật (_de-scope_), xây dựng một môi trường mẫu tối giản (**Sandbox PoC**) để chứng minh luồng truyền dẫn thời gian thực (**Voice-to-Action Pipeline**) trước khi tích hợp ngược lại vào sàn đấu đối kháng phức tạp.

### 1.2. Triết lý Vận động Sinh học: Kiến trúc AI 2 Tầng (Two-Tier AI Architecture)

Mentor đưa ra sự tương đồng giữa cách con người hoạt động thực tế với kiến trúc điều khiển trong game:

```
                  ┌─────────────────────────────────────────────────┐
                  │          TẦNG 1: CHIẾN LƯỢC / KẾ HOẠCH          │
                  │   (Strategic Macro Layer - LLM via Voice)       │
                  │   - Xử lý chậm (High latency, Low frequency)    │
                  │   - Nhận lệnh giọng nói người chơi (Coach)      │
                  │   - Phân tích và sinh bản vá cấu hình           │
                  └───────────────────────┬─────────────────────────┘
                                          │ Ghi đè tham số (TacticPatch)
                                          ▼
                  ┌─────────────────────────────────────────────────┐
                  │            TẦNG 2: PHẢN XẠ NỘI TẠI              │
                  │     (Deterministic Local Reflex Engine)         │
                  │   - Chạy 60 FPS tại Client (Three.js Loop)      │
                  │   - Phản ứng tức thì (Split-second)             │
                  │   - Sensors (Đọc môi trường) -> Actuators (Làm) │
                  └─────────────────────────────────────────────────┘

```

- **Con người không tư duy từng bước chân:** Khi bạn quyết định đi từ nhà sang công ty, não bộ chỉ lập kế hoạch vĩ mô: _"Đi đường này, rẽ hướng kia"_. Khi bạn thực sự nhấc chân lên, việc co cơ nào, giữ thăng bằng ra sao, né chướng ngại vật trước mắt là do hệ thần kinh phản xạ tủy sống tự động xử lý.
- **Ứng dụng vào Robot:**
- Không dùng AI/LLM để can thiệp vào từng frame cử động hay từng cú đấm (vì mạng có độ trễ từ vài trăm mili-giây đến vài giây, đối thủ đã ra đòn xong từ lâu).
- Robot phải có **Script phản xạ nội tại** tự động chiến đấu, dò đường, né chiêu theo chu kỳ vòng lặp 60 FPS (Tầng 2).
- Người chơi sử dụng **Giọng nói (Voice)** như một huấn luyện viên (Coach) để chỉ đạo chiến thuật cấp cao hoặc can thiệp sửa lỗi hành vi trong các quãng nghỉ (Tầng 1).

---

## 2. Giải Mã Chuyên Sâu: "Cái Script" Trong Game Là Gì?

"Script" mà mentor đề cập **hoàn toàn không phải việc bắt LLM ngồi sinh mã nguồn (Code Generation)** mỗi khi người chơi nói. Script ở đây là một **bộ máy logic trạng thái (Deterministic State Machine / Behavior Script)** được viết bằng TypeScript/JavaScript, chạy cục bộ 60 lần/giây ngay bên trong Game Loop của Three.js.

### 2.1. Cấu trúc Cốt lõi của một Robot Script

Mỗi script điều khiển bắt buộc phải bao gồm hai phần tách biệt:

- **Sensors (Cơ quan cảm biến - Đọc dữ liệu môi trường mỗi khung hình):**
- Khoảng cách thực tế đến đối thủ ($d$).
- Trạng thái chiêu thức của đối thủ: đang thủ (`blocking`), đang ra đòn (`attacking`), hay vừa đấm trượt và rơi vào thời gian khựng (`whiff` / `recovery`).
- Góc hướng mặt đối thủ so với robot (trước mặt, sườn trái, sau lưng).
- Chỉ số sinh tồn: phần trăm máu hiện tại, trạng thái hồi chiêu của các kỹ năng.

- **Actuators (Cơ quan thực thi - Gọi các hành động vật lý/animation):**
- Di chuyển: `moveToward(target)`, `strafeLeft()`, `dashBack()`, `patrol(pointA, pointB)`.
- Đòn đánh & Kỹ năng: `lightPunch()`, `heavyPunch()`, `block()`, `fireLaser(angle)`.

### 2.2. Điểm Mù Kịch Bản (Script Flaws / Biases)

Robot được thả vào sàn đấu là tự đánh tự né 100% (tương tự như trò chơi kinh điển **Robocode** từ những năm 2000). Tuy nhiên, các script này luôn có điểm mù được cài đặt cố ý theo thiết kế nhân vật (_Archetypes_):

- **Lớp Đô con / Hạng nặng:** Giáp dày, máu trâu, lực đấm cực mạnh (trúng một đòn là máu đối thủ tụt sâu), nhưng tốc độ di chuyển chậm và kịch bản có xu hướng chỉ biết lao thẳng và thủ thụ động.
- **Lớp Cơ động / Hạng nhẹ:** Di chuyển cực nhanh, nhảy nhót luồn lách liên tục, rỉa máu tầm xa/tầm trung nhưng máu mỏng; điểm mù là script không biết phòng thủ chắc chắn khi bị ép vào góc sàn đấu.

### 2.3. Mã nguồn mô phỏng Script Engine chạy nội tại

```typescript
// Script logic chạy ở tần số 60 FPS bên trong Three.js Loop
export class RobotReflexScript {
    constructor(robotEntity) {
        this.robot = robotEntity;

        // TẬP THAM SỐ CẤU HÌNH (SẼ ĐƯỢC VOICE / TACTIC-PATCH GHI ĐÈ)
        this.parameters = {
            preferredDistance: 2.0, // Khoảng cách lý tưởng muốn duy trì
            dodgeBias: "left", // Ưu tiên lách trái hay lách phải
            punishOnWhiff: true, // Có trừng phạt đối thủ khi họ đấm hụt không
            defenseAggressiveness: 0.7, // Tỷ lệ bật khiên đỡ đòn
            counterAttackSkill: "heavy_punch",
        };
    }

    // Chạy mỗi frame (dt ~ 0.016s)
    public update(sensors, actuators, dt: number) {
        const enemyDist = sensors.getDistanceToTarget();
        const enemyState = sensors.getEnemyCombatState();

        // 1. Phản xạ phòng thủ / Phản công khi đối thủ Whiff
        if (enemyState.isWhiffing && this.parameters.punishOnWhiff) {
            if (enemyDist <= this.parameters.preferredDistance) {
                actuators.executeAction(this.parameters.counterAttackSkill);
                return;
            } else {
                actuators.dashTowardsTarget();
                return;
            }
        }

        // 2. Phản xạ né đòn khi đối thủ đang vung đòn nặng
        if (enemyState.isAttackingHeavy) {
            if (this.parameters.dodgeBias === "left") {
                actuators.strafeLeft(dt);
            } else if (this.parameters.dodgeBias === "right") {
                actuators.strafeRight(dt);
            } else {
                actuators.raiseShield();
            }
            return;
        }

        // 3. Phản xạ duy trì khoảng cách chiến thuật cơ bản
        if (enemyDist > this.parameters.preferredDistance) {
            actuators.stepForward(dt);
        } else if (enemyDist < this.parameters.preferredDistance * 0.7) {
            actuators.stepBackward(dt);
        }
    }

    // Hàm nhận bản vá từ Voice Coach qua TacticPatch
    public applyTacticPatch(patchConfig: Partial<typeof this.parameters>) {
        Object.assign(this.parameters, patchConfig);
    }
}
```

---

## 3. Kiến Trúc Voice & Công Nghệ LLM: Tối Ưu Chi Phí & Tốc Độ

Mentor đặc biệt nhấn mạnh về công nghệ model, độ trễ (_latency_) và chi phí vận hành thực tế giữa các nền tảng AI.

### 3.1. So Sánh Mô Hình & Bài Toán Chi Phí Thực Tế

| Tiêu chí                           | OpenAI Realtime API                       | Gemini Flash Live (Multimodal Live)                         | Decision-Only / Classification Models    |
| ---------------------------------- | ----------------------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| **Chi phí Audio Input**            | ~$5.00 / giờ stream                       | ~$0.84 / giờ audio input                                    | Không áp dụng trực tiếp (dùng STT ngoài) |
| **Tính tiền lúc im lặng (Silent)** | Có tính liên tục khi giữ session          | **Không tính tiền** các khoảng silent (chỉ tính audio thực) | Không tính                               |
| **Chi phí Token Input**            | Cao ($5 - $20 / 1M token)                 | Rất rẻ                                                      | Cực rẻ (~**$0.04 / 1M token input**)     |
| **Chi phí Token Output**           | Rất cao cho audio/text                    | Tiêu chuẩn                                                  | **0$ (Không tốn token output)**          |
| **Độ trễ phản hồi (Latency)**      | ~300ms - 600ms                            | ~250ms - 500ms (Streaming)                                  | **Split-second** (Dưới 100ms)            |
| **Độ phù hợp cho Game Loop**       | Đắt, lãng phí nếu chỉ cần trích xuất lệnh | **Tối ưu nhất cho Voice Coach**                             | **Tối ưu cho logic phân loại nhãn**      |

Mentor phân tích:

- Nếu dùng model chỉ để phân loại (Decision-making): Đưa vào 3 nhãn hành động, model trả về xác suất % hoặc chọn 1 nhãn có điểm cao nhất. Việc không phải sinh text văn bản giải thích giúp tiết kiệm toàn bộ chi phí output token và tốc độ đạt mức _split-second_.
- Mentor khuyên tận dụng các mô hình siêu rẻ thông qua **OpenRouter** hoặc triển khai trực tiếp các model nhỏ cho các tác vụ logic nội bộ.

### 3.2. Luồng Xử Lý Giọng Nói Thời Gian Thực (Voice Pipeline)

Quy trình kỹ thuật để giọng nói chuyển hóa thành hành động trong game Three.js không trải qua bước STT thành văn bản dài dòng rồi mới suy luận, mà dùng **Multimodal Tool Calling**:

```
[Microphone Người Chơi]
        │
        ▼ (PCM 16kHz Streaming qua AudioWorklet)
[WebSocket Client Engine]
        │
        ▼ (Upstream Audio Chunks)
[Cloudflare Worker / Backend Proxy]
        │
        ▼ (Bidi-Streaming WebSocket)
[Gemini Flash Live API]
        │
        │ (Nhận diện giọng nói và đối soát tập Function Tools đã đăng ký)
        ▼
[Tool Call Event: updateTactics({ ... })] (Không sinh Text output)
        │
        ▼ (JSON Event trả về qua WebSocket)
[Game TacticalIntentResolver]
        │
        ▼ (Cập nhật trực tiếp vào robot)
[RobotReflexScript.applyTacticPatch()]

```

### 3.3. Quy Chế 3 Lần Time-Out Trong Trận Đấu

Thay vì cố gắng nói liên tục trong lúc hai con robot lao vào đấm nhau với tốc độ khung hình mili-giây, mentor đưa ra cơ chế:

1. **Trong trận đấu:** Robot tự vận hành theo kịch bản có sẵn. Người chơi chỉ đưa ra các lệnh vĩ mô (Macro commands: đi hướng nào, rút lui, xả chiêu tối thượng).
2. **Quyền Time-out:** Mỗi trận người chơi có tối đa **3 lần gọi Time-out**.
3. **Trong lúc Time-out:**

- Trận đấu tạm dừng (Pause loop).
- Người chơi bật mic chỉ đạo chiến thuật: _"Nó hay đấm tay phải đau lắm, mày lách sang trái rồi phản công nó khi nó đánh hụt"_.
- LLM nhận diện và chuyển hóa câu nói thành một object JSON (`TacticPatch`):

```json
{
    "dodgeBias": "left",
    "punishOnWhiff": true,
    "counterAttackSkill": "heavy_punch",
    "defenseAggressiveness": 0.85
}
```

- Trận đấu tiếp tục: Script của robot nhận giá trị mới, tự động đánh theo phong cách vừa được huấn luyện.

---

## 4. Cơ Chế Chiến Thuật: Attack-Move, Patrol & Game Mechanics Đối Kháng

Mentor so sánh cơ chế điều khiển robot với các game RTS (StarCraft, WarCraft), MOBA (Liên Minh Huyền Thoại, Dota) và game đối kháng 3D (Rakion).

### 4.1. Cơ Chế Lệnh RTS: Attack-Move (Phím A) & Patrol (Phím P)

```
                            CƠ CHẾ LỆNH ATTACK-MOVE (PHÍM A)

  [Vị Trí Hiện Tại] ────────────────────────────────────────► [Điểm Chỉ Định A]
                            │
                      (Gặp Kẻ Địch 1)
                            │
                            ▼
                    [Tự Động Giao Tranh]
                            │
                     (Tiêu Diệt Xong)
                            │
                            └────────────────────────────────► [Đi Tiếp Tới A]

```

- **Attack-Move (Phím A):**
- _Click vào đất (Ground Click):_ Robot di chuyển thẳng về tọa độ đích, nhưng hệ thống cảm biến (_Sensors_) luôn quét xung quanh. Bất kỳ khi nào kẻ địch bước vào tầm đánh (_Attack Range_), robot lập tức dừng bước, tự động giao tranh cho đến khi mục tiêu bị tiêu diệt rồi mới tiếp tục hành trình đến đích.
- _Click vào đầu mục tiêu (Target Click):_ Robot bỏ qua mọi mục tiêu khác trên đường, truy đuổi duy nhất đối tượng được chỉ định.
- _Ứng dụng bằng Voice:_ Người chơi hô: _"Tiến về hướng 6 giờ, gặp quái là bắn"_. Robot sẽ kích hoạt trạng thái Attack-Move theo vector góc 6 giờ.

- **Patrol (Tuần tra - Phím P):**
- Robot di chuyển tuần hoàn liên tục giữa Điểm A và Điểm B.
- Trong suốt hành trình tuần tra, nếu phát hiện bất kỳ mục tiêu nào xâm nhập bán kính cảm biến, robot tự động chuyển trạng thái sang tấn công. Sau khi tiêu diệt mục tiêu hoặc mục tiêu chạy mất, robot quay lại lộ trình tuần tra ban đầu.
- _Ứng dụng bằng Voice:_ Người chơi hô: _"Tuần tra bảo vệ mạn trái cho tao"_.

### 4.2. Cơ Chế Đối Kháng Chuyên Sâu (Fighting Game Mechanics) & Animation Blending

Mentor yêu cầu animation và cơ chế đánh phải mang lại cảm giác "sướng" (_game feel_ / _dopamine_), dựa trên các yếu tố:

- **Animation Blending (Pha trộn hoạt cảnh chuyển tiếp):**
- Sử dụng thư viện animation (như Quaternius). Khi robot đang thực hiện dở một động tác (ví dụ đang đấm thẳng) mà nhận lệnh đổi sang thế thủ hoặc né sang bên, engine không được ngắt đột ngột khung hình mà phải **blend (nội suy mượt mà)** từ animation hiện tại sang animation mới.

- **Vòng đời Frame Data của Đòn Đánh:**
- **Startup:** Thời gian robot chuẩn bị vung tay ra đòn.
- **Active:** Thời điểm cú đấm trúng đích và gây sát thương (_Hitbox active_).
- **Recovery Time (Thời gian khựng hồi chiêu):** Sau khi ra đòn, robot mất một khoảng thời gian ngắn để thu tay về thế thủ ban đầu. Trong thời gian này, robot hoàn toàn không thể bấm nút hay tự vệ.

- **Whiff & Punish (Hụt đòn & Trừng phạt):**
- Khi robot tung đòn mà đối thủ né được (đấm vào không khí), trạng thái này gọi là **Whiff**.
- Đối thủ khi thấy tình huống Whiff sẽ lập tức lao vào tung combo phản công trong khoảng thời gian đối phương đang bị khựng hồi chiêu (**Punish**). Cảm giác né được cú đấm uy lực rồi đấm trúng đích khiến thanh máu đối phương tụt sâu tạo ra khoái cảm chơi game cực lớn.

- **Block & Chip Damage (Đỡ đòn):**
- Khi bật khiên/giáp đỡ đòn thành công, sát thương bị giảm thiểu tối đa, chỉ dính một lượng nhỏ sát thương bào mòn (**Chip Damage** khoảng ~0.5% máu thay vì nhận toàn bộ sát thương).

---

## 5. Tầm Nhìn Mở Rộng: Voice RTS & Điều Khiển Đa Quân (Multi-Unit)

Từ bài toán điều khiển một robot đơn lẻ, mentor vạch ra lộ trình mở rộng quy mô hệ thống thành game chiến thuật thời gian thực điều khiển hoàn toàn bằng giọng nói (**Voice RTS**).

### 5.1. Cấu Trúc Câu Lệnh Chuẩn Hóa 3 Thành Phần (The 3-Component Voice Command)

Khi mở rộng sang điều phối nhiều đơn vị quân hoặc nhiều robot trên bàn cờ, bộ phân tích ý định giọng nói (_Intent Resolver_) phải trích xuất được 3 trường thông tin cốt lõi:

$$\text{Voice Command} = \text{Đối tượng (Who)} + \text{Hành động (Action)} + \text{Hướng / Mục tiêu (Target / Direction)}$$

- **Ví dụ 1:** _"Đạo lính ở góc 6 giờ, chạy sang chi viện cho thằng phía trên kia!"_
- **Who:** Đạo lính tại vị trí góc 6 giờ (tọa độ vector phía Nam).
- **Action:** Hành quân hỗ trợ (`reinforce`).
- **Target/Direction:** Vị trí của đồng minh phía Bắc (góc 12 giờ).

- **Ví dụ 2:** _"Làm thêm cho tao một đạo Footman!"_
- **Who:** Công trình nhà lính (Barracks / Base).
- **Action:** Huấn luyện / Sản xuất (`spawn_unit`).
- **Target:** Loại quân Footman.

---

## 6. Đối Soát Mã Nguồn Git Hiện Tại Với Định Hướng Mentor

> Bảng dưới đây là nhận định tại thời điểm viết tài liệu. Snapshot đã được kiểm chứng lại nằm trong `docs/CURRENT_STATE_AND_GAPS.md`. Các module được nhắc trong phần Sandbox nhưng chưa có trong `src/` được xem là proposal, không phải implementation fact.

Hệ thống mã nguồn trong dự án đã có sẵn nhiều module nền tảng quan trọng, nhưng đang gặp sự chênh lệch lớn về cách kết nối luồng logic:

| Hạng mục trong Repo        | Tệp mã nguồn tương ứng                  | Đánh giá hiện trạng so với yêu cầu của Mentor |
| -------------------------- | --------------------------------------- | --------------------------------------------- |
| **Hệ thống AI & Kịch bản** | `src/ai/RobotPatternRuntime.js`<br><br> |

<br>`src/ai/CombatBrain.js`<br><br>

<br>`src/ai/CombatBlackboard.js`<br> | **Đã có khung sườn**, nhưng logic AI đang thiên về một cây quyết định cố định cứng nhắc, chưa tách bạch rõ giữa tầng _Reflex Script 60 FPS_ và _Voice Macro_. Cần cấu trúc lại theo mô hình Sensors & Actuators thuần túy. |
| **Bản vá Chiến thuật** | `src/tactics/TacticPatch.js`<br><br>

<br>`src/tactics/TacticRuntime.js`<br><br>

<br>`src/tactics/TacticalIntentResolver.js`<br> | **Rất đúng hướng mentor muốn.** Cần kết nối trực tiếp `TacticalIntentResolver` với output Tool Calling của mô hình AI thời gian thực để gán đè trực tiếp tham số vào `RobotPatternRuntime`.

|
| **Quản lý Time-Out** | `src/match/TimeOutManager.js`<br> | **Khớp hoàn toàn với audio.** Cần kết nối sự kiện pause của `TimeOutManager` với việc kích hoạt kênh micro để người chơi chỉ đạo chiến thuật.

|
| **Xử lý Giọng nói** | `src/coaching/VoiceCoachController.js`<br><br>

<br>`src/coaching/LocalCommandParser.js`<br><br>

<br>`worker/coach-api.js`<br> | **Chưa tối ưu về chi phí & độ trễ.** Hiện tại vẫn đang dùng parser cục bộ kết hợp API worker truyền thống. Cần tích hợp WebSocket stream trực tiếp sang Gemini Flash Live hoặc mô hình phân loại nhãn để đạt độ trễ _split-second_.

|
| **Cơ chế Chiến đấu** | `src/combat/FightMode.js`<br><br>

<br>`src/combat/AttackDefenseMatrix.js`<br><br>

<br>`src/combat/CombatRules.js`<br> | **Quá phức tạp.** Đang cố gắng tính toán ma trận tương khắc phức tạp trong khi trải nghiệm cơ bản (di chuyển, đấm, né, whiff, punish) chưa mang lại phản hồi trực quan đã mắt.

|

---

## 7. Kế Hoạch Triển Khai Kỹ Thuật Chi Tiết (Actionable Roadmap)

> Roadmap chuẩn hiện tại đã được chuẩn hóa và mở rộng tại `docs/IMPLEMENTATION_PLAN.md`. Phần dưới giữ lại roadmap mentor ban đầu để truy nguyên ý tưởng, không dùng làm thứ tự task duy nhất.

Để thoát khỏi bẫy "One-Shot" và chứng minh được sản phẩm với mentor, lộ trình phát triển được phân rã thành 3 giai đoạn:

### Giai Đoạn 1: Sandbox PoC Tối Giản (Zombie / Fruit Harvest Sandbox)

- **Thời gian:** Mục tiêu hoàn thành đầu tiên.
- **Phạm vi kỹ thuật:**
- Tạo một mặt phẳng 3D đơn giản (`PlaneGeometry`), ánh sáng cơ bản.
- Đặt một Robot nhân vật chính (sử dụng model và animation Quaternius có sẵn).

- Sinh ngẫu nhiên một vài mục tiêu thụ động (cây có quả hoặc vài con Zombie di chuyển chậm chạp).

- **Mục tiêu nghiệm thu (Validation Criteria):**
- Bật micro, stream âm thanh lên hệ thống.
- Hô lệnh: _"Đi về hướng 6 giờ"_ $\rightarrow$ Robot quay đầu bước về hướng 6 giờ.
- Hô lệnh: _"Dừng lại"_ $\rightarrow$ Robot dừng lại ngay lập tức.
- Hô lệnh: _"Bắn zombie hướng 3 giờ"_ $\rightarrow$ Robot xoay nòng, xả đạn laser tiêu diệt mục tiêu và rơi vào cooldown ngắn.
- Chứng minh hoàn chỉnh luồng: **Voice $\rightarrow$ Tool Calling $\rightarrow$ Three.js Actuator Execution**.

### Giai Đoạn 2: Tích Hợp Kịch Bản Tự Động & Lệnh RTS (Attack-Move & Patrol)

- **Phạm vi kỹ thuật:**
- Trang bị cho Robot vòng lặp `ReflexScript`: Robot tự động ngắm bắn con quái ở gần nhất trong tầm quét.
- Hiện thực hóa 2 lệnh vĩ mô qua giọng nói:
- **Attack-Move:** _"Tiến lên phía trước, vừa đi vừa dọn đường"_.
- **Patrol:** _"Tuần tra giữa hai mỏm đá cho tao"_.

- **Mục tiêu nghiệm thu:**
- Robot tự động di chuyển theo lộ trình nhưng biết dừng lại xử lý mối đe dọa khi cảm biến phát hiện quái, sau đó tự tiếp tục hành trình.

### Giai Đoạn 3: Nâng Cấp Sàn Đấu Đối Kháng 3D Hoàn Chỉnh (Combat & 3 Time-Outs)

- **Phạm vi kỹ thuật:**
- Đưa 2 Robot đối kháng vào võ đài (`FightingStage.js`).

- Cài đặt 2 Archetype: Robot hạng nặng (chậm, trâu, đấm thốn) vs. Robot hạng nhẹ (cơ động, nhảy nhót, rỉa máu).
- Cài đặt hoàn thiện cơ chế **Whiff & Punish**: đấm trượt bị khựng recovery time; đối thủ phản đòn gây sát thương chí mạng.
- Kích hoạt cơ chế **3 lần Time-out**:
- Nhấn phím hoặc gọi Time-out $\rightarrow$ Game tạm dừng.

- Huấn luyện viên nói qua mic $\rightarrow$ LLM sinh `TacticPatch`.

- Gán patch vào `RobotReflexScript` $\rightarrow$ Hết Time-out, robot vào sàn đấu thể hiện ngay chiến thuật mới.
