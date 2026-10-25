# Corp trong UmiBridge 1.2.0

Corp nằm ngay trong dashboard UmiBridge. Mỗi chat đã khai báo là một nhân viên, nhận việc và chuyển kết quả theo các bước do người dùng đặt.

Giao diện dành cho máy tính để bàn và laptop, với mốc bố cục 1600×1000 và 1366×768. Không phát triển bố cục riêng cho màn hình hẹp.

## Kết nối lần đầu

1. Cập nhật UmiBridge, mở dashboard tại `http://127.0.0.1:43127/admin#corp`.
2. Trong Chrome hoặc Edge, mở trang quản lý extensions, bật Developer mode và chọn Load unpacked. Chọn thư mục `extensions/umibridge-corp` trong bản giải nén UmiBridge.
3. Trong Corp, mở **Kết nối**, bấm **Tạo mã ghép extension** rồi **Chép mã**. Mã này khác mã kết nối MCP.
4. Bấm biểu tượng extension để mở cài đặt. Nhập địa chỉ UmiBridge local và mã ghép, chọn **Lưu và kết nối**.
5. Trong **Projects & chats**, khai báo tên, thư mục cùng link Project ChatGPT (`https://chatgpt.com/g/g-p-.../project`). Mở trang Project trong trình duyệt có extension, chọn Project trong Corp rồi **Đồng bộ chat**. Cũng có thể thêm từng link chat cũ và chọn nhóm **Chat riêng lẻ**.

Extension có quyền truy cập loopback và ChatGPT, không đọc cookie, mật khẩu hoặc gọi API nội bộ của nhà cung cấp. Mã ghép nằm trong bộ nhớ riêng của extension; trang ChatGPT không nhận mã. **Thu hồi kết nối** vô hiệu hóa mã và tắt điều phối.

## Chỉ có ý tưởng ban đầu

Mở **Corp → Từ ý tưởng**. Chọn **Tạo Project mới và 8 chat bộ phận**, nhập ý tưởng, chọn **Thư mục lưu** và bấm **Tạo Project** khi Điều phối đang bật. Extension 0.4.0 tạo Project, chuẩn bị 8 chat rồi tự phân công và chạy các chặng. Không cần thêm Project hoặc tạo chat thủ công trước. UmiBridge tạo thư mục con riêng trong vị trí đã chọn, với ý tưởng gốc trong `UMI-IDEA.md`.

**Thư mục lưu** cho phép nhập đường dẫn tuyệt đối hoặc bấm **Chọn thư mục** để duyệt ổ đĩa và thư mục ngay trong dashboard. Chọn ổ, mở thư mục con hoặc nhập đường dẫn rồi bấm **Mở**; bấm **Dùng thư mục này** để xác nhận. Thư mục tự chọn phải tồn tại và có quyền ghi; vị trí mặc định `Documents\UmiBridge Projects` được tạo tự động khi cần. **Hủy** hoặc Escape không đổi đường dẫn đang nhập. Lựa chọn được nhớ trên trình duyệt và cố định trong yêu cầu đã tạo, kể cả khi tạm dừng hoặc khởi động lại. Không di chuyển dự án cũ. Hộp chọn chỉ đọc tên thư mục, không mở nội dung tệp; mỗi lượt tối đa 500 mục, có thể nhập đường dẫn để đi tới vị trí khác.

Luồng đầy đủ: Sản phẩm làm rõ ý tưởng → Thiết kế → Điều hành chốt kế hoạch → Kỹ thuật triển khai → QA → Bảo mật → Kỹ thuật sửa → QA nghiệm thu → DevOps chạy local → Tài liệu → Điều hành bàn giao. Có tối đa một vòng sửa/QA bổ sung nếu nghiệm thu còn lỗi. Các bộ phận nhận các báo cáo trước cùng đường dẫn artifact, không chỉ phản hồi của người ngay trước.

Chọn **Chỉ làm rõ ý tưởng và lập kế hoạch** để chạy 3 chặng đầu. Bỏ **Tự bắt đầu các chặng sau khi tạo đội ngũ** nếu chỉ muốn chuẩn bị Project và chat; quy trình tạo ra sẽ tạm dừng để bạn xem trước. Với Project cũ, chọn **Dùng Project đang chọn** và kiểm tra phân công gợi ý.

Các chat cần sử dụng công cụ UmiBridge để tạo tệp hoặc chạy lệnh. Chưa có công cụ, thiếu báo cáo bắt buộc, kiểm thử cuối chưa đạt hoặc bộ phận bị chặn thì quy trình dừng và giữ bằng chứng để xử lý. Báo cáo Markdown nằm trong `.umibridge-projects/<mã quy trình>/`. Hệ thống kiểm tra cấu trúc báo cáo và các cổng đạt; kết luận chất lượng vẫn cần dựa vào bằng chứng thực mà bộ phận đã ghi.

Tiến độ tạo Project/chat được lưu sau từng bước. Khi không xác nhận được thao tác, kiểm tra tab ChatGPT rồi mới bấm **Kiểm tra và tiếp tục**. Nếu mất tab cũ, hệ thống giữ trạng thái và báo cần đối chiếu để tránh tạo trùng. Hủy không tự xóa Project, chat hoặc tệp đã tạo. Tắt Điều phối ngăn lượt tạo/gửi mới; sau khi bật lại, kiểm tra trạng thái và bấm Bắt đầu nếu đang tạm dừng.

## Gửi brief vào chat đã có

Trong tab **Từ ý tưởng**, chọn phần gửi brief trực tiếp. Chọn đúng Project/nhóm, chọn một chat đã khai báo, nhập yêu cầu rồi gửi. Luồng này tạo một nhiệm vụ một bước trong chat được chọn, không tạo Project hoặc đội ngũ mới. Khi Điều phối tắt, nhiệm vụ được lưu tạm dừng; khi bật, thao tác gửi yêu cầu bắt đầu nhiệm vụ. Theo dõi hoặc phục hồi tại **Hàng đợi**.

Trong lúc gửi, form giữ phạm vi đã chọn. Nếu phản hồi lưu nhiệm vụ bị mất, thử lại cùng bản nháp dùng lại mã yêu cầu để tìm nhiệm vụ cũ. Nếu lưu thành công nhưng chưa xác nhận bắt đầu, trạng thái giữ nhiệm vụ đã tạo; kiểm tra Hàng đợi trước khi lặp thao tác. Không suy ra gửi đúng một lần từ một thông báo UI.

Luồng **Tạo Project và đội ngũ** vẫn giữ 8 bộ phận và các chặng. Tiêu chuẩn nghiệm thu chung gồm chức năng, UX/khả năng tiếp cận, bằng chứng kiểm thử, bảo mật, hiệu năng/ổn định, khả năng bảo trì và bàn giao local có thể tái hiện. Báo cáo phải ghi phần chưa kiểm chứng hoặc không áp dụng cùng lý do; không thay kết quả thực bằng lời khẳng định.

## Arena nằm ở mục riêng

Từ UmiBridge 1.1.0, mở **Arena** trên thanh điều hướng chính. Arena có Project riêng gồm 20 chat thí sinh và 1 giám khảo, state/API/công tắc điều phối riêng; không dùng đội ngũ, Project đang chọn hay hàng đợi Corp. Corp vẫn giữ quy trình Từ ý tưởng với 8 bộ phận và các chặng hiện có. Xem [hướng dẫn Arena](ARENA.vi.md).

Corp và Arena dùng chung browser transport cùng mã ghép extension; ghép lại hoặc thu hồi kết nối ảnh hưởng kết nối trình duyệt chung. Cài extension **0.4.0**, Reload thẻ extension rồi tải lại các tab ChatGPT sau cập nhật. Bật/tắt điều phối từng module riêng.

## Giao việc và bàn giao

Chọn **Project** trước khi giao việc. Danh sách nhân viên, hàng đợi và hoạt ảnh chỉ thuộc nhóm đang chọn. Với nhiệm vụ Project, mỗi bước chọn chat con trong cùng Project; backend và extension kiểm tra lại mã Project ngay trước lần gửi. Mở chat bằng nút trong Corp để giữ URL có mã Project. Tab chat riêng `/c/...` không được nhận nhiệm vụ Project chỉ vì trùng ID.

1. Bật **Điều phối** trong Corp.
2. Bấm **Giao việc**, nhập tên nhiệm vụ, chọn chat, vai trò và yêu cầu cho bước đầu. **Thêm bước bàn giao** để chọn chat tiếp theo, tối đa 12 bước.
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

## Đồng bộ Project

Project là nhóm cha; từng chat là nhân viên. Extension 0.4.0 đọc tên và URL chat từ vùng danh sách của Project đang mở, không đọc nội dung toàn bộ chat. Link chat ở thanh bên tài khoản chỉ được nhận khi URL chứa đúng mã Project; link trần và link Project khác bị loại. Không dùng cookie hoặc API nội bộ ChatGPT.

**Đồng bộ chat** yêu cầu quét danh sách: cuộn trong vùng Project, bấm **Load more / Show more / Xem thêm / Tải thêm** nếu có, rồi trả lại vị trí cuộn. Giới hạn một lượt: 60 vòng, tối đa 1.000 chat. Danh sách còn tải hoặc quét chưa hết được đánh dấu **Đã nhận một phần**; có thể đồng bộ lại. Giao diện lạ không được xác nhận là Project trống. ChatGPT có thể cập nhật danh sách chậm sau khi tạo chat; tải lại trang Project trước khi đồng bộ nếu cần.

Quan sát một phần được gộp với danh sách đã có. Chỉ lượt quét hoàn tất mới loại chat đã rời Project; nhiệm vụ trỏ tới chat đó bị chặn, kể cả lệnh đang chờ xác nhận gửi. Đồng bộ lại sau khi chuyển/xóa chat trong ChatGPT. Mở tab **Trò chuyện** của trang Project trong Chrome để extension đọc danh sách. Từ ý tưởng có luồng tạo Project mới cùng 8 chat; đồng bộ Project có sẵn không tự thêm hoặc chuyển chat giữa các Project.

Sau khi cập nhật extension, mở trang quản lý extensions của Chrome, bấm **Reload** ở UmiBridge Corp rồi tải lại các tab ChatGPT. Bản 0.4.0 hỗ trợ Arena độc lập và giữ kiểm tra placeholder “Không thể tải phản hồi này” cùng tương đương tiếng Anh, không bàn giao chúng như kết quả. Gateway từ 1.1.0 cũng kiểm tra để bảo vệ khi adapter cũ vẫn đang hoạt động. Giữ mã ghép cũ nếu còn kết nối; không cần nạp lại từ đầu hoặc tạo connector MCP mới.

## Đóng trình duyệt, ngủ máy và khởi động lại

Hàng đợi, prompt, kết quả, lựa chọn điều phối và mốc reset được ghi nguyên tử vào `.local-data/corp-state.json`. File nằm trong dữ liệu riêng, được giữ và kiểm tra digest khi chuyển Normal/Admin. Không nằm trong Git hoặc ZIP phát hành.

Corp không đánh thức Windows. Trong lúc trình duyệt, gateway bị đóng hoặc máy ngủ, không gửi việc. Khi chúng hoạt động lại, extension kết nối lại và kiểm tra mốc đã lưu. Bước chờ reset có thể tiếp tục nếu người dùng đã bật tự tiếp tục và nhiệm vụ chưa tạm dừng. Bước gửi chưa xác nhận không tự phát lại sau restart. Extension kiểm tra thường xuyên khi đang hoạt động; trình duyệt có thể giãn nhịp nền khoảng 30 giây hoặc lâu hơn.

## Văn phòng hoạt ảnh

Tên nhân viên chỉ hiện trong tooltip khi trỏ chuột hoặc dùng Tab đến bàn. Chấm màu trước tên và dòng trạng thái cho biết tình trạng hiện tại; danh sách Đội ngũ có cùng mã màu. Esc đóng tooltip. Chọn nhân viên tại bàn hoặc trong danh sách để xem nhiệm vụ và mở chat. Tên/trạng thái, biển UMIBRIDGE / CORP và Khu chờ dùng HTML rõ nét, không bị co cùng ảnh canvas.

**Mở rộng** tạm ẩn hàng đợi và mở thêm diện tích ngang ngay trong trang. Phòng và số bàn mỗi hàng thích ứng theo chiều rộng, giữ nguyên zoom và kích thước nhân vật/nội thất. Chọn **Thu gọn** hoặc **Esc** để trở lại. **− / +** đổi zoom 75-200%; **Vừa khung** chỉ tính tỷ lệ tại lúc bấm, tối thiểu 75%. Đội đông thêm hàng bàn và cuộn riêng. Bàn giao gần đây ở cột đội ngũ; hàng đợi trống của bộ lọc hiện tại thu thành thanh dưới văn phòng. Zoom chỉ đổi hiển thị, không đổi nhiệm vụ.

**Văn phòng: Bật/Tắt** chỉ đổi phần hiển thị, không đổi quyền điều phối. Lựa chọn được nhớ trên gateway. Nhân viên gõ phím khi đang gửi; ngồi chờ khi đợi phản hồi hoặc reset; đọc kết quả khi hoàn tất; đi đưa hồ sơ khi có sự kiện bàn giao thật. Sự kiện cũ không phát lại khi mở lại màn hình. **Giảm chuyển động** tắt chuyển động, vẫn giữ trạng thái và danh sách.

Trạng thái “Chờ phản hồi” không chứng minh model đang suy nghĩ. Hình Pixel Agents dùng theo MIT; xem `scripts/corp-office/assets/provenance.json` và `THIRD_PARTY_NOTICES.md`.

## Xem đôi

Mở **Xem đôi** để quan sát văn phòng Corp và đấu trường Arena trong hai pane. Project Corp dùng cùng lựa chọn với mục Corp; Arena có selector riêng và không tham gia đội ngũ/hàng đợi Corp. **Phóng lớn** tập trung một pane, **Escape** khôi phục hai pane. Pane bị che dừng hoạt ảnh; sự kiện bàn giao cũ không phát lại khi quay về. **Văn phòng: Tắt** cũng ẩn văn phòng trong Xem đôi, không tắt điều phối.

Văn phòng trong Xem đôi dùng bố cục gọn: nút Đội ngũ mở danh sách nổi, khung tự Vừa khung một lần khi hiện đội ngũ, các lượt refresh tiếp giữ zoom đã chọn. Chế độ này đọc trạng thái sẵn có, không tạo công việc hoặc tự đổi công tắc. Mở Corp để giao việc, thay điều phối hoặc xử lý lượt cần kiểm tra. Chữ trạng thái và giảm chuyển động vẫn dùng được khi không có hoạt ảnh.

## Nghiệm thu và giới hạn

- Các bằng chứng extension/tài khoản dưới đây là lịch sử; kết quả riêng của 1.2.0 ghi tại [nghiệm thu 1.2.0](ACCEPTANCE-1.2.vi.md).
- Kiểm thử trên một máy Windows hiện tại. Không xác nhận máy vật lý thứ hai hoặc thiết bị di động.
- Kiểm thử extension thật trong Edge với các trang ChatGPT giả lập: gửi một lần, nhận kết quả, bàn giao, chờ reset và tự tiếp tục, giữ bản nháp, công tắc nhớ lựa chọn.
- Chrome thật, extension 0.2.1: đồng bộ hai chat con trong Project đã chọn, tự gửi bước đầu và nhận `UMI_CORP_PROJECT_STEP1_OK`, tự bàn giao sang chat thứ hai và nhận `UMI_CORP_PROJECT_HANDOFF_OK`. Sổ nhiệm vụ ghi đúng một handoff, cả hai bước hoàn tất. Lượt thử chỉ yêu cầu văn bản, không gọi công cụ hay sửa tệp.
- Adapter nhận cả cấu trúc `data-message-author-role` cũ và `data-chatgpt-search-unit-key` / `data-talvt-turn-state` mới, cùng ô nhập textarea và Lexical nhiều đoạn. Lượt thử đầu phát hiện khác biệt xuống dòng của Lexical và được chặn trước gửi; đã sửa, giữ kiểm tra bản nháp, rồi nghiệm thu lại thành công.
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

## Token và hạn mức

Mở **Phân tích**. Chọn nguồn **Công cụ MCP**, **Chat Corp**, **Chat Arena** hoặc tổng ba nguồn; lọc Hôm nay, 24h, 7/30/60 ngày hoặc Tất cả. Hôm nay dùng độ lệch UTC hiện tại của trình duyệt. Mục Chi tiết có tìm kiếm, lọc trạng thái/công cụ/ứng dụng và 50 lượt mỗi trang. **Xuất trang CSV** xuất đúng trang đang xem, không xuất prompt, kết quả hoặc tham số công cụ.

MCP thống kê nhật ký hiện tại và numeric archive nếu đã làm mới dữ liệu, không giới hạn 500 lượt của màn hình lịch sử cũ. Corp chỉ có dữ liệu từ beta.24, tối đa 5.000 attempt gần nhất. Lượt chưa xác nhận gửi không được tính. Một attempt chỉ ghi một lần, qua restart vẫn giữ nguyên. Xóa nhiệm vụ đã xong không xóa số liệu; thông tin số đếm tiếp tục nằm trong state riêng. Reset dự án có chủ đích sẽ trung tính hóa tên nhiệm vụ/chat ID và chuyển số liệu MCP vào token-history.jsonl; Requests rỗng nhưng Analytics giữ lịch sử số liệu. Lượt chỉ có input hoặc thiếu kết quả đánh dấu một phần. Hủy theo dõi hoặc timeout hiển thị lỗi/đã dừng, không khẳng định nhà cung cấp đã hủy xử lý.

Bộ đếm offline `o200k_base` áp dụng lên văn bản quan sát được. Không có toàn bộ lịch sử chat, reasoning, cache, hình ảnh hoặc model thực. Tổng MCP + Corp + Arena có thể trùng nội dung, không phải số token tính phí. Lượt payload quá lớn được đánh dấu không đếm; không chuyển dữ liệu nhạy cảm ra ngoài để đếm.

Tab **Hạn mức & ngân sách** hiển thị thông báo reset thực mà Corp đã ghi nhận. Không có thông báo không đồng nghĩa còn hạn mức. Giá USD/1M input-output và ngân sách cho kỳ đang lọc do bạn nhập, lưu tại trình duyệt. Cảnh báo ngân sách chỉ tham khảo, không tự dừng nhiệm vụ hoặc thay đổi gói tài khoản.

Bố cục Corp tách Văn phòng, Từ ý tưởng và Hàng đợi thành các tab cùng vùng làm việc. Bộ lọc Đang mở/Tất cả/Đã xong giảm danh sách hàng đợi. Form Giao việc nằm trong tab Hàng đợi, không phải cửa sổ chặn toàn trang. Nút Văn phòng vẫn nhớ lựa chọn độc lập với Điều phối.

## Văn phòng sinh hoạt - 1.3.0

Văn phòng chia quầy tiếp khách, pantry, bàn làm việc, góc sofa và hai nệm nghỉ. Nhân viên đang làm quay vào màn hình; người rảnh có thể đi ăn vặt hoặc trải nệm, nằm nghỉ, dậy gấp nệm rồi quay về. Shipper thỉnh thoảng giao kiện đồ tại pantry. Đây là hoạt cảnh minh họa, không tạo đơn hàng, gửi chat hay làm thay đổi tiến độ thật. Nhận nhiệm vụ mới sẽ thu dọn chỗ nghỉ và đi về bàn.

Tên khách hàng là trường tùy chọn trong tạo công việc, brief trực tiếp và Từ ý tưởng. Hàng đợi và quầy tiếp khách hiện tên khách theo Project đang chọn; công việc cũ chưa có tên sẽ ghi rõ chưa đặt tên.

Dùng **Xem mẫu** để xem tám nhân viên và ba khách minh họa khi chưa có đội ngũ. Nhãn MINH HỌA và liên kết chat bị tắt giúp phân biệt dữ liệu mẫu; **Thoát mẫu** trở về dữ liệu thật. **Sinh hoạt: Bật/Tắt** điều khiển các chuyến nghỉ mới; chuyến đang diễn ra thu dọn và trở về. **Giảm chuyển động** giữ cảnh tĩnh. **Vừa khung**, zoom 50-200% và **Mở rộng** hỗ trợ desktop/laptop, cả Xem đôi.

Kiểm hoạt cảnh có thể chạy bằng `npm run office:qa` khi PLAYWRIGHT_MODULE trỏ tới Playwright đã cài và máy có Microsoft Edge. Fixture dùng gateway tạm, không tài khoản thật. `OFFICE_CAPTURE_ANIMATION=1` xuất thêm 450 ảnh minh họa tại .impeccable/review/office-life/animation-frames.

## Đội kiểm thử tùy chọn - 1.4.0

Trong Từ ý tưởng mở **Đội kiểm thử & mục tiêu**. Chọn một trong bảy hồ sơ sản phẩm, ghi mục đích và bật đội chuyên trách cần dùng. Tám bộ phận nền tảng giữ quy trình hiện có; tám đội tùy chọn là kiến trúc, UX/tiếp cận, API/tích hợp, hiệu năng, dữ liệu, desktop, giáo dục và game. Mỗi đội có quy chuẩn hiển thị cạnh lựa chọn. Đội được chọn có lượt rà trước sửa và nghiệm thu sau sửa; kiểm cuối chưa đạt dừng quy trình. Không chọn đội thì không tạo chat/bước riêng cho đội đó. Project đã có cần phân công vai trò tương ứng. Cấu hình được ghim khi tạo và không viết lại run cũ.

## Model & mức suy nghĩ

Nạp lại extension **0.5.0** và tab ChatGPT. Mở tab ở chế độ **Công việc**, giữ ô nhập trống. Trong **Cài đặt → Model & mức suy nghĩ**, bấm **Quét từ ChatGPT**; quét đọc điều khiển công khai và khôi phục lựa chọn ban đầu. Chọn model và effort được liệt kê rồi **Lưu lựa chọn**. Áp dụng cho lượt gửi mới Corp/Arena, cả seed chat mới; không phát nhiệm vụ khi lưu/quét. **Giữ lựa chọn hiện tại** tắt việc đổi model. Nếu quét lỗi, kiểm tab Công việc và quét lại; không nhập tên model tùy ý.

Adapter chọn và xác minh lại trước gửi; không tìm thấy model/mức hoặc UI đổi thì chặn, không thay bằng model khác hay câu yêu cầu trong prompt. Đây là xác minh UI, không phải chứng nhận routing nội bộ hoặc usage billing. Phiên bản extension cũ không được nhận lệnh mới khi đang bật preference.

Văn phòng 1.4 tự vừa khung cả khi đổi kích thước; bản đồ không cuộn. Zoom được giới hạn để giữ đủ sàn; tên/trạng thái dùng roster và tooltip rõ nét. Dòng chú thích 1.3 đã bỏ, nguồn/giấy phép vẫn kèm source.
