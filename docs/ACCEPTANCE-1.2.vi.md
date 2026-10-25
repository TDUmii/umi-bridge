# Nghiệm thu UmiBridge 1.2.0

Ngày lập: 25/10/2026, Asia/Saigon. Phạm vi Windows desktop/laptop tại 1600×1000 và 1366×768. Build, hồi quy và các fixture trình duyệt của source cuối đã đạt. ZIP và đối chiếu phát hành remote còn chờ kiểm tra; không lấy kết quả phát hành cũ làm kết quả của 1.2.0.

## Hạng mục cần chốt

| Hạng mục | Kết quả trên source cuối | Bằng chứng / giới hạn |
| --- | --- | --- |
| Syntax build | PASS | npm run build đạt trên source cuối. |
| Full local regression | PASS 151/151 | 0 fail, 0 cancel, 0 skip; thời gian 400.600 ms. |
| Arena rubric v2 | PASS | Runtime/API và arena:qa xác nhận 7 tiêu chí, tổng 100; thiếu tiêu chí, sai tổng hoặc vượt max bị chặn. |
| Arena legacy v1 | PASS | Giữ thang 35/15/20/15/15, decision/history và queued prompt; bảng điểm dùng rubric riêng. |
| Corp direct brief | PASS | corp:qa đạt 8 trường hợp direct brief và hidden; đúng scope, pause/start, draft, run ID và requestKey. Có ảnh form desktop/laptop. |
| Manual run idempotency | PASS | Cùng key/input trả run cũ qua restart; khác input báo conflict. |
| Corp Idea acceptance | PASS | Common prompt đủ dimensions; corp:idea:qa đạt 1 Project, 8 chat, 13 lượt workflow và 2 vòng sửa bằng provider fixture. |
| Arena renderer | PASS | arena:qa đạt 20 vị trí, judge, 7 tiêu chí, giữ tab/vòng/focus. Thanh tiến độ/lộ trình đứng trước trang trí; chữ trạng thái 11px. |
| Corp office | PASS | corp:qa đạt room/theme, roster, tooltip, zoom/Fit, expansion, hidden/reduced motion và bàn giao; watch:qa đạt compact roster overlay và Fit ban đầu. |
| Xem đôi | PASS | watch:qa đạt selectors, focus/Escape, hidden/reduced motion, Office switch, baseline và Fit; 0 POST, 0 request remote, 0 page error trong fixture. |
| Browser adapter | PASS | arena:adapter:qa đạt bằng fixture: hai kênh, auth/scope/outbox và giữ bản nháp. Extension 0.4.0 thực đang connected/paired. |
| Live local runtime | PASS trong phạm vi quan sát | Health đạt; watch assets HTTP 200; 20 vị trí Arena, data-running=false, Corp thực có 0 agents; 0 page error. Arena hiện có đã cancelled, không khởi chạy giải thật. |
| Source ZIP/privacy | PASS preflight | ZIP từ Git index có 154 mục, không private state/profile/log/credential/handoff; build bản giải nén đạt. ZIP phát hành cuối lấy từ commit, checksum ghi trong SHA256SUMS-1.2.0.txt. |
| Remote release parity | Đối chiếu khi phát hành | Kết quả của commit/tag v1.2.0 được ghi trong GitHub Actions và release v1.2.0; SHA-256 tài sản công khai đối chiếu với ZIP local trước bàn giao. |

## Tiêu chuẩn chấm được lưu theo Arena

Arena mới dùng rubric v2: yêu cầu/chức năng 30, UX/khả năng tiếp cận 15, kiểm thử/bằng chứng 20, bảo mật 10, hiệu năng/độ ổn định 10, khả năng bảo trì 5 và local/tài liệu 10. Công bằng là quy tắc dùng cùng dữ liệu, mức kiểm tra và chuẩn bằng chứng cho mọi thí sinh. Arena đã có trước cập nhật giữ rubric v1; không viết lại điểm, lịch sử hoặc prompt giám khảo đang chờ.

## Phạm vi bằng chứng

Focused backend checks trong lúc phát triển đạt 26/26; full regression source cuối đạt 151/151. Browser fixtures ghi trong bảng dùng state tạm và dữ liệu minh họa. Kiểm tra live local xác nhận gateway, assets và UI/state thật ở trạng thái không chạy giải; không ghi ID hoặc prompt riêng vào tài liệu.

Review correctness trong phạm vi thay đổi: SHIP. Hai finding về rubric legacy và visibility pane đã sửa; rubric lấy từ Arena đang chọn, pane bị che dừng motion và thiết lập lại baseline. ZIP/privacy và parity remote vẫn chờ kết quả riêng.

Fixture runtime/browser không chứng minh giải thật đã xây, sửa và chấm 20 sản phẩm bằng tài khoản ChatGPT. Gateway kiểm tra báo cáo, tệp và hash; không tự chạy lại toàn bộ lệnh build/test/run và không chứng nhận chất lượng ngữ nghĩa. Model thực, Project memory và hạn mức nhà cung cấp cần bằng chứng riêng. Thư mục/chat riêng không phải sandbox hệ điều hành. Không xác nhận máy vật lý thứ hai, di động, mọi biến thể ChatGPT UI hoặc một chu kỳ hạn mức thật nếu chưa kiểm tra.

Các biên bản 1.0.0 và 1.1.0 giữ nguyên làm lịch sử của bản tương ứng.
