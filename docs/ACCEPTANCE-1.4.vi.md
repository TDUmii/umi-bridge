# Kiểm chứng UmiBridge 1.4.0

Ngày đối chiếu: 25/10/2026. Phạm vi: dashboard desktop/laptop, quy trình Corp và adapter model cho web ChatGPT.

| Hạng mục | Bằng chứng |
| --- | --- |
| Văn phòng | Bỏ dòng footer; scene không cuộn, tự Fit ban đầu/resize, zoom giới hạn trong khung; roster và tooltip giữ chữ rõ |
| Hoạt cảnh | 5.400 frame mô phỏng qua browser QA; không nhảy vị trí/xuyên mặt bàn trong fixture; hidden/reduced motion/scope giữ cơ chế dừng |
| Đội chuyên trách | 8 đội tùy chọn, 7 hồ sơ sản phẩm, mục đích; kiểm trước sửa và kiểm cuối bắt buộc cho từng đội |
| Lưu cấu hình | Backend kiểm idempotency/restart; bootstrap chỉ tạo đội được chọn; 2 đội thêm 2 chat và 4 bước, tổng 15 bước |
| Tương thích | 8 companyRoles nền tảng giữ contract cũ; bộ phận/roster có thể phân công thêm vai trò reviewer; workflow cũ giữ kế hoạch đã lưu |
| Model picker fixture | Quét/khôi phục ban đầu, chọn GPT-5.6 Sol/high, verify, chặn tên hoặc mức không có |
| Settings browser fixture | Lưu/reload model và effort, chọn profile/goal/đội, plan-only vô hiệu reviewer, tạo bootstrap tạm dừng; 0 request ngoài và 0 page error |
| Corp / Idea / Xem đôi | Browser fixtures desktop 1600×1000 và laptop 1366×768; gateway tạm và provider giả lập |
| Live web | Extension 0.5.0 đọc 7 model từ picker công khai của tài khoản; GPT-5.6 Sol có low/medium/high/xhigh/max; Cài đặt lưu GPT-5.6 Sol/high |
| Design detector | DEGRADED: thiếu parser, fallback regex; không coi 0 finding là chứng nhận contrast/computed CSS |

Nguồn chuẩn kiểm tra và tài liệu model: docs/REVIEW-SOURCES.vi.md. Không cài hoặc thực thi setup từ repo tham khảo; checklist UmiBridge viết riêng. API catalog không được dùng để suy diễn quyền chọn model trên web.

Cài đặt model điều khiển UI, không phải model ghi trong prompt. Catalog chỉ nhận tên/mức đã được extension báo từ picker; trước gửi mới, adapter chọn và verify lại. Khi đã lưu preference, adapter cũ không nhận nhiệm vụ mới. Không tìm thấy UI/mức thì chặn gửi; không tự fallback model khác. Quét khôi phục model ban đầu và không gửi chat. Kiểm live đã quét/lưu, không phát thêm nhiệm vụ thật để thử model. Chưa chứng minh routing nội bộ phía provider, billing hay một quy trình thật hoàn chỉnh bằng model đó.

Runtime kiểm cấu trúc báo cáo, đường dẫn/evidence và kết quả tự báo; không tự chạy lại mọi lệnh hay chứng nhận mọi kiểm tra ngữ nghĩa. Đội chuyên trách cuối cần PASS để bàn giao. Không có chứng nhận ASVS, accessibility đầy đủ hoặc kiểm mọi cấu hình màn hình/nhân viên.

Kết quả full regression, Windows CI của commit phát hành và checksum ZIP công khai được ghi cùng release v1.4.0. Dữ liệu riêng, browser profile, credentials, runtime và handoff không đi vào gói nguồn.
