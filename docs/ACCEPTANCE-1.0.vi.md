# Nghiệm thu UmiBridge 1.0.0

Ngày cập nhật: 25/10/2026, Asia/Saigon. Phạm vi chính: một máy Windows hiện tại, màn hình desktop/laptop. Giữ dữ liệu nhiệm vụ, chat, ảnh và log thực trong vùng riêng; tài liệu công khai chỉ ghi kết luận tổng hợp.

**Kiểm thử source cuối trên Windows đạt.** Các thay đổi stable 1.0.0, Từ ý tưởng và Arena được chốt cùng nhau. Kết quả dưới đây thuộc source có đủ hai thể thức Arena. Trạng thái CI của commit phát hành và SHA-256 của ZIP được công bố riêng trên GitHub Actions và Releases.

## Kết quả kiểm tra source cuối

| Phần | Kết quả |
| --- | --- |
| Syntax build | `npm run build` đạt, kiểm tra cú pháp gateway/runtime/dashboard/extension. |
| Regression Windows | `npm run local:test`: 119/119 đạt, 0 fail/cancel/skip; thời gian 375,9 giây. |
| Arena runtime | Cả `group_knockout` và `knockout` chạy đủ 20/50/100 ứng viên bằng phản hồi giả lập. Xác minh quán quân, rubric, xếp hạng và ghép chéo bảng, hòa điểm, lịch sử vượt 200 trận, migration/restart, pause/retry/quota và scope. |
| Browser Arena | Edge thật, gateway/profile tạm và API Corp giả lập, không dùng extension/tài khoản thật. Đạt 4 tab chính, 5 view Arena, keyboard/reload/poll giữ lựa chọn và báo cáo, bảng xếp hạng, sơ đồ, lịch sử/lọc, đủ 5 tiêu chí và thang điểm, lỗi tạo/thử lại, animation và giảm chuyển động. Không pageerror hoặc request ra ngoài. |
| Browser Corp/Idea | Extension thật trên provider giả lập đạt discovery/pagination, gửi đúng một lần, handoff, quota/reset/resume, giữ draft và scope. Kịch bản Từ ý tưởng tạo 1 Project + 8 chat, chạy 13 lượt có thêm sửa lỗi và bàn giao hoàn tất. Cả hai không có request ra ngoài fixture. Không dùng nội dung giả lập để chứng nhận sản phẩm thật. |
| Reflow màn hình hẹp | Đạt 1600×1000, 1366×768 và sanity 390×844, không tràn trang. Bảng/sơ đồ có vùng cuộn riêng. Không chứng nhận điện thoại vật lý. |
| Runtime local | Dashboard trả HTTP 200, form có thể chọn thể thức, extension 0.3.0 vẫn paired. Điều phối giữ tắt; không có run/bootstrap/Arena thật đang chạy. |
| Release artifact | ZIP tạo bằng `git archive` từ commit phát hành, không đóng gói working directory. Loại handoff riêng, runtime, profile, credential, log và ảnh QA. Đối chiếu tag/commit, CI và checksum công khai tại GitHub Releases. |

Arena mặc định trên form là **Vòng bảng + loại trực tiếp**: bảng 5 sản phẩm, vòng tròn một lượt, 2 suất đầu mỗi bảng. Chấm 47/119/239 trận, tương ứng 267/669/1.339 lượt cơ bản cho 20/50/100 sản phẩm. Tùy chọn **Loại trực tiếp** chấm 19/49/99 trận, tương ứng 239/599/1.199 lượt. Công thức cơ bản là `11 × số sản phẩm + số trận chấm`; chưa tính vòng sửa.

Rubric có 5 tiêu chí: yêu cầu/chức năng 35, UX 15, kiểm thử/bằng chứng 20, bảo mật 15, chạy local/tài liệu 15. Vòng bảng tính 3 điểm/trận thắng, rồi xét hiệu số điểm chấm, tổng điểm chấm, thứ tự hạt giống. Kiểm tra báo cáo cần đối chiếu đủ tiêu chí, tổng điểm, checks và tệp bằng chứng không rỗng đúng scope. Các cổng báo cáo/tệp không chứng nhận độc lập rằng nội dung đúng hoặc lệnh đã chạy thành công.

## Bằng chứng có trước lần chốt này

| Phần | Bằng chứng và kết luận |
| --- | --- |
| Source trước Arena | Build và regression của các đợt trước đã đạt. Số cũ không đại diện cho source cuối có Arena; kết quả chốt ghi ở bảng trên. |
| Corp UI | Edge thật, extension thật, gateway/state tạm và trang nhà cung cấp giả lập. Kiểm tra 1600×1000 và 1366×768, không cuộn trang Corp ở laptop; zoom/fit, nhãn HTML, mở rộng/Esc và menu Project đạt. |
| Đội ngũ lớn | 24 nhân viên minh họa, tên tiếng Việt dài: thêm hàng, cuộn bản đồ, chọn nhãn bằng bàn phím; chữ giữ nguyên cỡ khi zoom. |
| Điều phối | QA giả lập kiểm tra gửi một lần, bàn giao, trạng thái streaming, reset/resume, giữ bản nháp, phạm vi Project và analytics. Không có request ra ngoài các nguồn fixture được phép. |
| Lỗi tải phản hồi | Adapter cũ có thể bàn giao placeholder “Không thể tải phản hồi này”. Gateway và extension 0.2.2 đã thêm chặn, có test cho adapter cũ và trình duyệt thật với fixture. Không đánh dấu done hoặc tạo handoff khi gặp placeholder được nhận diện. Lượt đã gửi được ghi usage lỗi/một phần. |
| Công việc thực qua Chrome | Hai chat trong cùng Project dùng connector UmiBridge. Chat lập trình tạo một web tách nền local thật; chat QA độc lập đọc source và chạy kiểm thử. Root điều phối/giám sát, không viết mã dự án con. |
| Kết quả công việc thực | Server loopback hoạt động, model U²-Net local đã tải. Chat QA ghi 16/16 smoke test đạt, PNG RGBA có alpha 0/255, batch hai ảnh và ZIP tên tiếng Việt/CRC đạt; thêm các ca đầu vào/route không hợp lệ đạt. Báo cáo riêng được lưu trong thư mục QA dự án. |
| Tạo Project thật | Extension 0.3.0 đã tạo một Project minh họa và đủ 8 chat bộ phận, đồng bộ/phân công và tạo workflow ở trạng thái tạm dừng. Đây là bằng chứng khởi tạo, không phải nghiệm thu toàn bộ chuỗi xây sản phẩm. Project/chat/tệp minh họa được giữ riêng. |

## Lỗi đã quan sát và giới hạn

Trong lần triển khai thực, ChatGPT lỗi luồng ở phản hồi cuối dù công cụ đã tạo mã và chạy test. Giám sát đã đối chiếu tệp, không phát lại bước triển khai; yêu cầu báo cáo ngắn rồi cho QA kiểm chứng độc lập. Adapter cũ đã bàn giao placeholder lỗi trong lần phục hồi. Lịch sử thực được giữ nguyên; bản sửa 1.0.0/0.2.2 bảo vệ các lần tiếp theo, không sửa lại lịch sử thành một lượt thành công hoàn toàn.

Nghiệm thu dự án con xác nhận API, inference và tệp đầu ra. Chưa xác nhận đầy đủ drag/drop, thanh so sánh và tải bằng tương tác UI; chưa đánh giá chất lượng tách nền tóc, lông hoặc vật thể trong suốt trên ảnh chụp thật. Hai ảnh tổng hợp có alpha nhị phân, chỉ chứng minh có vùng trong suốt. Không dùng kết quả này để tuyên bố dự án con đã nghiệm thu toàn bộ sản phẩm.

Reset provider dùng đồng hồ giả lập; chưa chờ một lần limit tài khoản thật 2-3 giờ. Chưa kiểm thử máy vật lý thứ hai, điện thoại hoặc mọi biến thể ChatGPT DOM. Detector typography chạy chế độ regex thiếu parser, không chứng nhận accessibility toàn sản phẩm.

Chưa chạy giải đấu 20/50/100 sản phẩm trọn vẹn bằng LLM thật hoặc nghiệm thu sản phẩm thắng từ tài khoản thật. Runtime tests và browser fixture mô phỏng nội dung phản hồi, không chứng minh model đã đọc source, chạy lệnh hoặc xây sản phẩm thực. Hoạt ảnh chỉ phản ánh trạng thái điều phối đã ghi nhận, không chứng minh hoạt động suy nghĩ của model. Điều phối tài khoản thật giữ tắt trong đợt kiểm thử; không tự khởi chạy Project minh họa.

## Chạy lại

```powershell
npm run build
npm run local:test
$env:PLAYWRIGHT_MODULE = 'duong-dan-tuyet-doi-toi-module-playwright'
npm run corp:qa
npm run corp:idea:qa
npm run corp:arena:qa
```

Browser QA tạo state tạm, không dùng thông tin tài khoản hoặc gửi đến ChatGPT thật. Ảnh/log nghiệm thu thật không nằm trong Git và ZIP.
