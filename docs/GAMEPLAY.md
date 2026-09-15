# GAMEPLAY

## Ruleset v1 — Match lifecycle

- A match uses one timed round of 180 seconds.
- A fighter wins immediately by KO when the opponent reaches zero health.
- If the timer expires, the fighter with higher remaining health wins by decision.
- Equal remaining health at the timer produces a draw.
- The three tactical Time-outs are scoped to the whole match and are not refilled by the timer result.
- Reset/retry starts a new match and restores health, posture, stamina, tactics runtime and Time-out allowance.
- Replay is a local deterministic record of validated simulation inputs/events; it never calls a model or network provider.

## Combat interaction rules v2 — attack/defense

Ma trận boxing hiện tại và contract animation được mô tả tại [ATTACK_DEFENSE_MATRIX.md](ATTACK_DEFENSE_MATRIX.md). Các luật product cố định cho phiên bản này:

- Left/right là bên giải phẫu của robot thực hiện action; tất cả robot hiện dùng left-lead stance.
- High guard chỉ che head; low guard chỉ che body. Guard sai vùng chịu clean hit, không được universal chip reduction.
- High straight jab trái có thể bị parry bằng tay phải defender; cross phải bằng tay trái. Parry này không che hook, uppercut, overhand hoặc body shot.
- Slip trái/phải né head straight và uppercut; duck né head straight/hook; roll chuyên né head hook. Các defense này không tránh body shot. Overhand phải có thể né bằng slip trái, không phải slip phải/duck/roll.
- Defense chỉ có hiệu lực trong active window và khi quay về attacker; range/facing/action legality của simulation vẫn có quyền cao hơn matrix. Feint không có contact/damage/parry stun.
- Ma trận là luật boxing cách điệu có chủ đích, không cam kết mô phỏng đầy đủ boxing thực tế. Cùng một action giữ nguyên coverage giữa các robot; personality/capability thay đổi cách lựa chọn/thực hiện, không đổi nghĩa ID.
- Thay đổi luật contact dùng replay log v2; replay v1 không được âm thầm phát theo luật mới. Playbook cũ không tự bị rewrite vì đổi coverage.

## Built-in robot patterns — đợt 1

Volt Kestrel có thói quen **jab trái → cross phải**, không cancel recovery và không đảm bảo nối đòn. Pattern chỉ bắt đầu khi có cơ hội, đủ tầm/hướng/stamina, có xác suất chọn và cooldown; có thể hủy khi điều kiện thay đổi. Đây là base personality, không tự thêm/sửa playbook. Direct Command, player tactic và Blackboard vẫn giữ quyền ưu tiên theo thiết kế; simulation vẫn quyết định legality/contact. Các robot khác chưa có pattern mới trong đợt này.

Xem [ROBOT_PATTERNS.md](ROBOT_PATTERNS.md) để tra tuning, storyboard, QA scene và checklist cho animator. Fixture kiểm tra đúng/sai parry không phải bằng chứng một coaching loop hoàn chỉnh hoặc animation đã được duyệt.

## 1. Game Fantasy

Đây là một game đấu robot lấy cảm hứng từ **Real Steel**, nhưng fantasy cốt lõi không phải là điều khiển robot như một fighting game truyền thống.

Người chơi đóng vai **coach / trainer**:

- robot có khả năng tự chiến đấu;
- robot có tính cách, kỹ năng, giới hạn và playbook riêng;
- người chơi quan sát trận đấu và đọc đối thủ;
- trong lúc đánh, người chơi steer robot bằng giọng nói;
- khi cần thay đổi chiến thuật sâu, người chơi dùng một trong số ít **Time-out** để thực sự "dạy" hoặc sửa kế hoạch cho robot.

Trải nghiệm mong muốn là:

> **Robot là một fighter tự chủ. Người chơi không puppeteer từng frame; người chơi huấn luyện, coach, sửa chiến thuật và sống với hậu quả của những quyết định đó.**

---

## 2. Core Match Structure

Một trận đấu có hai mode gameplay khác nhau rõ rệt:

1. **Live Fight** — coaching trong thời gian thực.
2. **Time-out** — tactical programming / training.

Ranh giới này là một rule quan trọng của game:

```text
LIVE FIGHT
= phản ứng nhanh, steer, ưu tiên, yêu cầu hành động

TIME-OUT
= suy nghĩ sâu, tạo/sửa tactical logic
```

Người chơi có tối đa:

# **3 TIME-OUTS / MATCH**

Vì vậy việc thay đổi sâu chiến thuật là một tài nguyên hữu hạn, không phải hành động có thể spam sau mỗi tình huống.

---

# 3. The Robot Fights by Itself

Robot luôn có một **base combat AI** chạy độc lập.

Nó tự xử lý các nhiệm vụ cơ bản như:

- di chuyển;
- giữ thăng bằng;
- chọn đòn hợp lệ;
- tấn công;
- phòng thủ;
- né;
- quản lý stamina;
- recovery;
- tránh những hành động vật lý bất khả thi;
- phản ứng ở tốc độ gameplay bình thường.

Robot không đứng yên chờ command từ người chơi.

Ngay cả khi không có voice command, robot vẫn tiếp tục chiến đấu dựa trên:

```text
robot personality
+ stats / capabilities
+ base combat AI
+ tactical playbook
+ current blackboard state
```

Điều này tạo cảm giác người chơi đang **coach một fighter**, không phải điều khiển một avatar bằng giọng nói.

---

# 4. Three Gameplay Control Layers

Gameplay được tổ chức thành ba lớp can thiệp khác nhau.

```text
┌──────────────────────────────┐
│ Dynamic Tactical Scripts     │
│ kế hoạch / tactic phức tạp   │
│ chỉ sửa trong TIME-OUT       │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│ Blackboard / Working Memory  │
│ mục tiêu và ưu tiên hiện tại │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│ Fixed Local Combat AI        │
│ chọn hành động cụ thể        │
└──────────────┬───────────────┘
               ↓
          ROBOT ACTION
```

Ngoài ra, **Direct Command** có thể đi vào action-selection như một yêu cầu ưu tiên cao nhưng không tuyệt đối.

---

# 5. Live Fight — Voice Coaching

Trong Live Fight, người chơi nói tự nhiên với robot như một coach ngoài võ đài.

Voice command trong lúc trận đấu đang diễn ra **chỉ được chuyển thành**:

1. **Direct Command**; hoặc
2. **Blackboard Override**.

Live Fight **không được tạo hoặc sửa tactical script mới**.

Điều này giữ cho live gameplay nhanh, phản ứng và có áp lực.

---

## 5.1 Direct Command

Direct Command là một yêu cầu hành động ngắn hạn.

Ví dụ:

- "Jab him!"
- "Back!"
- "Block!"
- "Dodge!"
- "Get out!"
- "Right hook!"

Về gameplay, đây là **request**, không phải guaranteed input.

Ví dụ:

```text
Player: "RIGHT HOOK!"
        ↓
Robot đang ngã ra sau
        ↓
RIGHT_HOOK hiện không khả thi
        ↓
queue ngắn / reject / chọn thời điểm hợp lệ
```

Robot không phá physics, animation state hay khả năng hiện tại chỉ để obey command.

Đây là một phần quan trọng của cảm giác "coaching a machine".

---

## 5.2 Blackboard Override

Blackboard là **working memory / current intent** của robot trong trận.

Nó chứa các ưu tiên hoặc trạng thái chiến thuật ngắn hạn như:

- aggression;
- preferred distance;
- target body part;
- guard bias;
- risk;
- tempo;
- attention focus;
- move preference / avoidance;
- urgency;
- temporary tactic enable / disable.

Ví dụ:

> "Stay outside."

có thể trở thành:

```text
preferred_distance = FAR
urgency = HIGH
```

> "Watch his right."

có thể trở thành:

```text
attention.enemy_right = HIGH
guard_bias.right += 0.5
```

> "Stop jabbing."

có thể trở thành một temporary preference/avoidance chứ không rewrite chương trình chiến thuật.

Các override có thể:

- tồn tại vài giây;
- tồn tại cho tới khi bị cancel;
- giảm dần;
- hoặc bị thay bởi command mới.

Chi tiết tuning có thể thay đổi, nhưng về gameplay blackboard là **trạng thái steer ngắn hạn**, không phải nơi tạo logic phức tạp.

---

## 5.3 Live Commands Are Reactive, Not Programming

Trong Live Fight, một câu như:

> "Watch the right!"

không được bí mật biến thành:

```text
WHEN enemy throws RIGHT_HOOK
DO slip left
THEN counter body
```

Đó là một tactic mới và phải chờ Time-out.

Live commands cho phép người chơi **bù trừ**, **steer** và **phản ứng**, nhưng không permanently sửa playbook.

---

# 6. Dynamic Tactical Scripts

Blackboard một mình không đủ để biểu đạt những chiến thuật có temporal logic, branching hoặc nhiều phase.

Dynamic Tactical Script tồn tại để cho phép người chơi tạo những kế hoạch thực sự mới.

Ví dụ:

> "Bait his right hook. Back away twice, wait until he commits, slip left, then punish the body. Abort if we're near the ropes."

Tactic này có thể chứa:

- conditions;
- sequence;
- phases;
- wait-for-event;
- counters;
- timers;
- repetition;
- conditional reactions;
- temporary priorities;
- tactical goals;
- abort conditions.

Conceptually:

```text
TACTIC bait_right_hook

PHASE 1
    provoke
    give ground

TRIGGER
    enemy commits to RIGHT_HOOK

IF near ropes
    abort

RESPONSE
    slip left
    punish recovery
```

Điểm quan trọng là tactic định nghĩa **plan**, không định nghĩa physics hay animation implementation.

---

# 7. Strategy vs. Execution

Một tactic không cần nói chính xác robot phải dùng từng animation nào.

Ví dụ người chơi dạy:

> "Bait the hook and counter."

Hai robot khác nhau có thể thực hiện cùng tactic khác nhau.

### Fast technical robot

```text
jab feint
small retreat
slip
straight counter
```

### Heavy robot

```text
show open guard
absorb/glance hook
step through
body uppercut
```

Vì vậy:

```text
same strategy
+ different robot personality/capabilities
= different execution
```

Điều này cho phép tactic có thể portable giữa robot mà không làm mọi robot trở nên giống nhau.

---

# 8. Robot Personality

Robot không phải blank slate.

Mỗi robot có thể có default tendencies như:

```text
jab bias       +0.3
pressure bias  +0.4
retreat bias   -0.2
```

Một robot có thể tự nhiên:

- aggressive;
- defensive;
- technical;
- reckless;
- counter-heavy;
- pressure-oriented;
- mobile;
- patient.

Coaching không xóa personality này. Nó **steer hoặc temporarily override** nó.

Ví dụ:

> "Calm down. Stop chasing."

Robot aggressive sẽ giảm pressure, nhưng vẫn có thể cảm giác là cùng một fighter.

---

# 9. Time-out — Tactical Programming / Training

Mỗi trận có tối đa **3 Time-outs**.

Time-out là thời điểm duy nhất người chơi được:

- inspect playbook;
- tạo tactic mới;
- sửa conditions;
- sửa sequence;
- thêm / bỏ branch;
- thay priority;
- delete tactic;
- thay đổi cách tactic phản ứng;
- commit thay đổi vào robot.

Gameplay flow:

```text
observe opponent
      ↓
notice a pattern
      ↓
form a hypothesis
      ↓
spend 1 scarce Time-out
      ↓
discuss / edit tactic
      ↓
review interpretation
      ↓
commit
      ↓
resume fight
      ↓
test whether the hypothesis was right
```

Time-out vì vậy là một phần của chiến thuật trận đấu, không chỉ là pause screen.

---

# 10. Conversational Time-out Editing

Trong Time-out, người chơi được phép nói tự nhiên và chi tiết hơn nhiều so với Live Fight.

Ví dụ:

> "What do we currently do against his hook?"

Game có thể hiển thị:

```text
Right Hook Counter:
slip left → body cross
```

Người chơi:

> "That's not working because he steps away afterward. Chase with a jab instead of the cross."

Game đề xuất patch:

```diff
RIGHT_HOOK_COUNTER

  slip LEFT
- counter BODY_CROSS
+ pursue STEP
+ attack JAB
```

Người chơi review rồi **Commit**.

Điểm UX quan trọng:

> Người chơi phải có khả năng hiểu game đã diễn giải lời mình thành tactic gì trước khi commit.

Điều này biến natural-language programming thành một mechanic có chủ đích thay vì invisible magic.

---

# 11. Time-out Economy

Vì chỉ có 3 Time-outs, người chơi phải quyết định **khi nào đã đủ thông tin để commit một giả thuyết**.

Ví dụ:

- phát hiện pattern sau 30 giây;
- chưa chắc đó là pattern thật hay bait;
- có thể dùng Live Commands để thăm dò thêm;
- hoặc tiêu Time-out #1 ngay để counter nó.

Tension mong muốn:

```text
TIME-OUTS: 1
YOUR BOT: 34% HP
ENEMY:    51% HP
```

Người chơi vừa nhận ra một weakness lớn.

Time-out cuối cùng trở thành một quyết định có trọng lượng.

---

# 12. Tactical Capacity / Mental Bandwidth

Chỉ giới hạn số Time-out chưa đủ để ngăn tactic quá phức tạp.

Robot còn có **tactical capacity / mental bandwidth** giới hạn số lượng và độ phức tạp của kế hoạch nó có thể duy trì đáng tin cậy.

Ví dụ:

```text
TACTICAL MEMORY
███████░░░  7 / 10
```

Một rule đơn giản có thể cost thấp:

```text
after enemy misses heavy
→ prefer counter
```

Một sequence phức tạp hơn cost nhiều hơn:

```text
feint jab
→ wait for parry
→ attack body
```

Một tactic có branching và abort condition cost cao hơn nữa.

Điều này tạo một progression axis khác ngoài damage/HP:

```text
scrapyard brain   → ít tactical capacity
mid-tier brain    → nhiều hơn
elite brain       → giữ được nhiều tactic phức tạp hơn
```

Robot mạnh hơn không nhất thiết vì "LLM thông minh hơn", mà vì nó có thể duy trì và thực thi nhiều kế hoạch đồng thời hơn.

---

# 13. Imperfect Memory and Instruction Adherence

Robot không nhất thiết obey hoàn hảo mọi tactic.

"Forgetting" là một **gameplay mechanic**, không phải lỗi của voice model.

Một robot yếu có thể:

- quên một bước;
- bỏ một instruction;
- mất focus khi bị stun;
- thực thi không ổn định khi stamina thấp;
- bị overload khi có quá nhiều active rules.

Ví dụ concept:

```text
instruction adherence
cheap robot        55%
championship robot 96%
```

Stress có thể làm giảm adherence:

```text
normal                    × 1.0
stunned                   × 0.7
low stamina               × 0.8
too many active rules     × 0.65
```

Gameplay consequence:

> Người chơi không chỉ xây tactic tốt; họ còn phải xây tactic phù hợp với khả năng "đầu óc" của robot hiện tại.

Một tactic 5 bước hoàn hảo trên paper có thể là lựa chọn tệ cho một robot không đủ discipline hoặc bandwidth.

---

# 14. Playbook — Tactics Become Objects

Tactical scripts không chỉ là transient instructions; chúng có thể trở thành các tactic có tên trong **playbook**.

Ví dụ:

```text
High Guard Breaker
Corner Escape
Double Jab Bait
Right Hook Punish
Low-Stamina Turtle
Desperation Rush
```

Sau khi tactic được tạo và commit, robot có thể thực thi nó locally mà không cần người chơi nhắc lại toàn bộ logic.

Điều này tạo fantasy:

> Người chơi thực sự đang **training a robot fighter**, và qua thời gian robot tích lũy một repertoire do chính người chơi xây dựng.

---

# 15. Tactics Can Be Edited and Evolve

Một tactic đã học không phải immutable.

Ví dụ ban đầu:

```text
WHEN enemy HIGH_GUARD
    body jab
    body jab
    head hook
```

Sau đó đối thủ bắt đầu punish jab thứ hai.

Trong Time-out, người chơi có thể sửa:

```diff
WHEN enemy HIGH_GUARD
    body jab
-   body jab
    head hook
```

Đây là **natural-language tactical programming as gameplay**.

Người chơi không chỉ chọn perk có sẵn; họ có thể iteratively phát triển playbook theo những gì họ học được.

---

# 16. Bad Reads and Bad Programming Must Matter

Game không nên luôn biến lời người chơi thành quyết định đúng.

Người chơi có thể đọc sai đối thủ.

Ví dụ:

> "He always follows the jab with a right."

Người chơi tiêu Time-out để tạo jab-counter.

Nhưng thực ra đối thủ đang conditioning họ và lần sau tung left.

Robot trung thành với tactic sai và bị punish.

Đây là gameplay tốt.

Người chơi phải chọn:

- tiêu thêm một Time-out để sửa tactic;
- hoặc dùng Live Fight commands để temporarily compensate.

Ví dụ:

> "Ignore the jab counter!"

có thể trở thành:

```text
disable_tactic(jab_counter, temporary = true)
```

Nhưng tactic không được permanently sửa cho tới Time-out tiếp theo.

Core rule:

> **Live coaching có thể compensate cho bad programming, nhưng không permanently fix nó.**

---

# 17. Player Knowledge Can Be Wrong

Game nên tách:

```text
SYSTEM TRUTH
PLAYER HYPOTHESIS
PLAYER INSTRUCTION
```

Ví dụ hệ thống biết:

```text
enemy_right_arm_damaged = true
```

Nhưng người chơi chỉ *nghĩ*:

```text
"He always hooks after two jabs."
```

Robot có thể obey chiến thuật dựa trên giả thuyết sai của người chơi.

Điều này hỗ trợ gameplay observation và mind-game:

- pattern thật;
- bait;
- conditioning;
- false read;
- adaptation;
- counter-adaptation.

---

# 18. Base AI vs. Tactical Playbook

Robot luôn có một foundation không bị tactical script thay thế hoàn toàn.

```text
BASE COMBAT AI
├── balance
├── legal actions
├── basic defense
├── stamina management
├── movement
├── recovery
└── physical feasibility
```

Phía trên là:

```text
TACTICAL PLAYBOOK
├── counter-right-hook
├── high-guard-breaker
├── corner-pressure
└── ...
```

Và trong thời điểm hiện tại:

```text
BLACKBOARD
├── aggression
├── target
├── distance
├── guard bias
└── attention
```

Action selection conceptually dùng:

```text
base AI
+ tactical scripts
+ current blackboard
+ direct command
→ chosen action
```

Tactical programming vì vậy **modify behavior**, không thể phá các nguyên tắc vật lý cơ bản của robot.

---

# 19. Tactics Have Goals, Not Micromanaged Animation

Các tactic tốt nên có thể được mô tả ở mức tactical intent.

Ví dụ:

```text
GOAL
    make opponent overcommit

METHOD
    give ground
    appear passive
    avoid trading

TRIGGER
    opponent starts chasing aggressively

RESPONSE
    circle away
    counter recovery
```

Local combat AI quyết định:

- bước nào;
- hướng né nào;
- đòn cụ thể nào;
- timing hợp lệ nào;
- combo nào phù hợp với robot đó.

Đây là điểm cân bằng giữa:

- player creativity;
- robot autonomy;
- robot personality;
- readable gameplay.

---

# 20. Match Learning Loop

Gameplay loop đầy đủ:

```text
ROBOT FIGHTS AUTONOMOUSLY
        ↓
PLAYER OBSERVES
        ↓
PLAYER SHOUTS LIVE COACHING
        ↓
DIRECT COMMAND / BLACKBOARD OVERRIDE
        ↓
PLAYER TESTS A HYPOTHESIS
        ↓
PATTERN SEEMS IMPORTANT
        ↓
SPEND ONE OF 3 TIME-OUTS?
       ↙          ↘
     NO            YES
     ↓              ↓
keep probing     inspect playbook
with live        create / modify tactic
commands             ↓
     │            review patch
     │               ↓
     └──────────→  commit
                     ↓
                  RESUME
                     ↓
               TACTIC EXECUTES
                     ↓
           DID THE READ WORK?
              ↙             ↘
            YES              NO
             ↓                ↓
         exploit it      compensate live
                        or spend another
                           Time-out
```

---

# 21. Skill Expression

Game hỗ trợ nhiều mức kỹ năng tự nhiên.

### Beginner

> "Punch!"
>
> "Block!"
>
> "Back up!"

Chủ yếu dùng Direct Commands.

### Intermediate

> "Stay outside. Work the body. Watch his right."

Biết steer blackboard và quản lý robot trong trận.

### Expert

- quan sát lâu hơn;
- nhận ra behavioral pattern;
- phân biệt pattern thật với bait;
- tiết kiệm Time-out;
- xây tactic có trigger / branch / abort;
- hiểu personality và hạn chế của robot;
- xây playbook phù hợp với matchup;
- biết khi nào dùng Live Command để compensate thay vì rewrite.

Fantasy ở level cao:

> Người chơi nghiên cứu đối thủ, dùng một Time-out đúng lúc và rewrite một counter-strategy khiến cả trận đổi chiều.

---

# 22. What Makes the Game Distinctive

Điểm khác biệt không phải chỉ là:

> "fighting game nhưng nút bấm được thay bằng voice recognition."

Điểm khác biệt là:

```text
observe
→ hypothesize
→ coach
→ test
→ program tactic
→ robot interprets through its own personality/capability
→ tactic succeeds or fails
→ adapt
```

Người chơi vừa là:

- ringside coach;
- tactical analyst;
- robot trainer;
- playbook designer.

Robot vừa là:

- autonomous fighter;
- imperfect machine;
- character có personality;
- hệ thống có thể được dạy dần qua tactic.

---

# 23. Current Intended Rules

Đây là tập rule gameplay hiện tại sau khi áp dụng các chỉnh sửa mới hơn lên các đề xuất trước đó:

1. Robot tự chiến đấu; người chơi không điều khiển từng frame.
2. Voice là giao diện coaching chính.
3. Live Fight chỉ cho **Direct Command** và **Blackboard Override**.
4. Live Fight không được create/edit tactical logic mới.
5. Dynamic Tactical Scripts dùng để mô tả tactic phức tạp: condition, sequence, phase, trigger, branch, timer, repeat, abort, tactical goal.
6. Dynamic scripts chỉ được tạo/sửa trong **Time-out**.
7. Có tối đa **3 Time-outs mỗi match**.
8. Time-out editing là conversational và nên cho người chơi review trước khi commit.
9. Tactical script tạo plan; local combat AI quyết định execution cụ thể.
10. Robot có personality và default tendencies riêng.
11. Direct Commands là request ưu tiên cao, nhưng robot vẫn bị giới hạn bởi physical feasibility.
12. Blackboard là working memory / current intent ngắn hạn.
13. Tactical scripts tạo thành playbook có thể được sửa dần.
14. Robot có imperfect adherence / forgetting như một gameplay mechanic.
15. Robot có tactical capacity / mental bandwidth giới hạn độ phức tạp và số tactic nó duy trì được.
16. Tactical capacity có thể trở thành một progression axis của robot.
17. Player hypothesis có thể sai; game không tự sửa nó thành "truth".
18. Bad tactic có hậu quả thật.
19. Live coaching có thể temporarily compensate cho bad tactic nhưng không permanently rewrite nó.
20. Base combat AI vẫn tồn tại bên dưới và không bị tactical script thay thế hoàn toàn.
21. Cùng một tactic có thể được các robot khác nhau thực thi khác nhau theo personality/stats/capability.
22. Core skill loop là **observe → hypothesize → coach/program → test → adapt**.
23. **Match Flow & Player Agency**: Người chơi tự do chọn robot tại Lab/Hangar; màn hình VS Setup cho phép xác nhận robot [YOU] và lựa chọn đối thủ [CPU] (hoặc Random); HUD và sàn đấu 3D hiển thị rõ ràng nhận diện [YOU] (vòng sáng ground ring) và ngữ cảnh Coach; màn hình kết quả thể hiện rõ ràng VICTORY / DEFEAT theo góc nhìn người chơi và cung cấp vòng lặp Rematch, Change Opponent, Return to Lab.

---

# 24. Implementation Details That Are Not Gameplay Requirements

Một số chi tiết từng được nhắc tới có thể hữu ích cho implementation nhưng không phải bản thân gameplay fantasy, nên tài liệu này không ép buộc chúng:

- Gemini hay model/API cụ thể nào;
- Utility AI vs Behavior Tree vs GOAP vs state machine;
- event sourcing / rollback implementation;
- DSL syntax cụ thể;
- field names cụ thể trong blackboard;
- exact expiry duration của override;
- exact tactical-capacity cost numbers;
- networking / latency implementation;
- save-file representation;
- exact voice recognition stack.

Các implementation này có thể thay đổi miễn là vẫn giữ được gameplay rules ở trên.
