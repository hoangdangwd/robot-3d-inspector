Dưới đây là tài liệu tổng hợp thiết kế toàn bộ hệ thống gameplay (Game Design Document tóm lược) dựa trên các ý tưởng đã thống nhất:

```markdown
# TÀI LIỆU THIẾT KẾ: HỆ THỐNG HUẤN LUYỆN & CHIẾN ĐẤU ROBOT (BOXING COACH AI)

---

## 1. TỔNG QUAN Ý TƯỞNG CỐT LÕI

* **Tầm nhìn (Core Fantasy):** Người chơi không trực tiếp điều khiển nhân vật qua tay cầm, mà đóng vai trò huấn luyện viên (Cornerman / Coach) ra lệnh cho một cỗ máy chiến đấu bằng ngôn ngữ tự nhiên.
* **Nguyên lý cốt lõi:** *"Lệnh động, nhưng thực thi tĩnh" (Dynamic script, deterministic implementation)*. LLM (Gemini) đóng vai trò bộ não lập chiến thuật, tuyệt đối không can thiệp sâu vào engine vật lý, hitbox, animation hay cơ chế tính toán sát thương.

---

## 2. KIẾN TRÚC 3 TẦNG (THREE-LAYER ARCHITECTURE)

Hệ thống điều khiển robot được chia làm 3 lớp độc lập:


```

┌────────────────────────────────────────────────────────┐
│ TẦNG 1: DYNAMIC TACTICAL PROGRAMS (Tập lệnh chiến thuật)│
│ "Nhử đòn móc phải → né trái → đánh vào sườn"           │
└───────────────────────────┬────────────────────────────┘
│ (Biến đổi / Kích hoạt)
▼
┌────────────────────────────────────────────────────────┐
│ TẦNG 2: BLACKBOARD / WORKING MEMORY (Bộ nhớ trạng thái) │
│ aggression: 0.8, distance: CLOSE, guard_right: HIGH   │
└───────────────────────────┬────────────────────────────┘
│ (Tham số hóa)
▼
┌────────────────────────────────────────────────────────┐
│ TẦNG 3: FIXED COMBAT AI (AI nền tảng / Bản năng máy)   │
│ Utility AI / Hành vi cơ bản / Quản lý thể lực / Hoạt cảnh│
└────────────────────────────────────────────────────────┘

```

* **Fixed Combat AI (AI nền):** Cung cấp các hành vi bản năng: giữ thăng bằng, duy trì khoảng cách tối thiểu, không đi vào góc kẹt, quản lý stamina, xử lý va chạm và hoạt ảnh đòn đánh.
* **Blackboard (Bảng trạng thái):** Bộ nhớ ngắn hạn lưu các biến số số học (độ hung hãn, cự ly ưu tiên, hướng thủ, tiêu điểm chú ý).
* **Dynamic Scripts (Kịch bản chiến thuật):** Các chuỗi điều kiện thời gian và phản xạ phức tạp, được viết bằng ngôn ngữ nội bộ (Combat DSL).

---

## 3. COMBAT DSL (DOMAIN-SPECIFIC LANGUAGE)

Để đảm bảo an toàn cho rollback netcode và chống lỗi tràn dữ liệu, LLM chỉ được biên dịch lệnh của người chơi thành một tập DSL giới hạn.

### Cú pháp ví dụ
```dsl
STRATEGY bait_and_punish {
    CONDITIONS:
        distance == MID
        stamina > 0.40

    SEQUENCE:
        DO feint(JAB)
        WAIT enemy.state == WINDUP(RIGHT_HOOK) TIMEOUT 2.0s
        DO slip(LEFT)
        WAIT enemy.state == RECOVERY
        DO attack(BODY_CROSS)

    ABORT_IF:
        near_ropes == TRUE
        enemy.break_distance == TRUE
}

```

### Giới hạn can thiệp của DSL

| Cho phép kiểm soát | Nghiêm cấm can thiệp |
| --- | --- |
| Trình tự các hành động (Sequence, Feint) | Vật lý, trọng lượng, tốc độ rơi |
| Điều kiện rẽ nhánh (If/Else, Abort) | Hitbox, Hurtbox, Frame data đòn đánh |
| Bộ hẹn giờ, độ trễ phản hồi (Timers, Delays) | Tỉ lệ tính toán sát thương trực tiếp |
| Thiết lập các biến Blackboard | Can thiệp bộ nhớ engine ngoài DSL |

---

## 4. VÒNG LẶP CHIẾN ĐẤU & CƠ CHẾ TIME-OUT

Tách biệt hoàn toàn hai hoạt động: **Coaching tức thời** và **Lập trình chiến thuật**.

```
                TRẬN ĐẤU (MATCH)
  ┌───────────────────────────────────────────┐
  │ 1. TRONG TRẬN (LIVE FIGHT)                │
  │    - Hét lệnh trực tiếp (Direct Command)  │
  │    - Chỉnh tham số Blackboard tạm thời   │
  │    - Bật/tắt các chiến thuật đã có        │
  │    - KHÔNG tạo hoặc viết lại logic mới     │
  └─────────────────────┬─────────────────────┘
                        │
                  HẾT HIỆP / TIME-OUT
               (Tối đa 3 lần / trận)
                        │
                        ▼
  ┌───────────────────────────────────────────┐
  │ 2. CHỈNH SỬA CHIẾN THUẬT (TACTICAL EDIT)   │
  │    - Phân tích telemetry đối thủ          │
  │    - Hội thoại tự nhiên với robot         │
  │    - Viết lại/xóa/thay nhánh kịch bản DSL │
  │    - Hiển thị diff (xác nhận thay đổi)    │
  └───────────────────────────────────────────┘

```

### Trận đấu trực tiếp (Live Combat)

* **Lệnh tức thì:** "Đấm móc đi!" $\rightarrow$ Gửi yêu cầu `request_action(RIGHT_HOOK)`. Nếu robot đang mất đà, AI nền sẽ từ chối hoặc hoãn lại.
* **Ghi đè Blackboard:** "Áp sát vào!", "Để ý tay phải!" $\rightarrow$ Đẩy `preferred_distance = CLOSE` hoặc `guard_bias.right = +0.5` trong 5–8 giây.
* **Ứng biến sai lầm:** Nếu chiến thuật cũ bị bắt bài, chỉ có thể ra lệnh: *"Bỏ bài né đòn đi!"* $\rightarrow$ Tạm thời vô hiệu hóa kịch bản đó mà không thể sửa mã logic.

### Quản lý Time-out (3 lần/trận)

* Người chơi quan sát quy luật của đối thủ trong hiệp đấu.
* Dùng 1 lượt Time-out để trò chuyện:
> **Người chơi:** *"Nó hay né đòn tay phải rồi phản đòn móc trái. Lần tới hãy nhử tay phải, lùi nửa bước né cú móc rồi thúc uppercut."*


* LLM dịch thành bản vá DSL, giao diện hiển thị bảng so sánh (Diff view).
* Xác nhận xong, chiến thuật mới được lưu vào Playbook cho phần còn lại của trận.

---

## 5. HỆ THỐNG PHÁT TRIỂN & TIẾN TRÌNH ROBOT

### Dung lượng bộ nhớ chiến thuật (Tactical Memory Budget)

Tránh việc người chơi yêu cầu LLM viết một siêu thuật toán xử lý mọi tình huống bằng giới hạn phần cứng (CPU):

* **CPU Ve chai (Scrapyard):** 5 ô nhớ (Slots).
* **CPU Tầm trung (Mid-tier):** 9 ô nhớ.
* **CPU Quân sự (Military):** 14 ô nhớ.

*Chi phí ô nhớ:*

* Điều kiện đơn (1 ô): `AFTER enemy_miss_heavy -> counter`
* Chuỗi đòn combo (2 ô): `feint -> wait -> strike`
* Cấu trúc rẽ nhánh phức tạp (3–4 ô): `bait -> branch_left/right -> counter -> abort`

### Cá tính robot (Robot Personality & Archetypes)

Cùng một kịch bản DSL, các dòng robot khác nhau sẽ biên dịch hành động vật lý khác nhau thông qua AI nền:

* **Robot Tốc độ (Out-boxer):** Lệnh `bait()` chọn cách nhấp nhả khoảng cách, lùi nhanh và phản đòn thẳng dài.
* **Robot Hạng nặng (Brawler):** Lệnh `bait()` chọn giơ kín tay chịu đòn một phần, bước chếch góc và tung đòn xúc cực nặng vào thân.

### Cơ chế trí nhớ & Quên bài (Bandwidth & Degradation)

* Robot giá rẻ có chỉ số `Mental Bandwidth` thấp. Khi bị áp lực, dính đòn choáng (Stun), hoặc khi người chơi nhồi nhét quá nhiều chiến thuật, robot có thể bỏ qua một bước trong chuỗi lệnh (ví dụ: nhử đòn, lùi bước... nhưng quên né mà lao vào ăn đòn).

### Sổ tay chiến thuật (The Playbook)

* Sau mỗi trận đấu, các kịch bản DSL hiệu quả có thể được đặt tên (ví dụ: *"High Guard Breaker"*, *"Anti-Hook Step"*) và lưu vào thư viện dữ liệu của người chơi để trang bị cho các trận đấu tiếp theo.

---

## 6. THANG TRÌNH ĐỘ NGƯỜI CHƠI (PLAYER MASTERY)

* **Sơ cấp:** Hét lệnh phản xạ trong trận (*"Đấm đi!", "Thủ lại!", "Lùi ra!"*).
* **Trung cấp:** Kiểm soát nhịp độ qua Blackboard (*"Đánh vào bụng", "Giữ cự ly xa", "Cẩn thận bên trái"*).
* **Cao cấp:** Dành 1 phút quan sát nhịp đối thủ, bấm Time-out và biên soạn một kịch bản bẫy đòn chính xác để lật ngược thế cờ.

```

```