# UmiBridge

UmiBridge kết nối ChatGPT với máy Windows qua MCP, kèm dashboard quản trị chạy trên máy. Bạn có thể cấp quyền cho từng công cụ để đọc, sửa tệp, chạy lệnh, điều khiển màn hình và làm việc với trình duyệt. Corp và Arena cung cấp các luồng làm việc có điều phối trong ChatGPT.

[English](#english) · [Bản phát hành](https://github.com/TDUmii/umi-bridge/releases) · [Giấy phép](LICENSE)

## Cài đặt và kết nối

1. Tải [UmiBridge-Setup.cmd](https://github.com/TDUmii/umi-bridge/releases/latest/download/UmiBridge-Setup.cmd) và mở tệp trên Windows. Trình cài đặt tải bản phát hành mới nhất và kiểm tra SHA-256 trước khi cài.
2. Mở shortcut **UmiBridge** trên Desktop. Ứng dụng chạy ở khay hệ thống; chọn **Exit** để dừng. Mở [dashboard local](http://127.0.0.1:43127/admin) trên chính máy đó.
3. Trong ChatGPT, thêm ứng dụng MCP bằng URL máy chủ được UmiBridge cung cấp, chọn OAuth và hoàn tất trang cấp quyền bằng mã kết nối hiển thị trên máy. Giữ mã này riêng tư.
4. Trong dashboard, chọn **Tools** và bật những công cụ cần dùng. Nếu danh sách công cụ thay đổi, làm mới kết nối trong ChatGPT hoặc mở chat mới.
5. Để dùng Corp, Arena hoặc điều khiển trang Chrome, nạp thư mục `extensions/umibridge-corp` vào Chrome và ghép tại **Corp → Connection**. Bật **Browser control** trong cài đặt extension nếu cần thao tác trang.

Trang cài đặt lấy **bản phát hành mới nhất**, có thể chậm hơn mã trên `main`. Tại thời điểm viết, bản phát hành là **1.10.0**; tích hợp Desktop Commander mô tả bên dưới nằm trên `main` và cần bản phát hành mới hoặc chạy từ source để sử dụng.

## Tính năng

| Thành phần | Chức năng |
| --- | --- |
| Windows và tệp | Các công cụ MCP cho tệp, PowerShell, ảnh màn hình và thao tác chuột, bàn phím trên máy đã chọn. |
| Chrome | Quản lý tab, đọc trang, bấm, nhập, cuộn, kéo thả và chụp ảnh. Tính năng điều khiển trang cần được bật trong extension. |
| Corp | Tổ chức các bộ phận, giao việc, theo dõi hàng đợi và lịch sử bàn giao trong ChatGPT. |
| Arena Beta | Tạo các ứng viên độc lập, chấm theo tiêu chí và sửa sản phẩm qua các vòng; dashboard hỗ trợ từ 10 đến 100 ứng viên. |
| Dashboard local | Quản lý quyền tool, skills, thiết bị, model, hoạt động, tùy chọn giao diện và Git private cho sản phẩm. |
| Desktop Commander | Tích hợp local tùy chọn cho tệp, terminal và tìm kiếm qua các tool `dc_*`; cần cài Desktop Commander riêng. |

Trang nội bộ Chrome, ô mật khẩu và chọn tệp cần thao tác trực tiếp. Ảnh màn hình và nội dung trang không được lưu trong lịch sử request của UmiBridge. Số token trong dashboard là ước tính, không phải số liệu thanh toán.

## Desktop Commander local trên `main`

Tích hợp này chạy một bản Desktop Commander MCP đã được cài và build trên cùng máy. Nó không tự kết nối các thiết bị của ứng dụng Remote Desktop Commander cloud. Các tool `dc_*` hỗ trợ tệp, tìm kiếm và terminal; chuột, bàn phím và ảnh màn hình vẫn dùng các tool `windows_*` của UmiBridge.

1. Chuẩn bị bản Desktop Commander có `dist/index.js` và các dependency đã cài.
2. Trước lần chạy đầu, tạo `.local-data/desktop-commander.json` trong thư mục UmiBridge. Thay các đường dẫn trong ví dụ bằng đường dẫn tuyệt đối thực tế:

   ```json
   {
     "enabled": true,
     "entry": "D:/path/to/DesktopCommanderMCP/dist/index.js",
     "allowedDirectories": ["D:/your-workspace"]
   }
   ```

3. Khởi động lại UmiBridge, kiểm tra `dc_status` và bật các tool cần dùng trong **Tools**. UmiBridge tạo profile Desktop Commander riêng và tắt telemetry khi tạo profile lần đầu.

Danh sách `allowedDirectories` dùng cho các thao tác tệp của Desktop Commander; terminal có quyền rộng hơn và không bị giới hạn bởi danh sách này. Nếu bỏ trống tùy chọn, thư mục trạng thái local của UmiBridge được dùng mặc định. Phạm vi tệp được ghi vào profile Desktop Commander khi profile được tạo lần đầu; thay đổi trong `desktop-commander.json` về sau không tự cập nhật profile đã tồn tại.

Khi bật **khóa workspace được bảo vệ**, UmiBridge chỉ công bố trạng thái Desktop Commander và chặn các tool toàn máy `dc_*`, Windows, tệp và shell. Để dùng chuột, bàn phím hoặc terminal toàn máy, chuyển khỏi chế độ khóa workspace trong dashboard. Thay đổi này cũng ảnh hưởng điều phối DAG phụ thuộc vào khóa; hãy tạm dừng và đối soát công việc đang chạy trước khi chuyển.

## Chạy từ source

Yêu cầu Windows và Node.js **22.12.0 trở lên**. Tại thư mục dự án:

```powershell
npm ci --ignore-scripts
npm run build
npm start
```

`npm run build` kiểm tra cú pháp các module; nó không thay thế kiểm thử chức năng. Thiết lập Windows runtime và tunnel dùng launcher/công cụ cài đặt của dự án. Các thư mục `.local-data`, `.runtime`, log, dữ liệu chat và khóa là dữ liệu riêng của máy, không đưa vào Git hay chia sẻ công khai.

## Xử lý sự cố

- **Không kết nối được:** mở UmiBridge, kiểm tra dashboard và trạng thái gateway. Nếu cần, dùng **Restart** từ biểu tượng khay; kiểm tra tunnel và kết nối MCP trong ChatGPT.
- **`windows_status` báo ready nhưng thiếu tool điều khiển:** kiểm tra tool có được bật, desktop có bị tạm dừng và khóa workspace có đang bật. Làm mới kết nối hoặc mở chat mới sau khi đổi quyền.
- **Desktop Commander không sẵn sàng:** kiểm tra `entry`, bản build và dependency của Desktop Commander, cấu hình đường dẫn, sau đó restart UmiBridge. `dc_status` phản ánh trạng thái backend local.
- **Extension chưa kết nối:** kiểm tra extension đã được nạp và ghép với dashboard; sau cập nhật extension, reload extension và các tab ChatGPT liên quan.

## English

UmiBridge is a Windows MCP gateway for ChatGPT with a local administration dashboard. It offers owner-selected file, shell, Windows desktop and Chrome tools, plus Corp workflows and Arena Beta.

### Installation

1. Download and run [UmiBridge-Setup.cmd](https://github.com/TDUmii/umi-bridge/releases/latest/download/UmiBridge-Setup.cmd). The installer verifies the release SHA-256.
2. Open the **UmiBridge** desktop shortcut and the [local dashboard](http://127.0.0.1:43127/admin). Use the tray icon to restart or exit.
3. Add the displayed MCP server URL in ChatGPT, select OAuth and authorize it with the connection code shown locally. Enable the tools you need in **Tools**.
4. For Corp, Arena or Chrome page control, load `extensions/umibridge-corp` in Chrome and pair it under **Corp → Connection**. Enable **Browser control** in the extension for page actions.

The installer uses the latest release, which can lag behind `main`. Release **1.10.0** predates the optional Desktop Commander integration currently on `main`.

### Optional local Desktop Commander

Install and build Desktop Commander separately, then create `.local-data/desktop-commander.json` before starting the integration. The JSON example above uses an absolute path to `dist/index.js` and an absolute allowed directory. Restart UmiBridge and check `dc_status`. The integration creates a separate upstream profile with telemetry disabled on first creation; existing profile settings are retained. Its file allowlist does not sandbox terminal commands.

The `dc_*` tools provide local file, search and terminal operations. Windows input and screenshots use `windows_*`. This local integration does not import devices from the separate Remote Desktop Commander cloud service. Protected workspace mode blocks global DC, Windows, file and shell operations; disabling workspace locks also requires disabling the dependent DAG scheduler.

### Source and privacy

On Windows with Node.js 22.12.0 or newer, run `npm ci --ignore-scripts`, `npm run build`, then `npm start`. The build script checks syntax. Local credentials, runtime data, logs and chat data remain outside Git. Browser page content and screenshots are omitted from UmiBridge request history. Review enabled tools before connecting an MCP client.

UmiBridge is licensed under [MIT](LICENSE). Third-party asset and dependency notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
