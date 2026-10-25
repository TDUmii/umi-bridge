# UmiBridge Sakura Console

Gateway Windows local để ChatGPT dùng công cụ file, PowerShell và desktop, kèm dashboard riêng cho desktop/laptop.

## Chạy app

Cần Windows, Node.js 22.12 trở lên, Chrome và tài khoản ChatGPT có quyền dùng Chat. Mở **UmiBridge.cmd** để cài và chạy; mở dashboard được launcher hiển thị. Giữ app chạy khi ChatGPT dùng công cụ. Cài đặt và ghép OAuth/extension theo hướng dẫn trong dashboard. Không đưa mã ghép hoặc thư mục .local-data lên mạng.

Có thể chạy gateway bằng `npm ci --ignore-scripts` rồi `npm start`. Lệnh `npm run build` kiểm cú pháp source. Cấu hình tunnel, OAuth, browser pairing và dữ liệu công việc nằm trong .local-data; runtime/dependency tự cài nằm trong .runtime, local-bin và node_modules.

## Corp

Corp có Văn phòng, Từ ý tưởng và Hàng đợi. Tạo Project mới từ ý tưởng để điều phối tám bộ phận, hoặc gửi brief vào chat đã liên kết. Chọn thư mục riêng, hồ sơ sản phẩm, mục đích và các đội kiểm thử chuyên trách khi cần. Đội tùy chọn có kiểm trước sửa và nghiệm thu sau sửa; kiểm cuối không đạt sẽ dừng bàn giao. Bật Điều phối để cho phép gửi; lưu khi tắt sẽ tạm dừng. Không tự khởi động lại lần gửi chưa xác nhận.

Văn phòng dùng trạng thái thật của Corp; hoạt cảnh nghỉ/ăn/shipper chỉ là minh họa. Xem mẫu tạo cảnh cục bộ có nhãn, không gửi công việc. Bản đồ tự vừa khung; roster và tooltip giữ tên/trạng thái dễ đọc.

## Arena

Arena độc lập với Corp, cho chọn **10–100 đội**, một giám khảo và một Project riêng. Mỗi đội tự hoàn thành sản phẩm trong thư mục/chat của mình. Sau mỗi vòng chấm, một nửa (làm tròn lên) đi tiếp để sửa theo nhận xét, đến một sản phẩm thắng. Có lịch sử, điểm từng tiêu chí, feedback và phiên bản bằng chứng. Cảnh trực tiếp hiện tối đa 20 vị trí mỗi trang; không mở đồng thời toàn bộ tab để giả đấu song song.

Khuyến cáo số đội dùng RAM/CPU của máy tại thời điểm chạy, không phải benchmark hoặc bảo đảm. AI vẫn chạy trên web, chịu hạn mức tài khoản và tốc độ mạng. Số lượng lớn cần nhiều lượt tạo chat, xây/sửa/chấm sản phẩm và thời gian. Chỉ bắt đầu sau khi tạo xong đội ngũ. Hủy/xóa danh sách giữ Project/chat và file sản phẩm.

## Model, giao diện và phân tích

Dùng extension **0.8.0** trong extensions/umibridge-corp, ghép vào địa chỉ local đang chạy. Trong Cài đặt → Model, quét picker thật của ChatGPT Trò chuyện rồi chọn model/effort đọc được. Adapter chọn và xác minh trước lượt gửi; không có lựa chọn sẽ chặn, không thay bằng lời yêu cầu trong prompt. Giữ lựa chọn hiện tại để tắt đổi model. Nạp lại extension và tab ChatGPT sau khi cập nhật extension.

Cài đặt chia tab Model, Giao diện, Kết nối, Hệ thống và Bảo trì. Có màu nhấn, mật độ, độ trong bảng và nền PNG/JPEG/WebP từ máy. Nền được thu nhỏ và lưu trong trình duyệt, không upload. Nút VI/EN đổi ngôn ngữ bằng một lần bấm.

Tổng quan hiển thị trạng thái, dự án và hoạt động thực. Phân tích có bộ lọc MCP/Corp/Arena, thời gian, ứng dụng, công cụ, token input/output, chi tiết lượt và phân tích sâu theo nguồn/nhóm/lỗi/thời gian. Token là ước tính o200k_base từ văn bản quan sát, không phải hóa đơn, số dư hoặc toàn bộ lịch sử model. Bằng chứng/report hợp lệ không đồng nghĩa tự chạy lại mọi lệnh hoặc chứng nhận chất lượng ngữ nghĩa.

## Quyền riêng tư và source

Gói source chỉ giữ file app, launcher/installer, dependency manifests, assets, giấy phép và hướng dẫn chạy. Test, QA, báo cáo kiểm tra, video, tài liệu thiết kế và dữ liệu riêng giữ local, không nằm trong source phát hành. Không lưu thông số máy hoặc tài khoản vào repo. Cập nhật bình thường không xóa dữ liệu runtime.

## Nguồn và giấy phép

App MIT. Asset và công cụ bên thứ ba xem THIRD_PARTY_NOTICES.md và license/provenance đi kèm. Quy chuẩn review viết riêng, tham khảo Playwright (microsoft/playwright), axe-core (dequelabs/axe-core), OWASP/ASVS và anthropics/skills/webapp-testing. Không có chứng nhận ASVS/accessibility tự động.

UmiBridge chỉ gửi trong **Chat thường / Trò chuyện**. Adapter chuyển và xác nhận chế độ trước khởi tạo/gửi; không dùng Work. Catalog model/effort được quét lại trên Chat thường, không dùng danh sách Work trước đó. Hạn mức nào hiện trên Chat vẫn được tôn trọng.

## Bản cập nhật 1.6.0

Corp chỉ mở bản đồ sau khi roster đã đủ. Phòng ban có ranh giới, bàn ghép đối diện, lối đi theo A*, và hoạt ảnh nhân viên mang bàn, ghế, màn hình vào lắp. Chấm trạng thái nằm góc trên trái; Sơ đồ phòng tô vùng khi rê chuột; nhân viên hiển thị tên, vai trò và nhiệm vụ thật. Đội ngũ, khách và bàn giao nằm trong tab con; trao đổi bàn giao chỉ dùng kết quả thật từ run.

Hàng đợi hiển thị khách hàng, chặng hiện tại, tiến độ và quy trình thu gọn. Giao diện có xem trước trước khi lưu. Hướng dẫn mới đi theo bước, có tìm kiếm và nút mở đúng màn hình. Dự án có lựa chọn dọn chat sau bàn giao, giữ sản phẩm và Git. Git private chỉ bật khi người dùng bật và máy đã xác thực gh; collector chặn test, dữ liệu riêng, thông tin máy, bí mật và repo public.

Gateway tự khôi phục công việc đã dở theo chat Project đã xác minh; lượt gửi không rõ chỉ đối chiếu, không tự gửi trùng. UmiBridge chạy nền cùng icon khay hệ thống, menu mở dashboard/khởi động lại/thoát, watchdog có giới hạn.

Khi xóa đã được UI xác minh hoàn tất, app bỏ liên kết chat/Project tương ứng và hủy công việc phụ thuộc; file sản phẩm, lịch sử token và Git vẫn giữ. Nếu phản hồi ChatGPT lỗi hoặc chưa đủ báo cáo, Corp dừng tại chặng với lý do cụ thể. Tự khôi phục gateway không biến lỗi phản hồi thành kết quả thành công.
