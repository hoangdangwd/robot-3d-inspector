# Voice provider evaluation

**Ngày đo:** 2026-09-22  
**Quyết định:** no-go. Không thêm live streaming provider.

## Local path đã có

Web Speech (nếu mic có) hoặc ô text → `parseSandboxCommand` → validated intent. Combat và Sandbox không chờ mạng.

Đo parser trên 8 câu lệnh thật, 2000 lần, không mạng (`node scripts/sandbox-latency-report.mjs`):

| | ms |
|---|---|
| p50 | 0.022 |
| p95 | 0.065 |
| max | 0.775 |

## Cloud live (không gọi trong lần đo này)

Số từ `docs/req.md` mục 3.1, không phải hóa đơn mới:

| | OpenAI Realtime | Gemini Flash Live |
|---|---|---|
| Giá audio | ~$5.00 / giờ | ~$0.84 / giờ audio |
| Latency mentor ghi | ~300–600 ms | ~250–500 ms |

Giả định: một trận 10 phút nói thật ≈ 1/6 giờ. Gemini ~$0.14, OpenAI ~$0.83, trước khi cộng token. Browser vẫn cần WebSocket, secret phía server, và xử lý stale response.

## Vì sao no-go

Parser local nhanh hơn mức mentor ghi cho live khoảng 4 bậc (0.06 ms p95 so với ≥250 ms). Lệnh Sandbox/boxing ngắn đã có parser. Live stream thêm chi phí và một đường mạng mà game không cần để tiếp tục đánh.

Mở lại khi có lệnh tự do dài mà parser từ chối và người chơi chấp nhận trả ~$0.84/giờ audio. Khi đó mới làm Task 9.2.

