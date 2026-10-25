# Nghiệm thu UmiBridge 1.1.0

Ngày kiểm tra: 25/10/2026, Asia/Saigon. Phạm vi Windows desktop/laptop, 1600×1000 và 1366×768. Không phát triển hoặc nghiệm thu màn hình di động.

## Luồng Arena độc lập

Arena có route, state, công tắc và Project riêng. Tạo 20 chat thí sinh với thư mục riêng và một chat giám khảo, không dùng đội Corp. API chặn sử dụng Project Corp cho Arena và chặn đăng ký Project/chat Arena vào Corp theo chiều ngược lại. Lưu và khởi tạo không tự bắt đầu phát triển sản phẩm.

Fixture runtime đi hết năm vòng 20, 10, 5, 3, 2 thí sinh và còn một quán quân. Gồm 20 lượt tạo sản phẩm, 20 lượt cải tiến và 5 lượt giám khảo. Mỗi người đi tiếp thay đổi source theo phản hồi, có build/test/run report và phiên bản mới trước lần chấm sau. Quán quân giữ 5 phiên bản. Các phiên bản có manifest, bản sao tệp và SHA-256; thay source/bằng chứng đã chấp nhận, báo cáo thiếu tiêu chí, sai tổng hoặc sản phẩm đi tiếp chưa đạt đều bị chặn.

Kiểm tra phục hồi bao gồm restart, nhận báo cáo hoàn tất đến muộn, giữ tạm dừng sau phục hồi, không gửi lại khi chưa đối chiếu và chỉ tiếp tục sau Bắt đầu thủ công. Lỗi ghi state dọn đúng thư mục/tệp do lần tạo sở hữu.

## Browser và API

- Browser fixture Arena đạt điều hướng chính riêng, 3 tab Corp cũ, bật/tắt độc lập, 20 ứng viên và một giám khảo, đủ rubric/feedback, phiên bản, lịch sử, giữ tab/vòng/disclosure/focus sau polling, idempotency, khóa form và chọn thư mục. Không page error hoặc request ra ngoài fixture.
- Adapter 0.4.0 kiểm tra hai kênh tuần tự, đúng Project/chat/role/tab/attempt, outbox sau restart, authorize trước điền và trước gửi, giữ bản nháp và tạo Project Arena mới dù tên trùng. Reset generation xóa metadata điều phối cũ của extension, giữ mã ghép và cài đặt. Kiểm tra dùng worker mô phỏng và trang provider giả lập.
- Corp browser QA dùng extension thật trong Edge với provider giả lập, kiểm tra discovery/pagination, scope, Office/đội ngũ, gửi một lần, bàn giao, quota reset/resume và giữ bản nháp. Arena không trở thành nhân viên/nhiệm vụ Corp.
- API giữ local-admin, CSRF và bearer guards. Adapter dưới 0.4 không nhận lệnh Arena. Ghép/thu hồi browser credential dùng chung; điều phối hai module vẫn độc lập. Analytics có nguồn Arena riêng.

## Làm mới dữ liệu và token

Năm store được làm sạch bằng utility có kiểm tra root, gateway đã dừng, launcher lock, staging và rollback khi ghi lỗi. Request history rỗng; numeric archive giữ token totals, thời gian, trạng thái và nhãn thống kê an toàn. Workspace/chat, Corp task/team/setup/Arena cũ và workflow rỗng. Audit so sánh totals/time series qua các khoảng thời gian, nguồn và múi giờ trước/sau. Bản reset lần tiếp theo không nhân đôi số đo đã lưu.

Đã kiểm tra thực tế tại máy local: request/workspace/task rỗng, Analytics giữ nguyên tổng token; extension 0.4.0 đã kết nối. Các giá trị token và tên/URL Project riêng của tài khoản không nằm trong source hoặc ZIP phát hành. Project/chat remote chỉ được xóa qua yêu cầu và xác nhận riêng của chủ tài khoản.

## Build và hồi quy

`npm run build`, runtime/API tests, reset/archive tests, kiểm tra migration Normal/Administrator và browser fixtures là các bước chốt source. Kết quả đầy đủ của đúng commit phát hành được ghi trên GitHub Actions và release 1.1.0. Source ZIP lấy từ commit, không đóng gói runtime/profile/credential/handoff/ảnh QA; checksum ZIP công khai được đối chiếu với bản local.

## Giới hạn bằng chứng

Fixture chứng minh luồng và các cổng kiểm tra, không chứng minh 20 sản phẩm đã được xây bằng LLM thật. Gateway kiểm tra báo cáo/tệp/hash, không tự chạy lại lệnh build/test/run hoặc chứng nhận chất lượng sản phẩm. Model thực được chọn trong ChatGPT UI chưa được adapter xác minh. Chat và thư mục riêng không tạo sandbox hệ điều hành hoặc chứng nhận cách ly Project memory của nhà cung cấp. Chưa chờ một chu kỳ hạn mức thật hoặc kiểm tra mọi biến thể ChatGPT UI.
