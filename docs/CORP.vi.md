# Corp trong UmiBridge

Corp từ beta.23 nằm ngay trong dashboard UmiBridge. Tính năng không yêu cầu chạy UmiDevCorp riêng. Mỗi chat đã khai báo là một nhân viên, nhận việc và chuyển kết quả theo các bước do người dùng đặt.

Chỉ hỗ trợ máy tính để bàn và laptop. Giao diện nghiệm thu ở 1600×1000 và 1366×768; không phát triển hoặc nghiệm thu điện thoại.

## Kết nối lần đầu

1. Cập nhật UmiBridge, mở dashboard tại `http://127.0.0.1:43127/admin#corp`.
2. Trong Chrome hoặc Edge, mở trang quản lý extensions, bật Developer mode và chọn Load unpacked. Chọn thư mục `extensions/umibridge-corp` trong bản giải nén UmiBridge.
3. Trong Corp, mở **Kết nối extension điều phối**, bấm **Tạo mã ghép extension** rồi **Chép mã**. Mã này khác mã kết nối MCP.
4. Bấm biểu tượng extension để mở cài đặt. Nhập địa chỉ UmiBridge local và mã ghép, chọn **Lưu và kết nối**.
5. Trong **Projects & chats**, khai báo thư mục cùng link của từng cuộc trò chuyện ChatGPT. Mở các chat đó trong trình duyệt có extension và đăng nhập bằng thao tác bình thường.

Extension có quyền truy cập loopback và ChatGPT, không đọc cookie, mật khẩu hoặc gọi API nội bộ của nhà cung cấp. Mã ghép nằm trong bộ nhớ riêng của extension; trang ChatGPT không nhận mã. **Thu hồi kết nối** vô hiệu hóa mã và tắt điều phối.

## Giao việc và bàn giao

1. Bật **Điều phối** trong Corp.
2. Nhập tên nhiệm vụ, chọn chat, vai trò và yêu cầu cho bước đầu. **Thêm bước bàn giao** để chọn chat tiếp theo, tối đa 12 bước.
3. Bấm **Lưu nhiệm vụ**, kiểm tra chuỗi bước rồi bấm **Bắt đầu** trên nhiệm vụ.
4. Corp gửi yêu cầu bước đầu. Khi adapter xác nhận câu trả lời đã kết thúc, nội dung đó được đính kèm vào yêu cầu bước tiếp theo. Không dùng nội dung câu trả lời để tự quyết định người nhận hoặc tạo thêm bước.

Tab phải mở sẵn. Corp không ghi đè bản nháp, không chen vào chat đang tạo câu trả lời, không đổi tài khoản hoặc model. Mỗi lần gửi có dấu `[UmiBridge task ...]` để xác nhận đúng lượt. Mỗi chat chỉ có một bước đang thực hiện; các chat khác có thể xử lý nhiệm vụ riêng.

**Tạm dừng** ngăn lượt gửi tiếp theo, vẫn ghi nhận kết quả của lượt đã gửi. **Điều phối: Tắt** ngăn gửi toàn bộ hàng đợi. **Hủy** kết thúc nhiệm vụ trong Corp; các thao tác đã gửi cho ChatGPT hoặc công cụ vẫn có thể đang chạy. Không dùng nút hủy như cách dừng một lệnh hệ điều hành.

## Khi hết hạn mức

Adapter đọc thông báo hạn mức của giao diện ChatGPT, không suy ra từ số token công cụ và không dùng nội dung trả lời của model làm thông báo hạn mức. Các mẫu hỗ trợ gồm:

| Thông báo | Thời gian đợi |
| --- | --- |
| `in 2h 11m` | 2 giờ 11 phút |
| `in 2h 29min` | 2 giờ 29 phút |
| `2h 37m` | 2 giờ 37 phút |
| `in 2 hours 11 minutes` | 2 giờ 11 phút |

Mốc lưu bằng thời gian tuyệt đối, cộng 15 giây dự phòng. Việc đọc lại cùng thông báo không đẩy mốc xa hơn. UI hiển thị cả đếm ngược và giờ tiếp tục. Nếu **Tự tiếp tục sau reset** bật, Corp làm mới tab đúng chat rồi kiểm tra lại trước khi gửi. Nếu giới hạn vẫn còn, mốc mới được ghi nhận và tiếp tục chờ.

Nếu yêu cầu trước đã gửi, lời nhắc tiếp tục yêu cầu kiểm tra tiến độ đã có và tránh lặp thao tác. Nếu chưa gửi, Corp gửi yêu cầu đang chờ. Không cam kết model hoặc công cụ ngoài trình duyệt thực hiện đúng một lần: khi việc gửi không xác nhận được, Corp chuyển sang **Cần kiểm tra**, không tự gửi lại. Nút **Đã kiểm tra chat - chuẩn bị thử lại** cần người dùng đối chiếu chat và xác nhận; sau đó vẫn cần bấm **Bắt đầu**.

Không đọc được thời gian reset, giao diện nhà cung cấp đổi, mất đăng nhập, không xác nhận phản hồi sau 45 phút hoặc kết quả dài hơn 48.000 ký tự: giữ công việc và yêu cầu kiểm tra. Không đoán thời điểm để thử liên tục.

## Đóng trình duyệt, ngủ máy và khởi động lại

Hàng đợi, prompt, kết quả, lựa chọn điều phối và mốc reset được ghi nguyên tử vào `.local-data/corp-state.json`. File nằm trong dữ liệu riêng, được giữ và kiểm tra digest khi chuyển Normal/Admin. Không nằm trong Git hoặc ZIP phát hành.

Corp không đánh thức Windows. Trong lúc trình duyệt, gateway bị đóng hoặc máy ngủ, không gửi việc. Khi chúng hoạt động lại, extension kết nối lại và kiểm tra mốc đã lưu. Bước chờ reset có thể tiếp tục nếu người dùng đã bật tự tiếp tục và nhiệm vụ chưa tạm dừng. Bước gửi chưa xác nhận không tự phát lại sau restart. Extension kiểm tra thường xuyên khi đang hoạt động; trình duyệt có thể giãn nhịp nền khoảng 30 giây hoặc lâu hơn.

## Văn phòng hoạt ảnh

**Văn phòng: Bật/Tắt** chỉ đổi phần hiển thị, không đổi quyền điều phối. Lựa chọn được nhớ trên gateway. Nhân viên gõ phím khi đang gửi; ngồi chờ khi đợi phản hồi hoặc reset; đọc kết quả khi hoàn tất; đi đưa hồ sơ khi có sự kiện bàn giao thật. Sự kiện cũ không phát lại khi mở lại màn hình. **Giảm chuyển động** tắt chuyển động, vẫn giữ trạng thái và danh sách.

Trạng thái “Chờ phản hồi” không chứng minh model đang suy nghĩ. Hình Pixel Agents dùng theo MIT; xem `scripts/corp-office/assets/provenance.json` và `THIRD_PARTY_NOTICES.md`.

## Giới hạn nghiệm thu beta.23

- Kiểm thử trên một máy Windows hiện tại. Không xác nhận máy vật lý thứ hai hoặc thiết bị di động.
- Kiểm thử extension thật trong Edge với các trang ChatGPT giả lập: gửi một lần, nhận kết quả, bàn giao, chờ reset và tự tiếp tục, giữ bản nháp, công tắc nhớ lựa chọn.
- Kiểm thử thời gian dùng đồng hồ giả lập; chưa chờ hết hạn mức tài khoản thật trong 2-3 giờ. Không tuyên bố mọi biến thể giao diện hoặc thông báo ChatGPT đều đã được xác nhận.
- Source đã kiểm tra API local, CSRF, mã ghép, khôi phục, deadline và migration. Bản Administrator cần cập nhật qua lifecycle có xác nhận Windows; không chép đè mã vào thư mục được bảo vệ.

## Kiểm tra lại

```powershell
npm run build
npm run local:test
# Dùng Playwright đã cài, không thêm dependency chạy ứng dụng:
$env:PLAYWRIGHT_MODULE = 'duong-dan-toi-playwright'
npm run corp:qa
```

Browser QA chỉ dùng state tạm và dữ liệu minh họa. Không gửi yêu cầu đến nhà cung cấp thật.
