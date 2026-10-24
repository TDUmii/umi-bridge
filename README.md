# UmiBridge Sakura Console

Cho phép ChatGPT đọc, sửa file, chạy lệnh và điều khiển giao diện Windows qua MCP, kèm dashboard local và điều khiển nhiều máy.

[Tải bản mới nhất](https://github.com/TDUmii/umi-bridge/releases/latest)

![UmiBridge Sakura Console](assets/umibridge-banner.svg)

## Cài và chạy

1. Giải nén bản phát hành vào một thư mục riêng.
2. Mở **UmiBridge.cmd**. Lần đầu launcher tự chuẩn bị Node.js, Python và bộ Windows tools, cài dependency đã khóa, kiểm tra source và tạo tunnel HTTPS cố định.
3. Nếu Microsoft Dev Tunnels yêu cầu đăng nhập, chọn GitHub một lần. Những lần sau launcher dùng lại URL, OAuth và mã kết nối đã lưu.
4. Mở `http://127.0.0.1:43127/` để vào dashboard xem trạng thái, endpoint, lịch sử lệnh, token tham chiếu, thiết bị và cài đặt. Đường dẫn `/admin` vẫn truy cập trực tiếp được.

Chỉ cần mở **UmiBridge.cmd** mỗi khi bật máy. Cửa sổ này theo dõi request; gateway và PowerShell worker chạy nền, không mở thêm terminal cho từng lệnh.

## Kết nối ChatGPT

Trong ChatGPT, thêm MCP connector bằng endpoint hiển thị ở **Dashboard → Settings**:

- Authentication: **OAuth**
- Client registration: **Dynamic (DCR)**
- Client ID và Client secret: để trống
- Khi UmiBridge hỏi mã: dùng **Connection code** trong Settings

Tunnel cố định giữ nguyên URL và quyền OAuth sau khi khởi động lại. Không gửi endpoint, connection code, token hoặc file trong `.local-data` cho người khác.

## Dashboard

- **Overview**: trạng thái gateway và tổng request.
- **Analytics**: độ trễ, tỷ lệ thành công và token tham chiếu của payload công cụ.
- **Projects & chats**: khai báo một thư mục và link ChatGPT để tự nhóm request.
- **Devices**: ghép thêm máy Windows và nhận kết quả theo `device_id`.
- **Tools**: bật/tắt công cụ, lệnh và xem hướng dẫn MCP tự động.
- **Skills**: chọn skill và xem nội dung trước khi dùng.
- **Workflows**: theo dõi task, handoff, trạng thái và liên kết request/job bằng thao tác thủ công.
- **Corp**: điều phối các chat đã chọn, chuyển kết quả giữa các bước, chờ reset hạn mức và hiển thị văn phòng Pixel Agents có nút bật/tắt.
- **Requests**: tham số, stdout, stderr, exit code và thời gian chạy.
- **Settings**: endpoint, mã kết nối ban đầu, giao diện và chu kỳ làm mới.

## Chọn công cụ và skill

Mở **Tools**, chọn nhóm hoặc tìm công cụ rồi bật/tắt từng mục. Lựa chọn được lưu riêng trên máy và có hiệu lực cho lệnh mới, kể cả khi ChatGPT còn giữ danh sách công cụ cũ. Nhóm File, PowerShell và Windows áp dụng cho cả thao tác tương ứng trên máy phụ.

Trong **Skills**, bật những skill bạn muốn dùng, chẳng hạn `impeccable` hoặc `ui-ux-pro-max` cho thiết kế giao diện. Bật **hướng dẫn MCP tự động** trong Tools để UmiBridge gửi danh sách quyền hiện tại và các skill đã chọn khi kết nối; sau thay đổi, kết quả công cụ tiếp theo sẽ bổ sung hướng dẫn mới. Các kết quả sau đó kèm lời nhắc ngắn để chat mới dùng chung kết nối vẫn nhận được gợi ý skill. Xem trước nội dung ngay tại Tools. Model được hướng dẫn đọc skill phù hợp trước khi áp dụng; nội dung đầy đủ và script của skill không tự chạy.

Đây là hướng dẫn qua MCP, không sửa system prompt hoặc thay quyền xác nhận của ChatGPT. Công tắc kiểm soát từng tên công cụ, không tạo sandbox hệ điều hành: khi PowerShell được bật, lệnh shell vẫn có thể thao tác file và hệ thống. Tắt hướng dẫn tự động chỉ ngừng bổ sung prompt; các công cụ đã tắt vẫn bị từ chối. Mỗi mục lưu ngay, không cần nhập lại URL hoặc mã kết nối. Sau cập nhật bản phát hành, dùng **Làm mới công cụ** trong cài đặt plugin ChatGPT để cập nhật mô tả công cụ.

## Quyền thường và Administrator

Trong **Settings → Quyền chạy UmiBridge**, xem riêng **Quyền hiện tại** và **Lần mở sau**. Quyền thường là mặc định. Chọn **Bật Administrator** để Windows xác nhận và lưu chế độ chạy cho tài khoản đang đăng nhập. Windows có thể hỏi đồng ý hoặc thông tin đăng nhập theo chính sách UAC của máy; dashboard không nhận hay lưu mật khẩu.

Nếu Windows đã được cấu hình tự cấp quyền cho tài khoản admin, UAC có thể không hiện hộp thoại. UmiBridge giữ nguyên chính sách đó; thao tác đổi chế độ vẫn được kiểm tra bằng token admin thật.

Sau khi bật thành công, vẫn chỉ mở **UmiBridge.cmd** mỗi ngày. Launcher chạy bộ mã và runtime đã được bảo vệ trong `%ProgramData%\UmiBridge`, giữ URL, OAuth và các lựa chọn công cụ/skill đã lưu. PowerShell tiếp tục chạy ẩn; cửa sổ CMD hiện có chỉ theo dõi request. Chọn **Dùng quyền thường** để tắt chế độ; thao tác này cần xác nhận Windows bằng quyền admin và chuyển dữ liệu riêng về bản thường.

Chế độ được ghi nhớ yêu cầu cùng một tài khoản Windows thuộc nhóm Administrators. UmiBridge không lưu mật khẩu của tài khoản khác để cấp quyền cho tài khoản thường. Nếu Windows hiện màn hình UAC hoặc hỏi mật khẩu, chính người dùng thao tác tại cửa sổ Windows.

Lệnh nâng cao vẫn dùng một launcher: `UmiBridge.cmd -Action admin` hoặc `UmiBridge.cmd -Action normal`. `-Action stop` dừng phiên hiện tại mà không xóa chế độ đã lưu. Nếu source đã cập nhật, chuyển về quyền thường rồi bật lại Administrator để cấp quyền cho bản sao mã mới; bản admin không tự chạy mã vừa sửa ở thư mục source.

Đối với công việc thường ngày, bật đọc/sửa/tìm file, `run_command`, quan sát cửa sổ và những thao tác chuột/phím cần dùng. Các lệnh sửa Registry, kết thúc tiến trình và clipboard chỉ nên bật khi nhiệm vụ cần đến chúng. Các công tắc công cụ vẫn áp dụng trong cả hai chế độ; lệnh được phép chạy admin có quyền tương ứng của Windows.

## Corp - điều phối chat và văn phòng hoạt ảnh

Từ beta.26, **Projects & chats** nhận cả link Project ChatGPT (`https://chatgpt.com/g/g-p-.../project`). Thêm Project một lần, mở trang Project trong Chrome, chọn Project trong Corp rồi **Đồng bộ chat**. Chat con trở thành nhân viên; văn phòng và hàng đợi chỉ hiển thị nhóm đang chọn. Các bước trong một nhiệm vụ Project phải thuộc cùng nhóm. Sau khi cập nhật, Reload extension UmiBridge Corp để nhận adapter 0.2.1.

Từ beta.24, **Phân tích** có bộ lọc thời gian/nguồn/ứng dụng/công cụ, biểu đồ input-output, bảng chi tiết phân trang, xuất CSV và ngân sách tham khảo. Token MCP đọc toàn bộ nhật ký; token Corp tính các lượt đã xác nhận từ bản này. Số đếm là ước tính payload, không phải hóa đơn hoặc hạn mức tài khoản. Model, cache, reasoning và số dư nhà cung cấp chưa có dữ liệu.

Corp dùng bố cục văn phòng và hàng đợi cùng màn hình; **Giao việc** và **Kết nối** mở khi cần. Chỉ phát triển desktop/laptop.

Từ beta.23, mở **Corp** ngay trong dashboard UmiBridge. Thêm các chat tại **Projects & chats**, nạp extension trong `extensions/umibridge-corp` vào Chrome/Edge, ghép bằng mã Corp rồi chọn chuỗi giao việc. Bật điều phối và bấm **Bắt đầu** trên nhiệm vụ để gửi thật vào các tab chat đang mở.

Corp đọc thông báo như `in 2h 11m`, `in 2h 29min`, `2h 37m`, lưu mốc reset và tiếp tục cùng nhiệm vụ khi đến giờ nếu bật tự tiếp tục. Không đọc được giờ hoặc không xác nhận đã gửi thì dừng để kiểm tra, không tự gửi trùng. **Văn phòng: Bật/Tắt** chỉ đổi hiển thị; nhân viên và hoạt ảnh bàn giao phản ánh hàng đợi thật.

Chỉ hỗ trợ desktop/laptop. Xem [hướng dẫn Corp và giới hạn nghiệm thu](docs/CORP.vi.md). Prompt và kết quả bàn giao lưu riêng trong `.local-data/corp-state.json`, không đưa vào Git hoặc ZIP. Bản Administrator cần cập nhật qua cơ chế Windows đã có để nhận runtime mới.

## Workflows

Workflows là sổ theo dõi cục bộ cho một yêu cầu công việc cấp người dùng. Một workflow có thể gắn nhiều `request_id` và tối đa một `job_id` đang hoạt động; nó không tạo thêm MCP tool-call và không tự gửi lại lệnh. Trạng thái đi qua `queued`, `running`, `waiting`, `paused`, `review`, `blocked`, `done`, `archived` hoặc `cancelled`. Pause, resume và link job cần thao tác rõ ràng trong dashboard. Job thực thi qua MCP/device relay hiện có; `dispatch_key` chỉ chống gắn job trùng vào workflow, không chống chạy lại lệnh khi gọi MCP lần nữa.

Tính năng tắt mặc định. Bật tạm bằng biến môi trường `UMIBRIDGE_WORKFLOWS=1`, hoặc bật bền vững bằng file rỗng `.local-data/profile/workflows-enabled`, rồi khởi động lại gateway. Marker chỉ áp dụng cho profile đó; khi không có marker và biến môi trường không bằng `1`, dashboard ẩn Workflows và gateway không tạo journal mới.

Để dùng trong Administrator, trước tiên chuyển về Normal bằng `UmiBridge.cmd -Action normal`. Trong thư mục source gốc, tạo marker rồi khởi động lại gateway Normal:

```powershell
New-Item -ItemType Directory -Path .local-data\profile -Force | Out-Null
New-Item -ItemType File -Path .local-data\profile\workflows-enabled -Force | Out-Null
```

Sau khi gateway Normal hoạt động, chạy `UmiBridge.cmd -Action admin` để Windows cấp quyền cho bản sao hiện tại. Profile và marker được chuyển qua lifecycle chuẩn với ACL bảo vệ; không cần đổi biến môi trường Windows hoặc sửa trực tiếp thư mục `%ProgramData%`. Muốn tắt bền vững, trở về Normal, xóa marker, bỏ biến môi trường bật tạm và khởi động lại; nếu tiếp tục dùng Admin, bật lại bằng launcher.

Dữ liệu nằm trong `.local-data/workflows.jsonl`, được giữ cùng production state và kiểm tra digest khi chuyển Normal/Admin. Ledger tự phục hồi dòng cuối bị cắt và chuyển workflow `running` mất job sau restart về `waiting` với lý do `gateway_restart`. Khi import, workflow đang `running` cũng chuyển về `waiting` với lý do `import_requires_resume` để luôn cần thao tác resume rõ ràng. Export dùng dữ liệu đã lọc, chỉ nhận baseline hash là SHA-256 metadata, loại URL, token, secret và khóa dispatch; import/export và mọi thay đổi đều cần header thao tác local-admin hiện tại.

## Công cụ Windows

Bộ [Windows-MCP của CursorTouch](https://github.com/CursorTouch/Windows-MCP) được ghim tại commit `e28abb5c6934cb3427190bdb970e02644c915ae3`, chạy bằng stdio riêng dưới nền. Không mở thêm cổng, tạo scheduled task riêng hay thay OAuth của UmiBridge. Telemetry và watchdog tùy chọn được tắt.

| Nhóm | Công cụ |
| --- | --- |
| Quan sát | `windows_snapshot`, `windows_screenshot`, `windows_display_inventory`, `windows_control_status` |
| Chuột và phím | `windows_click`, `windows_type`, `windows_scroll`, `windows_move`, `windows_shortcut`, `windows_multi_select`, `windows_multi_edit` |
| Ứng dụng và hệ thống | `windows_app`, `windows_process`, `windows_clipboard`, `windows_notification`, `windows_registry` |
| Nội dung và chờ | `windows_scrape`, `windows_file_system`, `windows_wait`, `windows_wait_for` |
| Trạng thái và máy phụ | `windows_status`, `windows_on_device` |

Dùng `windows_snapshot` trước khi bấm/gõ để lấy nhãn phần tử và tọa độ hiện tại. `windows_screenshot` trả ảnh thật; tham số `region` giới hạn vùng chụp. `windows_app` mở ứng dụng hoặc chuyển cửa sổ. Tiếp tục dùng `run_command` cho shell để giữ phiên PowerShell ẩn có sẵn.

**Settings → Windows tools → Pause** chặn các lệnh desktop mới, vẫn cho phép dùng file và PowerShell. Bộ điều phối quyền điều khiển của Windows-MCP giữ nguyên để người dùng giành lại chuột/phím. Máy cần có phiên desktop đang mở khóa; công cụ không điều khiển được UAC/secure desktop hay Session 0.

Ảnh trả trực tiếp qua MCP, không vào request journal. Nội dung gõ, clipboard và giá trị registry được che khỏi lịch sử. Token analytics chỉ đo text, không quy đổi ảnh thành token model. Công cụ desktop trên Agent cần cài cùng runtime; `windows_on_device` dùng nhãn/tọa độ của máy đích. Kết quả ảnh máy phụ chỉ giữ tạm trong bộ nhớ, tối đa tám kết quả; sau restart chỉ còn metadata job, cần chụp lại nếu muốn ảnh mới.

Dependency tải trong lần setup đầu, sau đó dùng cache local và lock SHA-256. Giữ `.runtime` khi cập nhật để tránh tải lại. License và nguồn tham khảo: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Token dùng tokenizer offline `o200k_base` trên nội dung công cụ mà UmiBridge nhìn thấy. Đây là số tham chiếu, không phải billing hay toàn bộ context của ChatGPT.

## Nhiều máy

Máy chính chạy gateway và dashboard. Trên máy phụ, chép cùng project rồi chạy:

```powershell
.\UmiBridge.cmd -Action pair
```

Nhập URL Hub và mã ghép một lần từ trang **Devices**. Sau đó dùng `UmiBridge.cmd -Action agent` trên máy phụ. Agent chỉ kết nối outbound và trả về `job_id`, stdout, stderr, exit code hoặc kết quả file. Thu hồi máy tại Devices khi không còn dùng.

## Các thao tác

| Thao tác | Lệnh |
| --- | --- |
| Chạy hằng ngày | `UmiBridge.cmd` |
| Dừng gateway | `UmiBridge.cmd -Action stop` |
| Sửa tunnel | `UmiBridge.cmd -Action repair` |
| Ghép máy | `UmiBridge.cmd -Action pair` |
| Chạy Agent | `UmiBridge.cmd -Action agent` |

## Khi gặp lỗi

| Hiện tượng | Xử lý |
| --- | --- |
| Tool failed | Kiểm tra Requests và endpoint trong Settings; chạy `UmiBridge.cmd -Action repair` nếu tunnel lỗi |
| Link tạm hết DNS | Dùng tunnel cố định và endpoint trong Settings |
| Cổng đã có phiên | Chạy `UmiBridge.cmd -Action stop`, rồi mở lại |
| Dashboard chưa mở | Chờ dòng `UmiBridge is ready`; xem `.local-data/server-error.log` trên máy |
| Chi tiết đang xem không cập nhật | Đóng chi tiết; tổng số vẫn được làm mới ở nền |

## Quyền riêng tư và phát triển

Kết quả kiểm thử ChatGPT web/Administrator, hai phiên dùng chung connector, hai Agent cục bộ và giới hạn kiểm thử: [Nghiệm thu beta.22](docs/ACCEPTANCE.vi.md).

`.local-data`, `.runtime`, `node_modules`, `local-bin`, log, token và cấu hình tài khoản không vào Git hoặc source ZIP. Lịch sử giới hạn tham số/output và che các secret đã biết. Đừng dùng request history để lưu dữ liệu nhạy cảm.

```powershell
npm ci
npm run build
npm run local:test
```

## English

Extract the latest release and open **UmiBridge.cmd**. The first launch prepares local Node/Python runtimes, hash-locked Windows-MCP dependencies and a reusable HTTPS tunnel. Later launches reuse the installed tools, URL and OAuth grants. Connect ChatGPT with the MCP endpoint and initial connection code shown under **Dashboard → Settings**. Keep ignored `.local-data` and `.runtime` when updating. Settings includes a pause/resume control for desktop tools; `windows_on_device` routes them to a linked Agent with the same runtime installed.

Optional actions use the same launcher: `-Action stop|repair|pair|agent`. Token analytics count observed tool text with an offline reference tokenizer; they are not provider billing or complete chat usage.

**Tools** persists per-tool access choices and rejects disabled tools even when a client has cached an old list. **Skills** controls which instruction documents can be read. Automatic MCP guidance includes the enabled tool and skill selection during initialization and after configuration changes; it never replaces ChatGPT system instructions or automatically runs skill scripts. Shell access remains broad OS access rather than a filesystem sandbox. All access settings stay in ignored local data and survive restart.

## License

MIT. Independent personal project; upstream DesktopCommanderMCP is not modified. See [LICENSE](LICENSE).
