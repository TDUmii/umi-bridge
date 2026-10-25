# Nghiệm thu UmiBridge 1.2.1

Ngày 25/10/2026. Phạm vi: asset chiến binh pixel và căn chỉnh Arena/Xem đôi cho desktop/laptop.

| Hạng mục | Kết quả |
| --- | --- |
| Nguồn và quyền dùng asset | Gladiator SMS của Chasersgaming, CC0 1.0; giấy phép đầy đủ, metadata PNG, hash ZIP/gốc/atlas và script tái tạo đi kèm. Không mua asset hoặc đưa asset hạn chế phân phối vào source. |
| Khung pixel | Idle/Run: bốn cột, năm bảng màu, frame 18×24; hiển thị 36×48. Crop cố định `(3,8)-(21,32)` giữ toàn bộ bàn chân ở cả bốn Run frame. |
| Syntax build | `npm run build` PASS. |
| Gateway | `node --test test/arena-gateway.test.mjs` PASS. PNG signature đúng, HTTP 200 qua local-admin, 404 ngoài local-admin, CSP cho ảnh cùng origin. |
| Arena browser | `npm run arena:qa` PASS. Ba PNG tải đúng kích thước; đủ 20 sprite; frame/nhãn trong cảnh tại 1600×1000 và 1366×768; giữ progress/path, tab/focus, chọn thư mục, trạng thái và reduced motion. |
| Xem đôi browser | `npm run watch:qa` PASS. Hai pane, chọn scope, phóng lớn/Escape, Fit, Office switch, hidden/reduced motion; 0 POST, 0 remote request, 0 page error. Kiểm tra dừng iframe đợi message đã áp dụng thay vì đọc ngay sau click. |
| Local đang chạy | Health đạt; sprite route HTTP 200 image/png. Arena hiện có đã hủy; không tạo hoặc bắt đầu giải thật khi kiểm tra asset. |
| Phát hành | Bộ đầy đủ trên Windows CI và checksum ZIP của đúng commit được ghi ở release v1.2.1. Không dùng kết quả full suite 1.2.0 thay cho bản này. |

Hai lượt ảnh desktop/laptop xác định và sửa nhãn hàng dưới sát mép, chữ chạm cờ, khoảng chân sprite và vị trí giám khảo. Asset giữ trên máy, không hotlink. Thư mục QA, ZIP nguồn tải về, HTML nguồn, dữ liệu app và profile nằm ngoài release source.

Đây là fixture UI/API và ảnh nguồn, không chứng minh giải 20 sản phẩm LLM thật hoặc chứng nhận chất lượng sản phẩm do thí sinh tạo. Không đổi runtime chấm, dispatch hoặc phạm vi quyền công cụ.
