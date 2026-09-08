# Robot 3D Inspector

Ứng dụng web Three.js để xem mô hình robot 3D, kiểm tra rig và phát các animation chiến đấu trong một đấu trường tương tác.

## Tính năng

- Chuyển đổi giữa 3 mô hình robot GLB có animation.
- Phát, tạm dừng, tua và chuyển từng frame animation.
- Điều chỉnh tốc độ, chế độ lặp và in-place.
- Camera orbit/turntable để quan sát mô hình 360°.
- Kéo thả file GLB cục bộ để kiểm tra nhanh.
- Hiển thị thông số mesh, material, texture, bone và animation.

## Chạy dự án

Yêu cầu Node.js phiên bản tương thích với Vite 8.

```bash
npm install
npm run dev
```

Mở địa chỉ Vite hiển thị trong terminal, mặc định là `http://localhost:5173`.

## Build production

```bash
npm run build
npm run preview
```

## Cấu trúc chính

```text
public/animated/   Các mô hình GLB dùng lúc chạy
src/arena/         Đấu trường, ánh sáng và hiệu ứng môi trường
src/audio/         Âm thanh tổng hợp bằng Web Audio API
src/camera/        Điều khiển camera
src/combat/        Trình phát và xử lý animation của robot
src/loaders/       Nạp và phân tích mô hình GLB
src/ui/            HUD và stylesheet
```
