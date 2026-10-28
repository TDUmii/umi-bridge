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

> **Tích hợp sẵn từ 1.11.0:** Setup tải runtime desktop cùng UmiBridge và tự cài các dependency cần thiết. Bạn không cần cài Desktop Commander riêng hoặc chạy từ source. Cài đặt cần Internet để tải gói phát hành và dependency.

## ✨ Tính năng

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

- **Không kết nối được:** mở UmiBridge, kiểm tra dashboard và trạng thái gateway. Nếu cần, dùng **Restart** từ biểu tượng khay; kiểm tra tunnel và kết nối MCP trong ChatGPT.
- **`windows_status` báo ready nhưng thiếu tool điều khiển:** kiểm tra tool có được bật, desktop có bị tạm dừng và khóa workspace có đang bật. Làm mới kết nối hoặc mở chat mới sau khi đổi quyền.
- **Desktop Commander không sẵn sàng:** kiểm tra runtime `scripts/vendor/desktop-tools` và dependency đã được cài bằng `npm ci --ignore-scripts`, sau đó restart UmiBridge. `dc_status` phản ánh trạng thái runtime local.
- **Extension chưa kết nối:** kiểm tra extension đã được nạp và ghép với dashboard; sau cập nhật extension, reload extension và các tab ChatGPT liên quan.

## English

UmiBridge is a Windows MCP gateway for ChatGPT with a local administration dashboard. It offers owner-selected file, shell, Windows desktop and Chrome tools, plus Corp workflows and Arena Beta.

### Installation

1. Download and run [UmiBridge-Setup.cmd](https://github.com/TDUmii/umi-bridge/releases/latest/download/UmiBridge-Setup.cmd). The installer verifies the release SHA-256.
2. Open the **UmiBridge** desktop shortcut and the [local dashboard](http://127.0.0.1:43127/admin). Use the tray icon to restart or exit.
3. Add the displayed MCP server URL in ChatGPT, select OAuth and authorize it with the connection code shown locally. Enable the tools you need in **Tools**.
4. For Corp, Arena or Chrome page control, load `extensions/umibridge-corp` in Chrome and pair it under **Corp → Connection**. Enable **Browser control** in the extension for page actions.

**Included since 1.11.0:** Setup downloads the bundled desktop runtime and installs its dependencies automatically. No separate Desktop Commander installation or source checkout is required. Internet access is needed to download the release and dependencies.

### Bundled desktop tools

The MIT-licensed desktop tools runtime is included under `scripts/vendor/desktop-tools`. No separate Desktop Commander installation or external entry path is required. Run `npm ci --ignore-scripts` to install its dependencies. Compatible `dc_*` tools provide files, search, terminal, documents, settings and usage features; `windows_*` provides desktop input. Private runtime settings stay in `.local-data`. Cloud service accounts/devices are not imported; use UmiBridge Hub/Agent for remote devices.

### Source and privacy

On Windows with Node.js 22.12.0 or newer, run `npm ci --ignore-scripts`, `npm run build`, then `npm start`. The build script checks syntax. Local credentials, runtime data, logs and chat data remain outside Git. Browser page content and screenshots are omitted from UmiBridge request history. Review enabled tools before connecting an MCP client.

UmiBridge is licensed under [MIT](LICENSE). Third-party asset and dependency notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
