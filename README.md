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

Dùng extension **0.9.2** trong extensions/umibridge-corp, ghép vào địa chỉ local đang chạy. Trong Cài đặt → Model, quét picker thật của ChatGPT Trò chuyện rồi chọn model/effort đọc được. Adapter chọn và xác minh trước lượt gửi; không có lựa chọn sẽ chặn, không thay bằng lời yêu cầu trong prompt. Giữ lựa chọn hiện tại để tắt đổi model. Nạp lại extension và tab ChatGPT sau khi cập nhật extension.

Corp tự đóng tab chat thuộc Project đã quản lý sau khi gateway nhận bàn giao. Tab đang sinh phản hồi, có bản nháp hoặc lượt gửi chưa xác nhận được giữ để đối chiếu. Nhiệm vụ sẵn sàng sẽ mở lại đúng chat cũ theo giới hạn điều phối; nhánh DAG độc lập không cần giữ sẵn mọi tab bộ phận.

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


## vNext 1.7.0-next.1 - bản local thử nghiệm

Runtime sản phẩm chỉ dùng ChatGPT Web trong Trò chuyện. Không có Codex CLI/API, OpenAI API fallback, chuyển tài khoản hay vượt hạn mức. Bản source này chưa được push, publish hoặc deploy. Các flag mới mặc định **tắt**; mở source không kích hoạt task hoặc thay đổi dữ liệu Project hiện tại.

Trong Corp → Hàng đợi → Điều phối DAG có tab Sơ đồ, Bằng chứng, Bộ nhớ, Cấu hình và Tài liệu skill. Sơ đồ có dependency, worker, trạng thái thực và chi tiết lock/attempt/timeline. Arena hiển thị số lượt đang thực thi, phiên chờ và node cần kiểm chứng; số đội không phải concurrency. Phân tích có nhóm Project/task/worker/role/attempt và các chỉ số retry, dependency wait, verified/failed, provider limit. Token tiếp tục là **Estimated Tokens**, không phải số dư hoặc hóa đơn.

### Bật tính năng và tương thích

1. Tạm dừng Corp/Arena, đối chiếu các lượt đã gửi. Task chưa xác nhận không được tự gửi lại. Các node đang chờ kiểm chứng phải được xử lý hoặc hủy trước khi đổi flag.
2. Trong Cấu hình, bật `dagSchedulerEnabled`. Giao diện đồng thời chọn `workspaceLocksEnabled`, `evidenceGateEnabled`, `workerHealthEnabled`; server cũng bắt buộc nhóm bảo vệ này. Chọn giới hạn toàn cục 1–16 và giới hạn mỗi Project không vượt giới hạn toàn cục.
3. Bật tùy chọn `projectMemoryEnabled` và `capabilityRoutingEnabled` khi cần. Model/effort theo vai trò chỉ được chọn từ catalog đã quét thật trên ChatGPT Web; lựa chọn không có sẽ chặn, không đổi provider.
4. Chỉ workflow mới tạo trong chế độ DAG mới tự mở các nhánh review QA/Security/đội độc lập. Workflow cũ giữ chuỗi dependency theo thứ tự cũ, ID và attempt không đổi. Kết quả hoàn thành cũ có nhãn `legacy_completed`; không tự chuyển thành `verified`.
5. Nạp extension 0.9.2 và các tab ChatGPT để có heartbeat/progress từ DOM cùng quản lý tab Corp. Extension cũ vẫn có cơ chế acknowledge, nhưng không cung cấp đủ tín hiệu progress mới. Việc nạp extension thuộc trang quản lý extension của người dùng.

Dữ liệu task dùng schema bổ sung `taskSchema: 2`, giữ container `schema: 1` để không reset store cũ. Trước migration, Corp tạo `corp-state.json.before-v2.bak` theo chế độ không ghi đè backup. Các file mới trong thư mục state riêng: `orchestration-settings.json`, `execution-ledger.json`, `project-memory.json`, thư mục `skills/`. Không chép hoặc sửa cấu hình Codex.

### Quyền workspace và nghiệm thu

Khi bật bảo vệ, các công cụ file/PowerShell/Windows/thiết bị có quyền chung bị chặn ở Gateway và backend stdio. Worker chỉ nhận capability ngẫu nhiên theo attempt cho `scope_read_file`, `scope_write_file`, `scope_list_directory`. Capability không có trong snapshot/lịch sử công cụ; không chia sẻ nó. Đọc trả SHA-256; ghi tệp có sẵn yêu cầu hash của bản vừa đọc. Ghi mới dùng `expectedHash: null`. Mỗi reviewer chỉ được ghi báo cáo riêng; scopes ghi chồng nhau phải chờ. Đường dẫn vượt root, symlink/junction, hardlink và Git index có conflict bị từ chối. Arena contestant chỉ đọc/ghi root riêng; judge đọc các thí sinh của vòng hiện tại và chỉ ghi `judge-reports/`.

Worker báo xong tạo trạng thái `reported_complete`, không mở dependency. Chủ máy xem artifact/tiêu chí rồi duyệt kiểm chứng từng node. Engine đọc file thật, lưu hash và chạy lệnh đã duyệt bằng executable tuyệt đối + mảng argv, không thông qua shell ngầm. Arena bắt buộc ba kế hoạch riêng `build`, `test`, `run`; judge dùng kế hoạch `review`. Ví dụ JSON cho một kế hoạch: `{"executable":"<đường dẫn tuyệt đối đến node.exe>","args":["--check","src/main.mjs"]}`. Chỉ chọn lệnh đúng tiêu chí sản phẩm, không dùng syntax check để thay toàn bộ kiểm thử chức năng.

Capability là bearer credential: bên giữ khóa có quyền trong scope của attempt, không phải định danh conversation được ChatGPT chứng thực. Phần cách ly kiểm thử ở đây thuộc công cụ local và Project Memory của UmiBridge; chưa xác minh sự cách ly ngữ cảnh/memory phía ChatGPT giữa các chat cùng Project. Lệnh do chủ máy duyệt chạy bằng quyền hiện tại trên máy và **không có OS sandbox**. Không chạy lệnh do worker đưa ra mà chưa đọc/duyệt. Kiểm tra cwd không cô lập PowerShell. Bảo vệ file là kiểm soát hợp tác ở tầng công cụ; không ngăn một chương trình ngoài UmiBridge hoặc người dùng sửa đồng thời trong khe thời gian giữa kiểm tra và ghi. Source snapshot bị giới hạn 2.000 file/64 MiB, mỗi file tối đa 8 MiB; vượt giới hạn sẽ chặn kiểm chứng, không lấy mẫu để giả đạt.

Receipt lưu task/attempt/worker, lệnh, exit code, stdout/stderr có giới hạn, hash và thời gian. Lệnh hết 30 giây bị dừng, ghi timeout và không nghiệm thu; không tự chạy lại. Thay source hoặc artifact làm bằng chứng liên quan stale khi mở dependency. Báo cáo QA phát hiện lỗi có thể được chủ máy chấp nhận như **kết quả rà soát** để mở vòng sửa; exit code thất bại được giữ, không biến thành test pass. Tiêu chí artifact chỉ chứng minh tệp tồn tại/hash, không chứng nhận chất lượng ngữ nghĩa.

Lease dùng heartbeat 120 giây, stalled khi không có tiến triển 10 phút, timeout phản hồi theo loại task 20/30/45 phút. Browser kết nối, ChatGPT đang xử lý và tiến triển là tín hiệu riêng. Lease hết hạn chặn công cụ nhưng giữ lock để tránh worker cũ ghi khi task khác bắt đầu. Khôi phục theo attempt đã lưu và chỉ quan sát/reconcile; không resend khi chưa rõ ChatGPT đã nhận. Retry là thao tác thủ công, tối đa ba attempt trong chế độ mới. Hủy hoặc retry đã đối chiếu mới thu hồi capability/giải phóng lock.

### Memory và skill

Memory riêng theo Project, chỉ recall mục `approved`, tối đa 6.000 byte và 20 mục. Luồng `candidate → reviewed → approved → deprecated` do chủ máy duyệt; không tự coi kết luận worker là sự thật. Corp không recall memory Arena. Công cụ worker không có API sửa/phê duyệt memory. Skill từ thư mục ngoài chỉ là tài liệu; Import sao chép **SKILL.md** sang kho UmiBridge, không chép/chạy scripts, không ghi đè nguồn. Category/role mapping chỉ dùng skill đã bật, gói tài liệu tối đa 6.000 byte.

### Rollback

1. Tạm dừng, đối chiếu các lượt đang dở; không rollback khi task vẫn có quyền ghi hoặc một lượt chưa rõ đã gửi.
2. Nếu chỉ tắt chức năng, dùng Cấu hình để tắt các flag sau khi task đã được nghiệm thu/hủy. Dữ liệu bổ sung được giữ, không xóa sản phẩm hoặc lịch sử token.
3. Để quay về store trước migration, dừng đúng gateway của UmiBridge, sao lưu toàn bộ state hiện tại vào vị trí riêng, rồi **copy** `corp-state.json.before-v2.bak` về `corp-state.json`. Giữ backup, sản phẩm, OAuth/pairing và analytics; không reset `.local-data`.
4. Khôi phục source/extension bản 1.6.0 từ bản lưu hoặc commit local phù hợp, tắt các flag mới trước khi mở lại. Đây là thao tác bảo trì có chủ đích, không tự thực hiện khi một worker đang chạy.

Kiểm thử runtime/Gateway và UI trên fixture local không chứng minh đã chạy E2E trên tài khoản ChatGPT thật. Báo cáo QA, benchmark và ảnh kiểm tra giữ local, không thuộc source phát hành.
