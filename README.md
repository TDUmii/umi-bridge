# 🌸 UmiBridge

**Đưa ChatGPT đến gần hơn với máy Windows của bạn.**

UmiBridge kết nối ChatGPT với máy Windows qua MCP và cung cấp dashboard quản trị ngay trên máy. Bạn chọn công cụ được phép dùng để làm việc với tệp, terminal, màn hình và trình duyệt; Corp và Arena hỗ trợ tổ chức những công việc nhiều bước.

[Bắt đầu](#-bắt-đầu) · [Tính năng](#-tính-năng) · [Công cụ desktop](#-công-cụ-desktop-tích-hợp) · [Xử lý sự cố](#-xử-lý-sự-cố) · [English](#english)

[Bản phát hành](https://github.com/TDUmii/umi-bridge/releases) · [Giấy phép MIT](LICENSE)

## 🚀 Bắt đầu

### Cài đặt và kết nối

1. Tải [UmiBridge-Setup.cmd](https://github.com/TDUmii/umi-bridge/releases/latest/download/UmiBridge-Setup.cmd) và mở tệp trên Windows. Trình cài đặt tải bản phát hành mới nhất và kiểm tra SHA-256 trước khi cài.
2. Mở shortcut **UmiBridge** trên Desktop. Ứng dụng chạy ở khay hệ thống; chọn **Exit** để dừng. Mở [dashboard local](http://127.0.0.1:43127/admin) trên chính máy đó.
3. Trong ChatGPT, thêm ứng dụng MCP bằng URL máy chủ được UmiBridge cung cấp, chọn OAuth và hoàn tất trang cấp quyền bằng mã kết nối hiển thị trên máy. Giữ mã này riêng tư.
4. Trong dashboard, chọn **Tools** và bật những công cụ cần dùng. Nếu danh sách công cụ thay đổi, làm mới kết nối trong ChatGPT hoặc mở chat mới.
5. Để dùng Corp, Arena hoặc điều khiển trang Chrome, nạp thư mục `extensions/umibridge-corp` vào Chrome và ghép tại **Corp → Connection**. Bật **Browser control** trong cài đặt extension nếu cần thao tác trang.

Khi mở UmiBridge, trang tiến độ hiển thị bước kiểm tra runtime, cập nhật, đăng nhập tunnel và khởi động gateway. CMD chạy ẩn. Trang tự chuyển sang dashboard sau khi gateway và dashboard đều phản hồi; lỗi khởi động được giữ trên trang. Khi cần đăng nhập GitHub cho tunnel, bấm nút mở tab đăng nhập và nhập mã hiển thị; tab do trang này mở sẽ tự đóng khi bước đăng nhập kết thúc.

**Setup trên máy Windows x64 mới:** Umi tự tải Node.js portable, Python riêng, runtime Windows và dependency desktop. Không cần cài Node/Python/Git trước. Sau khi có Node, trang tiến độ theo dõi việc cài và chạy thử công cụ tệp, PowerShell, terminal, tìm kiếm và PDF. Setup không chụp màn hình. Khởi động kiểm tra gateway và dashboard phản hồi; kiểm tra desktop chỉ chạy khi bấm **Repair**. Báo cáo cục bộ nằm tại `.local-data/setup-check.json`. Cần Internet và một phiên desktop Windows đang mở; lần đăng nhập tunnel và cấp quyền kết nối ChatGPT vẫn do chủ máy thực hiện.

Cài mới mặc định dùng công cụ toàn máy với quyền tài khoản Windows đang chạy. Trong **Bộ công cụ**, số khả dụng khác số công tắc đang bật; mỗi công cụ bị chặn có lý do cụ thể. Nếu bật bảo vệ workspace, hãy tạm dừng nhiệm vụ đang chạy trước khi dùng **Bật công cụ toàn máy**. Chuyển chế độ đóng lease cũ của nhiệm vụ đã tạm dừng và đánh dấu cần đối soát; không tự gửi lại công việc. Thư mục cho phép đã tùy chỉnh của runtime desktop được giữ khi cập nhật; profile mới không bị giới hạn vào thư mục dữ liệu nội bộ.

**Tiếp tục Project đang có:** chọn Project trong **Corp → Văn phòng**, rồi bấm **Tiếp tục công việc** trên thẻ tiến độ. Lượt bị dừng do đổi chế độ truy cập sẽ được chuẩn bị lại trong cùng Project/chat; lỗi gửi chưa xác nhận hoặc lỗi khác vẫn cần xem hàng đợi và đối chiếu chat. Không cần tạo lại Project. Nếu máy đã có bản cài chính, mở `UmiBridge.cmd` từ checkout cũng dùng bản cài đó để tránh hai hàng đợi khác nhau; chạy `npm start` khi chủ động phát triển từ source.

> **Tích hợp sẵn từ 1.11.0:** Setup tải runtime desktop cùng UmiBridge và tự cài các dependency cần thiết. Bạn không cần cài Desktop Commander riêng hoặc chạy từ source. Cài đặt cần Internet để tải gói phát hành và dependency.

## ✨ Tính năng

**Bản 1.13.1:** màn khởi động và Skill Center dùng cùng bảng màu trung tính; Cài đặt có khoảng cách giữa tab và nội dung, tránh viền chồng nhau. Các số tổng quan và phân tích đếm lên khi mở tab hoặc thay đổi dữ liệu, dừng đúng giá trị thực và không chạy lại khi polling không đổi.

**Giao diện 1.13.0:** dashboard trắng/đen, nền than và ánh sáng nhẹ, font Manrope được đóng gói để dùng offline. Tổng quan có biểu đồ từ lịch sử thực, dự án gần đây và trạng thái công việc. Khi đổi tab, tiêu đề xuất hiện theo nhịp, các bảng chuyển nhẹ và đường biểu đồ tự vẽ; thao tác chọn/nhấn có phản hồi. Trong **Cài đặt → Giao diện**, có thể tắt **Hiệu ứng chuyển động**; cài đặt giảm chuyển động của Windows cũng được tôn trọng. Các hiệu ứng không gọi chụp màn hình hoặc kiểm tra công cụ.

| Thành phần | Chức năng |
| --- | --- |
| Windows và tệp | Các công cụ MCP cho tệp, PowerShell, ảnh màn hình và thao tác chuột, bàn phím trên máy đã chọn. |
| Chrome | Quản lý tab, đọc trang, bấm, nhập, cuộn, kéo thả và chụp ảnh. Tính năng điều khiển trang cần được bật trong extension. |
| Corp | Tổ chức các bộ phận, giao việc, theo dõi hàng đợi và lịch sử bàn giao trong ChatGPT. |
| Arena Beta | Tạo các ứng viên độc lập, chấm theo tiêu chí và sửa sản phẩm qua các vòng; dashboard hỗ trợ từ 10 đến 100 ứng viên. |
| Dashboard local | Quản lý quyền tool, skills, thiết bị, model, hoạt động, tùy chọn giao diện và Git private cho sản phẩm. |
| Desktop Commander | Runtime tích hợp cho tệp, terminal, tìm kiếm, tài liệu, cấu hình và thống kê qua các tool `dc_*`; không cần cài DC riêng. |

Trang nội bộ Chrome, ô mật khẩu và chọn tệp cần thao tác trực tiếp. Ảnh màn hình và nội dung trang không được lưu trong lịch sử request của UmiBridge. Số token trong dashboard là ước tính, không phải số liệu thanh toán.

## 🖥️ Công cụ desktop tích hợp

UmiBridge đóng gói runtime tệp, terminal, tìm kiếm, tài liệu PDF/Office, cấu hình và thống kê tại `scripts/vendor/desktop-tools`, dựa trên Desktop Commander được cấp phép MIT. Không cần cài Desktop Commander riêng, không dùng đường dẫn `entry` bên ngoài. `npm ci --ignore-scripts` cài các dependency cùng Umi.

Các công cụ tương thích giữ tiền tố `dc_*`; chuột, bàn phím và ảnh màn hình dùng `windows_*`. `dc_status` kiểm tra runtime tích hợp. Cấu hình riêng nằm trong `.local-data/desktop-commander`; dữ liệu này không được đưa lên Git. Profile mới tắt telemetry mặc định. Có thể dùng các công cụ cấu hình để xem và sửa tùy chọn runtime; không có công cụ gửi phản hồi lên dịch vụ Desktop Commander.

Khóa workspace vẫn chặn các thao tác toàn máy. Danh sách thư mục cho phép chỉ áp dụng cho công cụ tệp, không phải sandbox cho terminal. Tài khoản và thiết bị trên dịch vụ Remote Desktop Commander cloud không được tự nhập; thiết bị từ xa của Umi dùng Hub/Agent riêng.

## 🛠️ Chạy từ source

Yêu cầu Windows và Node.js **22.12.0 trở lên**. Tại thư mục dự án:

```powershell
npm ci --ignore-scripts
npm run build
npm start
```

`npm run build` kiểm tra cú pháp các module; nó không thay thế kiểm thử chức năng. Thiết lập Windows runtime và tunnel dùng launcher/công cụ cài đặt của dự án. Các thư mục `.local-data`, `.runtime`, log, dữ liệu chat và khóa là dữ liệu riêng của máy, không đưa vào Git hay chia sẻ công khai.

## 🔧 Xử lý sự cố

- **Repair:** vào **Bộ công cụ → Repair** để chủ động kiểm tra và kết nối lại worker. Lượt này có phép thử chụp màn hình, tệp tạm, lệnh vô hại, trạng thái runtime, skills, thiết bị và Chrome khi được bật. Không có kiểm tra desktop định kỳ. Mở **Xem kết quả từng công cụ** để xem chi tiết; kiểm tra không thao tác chuột/bàn phím hoặc chạy hành động phá hủy.
- **Tự khôi phục:** runtime desktop mất kết nối sẽ được kết nối lại ở lần gọi tiếp theo. Tùy chọn **Kết nối lại và thử lại phép kiểm tra an toàn một lần** áp dụng cho các phép thử có thể lặp an toàn. Umi không tự chạy lại lệnh công việc hoặc thao tác ghi sau lỗi, không tự bật quyền đã tắt, và không tự giao lại nhiệm vụ Corp.
- **Corp báo thiếu công cụ workspace:** khi khóa workspace bật, Corp dùng `scope_read_file`, `scope_write_file`, `scope_list_directory`, `corp_task_details` và `corp_submit_result`; các công cụ tệp/shell/desktop toàn máy bị chặn theo cấu hình. Phép thử dùng workspace tạm riêng, không dùng token hoặc thư mục của nhiệm vụ đang chạy. Nếu kiểm tra local đạt nhưng chat thiếu `scope_*`, làm mới kết nối UmiBridge trong ChatGPT rồi mở lại chat. Gateway không thể tự làm mới danh mục công cụ của một phiên ChatGPT đã mở.
- **Không kết nối được:** mở UmiBridge, kiểm tra dashboard và trạng thái gateway. Nếu cần, dùng **Restart** từ biểu tượng khay; kiểm tra tunnel và kết nối MCP trong ChatGPT.
- **Tunnel báo hết phiên hoặc Unauthorized:** trang khởi động hiển thị lý do và nút **Thử lại kết nối**. Umi thử làm mới kết nối đã lưu một lần; nếu cần đăng nhập GitHub, bấm nút và hoàn tất tab đăng nhập. Chạy nền không tự mở lượt đăng nhập mới hoặc thử mãi với phiên bị từ chối. Mở lại CMD khi gateway offline cũng thử lại kết nối, không chạy kiểm tra màn hình. URL, khóa và Project được giữ nguyên.
- **`windows_status` báo ready nhưng thiếu tool điều khiển:** kiểm tra tool có được bật, desktop có bị tạm dừng và khóa workspace có đang bật. Làm mới kết nối hoặc mở chat mới sau khi đổi quyền.
- **Desktop Commander không sẵn sàng:** kiểm tra runtime `scripts/vendor/desktop-tools` và dependency đã được cài bằng `npm ci --ignore-scripts`, sau đó restart UmiBridge. `dc_status` phản ánh trạng thái runtime local.
- **Extension chưa kết nối:** kiểm tra extension đã được nạp và ghép với dashboard; sau cập nhật extension, reload extension và các tab ChatGPT liên quan.

### Mở hằng ngày bằng một nút

Nhấp đúp **UmiBridge.cmd** hoặc shortcut **UmiBridge**. Ứng dụng kiểm tra bản cập nhật, runtime, tunnel và kết nối gateway. Trang khởi động hiển thị bước đang chạy và chuyển vào dashboard khi kết nối sẵn sàng. Setup cũng tự mở ứng dụng sau khi cài xong.

Nếu Umi đã chạy, mở lại cùng nút chỉ mở dashboard, không tạo gateway thứ hai hoặc chạy lại phép thử desktop. Kết quả Repair được lưu local; mở dashboard chỉ đọc lại kết quả đã có.

Khi chạy nền, Umi chỉ kiểm tra kết nối HTTP của gateway và dashboard, không tự chụp màn hình hoặc chạy thử công cụ. Gateway ngừng chạy được khởi động lại có giới hạn. Bấm **Repair** trong **Bộ công cụ** để chạy phép thử và kết nối lại worker; **Repair** ở menu khay còn có thể sửa runtime riêng khi cần. Tác vụ Corp/Arena đang chạy được giữ lại; sửa runtime hoặc cập nhật phải chờ công việc kết thúc. Quyền đã tắt, thư mục dự án, chat, URL và khóa kết nối được giữ nguyên.

Các bước cần chủ tài khoản như đăng nhập tunnel, cấp quyền ChatGPT hoặc nạp/reload extension vẫn hiển thị để bạn hoàn tất. Umi không tự gửi lại lệnh công việc khi chưa biết lệnh cũ đã chạy hay chưa. Phép thử công cụ xác nhận các thao tác an toàn đã chạy, không khẳng định mọi thao tác GUI hay toàn bộ sản phẩm đều đã nghiệm thu.

## English

UmiBridge is a Windows MCP gateway for ChatGPT with a local administration dashboard. It offers owner-selected file, shell, Windows desktop and Chrome tools, plus Corp workflows and Arena Beta.

### Installation

1. Download and run [UmiBridge-Setup.cmd](https://github.com/TDUmii/umi-bridge/releases/latest/download/UmiBridge-Setup.cmd). The installer verifies the release SHA-256.
2. Open the **UmiBridge** desktop shortcut and the [local dashboard](http://127.0.0.1:43127/admin). Use the tray icon to restart or exit.
3. Add the displayed MCP server URL in ChatGPT, select OAuth and authorize it with the connection code shown locally. Enable the tools you need in **Tools**.
4. For Corp, Arena or Chrome page control, load `extensions/umibridge-corp` in Chrome and pair it under **Corp → Connection**. Enable **Browser control** in the extension for page actions.

**Included since 1.11.0:** Setup downloads the bundled desktop runtime and installs its dependencies automatically. No separate Desktop Commander installation or source checkout is required. Internet access is needed to download the release and dependencies.

On a fresh Windows x64 machine, Setup provisions private Node.js and Python runtimes without requiring Node, Python or Git beforehand. It runs file, terminal, search and PDF probes, then checks the gateway and dashboard connection. Setup takes no screenshots. Desktop checks run only when the owner presses **Repair**. A signed-in Windows desktop and Internet access are required. Tunnel sign-in and ChatGPT authorization still require the owner. New profiles allow full-machine tools under the current Windows account; existing custom directory limits are preserved.

### Bundled desktop tools

The MIT-licensed desktop tools runtime is included under `scripts/vendor/desktop-tools`. No separate Desktop Commander installation or external entry path is required. Run `npm ci --ignore-scripts` to install its dependencies. Compatible `dc_*` tools provide files, search, terminal, documents, settings and usage features; `windows_*` provides desktop input. Private runtime settings stay in `.local-data`. Cloud service accounts/devices are not imported; use UmiBridge Hub/Agent for remote devices.

### Source and privacy

On Windows with Node.js 22.12.0 or newer, run `npm ci --ignore-scripts`, `npm run build`, then `npm start`. The build script checks syntax. Local credentials, runtime data, logs and chat data remain outside Git. Browser page content and screenshots are omitted from UmiBridge request history. Review enabled tools before connecting an MCP client.

### Tool checks and recovery

Double-click **UmiBridge.cmd** for daily use. The launcher checks updates, private runtimes, the tunnel and the gateway connection, then opens the dashboard. Opening it again opens the existing dashboard. Background monitoring checks HTTP connectivity only; it never runs desktop probes or screenshots. Use **Tools → Repair** for an explicit tool check and safe reconnect, including a screenshot test. **Repair** in the tray menu can also reinstall a broken private runtime once. Active Corp/Arena work defers file replacement and runtime repair. Owner-disabled features, work files, chats and saved connection credentials are preserved. Account sign-in and browser/client authorization still require the owner.

If the saved tunnel rejects its sign-in, startup shows the reason and **Retry connection**. Recovery refreshes the saved tunnel once without opening an unattended login flow. If owner sign-in is required, retries stop until you press the button or reopen the CMD; the same URL, credentials and Projects are retained. Connection retry does not run desktop diagnostics.

To continue an existing Corp Project, select it in **Corp → Office** and use **Resume work** on its progress card. Access-mode recovery reuses the existing Project and chat; other blocked sends still require reviewing the queue. GUI launches from source use the managed installation when present, keeping one normal work queue. Use `npm start` for intentional source development.

Open **Tools → Repair** for live probes in a temporary workspace and a per-tool result list. This explicit check includes a screenshot but no desktop input, remote-device operations or destructive actions. Repair reconnects and retries safe probes once. A disconnected desktop runtime reconnects on the next call; work commands and writes are never automatically replayed after an error.

Workspace protection requires the `scope_*` file tools for Corp. The check preserves existing permissions and active tasks. If local checks pass but a tool is missing in ChatGPT, refresh the UmiBridge app connection and reopen the chat; the gateway cannot refresh an existing client's tool catalog itself.

UmiBridge is licensed under [MIT](LICENSE). Third-party asset and dependency notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
