# Arena trong UmiBridge 1.2.0

Arena có mục riêng trên thanh điều hướng dashboard. Một ý tưởng tạo một Project ChatGPT riêng với **20 chat thí sinh và 1 chat giám khảo**. Mỗi thí sinh tự xây toàn bộ sản phẩm trong chat và thư mục của mình. Corp giữ Project, đội ngũ và hàng đợi riêng; không chọn Project Corp để chạy Arena.

Phạm vi giao diện: desktop/laptop, 1600×1000 và 1366×768. Hướng dẫn này không chứng nhận thiết bị di động hoặc một giải đấu thật đã hoàn tất.

## Chuẩn bị và kết nối

1. Cập nhật UmiBridge 1.2.0 và extension trong thư mục extensions/umibridge-corp lên **0.4.0**.
2. Trong chrome://extensions/ hoặc edge://extensions/, bật Developer mode rồi bấm **Reload** trên thẻ UmiBridge Corp. Sau đó tải lại các tab ChatGPT. Thay source trên ổ đĩa chưa tự nạp lại extension đã cài.
3. Mở dashboard local tại [http://127.0.0.1:43127/admin#arena](http://127.0.0.1:43127/admin#arena). Kiểm tra trạng thái extension. Corp và Arena dùng chung browser transport và mã ghép; giữ kết nối cũ nếu còn hợp lệ. Mã ghép extension khác Connection code OAuth của MCP.
4. Nếu chưa ghép, mở **Kết nối** tại Arena, tạo mã ghép rồi nhập địa chỉ local và mã trong cài đặt extension. Không gửi mã vào chat hoặc issue. Tạo/thu hồi mã ảnh hưởng kết nối trình duyệt chung.
5. Trong ChatGPT, bảo đảm connector UmiBridge được phép dùng ở các chat cần đọc/sửa source và chạy kiểm thử. Kiểm tra quyền công cụ bằng thao tác chỉ đọc trước khi thực hiện công việc.

Prompt yêu cầu **GPT-6.1 Sol**. Extension không bảo đảm hoặc chứng minh model đang được chọn trong ChatGPT UI. Người dùng kiểm tra lựa chọn model và công cụ trước khi bắt đầu; không có tự đổi tài khoản/model hoặc vượt hạn mức.

## Tạo và bắt đầu

1. Chọn **Tạo Arena**, nhập tên, ý tưởng và **Thư mục lưu**. Có thể nhập đường dẫn tuyệt đối hoặc bấm **Chọn thư mục**. Hủy/Escape giữ bản nháp; thư mục đã lưu không đổi khi tùy chọn lần sau đổi.
2. Lưu Arena. Số thí sinh cố định là 20; một giám khảo riêng chấm toàn bộ giải. Thao tác tạo không tự bật điều phối hoặc gửi yêu cầu phát triển sản phẩm.
3. Bật **Điều phối Arena**, bấm **Tạo Project và 21 chat**. Extension tạo Project trước, sau đó 20 chat thí sinh và chat giám khảo. Tiến độ chỉ tính chat đã xác nhận, từ 0/21 đến 21/21.
4. Khởi tạo xong, kiểm tra Project, chat và thư mục, rồi bấm **Bắt đầu**. Mỗi thí sinh nhận cùng ý tưởng và tự chịu trách nhiệm sản phẩm hoàn chỉnh.
5. Giữ gateway và trình duyệt hoạt động. Khi không xác nhận được tạo/gửi hoặc sau restart, đối chiếu tab và tệp trước khi chuẩn bị thử lại. Không tự tạo lại Project/chat chưa rõ kết quả.

Arena có công tắc điều phối, state và API riêng. Tắt Corp không thay công tắc Arena. Project và chat Arena không trở thành nhân viên hoặc nhiệm vụ trong hàng đợi Corp. Dùng chung hạ tầng công cụ không tạo sandbox hệ điều hành cho từng thí sinh: quyền tệp/lệnh vẫn là quyền công cụ đã cấp.

Các chat có lịch sử và source riêng, nhưng bộ nhớ/ngữ cảnh chung do ChatGPT Project quản lý. Prompt cấm đọc/sao chép sản phẩm đối thủ; UmiBridge không chứng nhận cách ly bộ nhớ nội bộ của nhà cung cấp.

## Sản phẩm bắt buộc

Mỗi thí sinh phải tạo mã nguồn thật, README và tệp bằng chứng trong thư mục riêng. README có hướng dẫn cài đặt, build, test và chạy. Báo cáo phải chỉ rõ source, README, artifact và ba kiểm tra **build**, **test**, **run** đạt, mỗi kiểm tra có lệnh, kết quả quan sát và tệp bằng chứng không rỗng. Không đủ công cụ hoặc chưa chạy được thì báo bị chặn; câu trả lời chỉ có kế hoạch không phải sản phẩm hoàn thành.

Gateway kiểm tra đường dẫn thuộc đúng thư mục, tệp thật không rỗng, source/README và cấu trúc báo cáo. Khi chấp nhận một phiên bản, hệ thống lưu bản source, README, bằng chứng cùng manifest, SHA-256 của manifest/source và từng tệp. Đây là phiên bản bất biến được kiểm tra trước khi tiếp tục. Không sửa/xóa bản lịch sử để thay kết quả trước.

Băm tệp chứng minh danh tính/nội dung đã ghi, không tự chứng minh lệnh được thực thi đúng hoặc sản phẩm đạt chất lượng. Người dùng và giám khảo cần đối chiếu bằng chứng thực tế. Sản phẩm chưa đạt cổng kiểm tra sẽ dừng, không tự ghi thành công.

## Năm vòng chọn và cải tiến

Số sản phẩm đi tiếp cố định: **20 → 10 → 5 → 3 → 2 → 1**. Không có vòng bảng hoặc chấm từng cặp. Trong mỗi vòng, giám khảo duy nhất đọc tất cả sản phẩm còn lại và xếp hạng theo cùng rubric:

| Tiêu chí | Điểm tối đa |
| --- | ---: |
| Yêu cầu / chức năng | 30 |
| Trải nghiệm / khả năng tiếp cận | 15 |
| Kiểm thử / bằng chứng | 20 |
| Bảo mật | 10 |
| Hiệu năng / độ ổn định | 10 |
| Khả năng bảo trì | 5 |
| Chạy local / tài liệu | 10 |
| **Tổng** | **100** |

Arena mới từ 1.2.0 dùng rubric v2 ở bảng trên. Arena đã tạo trước cập nhật giữ rubric v1: chức năng 35, trải nghiệm 15, bằng chứng 20, bảo mật 15 và local/tài liệu 15. Điểm lịch sử và prompt giám khảo đã xếp hàng không bị đổi thang điểm; màn Vòng đấu hiển thị đúng rubric của Arena đang chọn.

Công bằng là quy tắc chấm chung: cùng dữ liệu, tiêu chí và mức kiểm tra cho mọi thí sinh; không phạt tên, ngôn ngữ, framework, khuyết tật hoặc nguồn gốc. Khả năng tiếp cận nằm trong UX, gồm bàn phím, focus, nhãn, tương phản và giảm chuyển động khi phù hợp. Hiệu năng cần số đo hoặc hành vi quan sát; khả năng bảo trì dựa vào cấu trúc và hướng dẫn sửa.

Mỗi sản phẩm cần đủ điểm thành phần theo rubric đã lưu, lý do, tổng khớp, kiểm tra và phản hồi cụ thể. Thứ hạng giảm dần theo tổng; hòa ở ranh giới đi tiếp cần giải thích phân định. Phản hồi có điểm mạnh, lỗi và thay đổi cần làm cho từng thí sinh, kể cả bị loại.

**Mọi thí sinh đi tiếp phải cải tiến trước lần chấm sau.** Thí sinh đọc phản hồi giám khảo, sửa ít nhất một tệp source rồi chạy lại build/test/run và cung cấp bằng chứng mới. Gateway từ chối bản source không đổi hoặc phiên bản thiếu kiểm tra. Chỉ khi tất cả sản phẩm còn lại hoàn tất cải tiến mới gửi giám khảo chấm vòng tiếp. Thí sinh bị loại giữ sản phẩm và bằng chứng, không nhận vòng cải tiến mới.

Kết thúc vòng cuối còn một sản phẩm. Dashboard hiển thị người thắng và đường dẫn bàn giao; không tự publish/deploy, mua dịch vụ hoặc xóa sản phẩm còn lại. Số lượt thực tế phụ thuộc quá trình phát triển/sửa và hạn mức; không suy ra chi phí từ số chat hoặc số vòng.

## Các màn hình

| Tab | Nội dung |
| --- | --- |
| **Trực tiếp** | Đấu trường La Mã với 20 vị trí thí sinh và giám khảo; trạng thái trống, khởi tạo hoặc lượt hiện tại, tiến độ và người thắng. |
| **Ứng viên** | 20 chat/thư mục, các phiên bản source/bằng chứng, manifest/hashes, kiểm tra và phản hồi; chat giám khảo riêng. |
| **Vòng đấu** | Chọn vòng, xếp hạng toàn bộ thí sinh còn lại, điểm từng tiêu chí, người đi tiếp, phản hồi và bằng chứng. |
| **Lịch sử** | Sự kiện tạo, khởi tạo, giao việc, phiên bản, chấm, tạm dừng, phục hồi và hoàn tất đã ghi. |

Thanh trên đấu trường đặt tiến độ chat/lượt đã xác nhận, lộ trình chọn và link chat hiện tại trước phần trang trí. Chữ trạng thái thí sinh tối thiểu 11px ở bố cục desktop/laptop. Các tab hỗ trợ Tab, phím mũi tên, Home/End; lựa chọn được giữ khi refresh. Hoạt ảnh chỉ phản ánh trạng thái đã ghi nhận, không chứng minh model đang suy nghĩ. Giảm chuyển động giữ thông tin tĩnh.

## Xem Corp và Arena cùng lúc

Mở **Xem đôi** trên thanh điều hướng để thấy văn phòng Corp và đấu trường Arena bên nhau. Chọn Arena ở pane Arena; lựa chọn Project Corp nằm ở pane Corp và không trộn chat, nhiệm vụ hay công tắc điều phối. Dùng **Phóng lớn** để tập trung một pane; **Escape** trở lại hai pane. Pane bị che và tab trình duyệt bị ẩn dừng hoạt ảnh. Chế độ giảm chuyển động giữ trạng thái bằng chữ.

Xem đôi đọc trạng thái đã có, không tạo Project/chat hoặc tự bắt đầu giải. Muốn tạo, bật/tắt hoặc phục hồi Arena, mở mục Arena. Văn phòng Corp tôn trọng lựa chọn Văn phòng: Bật/Tắt riêng.

## Tạm dừng và phục hồi

**Tạm dừng** hoặc tắt Điều phối Arena ngăn lượt mới; thao tác đã gửi cho ChatGPT/công cụ có thể vẫn chạy. **Hủy Arena** không thay thao tác dừng lệnh hệ điều hành. **Xóa khỏi danh sách** chỉ dành trạng thái đã kết thúc, giữ Project/chat và tệp trên ổ đĩa.

Sau restart hoặc lần gửi/tạo chưa xác nhận, kiểm tra chat, bản nháp, source và bằng chứng. Chỉ dùng **Đã kiểm tra - thử lại** khi đã đối chiếu; Arena trở lại tạm dừng rồi cần Bắt đầu rõ ràng. Gửi lại có thể lặp thao tác nếu lượt cũ đã thực hiện. Không dùng báo cáo lỗi tải phản hồi, câu trả lời thiếu artifact hoặc placeholder làm kết quả đạt.

State riêng ở .local-data/arena-state.json, không đưa vào Git/ZIP. API local-admin dùng /admin/api/arena; bridge trình duyệt dùng /admin/arena/bridge. Lối tạo Arena cũ trong Corp trả 410 arena_moved hoặc từ chối input cũ với 400. Không tự chuyển nhiệm vụ Arena cũ thành Arena mới.

## Token và làm mới dữ liệu

Analytics có nguồn **Chat Arena**, tách **Chat Corp** và **Công cụ MCP**. Chỉ prompt đã xác nhận gửi và output quan sát được mới góp số liệu. Token offline o200k_base không bao gồm đầy đủ lịch sử, reasoning, cache, ảnh hoặc dữ liệu tính phí; tổng các nguồn có thể trùng nội dung. Model thực và số dư quota không được suy ra từ thống kê này.

Utility reset dự án mặc định dry-run, chỉ apply khi gateway đã dừng và root ứng dụng đúng. Năm store của reset là request-history.jsonl, token-history.jsonl, corp-state.json, chat-links.json và workflows.jsonl. Request history trở về rỗng; số liệu MCP đã làm sạch chuyển vào token-history.jsonl để Analytics giữ totals và time series. OAuth/tunnel/pairing/quyền công cụ/preferences giữ nguyên. State Arena độc lập không nằm trong reset này. Xem [README](../README.md#làm-mới-dữ-liệu-dự-án-giữ-thống-kê-token).

Reset không xóa tệp sản phẩm trên ổ đĩa hoặc Project/chat remote. Xóa dữ liệu ChatGPT cần thao tác riêng và xác nhận rõ phạm vi. Không tự tạo backup chat cũ trong quy trình làm mới.

## Kiểm tra và giới hạn

Từ thư mục repo, với Playwright đã cài và PLAYWRIGHT_MODULE trỏ đúng module:

```powershell
npm run build
npm run local:test
npm run arena:qa
npm run arena:adapter:qa
```

Runtime tests và browser fixtures không dùng tài khoản/provider thật. Kết quả cụ thể nằm trong [nghiệm thu 1.2.0](ACCEPTANCE-1.2.vi.md) sau khi chạy; tài liệu này không khẳng định số lượng tests hoặc CI chưa kiểm tra. Chưa xác minh toàn bộ giải xây/sửa/chấm sản phẩm bằng tài khoản ChatGPT thật. Giao diện provider thay đổi, đăng nhập, quyền connector hoặc chọn model có thể cần người dùng đối chiếu.
