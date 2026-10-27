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

## New in 1.8.8

Corp rooms have richer decor and more ambient events: coffee, lounge breaks, board review, print collection, reading, plants and delivery activity.

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

### Mới trong 1.8.8

Phòng Corp có nhiều đồ hơn và nhiều hoạt cảnh hơn: uống cà phê, nghỉ ở lounge, xem bảng, lấy tài liệu, đọc sách, chăm cây và nhận giao hàng.

## Source

Windows, Node.js 22.12+: `npm ci --ignore-scripts`, then `npm start`. Check syntax with `npm run build`.

MIT. Asset licenses: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## New in 1.8.9

Arena Beta now uses six real Kenney CC0 weapon tiles. Each contestant keeps a stable weapon assignment and active turns show a distinct sword slash, thrust, saber sweep, hammer strike, shield block or axe chop. Reduced-motion and paused states stay still.

## New in 1.9.0

Settings now include a Detail level control: Low shows only actions and essential status, Medium adds progress and reasons, High keeps full evidence and logs. The choice is saved per browser and applies across Corp, Arena, queue, workflows and settings without changing execution or stored project data.

## New in 1.9.1

Corp employee hover cards now show only name and current work. Room plan highlights every room with local asset furniture and room labels; information choices open as a floating popover. Arena active turns add bounded impact dust and shield spark cues while pause and reduced motion remain static.

## New in 1.9.2

Corp hover cards now keep only status, name and current work. Seat status badges are removed from the map, the information button is gone, and the information picker opens as a vertical high-contrast popover. Office and dashboard show a small version label. Low and Medium detail settings now reduce content across Overview, Analytics, Projects & chats, Tools, Skills, Corp and Arena.

## New in 1.9.3

Corp admin now has a `Việc tiếp theo` queue drawer for each run. It lists every step, shows queued/running/waiting/blocked state and reasons, provides start/pause/retry controls, and sends follow-up work from the same admin dialog. Version remains visible in the admin footer only; the office map stays focused on people and rooms.

## New in 1.9.4

Admin version is now visible in the top bar beside language and gateway controls, so users can see it without scrolling. The office map remains version-free.

## New in 1.9.5

Project and run state migration keeps existing Corp projects visible after installing the Windows build. Private Git archive now requires a repository name in the admin UI; invalid or empty names are blocked in the browser and rejected by the gateway before any repository action.
