# UmiBridge

Windows gateway for ChatGPT with a local dashboard. English by default; switch to Vietnamese with one click.

## Install

1. Download [UmiBridge-Setup.cmd](https://github.com/TDUmii/umi-bridge/releases/latest/download/UmiBridge-Setup.cmd), then double-click it.
2. Open the **UmiBridge** desktop shortcut. The tray icon runs in the background; **Exit** stops it.
3. Load `extensions/umibridge-corp` in Chrome and pair once in **Corp → Connection**. Enable **Browser control** in extension settings for page control.

Opening UmiBridge checks for updates. Local projects, pairing and settings are preserved.

## Features

- **Corp:** reusable departments, parallel work, follow-up requests and real handoff history.
- **Office:** staggered desk clusters, seats matched to staff, persistent furniture and department decor.
- **Chrome:** tabs, navigation, page reading, trusted clicks/input/keys/drag, select, scroll and screenshots in one extension.
- **Private Git:** optional source checkpoints for generated projects.
- **Arena Beta:** independent 10–100-team tournaments with scores and revision rounds.
- **Local dashboard:** models, skills, usage, appearance preview, guides and architecture map.

Browser control is opt-in. Chrome internal pages, password and file inputs require direct interaction. Page content and screenshots are not stored in request history. Tests, chat data, credentials and machine-specific files stay local.

## New in 1.8.0

Staggered office seating, aligned status badges, unified Chrome control, silent desktop launch and shorter interface copy.

---

## Tiếng Việt

UmiBridge nối ChatGPT với Windows, có dashboard local. Mặc định tiếng Anh; bấm VI để đổi tiếng Việt.

### Cài đặt

1. Tải và mở **UmiBridge-Setup.cmd** ở link trên.
2. Mở shortcut **UmiBridge** trên Desktop. App chạy ở khay Windows; chọn **Exit** để dừng.
3. Nạp `extensions/umibridge-corp` vào Chrome, ghép tại **Corp → Kết nối**. Bật **Browser control** trong extension nếu cần điều khiển trang.

App tự kiểm cập nhật khi mở, giữ dự án và cài đặt local.

### Tính năng

- **Corp:** đội ngũ tái sử dụng, làm song song, yêu cầu bổ sung, lịch sử bàn giao thật.
- **Văn phòng:** cụm bàn so le, ghế theo số người, giữ đồ đã lắp, trang trí từng phòng.
- **Chrome:** quản lý tab, đọc trang, bấm/nhập/phím/kéo thả, chọn mục, cuộn và chụp trong cùng extension.
- **Git private:** tùy chọn lưu các mốc source sản phẩm.
- **Arena Beta:** đấu độc lập 10–100 đội, chấm điểm và sửa sau mỗi vòng.
- **Dashboard local:** model, skill, token, xem trước giao diện, hướng dẫn và sơ đồ kiến trúc.

Điều khiển trình duyệt cần bật quyền. Trang nội bộ Chrome, ô mật khẩu và chọn file cần thao tác trực tiếp. Không lưu nội dung trang/ảnh chụp vào lịch sử request. Test, chat, khóa và dữ liệu riêng giữ local.

### Mới trong 1.8.0

Bàn ghế so le, dấu trạng thái đồng nhất, điều khiển Chrome tích hợp, mở Desktop ẩn và giao diện ít chữ hơn.

## Source

Windows, Node.js 22.12+: `npm ci --ignore-scripts`, then `npm start`. Check syntax with `npm run build`.

MIT. Asset licenses: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
