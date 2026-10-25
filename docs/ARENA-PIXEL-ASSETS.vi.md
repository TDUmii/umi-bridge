# Asset chiến binh Arena

Đối chiếu nguồn ngày 25/10/2026. Chỉ đóng gói sprite có quyền sửa và phân phối source rõ ràng.

| Bộ asset | Nguồn / điều kiện đã đối chiếu | Quyết định |
| --- | --- | --- |
| Gladiator SMS - Chasersgaming | [OpenGameArt](https://opengameart.org/content/rpg-asset-character-gladiator-sms), CC0 1.0. Có Idle/Walk/Run theo bốn hướng, cùng avatar. | Chọn. Mũ đấu sĩ, dáng pixel cổ điển hợp cảnh La Mã; bộ miễn phí tải được từ tác giả. |
| Gladiator - Elthen | [itch.io](https://elthen.itch.io/2d-pixel-art-gladiator-sprites), [licensing](https://elthen.itch.io/2d-pixel-art-gladiator-sprites). Có Idle/Run/Attack/Damage/Death; license hiện tại cấm phân phối lại asset nguyên liệu. | Không đưa raw sprite vào repository/source ZIP. |
| Roman Soldier - Siviovi | [itch.io](https://siviovi.itch.io/3pixelartcharactersanimated). Bộ trả phí; trang cũng nêu hạn chế phân phối lại. | Không mua hoặc đóng gói. |
| Ikaros Extended - surt và Scott Matott | [OpenGameArt](https://opengameart.org/content/ikaros-extended), CC-BY 3.0. Có sprite cổ đại và nhiều thế đánh. | Đã xem sheet; chưa dùng vì dáng phiêu lưu Hy Lạp khác đội đấu sĩ hiện tại. |

## Chuyển asset vào giao diện

Sprite gốc dùng canvas 24×32. Bốn frame được crop chung `(3,8)-(21,32)` thành 18×24, không cắt từng frame theo bounding box riêng. Cùng đường chân giúp hoạt ảnh không giật vị trí. Renderer phóng đúng 2× thành 36×48 với `image-rendering: pixelated`.

Hai atlas Idle và Run có bốn cột frame, năm hàng bảng màu. Năm màu vải/mũ giúp phân biệt vị trí, không mang ý nghĩa điểm hoặc thứ hạng. Thí sinh đang thực hiện dùng chu kỳ Run; người chờ giữ một frame Idle. Giảm chuyển động, tạm dừng và ẩn pane giữ ảnh tĩnh. Kết quả loại/đi tiếp/thắng chỉ lấy từ state Arena.

Giám khảo dùng portrait crop từ avatar đi kèm. Phần chữ trạng thái, progress và lịch sử vẫn là DOM, không bị raster hóa. Chữ trạng thái tối thiểu 11px; nhãn hai hàng nằm trong cảnh, không đè sprite. Mỗi vị trí có tên/trạng thái/phiên bản qua accessible label và focus bàn phím.

Nguồn, giấy phép, hash gốc và hash atlas nằm trong `scripts/arena-assets/`. `scripts/prepare-arena-sprites.py` tái tạo atlas từ ZIP gốc, không tải hoặc chạy nội dung trong ZIP. PNG nhúng metadata nguồn, tác giả và CC0. Ứng dụng phục vụ asset qua route local-admin; không hotlink ra website tác giả.

## Kiểm tra

`arena:qa` và `watch:qa` dùng gateway tạm cùng dữ liệu MINH HỌA. Kiểm tra cả Arena riêng và Xem đôi ở 1600×1000, 1366×768: đủ 20 vị trí, progress/path trong viewport, sprite tải được, nhãn không tràn, active/paused/hidden/reduced motion và không request remote. Gateway test xác nhận PNG chỉ truy cập qua local-admin, cùng CSP cho ảnh nội bộ.
