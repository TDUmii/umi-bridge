# Kiểm chứng UmiBridge 1.3.0

Ngày kiểm tra: 25/10/2026. Phạm vi: văn phòng Corp trên desktop/laptop; dữ liệu thử tạm, không phát nhiệm vụ vào tài khoản thật.

| Kiểm tra | Kết quả |
| --- | --- |
| Syntax build | Đạt |
| Backend tập trung: Corp, Idea, bootstrap, OfficeLife | 27/27 đạt |
| Choreography Canvas | 5.400 frame trong 180 giây mô phỏng; mọi ô sprite được vẽ nằm trong atlas |
| Nguồn sprite | 6 palette × 3 hướng × 7 frame = 126 ô; kiểm ảnh alpha và kích thước nguồn |
| Hướng làm việc | Nhân viên làm việc quay vào màn hình |
| Chuyển cảnh nghỉ | Đi, trải nệm, nằm xuống, ngủ, thức, gấp nệm, đi về; ngắt khi nhận việc ở cả trải/nằm/ngủ |
| Đường đi | Fixture không nhảy vị trí, không xuyên mặt bàn; khoảng cách nhỏ nhất giữa nhân viên di chuyển 17,001 pixel logic |
| Đặt chỗ | Tối đa 2 người nghỉ, 2 nệm, 1 chỗ ăn vặt; lối đi dùng lượt FIFO |
| Cập nhật | Poll cùng roster không khởi tạo lại chuyến nghỉ; đổi phạm vi/ẩn/reduced motion dừng hoạt cảnh |
| Khách hàng | Tên hiện tại quầy/hàng đợi; brief gửi đúng tên và xóa input sau thành công; idempotency/restart/backend giữ tên |
| Xem mẫu | Nhãn MINH HỌA, 8 nhân viên/3 khách, không mở chat; thoát khôi phục snapshot thật hoặc phòng trống |
| Corp browser | Đạt 1600×1000 và 1366×768, gửi một lần, bàn giao, hạn mức, brief/retry/giữ draft |
| Corp Idea browser | Đạt: 1 Project, 8 chat, 13 lượt, thêm vòng sửa và bàn giao bằng provider giả lập |
| Xem đôi browser | Đạt: chọn riêng, phóng to/Escape, Fit, visibility, reduced motion; 0 POST/remote request/page error |
| Office browser | Đạt: 7 nhóm ảnh sự kiện, desktop/laptop, ambient off/preview/polling; 0 POST/remote request/page error |
| Design detector | DEGRADED: thiếu HTML parser modules, fallback regex trả 0 finding; không chứng minh contrast/computed CSS |

Ảnh và GIF 450 frame/45 giây được tạo local tại `.impeccable/review/office-life/`. Đã xem bố cục laptop, ngủ/shipper và bảng khung chuyển nằm/dậy/thu dọn. Kiểm số học không chứng minh mọi frame trong mọi cấu hình nhân viên đều đẹp hoặc không giao nhau. Khoảng cách trên chỉ đo nhân viên trong fixture; shipper được xem bằng ảnh riêng, chưa có kiểm collision tổng quát cho mọi vật thể. Chỗ ngồi, nệm và lối đi là hoạt cảnh 2D; không thêm pathfinder hay vật lý.

Tên khách là metadata công việc, không đưa thêm vào prompt. Sinh hoạt không đặt đơn, gửi chat, sinh sản phẩm hoặc thay đổi tiến độ thật. Arena giữ phạm vi độc lập. Browser fixture không chứng minh vòng làm việc thật trên ChatGPT hoặc model thực.

Gateway local đã khởi động lại và trả HTTP 200. Microsoft Dev Tunnel báo `Login token expired.`; dashboard hiện chạy local, cần đăng nhập lại Dev Tunnel để khôi phục ChatGPT từ xa. URL và cấu hình tunnel cũ được giữ; không thay issuer/pairing/token history.

Kết quả full regression, CI và checksum gói phát hành được ghi trong release v1.3.0 sau khi hoàn tất.
