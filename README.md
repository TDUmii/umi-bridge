# UmiBridge Sakura Console

UmiBridge kết nối ChatGPT với máy Windows của bạn: đọc và sửa tệp, chạy PowerShell, quan sát và điều khiển cửa sổ. Dashboard local quản lý quyền công cụ, lịch sử, thiết bị, thống kê token và điều phối nhiều chat trong một ChatGPT Project.

**Bản 1.2.1.** Giao diện dành cho máy tính để bàn và laptop.

[Tải bản chính thức mới nhất](https://github.com/TDUmii/umi-bridge/releases/latest) · [Thay đổi từng bản](RELEASE_NOTES.md) · [Hướng dẫn Corp](docs/CORP.vi.md) · [Hướng dẫn Arena](docs/ARENA.vi.md)

![UmiBridge Sakura Console](assets/umibridge-banner.svg)

## Bạn cần chuẩn bị gì?

- Windows với phiên desktop đang mở khóa để dùng chuột, bàn phím và chụp màn hình.
- Internet cho lần cài đầu, Microsoft Dev Tunnels và ChatGPT. Xử lý tệp/lệnh vẫn chạy trên máy được chọn.
- Tài khoản ChatGPT có khả năng thêm MCP connector tùy gói và chính sách tài khoản. Corp dùng Chrome hoặc Edge với extension UmiBridge Corp.
- Một thư mục cài riêng, ví dụ `D:\Apps\UmiBridge`. Không giải nén trực tiếp vào thư mục Windows.

Launcher tự chuẩn bị Node.js, Python và Windows tools. Không cần cài Node/Python thủ công để sử dụng bản ZIP. Không cần Administrator cho công việc tệp/lệnh thông thường.

## Cài lần đầu

1. Mở trang [Releases](https://github.com/TDUmii/umi-bridge/releases/latest), tải ZIP và tệp checksum của cùng phiên bản.
2. Có thể kiểm tra ZIP trước khi dùng: chạy `Get-FileHash .\ten-ban-phat-hanh.zip -Algorithm SHA256` trong PowerShell, đối chiếu chuỗi SHA-256 với tệp checksum.
3. Giải nén toàn bộ ZIP vào thư mục riêng. Giữ nguyên cấu trúc `scripts`, `extensions` và các tệp đi kèm.
4. Bấm đúp **UmiBridge.cmd**. Lần đầu cần thời gian tải runtime, dependency đã khóa và tạo tunnel HTTPS cố định. Chờ thông báo **UmiBridge is ready**.
5. Nếu Microsoft Dev Tunnels yêu cầu đăng nhập, hoàn thành đăng nhập GitHub trong trình duyệt. Những lần sau launcher dùng lại URL và OAuth đã lưu.
6. Dashboard mở tại [http://127.0.0.1:43127/admin](http://127.0.0.1:43127/admin). Địa chỉ gốc `http://127.0.0.1:43127/` cũng mở dashboard.

Dashboard quản trị chỉ phục vụ trên loopback của máy. Endpoint HTTPS cho ChatGPT được hiển thị riêng trong **Settings / Cài đặt**. Không dùng địa chỉ `127.0.0.1` làm endpoint cho ChatGPT web.

## Mỗi ngày mở và dừng thế nào?

Bấm đúp **UmiBridge.cmd** sau khi bật máy. Gateway và PowerShell worker chạy nền; cửa sổ launcher theo dõi request. Dùng lệnh sau trong thư mục cài khi cần dừng:

```powershell
.\UmiBridge.cmd -Action stop
```

Dừng gateway không xóa dữ liệu, mã ghép hoặc lựa chọn đã lưu. Mở lại launcher để chạy tiếp. Không chạy hai bản UmiBridge cùng cổng.

| Việc cần làm | Lệnh trong thư mục cài |
| --- | --- |
| Chạy và mở dashboard | `.\UmiBridge.cmd` |
| Dừng gateway hiện tại | `.\UmiBridge.cmd -Action stop` |
| Kiểm tra/sửa tunnel | `.\UmiBridge.cmd -Action repair` |
| Chuyển sang Administrator | `.\UmiBridge.cmd -Action admin` |
| Chuyển về quyền thường | `.\UmiBridge.cmd -Action normal` |
| Ghép máy phụ | `.\UmiBridge.cmd -Action pair` |
| Chạy Agent trên máy phụ | `.\UmiBridge.cmd -Action agent` |

## Kết nối ChatGPT với máy Windows

Kết nối MCP cấp công cụ thao tác máy. Đây là bước riêng với ghép extension Corp.

1. Mở **Settings / Cài đặt** trên dashboard, tìm **MCP endpoint** và **Connection code**.
2. Trong phần cài đặt ứng dụng/connector của ChatGPT, tạo kết nối MCP với endpoint đó. Tên và vị trí menu phụ thuộc giao diện ChatGPT hiện tại.
3. Chọn **OAuth**, đăng ký client **Dynamic / DCR**, để trống Client ID và Client secret.
4. Trang UmiBridge hiện yêu cầu kết nối. Kiểm tra đúng ứng dụng bạn vừa thêm, nhập **Connection code** rồi cho phép.
5. Trong chat cần làm việc, chọn hoặc nhắc tên connector UmiBridge. Thử yêu cầu chỉ đọc, chẳng hạn: “Dùng UmiBridge liệt kê thư mục dự án của tôi, chưa sửa tệp.”
6. Kiểm tra **Requests / Yêu cầu** trên dashboard để thấy công cụ, kết quả và exit code thực.

Giữ kín connection code, mã ghép, token và dữ liệu OAuth. Không gửi chúng vào chat hoặc issue. Tunnel cố định giúp giữ endpoint sau khi khởi động lại. Nếu ChatGPT có công cụ cũ sau cập nhật, dùng **Làm mới công cụ** trong phần cài đặt connector.

## Các trang dashboard dùng để làm gì?

| Trang | Công việc chính |
| --- | --- |
| **Overview / Tổng quan** | Xem gateway, trạng thái kết nối và tổng request. |
| **Analytics / Phân tích** | Xem token tham chiếu, độ trễ, tỷ lệ thành công, bảng chi tiết và ngân sách. |
| **Projects & chats / Dự án và chat** | Gắn thư mục máy với link Project hoặc chat; nhóm lịch sử và chọn nhóm điều phối. |
| **Corp** | Giao việc theo chuỗi chat, bàn giao kết quả và xem văn phòng hoạt ảnh. |
| **Arena** | Tạo Project riêng với 20 thí sinh và 1 giám khảo, cải tiến sản phẩm qua 5 vòng chấm. |
| **Xem đôi** | Quan sát Corp và Arena trong hai pane; chọn riêng, phóng lớn và dừng chuyển động pane bị che. |
| **Requests / Yêu cầu** | Đọc tham số được lưu, stdout, stderr, exit code, thời gian và trạng thái công cụ. |
| **Devices / Thiết bị** | Ghép/thu hồi máy Windows phụ và xem job của Agent. |
| **Tools / Công cụ** | Bật/tắt từng công cụ, từng nhóm và hướng dẫn MCP tự động. |
| **Skills** | Chọn tài liệu hướng dẫn cho model, xem trước nội dung. |
| **Settings / Cài đặt** | Endpoint, mã kết nối, quyền chạy, giao diện và chu kỳ làm mới. |
| **Workflows** | Sổ nhiệm vụ thủ công, hiện khi được bật trong profile. |

Đổi ngôn ngữ và giao diện sáng/tối bằng điều khiển trên thanh trên cùng. Corp có các tab **Văn phòng**, **Từ ý tưởng**, **Hàng đợi**; Arena có mục riêng trên thanh điều hướng. Trong Corp, form **Giao việc** nằm trong Hàng đợi và chỉ mở lúc cần. Danh sách nhân viên và nội dung dài cuộn trong vùng tương ứng.

## Thêm toàn bộ ChatGPT Project

Nếu muốn mọi chat nhân viên nằm trong cùng Project, hãy thêm **link Project**, thay vì thêm từng link chat riêng lẻ.

1. Trong ChatGPT, tạo hoặc mở Project của bạn. Sao chép link dạng `https://chatgpt.com/g/g-p-.../project`.
2. Mở **Projects & chats**, nhập tên dễ nhớ, thư mục mã trên Windows và link Project. Lưu lại.
3. Trong Chrome/Edge đã ghép Corp, mở trang Project và tab **Trò chuyện** của Project.
4. Tại **Corp**, chọn đúng Project rồi bấm **Đồng bộ chat**. Các chat con trở thành nhân viên trong nhóm đó.
5. Kiểm tra số chat và thông báo đã quét hết. Nếu mới nhận một phần, giữ trang Project mở rồi đồng bộ lại.

Corp lọc văn phòng, người nhận việc và hàng đợi theo Project đang chọn. Với Project có sẵn, tạo hoặc chuyển chat bằng giao diện ChatGPT rồi đồng bộ lại. **Từ ý tưởng** có thể tự tạo Project mới cùng 8 chat bộ phận qua extension; Corp không tự chuyển chat giữa các Project. Thư mục dự án dùng để liên kết công việc, không tạo sandbox quyền tệp cho từng chat.

Vẫn có thể thêm link từng cuộc trò chuyện rồi chọn **Chat riêng lẻ** trong Corp. Không trộn chat riêng vào chuỗi thuộc một Project.

## Cài và ghép extension Corp

Extension gửi/quan sát trong các tab ChatGPT được giao việc. Connector MCP cung cấp công cụ đọc tệp/chạy lệnh. Một chat muốn lập trình trên máy cần cả kết nối công cụ phù hợp và khả năng nhận việc từ Corp.

1. Mở `chrome://extensions/` hoặc `edge://extensions/` bằng thanh địa chỉ của trình duyệt.
2. Bật **Developer mode / Chế độ nhà phát triển** ở góc trên.
3. Chọn **Load unpacked / Tải tiện ích đã giải nén**. Chọn thư mục `extensions\umibridge-corp` bên trong thư mục cài UmiBridge. Chọn thư mục có `manifest.json`, không chọn tệp ZIP.
4. Mở **Corp → Kết nối**, bấm **Tạo mã ghép extension**, rồi chép mã.
5. Bấm biểu tượng UmiBridge Corp trên thanh extension để mở cài đặt. Nhập địa chỉ local `http://127.0.0.1:43127` cùng mã Corp, chọn **Lưu và kết nối**.
6. Tải lại các tab ChatGPT đã mở. Corp phải hiện **Đã nối** và số chat đang mở.

**Mã Corp khác Connection code của MCP.** Không dán nhầm hai mã. Tạo mã Corp mới làm mã trước mất hiệu lực; chọn **Thu hồi kết nối** để ngắt extension và tắt điều phối.

Khi cập nhật extension đã cài: trở lại trang extensions, tìm thẻ **UmiBridge Corp**, bấm nút **mũi tên tròn Reload** trên chính thẻ đó, gần phần dưới của thẻ. Đây là nút nạp lại extension, khác nút tải lại trang trên thanh địa chỉ. Sau đó tải lại tab ChatGPT. Nếu nút chưa hiện, kiểm tra Developer mode đang bật. Extension hiện tại là **0.4.0**; phiên bản extension độc lập với phiên bản UmiBridge **1.2.0**. Corp và Arena dùng chung kết nối trình duyệt, nhưng có state và công tắc điều phối riêng.

## Tạo dự án từ một ý tưởng

Sau khi extension đã kết nối, vào **Corp → Từ ý tưởng**. Mặc định **Tạo Project ChatGPT và 8 chat bộ phận mới**; bạn không cần tạo từng chat hoặc nhập từng bước giao việc.

1. Nhập ý tưởng. Có thể chỉ mô tả sản phẩm và vấn đề bạn muốn giải quyết; các bộ phận sẽ làm rõ chi tiết.
2. Chọn **Lập kế hoạch rồi triển khai đầy đủ**, hoặc **Chỉ làm rõ ý tưởng và lập kế hoạch**.
3. Giữ **Tự bắt đầu các chặng sau khi tạo đội ngũ** bật để chạy tiếp ngay khi khởi tạo xong. Bỏ chọn nếu muốn kiểm tra Project và đội ngũ trước.
4. Bật **Điều phối**, bấm **Tạo Project** và giữ Chrome/Edge cùng UmiBridge đang chạy.

Extension tạo Project, lần lượt tạo 8 chat cho Điều hành, Sản phẩm, Thiết kế, Kỹ thuật, QA, Bảo mật, DevOps và Tài liệu, rồi tự phân công vai trò. Dashboard ghi tiến độ `0/8` đến `8/8` và chuyển sang Project mới. Tên Project có hậu tố UMI để nhận diện lần khởi tạo và tránh tạo trùng. Tại **Thư mục lưu**, nhập đường dẫn hoặc bấm **Chọn thư mục** để duyệt ổ đĩa/thư mục ngay trong dashboard, rồi bấm **Dùng thư mục này**. UmiBridge tạo thư mục dự án riêng bên trong, chứa `UMI-IDEA.md`. Đường dẫn được nhớ trên trình duyệt; mặc định là `Documents\UmiBridge Projects`. Project đang có giữ thư mục đã gắn.

Luồng đầy đủ gồm 11 chặng: làm rõ ý tưởng, thiết kế giải pháp, chốt kế hoạch, triển khai MVP, kiểm thử độc lập, rà soát bảo mật, sửa lỗi, nghiệm thu sau sửa, chạy thử local, viết hướng dẫn và bàn giao. Khi nghiệm thu sau sửa còn lỗi, hệ thống thêm một vòng kỹ thuật sửa và QA kiểm lại, tối đa 13 chặng/2 vòng sửa. Kế hoạch, nghiệm thu cuối, chạy local và bàn giao phải có báo cáo đạt cùng bằng chứng; phản hồi thiếu báo cáo, thiếu công cụ hoặc bị chặn sẽ dừng thay vì ghi hoàn tất.

Các báo cáo chi tiết nằm dưới `.umibridge-projects/<mã quy trình>/` trong thư mục dự án. Chat cần sử dụng connector UmiBridge đã kết nối để đọc/sửa tệp và chạy kiểm thử. Chất lượng và bằng chứng do các bộ phận báo cáo; việc nhận được phản hồi không tự chứng minh sản phẩm đã đạt. Quy trình chạy và bàn giao local, không tự publish/deploy hoặc mua dịch vụ.

Muốn dùng Project cũ, đổi **Project làm việc** thành **Dùng Project đang chọn**. Phân công đã lưu được ưu tiên; tên chat rõ ràng có thể được gợi ý theo bộ phận. Chat thiếu hoặc tên mơ hồ cần được phân công trước. **Chỉ lập kế hoạch** chạy 3 chặng và không giao phần lập trình.

Khởi tạo được lưu cùng hàng đợi Corp. Nếu thao tác tạo chưa được xác nhận, hệ thống dừng ở **Cần kiểm tra**. Kiểm tra tab đã tạo trước khi bấm **Kiểm tra và tiếp tục**; không tự tạo lại sau khi mất tab hoặc khởi động lại. Hủy khởi tạo giữ lại Project/chat và tệp đã tạo để bạn đối chiếu, không tự xóa chúng.

Tính năng tạo Project có từ extension **0.3.0**; bản hiện tại **0.4.0** tiếp tục hỗ trợ. Sau khi cập nhật source, bấm Reload ở thẻ UmiBridge Corp trong trang quản lý extension. Gateway giữ mã ghép hiện có. Adapter chỉ thao tác giao diện đang hiển thị, không dùng cookie hoặc API nội bộ ChatGPT. Giao diện hoặc đăng nhập thay đổi có thể làm khởi tạo dừng để kiểm tra.

## Gửi brief nhanh và xem hai luồng

Trong **Corp → Từ ý tưởng**, chọn gửi brief trực tiếp, chọn một chat đã có rồi nhập yêu cầu. Đây là nhiệm vụ một bước trong phạm vi Project/nhóm đang chọn. Điều phối tắt thì lưu tạm dừng; bật thì yêu cầu bắt đầu. Retry cùng bản nháp giữ mã yêu cầu để tránh tạo trùng khi mất phản hồi lưu; nếu chưa xác nhận bắt đầu, kiểm tra Hàng đợi.

Mở **Xem đôi** để xem văn phòng Corp và đấu trường Arena cùng lúc. Mỗi pane có selector riêng; lựa chọn Corp dùng cùng Project với mục Corp. **Phóng lớn** tập trung một pane; **Escape** trở lại hai pane. Pane bị che dừng chuyển động, sự kiện bàn giao cũ không phát lại khi mở lại. Văn phòng: Bật/Tắt áp dụng cả phần xem đôi. Chế độ xem không tạo hoặc bắt đầu công việc.

## Arena độc lập từ một ý tưởng

Mở **Arena** trên thanh điều hướng chính. Arena tạo **một Project ChatGPT riêng, 20 chat thí sinh và 1 chat giám khảo**. Mỗi thí sinh tự làm toàn bộ sản phẩm trong chat và thư mục riêng, gồm mã nguồn, README hướng dẫn cài/build/test/run cùng tệp bằng chứng thực tế. Không dùng đội ngũ hoặc hàng đợi Corp.

1. Cập nhật extension lên **0.4.0**, bấm Reload trên thẻ extension rồi tải lại các tab ChatGPT. Giữ kết nối đã ghép nếu còn hợp lệ.
2. Nhập tên, ý tưởng và thư mục lưu tại Arena, rồi tạo Arena. Bật **Điều phối Arena** khi sẵn sàng; công tắc Corp độc lập.
3. Bấm **Tạo Project và 21 chat**. Theo dõi số chat đã xác nhận; thao tác chưa rõ kết quả dừng để kiểm tra.
4. Sau khi khởi tạo hoàn tất, kiểm tra Project, công cụ UmiBridge và các chat rồi bấm **Bắt đầu**.
5. Theo dõi các tab **Trực tiếp**, **Ứng viên**, **Vòng đấu** và **Lịch sử**. Một giám khảo chấm tất cả sản phẩm còn lại theo cùng rubric, xếp hạng và phản hồi đầy đủ. Số sản phẩm đi tiếp cố định: **20 → 10 → 5 → 3 → 2 → 1**.

Trước mỗi vòng chấm tiếp theo, **mọi thí sinh đi tiếp phải sửa source theo phản hồi và chạy lại build/test/run**. Thiếu source, README, ba kiểm tra đạt hoặc tệp bằng chứng thì bị chặn. Phiên bản được chấp nhận lưu source, README và bằng chứng riêng với manifest cùng SHA-256; bản lịch sử không được ghi đè. Arena mới dùng rubric v2 tổng 100: chức năng 30, UX/khả năng tiếp cận 15, bằng chứng 20, bảo mật 10, hiệu năng/ổn định 10, khả năng bảo trì 5, local/tài liệu 10. Arena cũ giữ rubric v1 và điểm/prompt đã lưu. Công bằng là quy tắc chấm chung, không phải một điểm sản phẩm.

Prompt yêu cầu **GPT-6.1 Sol**; adapter không bảo đảm model thực tế đang được chọn trên giao diện ChatGPT. Kiểm tra model và quyền công cụ trong ChatGPT trước khi bắt đầu. Hủy hoặc xóa khỏi danh sách giữ Project/chat và tệp sản phẩm; không tự dừng lệnh hệ điều hành đã gửi. Chưa có xác nhận hoàn tất toàn bộ giải bằng tài khoản ChatGPT thật. Xem [hướng dẫn Arena](docs/ARENA.vi.md) để biết phục hồi, phiên bản và giới hạn.

## Giao việc cho các chat

1. Mở sẵn các chat con cần dùng trong Project. Trong mỗi chat cần thao tác máy, gắn connector UmiBridge và thử một lệnh chỉ đọc trước.
2. Chọn Project trong Corp và bật **Điều phối**.
3. Bấm **Giao việc**, đặt tên nhiệm vụ. Chọn chat, vai trò và yêu cầu cụ thể cho bước đầu.
4. Bấm **Thêm bước bàn giao** để thêm người nhận tiếp theo. Tối đa 12 bước cho một nhiệm vụ. Ví dụ: lập yêu cầu, lập trình, kiểm thử.
5. Bấm **Lưu nhiệm vụ**. Nhiệm vụ được lưu ở trạng thái tạm dừng để kiểm tra lại.
6. Bấm **Bắt đầu** trên thẻ nhiệm vụ. Corp gửi bước đầu, chờ phản hồi hoàn tất rồi đính kèm kết quả vào `previous_result` cho bước tiếp theo.
7. Theo dõi hàng đợi; mở **Kết quả bàn giao** để đọc phản hồi đã nhận, hoặc **Mở chat** để đối chiếu công cụ và kết quả gốc.

Viết yêu cầu kèm thư mục, phạm vi được sửa, đầu ra và tiêu chí nghiệm thu. Nếu muốn chỉ giám sát, giao viết mã cho một chat và kiểm thử cho chat khác. Corp chạy chuỗi do bạn đặt; nội dung model trả lời không tự tạo thêm bước hoặc tự chọn người nhận.

| Điều khiển | Hiệu lực |
| --- | --- |
| **Tạm dừng** trên nhiệm vụ | Ngăn bước gửi tiếp theo; vẫn ghi nhận kết quả của bước đã gửi. |
| **Điều phối: Tắt** | Ngăn lượt gửi mới trong toàn bộ hàng đợi. |
| **Văn phòng: Tắt** | Ẩn hoạt ảnh; không dừng điều phối. |
| **Hủy** | Kết thúc theo dõi nhiệm vụ trong Corp. Lệnh/câu trả lời đã gửi có thể vẫn đang chạy. |
| **Đã kiểm tra chat - chuẩn bị thử lại** | Chuẩn bị lần thử sau khi bạn đã đối chiếu tình trạng gửi; vẫn cần bấm Bắt đầu. |
| **Xóa khỏi hàng đợi** | Bỏ nhiệm vụ đã kết thúc khỏi danh sách; không xóa chat hoặc số liệu usage đã ghi. |

Corp giữ bản nháp hiện có, không chen vào chat đang phản hồi, không tự đổi tài khoản/model. Nếu không xác nhận được lần gửi, Corp chặn để kiểm tra trước khi thử lại. Mỗi chat nhận tối đa một bước đang thực hiện; những chat khác có thể nhận nhiệm vụ riêng.

## Hết limit thì chuyện gì xảy ra?

Corp đọc thông báo hạn mức thực trên giao diện ChatGPT, chẳng hạn `in 2h 11m`, `in 2h 29min`, `2h 37m`. Corp lưu giờ reset tuyệt đối kèm 15 giây dự phòng và hiển thị đếm ngược trong hàng đợi.

Nếu bật **Tự tiếp tục sau reset**, đến mốc Corp kiểm tra lại đúng chat. Hạn mức vẫn còn thì lưu mốc mới và chờ tiếp. Nếu lần trước đã gửi, lời nhắc tiếp tục yêu cầu kiểm tra tiến độ đã có để tránh lặp thao tác. Nếu chưa gửi thì gửi việc đang chờ.

Không đọc được giờ reset, gửi không rõ kết quả, chat rời Project, phản hồi vượt 48.000 ký tự hoặc chờ phản hồi quá 45 phút: nhiệm vụ cần kiểm tra. Không dùng số token ước tính để đoán tài khoản đã hồi limit. Đếm ngược về 0 chưa chứng minh nhà cung cấp đã mở lại.

Gateway và trình duyệt phải đang hoạt động. Corp giữ hàng đợi qua khởi động lại nhưng không đánh thức Windows; tab nền có thể cập nhật chậm hơn. Chi tiết cách phục hồi: [Hướng dẫn Corp](docs/CORP.vi.md).

## Văn phòng: zoom và nhiều nhân viên

- **− / +**: thu/phóng bản đồ từ 75% đến 200%. Tên/trạng thái trong tooltip giữ nguyên cỡ chữ.
- **Vừa khung**: chọn tỷ lệ theo khung hiện tại khi bấm, tối thiểu 75%. Sau đó đổi kích thước hoặc mở rộng không tự đổi zoom.
- **Mở rộng**: mở thêm diện tích ngang, tạm ẩn hàng đợi. Phòng giãn ngang và sắp thêm bàn mỗi hàng, giữ nguyên tỷ lệ nhân vật/nội thất. Bấm **Thu gọn** hoặc **Esc** để trở lại.
- Trỏ chuột hoặc dùng **Tab** đến nhân viên để hiện tên, chấm màu trạng thái và bộ phận. **Esc** đóng tooltip. Tên không che bản đồ thường trực; chọn nhân viên tại bàn hoặc trong **Đội ngũ** để xem nhiệm vụ và mở chat.
- Bàn dàn đều theo chiều rộng và chiều cao còn trống, chia số nhân viên cân giữa các hàng và căn giữa hàng chưa đủ bàn. Khu chờ cách hàng bàn đầu bằng một lối đi; chấm trạng thái nằm trong góc trên bên phải từng ô chỗ ngồi. Đội đông thêm hàng và cuộn trong bản đồ; danh sách **Đội ngũ**, chi tiết và **Bàn giao gần đây** ở cột bên. Chữ **UMIBRIDGE / CORP**, **Khu chờ** dùng HTML rõ nét.
- Khi hàng đợi của bộ lọc đang chọn trống, nó thu thành thanh gọn bên dưới để dành chiều ngang cho văn phòng. Chọn **Tất cả** hoặc **Đã xong** để xem nhiệm vụ cũ.
- **Giảm chuyển động** giữ trạng thái tĩnh. Tùy chọn giảm chuyển động của hệ điều hành cũng được tôn trọng.

Nhân viên gõ phím lúc gửi, chờ lúc đợi phản hồi/reset, đọc lúc có kết quả, đi giao hồ sơ khi sổ nhiệm vụ ghi nhận bàn giao thật. “Chờ phản hồi” không xác nhận model đang suy nghĩ. Mở lại văn phòng không phát lại các bàn giao cũ.

## Quản lý token và ngân sách

Mở **Analytics / Phân tích**. Chọn **Công cụ MCP**, **Chat Corp** hoặc cả hai; lọc theo ngày, ứng dụng, công cụ, trạng thái và nội dung tìm kiếm.

| Mục | Có thể xem/làm |
| --- | --- |
| **Tổng quan** | Input, output, tổng token tham chiếu, số lượt, thành công, độ trễ, biểu đồ và nhóm thống kê. |
| **Chi tiết** | 50 lượt mỗi trang, trạng thái, nguồn, thời điểm và số liệu từng lượt. **Xuất trang CSV** xuất đúng trang, không kèm prompt/kết quả/tham số. |
| **Hạn mức & ngân sách** | Thông báo reset Corp đã quan sát; tự nhập giá USD/1 triệu input-output và ngân sách cho kỳ đang lọc. |

Đây là **ước tính văn bản UmiBridge quan sát bằng tokenizer offline `o200k_base`**, không phải hóa đơn hay số dư tài khoản. Không có dữ liệu đầy đủ về model, reasoning, cache, ảnh hoặc toàn bộ lịch sử ChatGPT. Tổng MCP, Corp và Arena có thể trùng nội dung.

MCP đọc nhật ký hiện tại và numeric archive nếu đã làm mới dữ liệu. Nguồn Chat Arena có số liệu riêng từ các lượt đã xác nhận gửi. Corp giữ tối đa 5.000 attempt gần nhất, chỉ tính lần đã xác nhận gửi; lượt thiếu output được đánh dấu một phần. Không dựng lại số liệu những chat cũ chưa từng được theo dõi. Giá/ngân sách bạn nhập lưu trong trình duyệt; cảnh báo chỉ tham khảo, không tự chặn nhiệm vụ hoặc thay đổi gói dịch vụ.

## Công cụ, skill và quyền truy cập

Trong **Tools**, tìm tên hoặc chọn nhóm để bật/tắt. Lựa chọn có hiệu lực cho lệnh mới dù ChatGPT còn cache danh sách cũ. Nhóm File, PowerShell và Windows cũng áp dụng cho thao tác tương ứng trên Agent.

Trong **Skills**, bật tài liệu muốn model tham khảo và xem trước nội dung. **Hướng dẫn MCP tự động** gửi lựa chọn công cụ/skill khi khởi tạo và bổ sung sau thay đổi. Model được hướng dẫn đọc skill phù hợp; script của skill không tự chạy. Tắt hướng dẫn không bật lại công cụ đã khóa.

Các lựa chọn này không thay system prompt hoặc quyền xác nhận của ChatGPT. Chúng cũng không tạo sandbox hệ điều hành: cho phép PowerShell đồng nghĩa cho phép lệnh shell thao tác với quyền Windows hiện tại. Chỉ bật nhóm phù hợp công việc.

| Nhóm Windows | Ví dụ công cụ |
| --- | --- |
| Quan sát | `windows_snapshot`, `windows_screenshot`, `windows_display_inventory`, `windows_control_status` |
| Chuột/phím | `windows_click`, `windows_type`, `windows_scroll`, `windows_move`, `windows_shortcut`, `windows_multi_select`, `windows_multi_edit` |
| Ứng dụng/hệ thống | `windows_app`, `windows_process`, `windows_clipboard`, `windows_notification`, `windows_registry` |
| Tệp/nội dung/chờ | `windows_scrape`, `windows_file_system`, `windows_wait`, `windows_wait_for` |
| Máy phụ | `windows_status`, `windows_on_device` |

Dùng `windows_snapshot` trước thao tác để lấy giao diện hiện tại. Dùng `run_command` cho PowerShell ẩn. **Settings → Windows tools → Pause** ngăn lệnh desktop mới, vẫn cho phép tệp/shell. Windows tools không điều khiển UAC/secure desktop hoặc Session 0.

Bộ Windows-MCP của [CursorTouch](https://github.com/CursorTouch/Windows-MCP) được ghim tại `e28abb5c6934cb3427190bdb970e02644c915ae3`, chạy stdio nền; telemetry và watchdog tùy chọn tắt. Ảnh MCP không lưu vào request journal; nội dung nhập/clipboard/giá trị registry được che. Token ảnh không được ước tính. Xem [nguồn và giấy phép](THIRD_PARTY_NOTICES.md).

## Quyền thường và Administrator

**Settings → Quyền chạy UmiBridge** hiển thị riêng quyền hiện tại và chế độ lần mở sau. Bắt đầu bằng quyền thường. Chỉ bật Administrator khi nhiệm vụ cần quyền đó.

Chọn **Bật Administrator** hoặc chạy `UmiBridge.cmd -Action admin`. Windows có thể hỏi UAC; tự xác nhận trên cửa sổ Windows. UmiBridge không nhận/lưu mật khẩu và không thay chính sách UAC. Chế độ ghi nhớ yêu cầu cùng tài khoản thuộc nhóm Administrators.

Bản Administrator dùng mã/runtime được bảo vệ trong `%ProgramData%\UmiBridge`; không tự chạy source vừa sửa trong thư mục giải nén. Vẫn mở **UmiBridge.cmd** mỗi ngày. Chọn **Dùng quyền thường** hoặc `-Action normal` để chuyển lại; dữ liệu được di chuyển qua lifecycle có kiểm tra digest. Các lựa chọn công cụ vẫn áp dụng ở cả hai chế độ.

## Ghép thêm máy Windows

Máy chính chạy gateway. Tại **Devices**, tạo mã ghép. Trên máy phụ có cùng bản UmiBridge, chạy `UmiBridge.cmd -Action pair`, nhập Hub URL và mã. Sau đó chạy `UmiBridge.cmd -Action agent`.

Agent kết nối outbound, nhận job qua `device_id`, trả stdout/stderr/exit code hoặc kết quả tệp. Thu hồi thiết bị tại **Devices** khi không dùng. Desktop trên Agent cần runtime và phiên Windows mở khóa. Ảnh máy phụ giữ tạm tối đa tám kết quả trong bộ nhớ; sau restart cần chụp lại. Nghiệm thu vật lý hiện giới hạn một máy Windows; xem [giới hạn kiểm thử](docs/ACCEPTANCE.vi.md).

## Workflows: sổ nhiệm vụ tùy chọn

Workflows ghi nhiệm vụ người dùng, trạng thái và liên kết request/job bằng thao tác rõ ràng. Nó không tự gửi chat hoặc tự chạy lại lệnh. Dùng Corp cho chuỗi chat tự bàn giao.

Mặc định Workflows tắt. Để bật bền vững, về Normal, dừng gateway rồi tạo marker trong thư mục cài:

```powershell
New-Item -ItemType Directory -Path .local-data\profile -Force | Out-Null
New-Item -ItemType File -Path .local-data\profile\workflows-enabled -Force | Out-Null
.\UmiBridge.cmd
```

Cũng có thể bật tạm bằng `UMIBRIDGE_WORKFLOWS=1` trong môi trường khởi chạy. Muốn tắt, về Normal, dừng, xóa đúng marker và bỏ biến bật tạm rồi mở lại. Nếu dùng Administrator, bật lại sau khi Normal đã nhận cấu hình. Không sửa trực tiếp `%ProgramData%`.

Ledger ở `.local-data/workflows.jsonl`; có trạng thái queued/running/waiting/paused/review/blocked/done/archived/cancelled, liên kết request và một job hoạt động. Sau restart/import, nhiệm vụ đang chạy chuyển chờ để người dùng đối chiếu. Export loại URL/token/secret/khóa dispatch; không dùng export làm bản sao đầy đủ dữ liệu runtime.

## Cập nhật và sao lưu

1. Dừng giao việc mới, đối chiếu các chat/lệnh đang chạy. Đợi chúng kết thúc trước khi thay runtime.
2. Nếu đang Administrator, chạy `UmiBridge.cmd -Action normal` để đưa dữ liệu về bản thường qua lifecycle chuẩn.
3. Dừng gateway bằng `UmiBridge.cmd -Action stop`.
4. Sao lưu riêng thư mục `.local-data` vào nơi bạn kiểm soát. Đây là dữ liệu riêng, có OAuth/mã ghép/prompt/kết quả; không tải lên GitHub hoặc gửi vào chat. Giữ `.runtime` để tránh tải lại runtime.
5. Tải ZIP mới và kiểm tra checksum. Giải nén đè các **tệp phát hành** vào đúng thư mục cài; giữ `.local-data` và `.runtime` hiện có. Không trộn mã từ nhiều phiên bản.
6. Mở **UmiBridge.cmd**, kiểm tra dashboard và quyền hiện tại. Nếu cần Administrator, bật lại để Windows cấp quyền cho bản sao mới.
7. Nếu extension thay đổi, Reload thẻ UmiBridge Corp và tải lại các tab ChatGPT. Nếu MCP thay đổi, làm mới công cụ trong connector.

Không chỉ chạy `Admin-Mode.ps1 -Action update` để cập nhật ứng dụng: thao tác đó cập nhật helper, không thay toàn bộ app payload. Dùng quy trình Normal rồi Admin nêu trên. Không chép tay vào thư mục được bảo vệ.

Muốn phục hồi: dừng Normal, giữ bản dữ liệu hiện tại riêng, khôi phục bản `.local-data` đã sao lưu cùng source tương thích rồi mở lại. Không khôi phục đè khi gateway đang ghi dữ liệu. Lệnh đã chạy trên máy không được hoàn tác bằng phục hồi nhật ký.

## Làm mới dữ liệu dự án, giữ thống kê token

Chỉ thực hiện khi muốn xóa lịch sử hoạt động cũ. Dừng gateway bằng launcher của đúng bản cài trước; nếu đang Administrator, về Normal qua lifecycle chuẩn trước khi thao tác source. Chạy dry-run với đường dẫn tuyệt đối của thư mục cài:

```powershell
node scripts/reset-project-data.mjs --root "D:\Apps\UmiBridge" --dry-run
```

Kiểm tra báo cáo rồi thay `--dry-run` bằng `--apply` khi đã quyết định xóa. Utility kiểm tra đúng ứng dụng, gateway đã dừng, khóa launcher và đối chiếu số liệu trước/sau. Nó chỉ cập nhật năm store: request-history.jsonl, token-history.jsonl, corp-state.json, chat-links.json và workflows.jsonl. Requests/Overview bắt đầu lịch sử mới; Analytics vẫn đọc số liệu cũ đã loại tham số, output, đường dẫn và liên kết chat. Corp bị tắt và mất nhiệm vụ/nhóm/khởi tạo cũ; OAuth, tunnel, mã ghép, quyền công cụ và tùy chọn được giữ. Utility không tạo backup dữ liệu chat cũ.

Lệnh này **không xóa thư mục sản phẩm trên ổ đĩa hoặc Project/chat trong ChatGPT**. Xóa remote là thao tác riêng, chỉ thực hiện khi đã xác nhận rõ phạm vi. State Arena độc lập không nằm trong năm store này. Không dùng làm mới dữ liệu để giả định mọi thao tác ngoài ứng dụng đã được hoàn tác.

## Lỗi thường gặp

| Hiện tượng | Cách kiểm tra và xử lý |
| --- | --- |
| Dashboard chưa mở | Chờ `UmiBridge is ready`, mở `http://127.0.0.1:43127/admin`; xem `.local-data/server-error.log` trên máy. |
| Cổng đã có phiên / `EADDRINUSE` | Dừng bằng launcher của bản đang chạy, rồi mở một bản duy nhất. |
| ChatGPT không gọi được tool | Xem Settings, Requests, trạng thái tunnel; thử `-Action repair` và kiểm tra OAuth của connector. |
| Corp offline | Mở đúng Chrome/Edge có extension, kiểm tra local endpoint/mã Corp, tải lại tab. Không nhập Connection code MCP vào extension. |
| Project chưa có nhân viên | Mở Project → Trò chuyện trong trình duyệt đã ghép; bấm Đồng bộ chat. Tạo/chuyển chat bằng ChatGPT trước. |
| Đồng bộ chỉ một phần | Giữ Project mở, chờ danh sách tải xong rồi đồng bộ lại. Mỗi lượt tối đa 60 vòng/1.000 chat. |
| Corp báo bản nháp/chat bận | Mở chat, xử lý bản nháp hoặc đợi phản hồi; đối chiếu lần gửi rồi mới dùng nút chuẩn bị thử lại. |
| Chat nằm ngoài Project | Mở bằng nút Mở chat trong Corp, đồng bộ lại sau khi chuyển chat. Tab `/c/...` riêng không thay cho URL có Project. |
| Đếm ngược limit đã hết nhưng chưa gửi | Kiểm tra gateway, trình duyệt, tự tiếp tục và thông báo hạn mức thật. Mốc 0 vẫn cần extension xác minh lại. |
| Chat chỉ viết kế hoạch | Gắn connector UmiBridge trong chat, kiểm tra công cụ bằng yêu cầu chỉ đọc; ghi rõ cần thực thi và tiêu chí bàn giao. |
| ChatGPT báo không tải được phản hồi | Corp chặn bàn giao placeholder lỗi. Đối chiếu công cụ và tệp đã tạo, rồi yêu cầu báo cáo ngắn khi đã kiểm tra; tránh chạy lại lệnh đã thành công. |
| Windows click/screenshot lỗi | Kiểm tra desktop đang mở khóa, Windows tools không Pause, quyền công cụ và cửa sổ hiện tại. |
| Sửa source nhưng Admin vẫn chạy bản cũ | Về Normal rồi bật Admin lại; đối chiếu phiên bản runtime, không chép đè `%ProgramData%`. |
| Token không khớp tài khoản | Số liệu chỉ đo payload quan sát, không có billing hoặc toàn bộ context/provider quota. |

Khi báo lỗi, gửi phiên bản, bước tái hiện và log ngắn đã che dữ liệu riêng. Không gửi nguyên `.local-data`, mã kết nối, cookie hoặc token.

## Phát triển và kiểm thử

Biên bản hiện tại: [Nghiệm thu 1.2.0](docs/ACCEPTANCE-1.2.vi.md). [Nghiệm thu 1.0.0](docs/ACCEPTANCE-1.0.vi.md) và [1.1.0](docs/ACCEPTANCE-1.1.vi.md) là lịch sử, không thay kết quả kiểm tra bản mới. Source dùng Node.js >=22.12.0. Từ thư mục repo:

```powershell
npm ci
npm run build
npm run local:test
```

Browser QA dùng Playwright đã cài ngoài dependency chạy ứng dụng:

```powershell
$env:PLAYWRIGHT_MODULE = 'duong-dan-tuyet-doi-toi-module-playwright'
npm run corp:qa
npm run arena:qa
npm run arena:adapter:qa
```

QA trình duyệt dùng extension thật, state tạm và trang nhà cung cấp giả lập để kiểm tra bàn giao, reset, bản nháp, thống kê và bố cục desktop/laptop. Kiểm thử giả lập không chứng minh hạn mức tài khoản thật đã reset. Lịch sử nghiệm thu và giới hạn nằm trong [ACCEPTANCE.vi.md](docs/ACCEPTANCE.vi.md) và [CORP.vi.md](docs/CORP.vi.md).

`.local-data`, `.runtime`, `node_modules`, `local-bin`, log, browser profile và dữ liệu tài khoản không được đưa vào Git hoặc ZIP. Source release đóng gói từ tệp được theo dõi. Bản cũ được giữ trong Releases để đối chiếu.

## License

MIT. Dự án độc lập; không sửa upstream DesktopCommanderMCP. Xem [LICENSE](LICENSE) và [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### Arena pixel sprites

Bản 1.2.1 dùng chiến binh Gladiator SMS của Chasersgaming (CC0), có năm bảng màu, frame animation và portrait giám khảo. Asset chạy local, giữ pixel nét và cùng đường chân trong Arena/Xem đôi. [Nguồn và cách căn sprite](docs/ARENA-PIXEL-ASSETS.vi.md), [ghi công](THIRD_PARTY_NOTICES.md).
