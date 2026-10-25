# Nguồn tham khảo đội kiểm thử

Đối chiếu ngày 25/10/2026. Các quy chuẩn trong UmiBridge được viết riêng theo sản phẩm và mục tiêu người dùng. Không đóng gói mã, chạy installer hoặc cài dịch vụ từ các repo dưới đây.

| Nguồn | Phần tham khảo | Áp dụng trong UmiBridge |
| --- | --- | --- |
| [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | Danh mục skill hiện tại | Tìm đúng publisher và phạm vi kiểm tra |
| [anthropics/skills - webapp-testing](https://github.com/anthropics/skills/tree/main/skills/webapp-testing) | Đọc UI đã render, xác định selector, chạy tương tác và lưu bằng chứng | QA web và đội UX; kiểm lỗi thật bằng browser |
| [microsoft/playwright](https://github.com/microsoft/playwright) | Browser automation và kiểm luồng người dùng | Fixture riêng, desktop/laptop, log/screenshot và hành vi tái hiện |
| [dequelabs/axe-core](https://github.com/dequelabs/axe-core) | Kiểm accessibility tự động trong UI thực | Đội UX kiểm bàn phím/focus/nhãn/tương phản; axe là bổ sung khi có, không thay kiểm thủ công |
| [OWASP/ASVS](https://github.com/OWASP/ASVS) | Yêu cầu kiểm soát bảo mật theo phạm vi sản phẩm | Quyền, input, dữ liệu, bí mật và lỗi có bằng chứng; không gắn nhãn chứng nhận ASVS |

Ngoài QA, bảo mật và vận hành nền tảng, tám đội tùy chọn gồm kiến trúc, UX/tiếp cận, API/tích hợp, hiệu năng, dữ liệu, desktop, giáo dục và game/animation. Mỗi đội có kiểm trước sửa và kiểm cuối độc lập; kiểm cuối không đạt sẽ dừng quy trình. Hồ sơ sản phẩm và mục đích được ghim cùng run/bootstrap, đưa vào prompt và báo cáo; thay cấu hình không viết lại quy trình đã tạo.

Các đội đọc/sửa/chạy trong phạm vi Project theo quyền đã có. Không có API key mới hoặc pentest dịch vụ ngoài phạm vi. Tên đội không bảo đảm chất lượng: báo cáo cần lệnh/kết quả, artifact, trạng thái PASS/FAIL/CHƯA KIỂM TRA. Runtime kiểm cấu trúc báo cáo; không tự chạy lại mọi lệnh hoặc chứng nhận độ đúng ngữ nghĩa.

Model đối chiếu: [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol) và [model trên ChatGPT](https://learn.chatgpt.com/docs/models). Danh sách API không được dùng làm bằng chứng tài khoản web có quyền chọn. Extension đọc model picker công khai, quét từng mức bằng phím và khôi phục lựa chọn ban đầu. Settings chỉ lưu model/effort được picker báo; trước gửi sẽ chọn và xác minh lại. Không tìm thấy lựa chọn thì chặn gửi; không thêm lời yêu cầu model vào prompt để giả đổi model.
