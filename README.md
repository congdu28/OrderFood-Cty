# Ăn Chung · Chia Gọn

MVP website nội bộ để một nhóm cùng chọn món, chốt tiền và theo dõi trạng thái chuyển khoản.

## Cách chạy

Mở trực tiếp file `index.html` bằng trình duyệt. Dự án không dùng thư viện hay bước cài đặt nào.

## Luồng chính

1. Bất kỳ ai cũng có thể bấm **Tạo phiên đặt đồ**, nhập quán, hạn chốt, nickname và **danh sách món kèm giá** trước khi mở phiên. Người tạo chỉ có quyền quản lý, chưa được tính là người tham gia đặt món.
2. Người muốn đặt cùng nhập **nickname riêng chỉ trong phiên đó** rồi bấm **Tham gia**. Người tạo cũng cần bấm Tham gia nếu muốn gọi món. Tổng tiền/chia đều chỉ cập nhật theo số nickname đã tham gia.
3. Người tạo phiên chọn một trong hai cách tính:
   - **Chia đều:** nhập tổng hóa đơn cuối cùng.
   - **Theo từng món:** hệ thống cộng món mỗi người chọn; phí ship và giảm giá được chia đều.
4. Nhập thông tin tài khoản, nội dung chuyển khoản và tải ảnh QR nếu có.
5. Bấm **Chốt & gửi tổng tiền** để khóa món/giá và mở checkbox **Đã chuyển**.
6. Chọn tên từng thành viên trong bản demo để mô phỏng việc họ tick đã chuyển. Khi triển khai thật, bước này sẽ theo tài khoản đăng nhập của người dùng.
7. Người tạo có thể **lưu trữ** phiên để khôi phục sau, hoặc **xóa hẳn** sau bước xác nhận. Phiên lưu trữ nằm trong bộ lọc **Kho lưu trữ** ở màn Lịch sử.
8. Hoàn tất phiên để giữ lại số liệu trong màn Lịch sử; có bộ lọc ngày, tuần, tháng, năm và nút xuất JSON.

## Lưu ý của MVP

Dữ liệu hiện được lưu bằng `localStorage`, vì vậy chỉ tồn tại trên **trình duyệt và thiết bị đang mở website**. Đây là lựa chọn phù hợp để duyệt giao diện và luồng nghiệp vụ.

Để mọi thành viên cùng xem/chọn món trên các máy khác nhau, bước kế tiếp là thay `localStorage` bằng Firebase Firestore hoặc Supabase, thêm đăng nhập Google/email nội bộ và phân quyền người tạo phiên.

## Bật Supabase để test nhiều người dùng

Website đã có sẵn adapter Supabase. Thực hiện một lần theo thứ tự sau:

1. Tạo một project trên [Supabase](https://supabase.com/dashboard).
2. Mở **SQL Editor**, dán toàn bộ nội dung [supabase-schema.sql](./supabase-schema.sql) rồi bấm **Run**.
3. Trong **Connect / API Keys**, sao chép **Project URL** và **Publishable key** (hoặc anon key).
4. Sao chép [supabase-config.example.js](./supabase-config.example.js) thành `supabase-config.js`, rồi điền hai giá trị:

```js
window.SUPABASE_CONFIG = {
  url: "https://ten-project.supabase.co",
  publishableKey: "sb_publishable_..."
};
```

5. Tải lại website trên từ hai trình duyệt hoặc hai thiết bị. Góc trái sẽ hiện **Supabase · đồng bộ trực tiếp** khi kết nối thành công.

Trong lúc test, schema mở quyền đọc/ghi cho mọi người có link để nickname và phiên đặt đồ có thể đồng bộ ngay. Không dùng cấu hình đó cho môi trường thật; khi triển khai nội bộ cần bật Supabase Auth và thay chính sách RLS theo nhóm/người tạo phiên.

Không bao giờ dán `service_role key` vào `supabase-config.js` hoặc đưa lên website.
