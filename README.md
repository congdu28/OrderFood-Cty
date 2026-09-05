# Ăn Chung · Chia Gọn

MVP website nội bộ để một nhóm cùng chọn món, chốt tiền và theo dõi trạng thái chuyển khoản.

## Cách chạy

Mở trực tiếp file `index.html` bằng trình duyệt. Dự án không dùng thư viện hay bước cài đặt nào.

## Luồng chính

1. Lần truy cập đầu tiên, mỗi người tạo một **nickname dùng lại**. Nickname được lưu trên trình duyệt và tự điền ở các phiên sau trên cùng thiết bị.
2. Bất kỳ ai cũng có thể bấm **Tạo phiên đặt đồ**, nhập quán, hạn chốt và **danh sách món kèm giá** trước khi mở phiên. Người tạo chỉ có quyền quản lý, chưa được tính là người tham gia đặt món.
3. Người muốn đặt cùng chỉ cần **tick món đầu tiên**. Hệ thống tự thêm nickname đã lưu vào phiên, không yêu cầu nhập lại; sau đó bấm **Xác nhận món đã chọn**. Người tạo cũng cần tick món nếu muốn gọi món.
4. Người tạo phiên chọn một trong hai cách tính:
   - **Chia đều:** nhập tổng hóa đơn cuối cùng.
   - **Theo từng món:** hệ thống cộng món mỗi người chọn; phí ship và giảm giá được chia đều.
5. Nhập thông tin tài khoản, nội dung chuyển khoản và tải ảnh QR nếu có.
6. Phần tính tiền và theo dõi chuyển khoản hiển thị rõ từng người chọn món gì, số lượng, giá từng món và tổng cần chuyển. Khi mọi người đã xác nhận, bất kỳ người nào đã tham gia phiên đều có thể bấm **Chốt & gửi tổng tiền** để khóa món/giá và mở checkbox **Đã chuyển**. Mỗi nickname chỉ tick được trạng thái của chính mình.
7. Menu trái có khu vực **Đăng nhập quản trị**. Tài khoản Admin sau khi đăng nhập có thể quản lý mọi phiên và quyền trên trang. Ngoài ra, người tạo là **ADMIN** mặc định trong phiên và có thể đặt hoặc gỡ quyền ADMIN cho người đang tham gia; ADMIN được sửa cách chia, phí/phát sinh, thông tin thanh toán, quản lý người tham gia, **Hoàn thành đơn** và **xóa** phiên. Giá món có sẵn được cố định ngay khi tạo phiên. Phiên xóa được đưa vào mục **Đã xóa** để lịch sử không mất dữ liệu. Thao tác không có quyền sẽ hiện thông báo rõ ràng.
8. Hoàn tất phiên để giữ lại số liệu trong màn Lịch sử; có bộ lọc ngày, tuần, tháng, năm và nút xuất JSON.

## Lưu ý của MVP

Dữ liệu phiên đặt đồ được đồng bộ vào Supabase nếu đã cấu hình. Nickname được lưu bằng `localStorage`, nên chỉ dùng lại được trên chính trình duyệt/thiết bị đã tạo. Muốn đổi nickname, bấm vào avatar ở góc phải hoặc nút **Đổi nickname**.

Menu trái lọc riêng **phiên đang mở**, **phiên đã chốt** và **phiên đã hoàn thành**; ô chọn phiên chỉ hiển thị đúng nhóm đang chọn. Tổng quan luôn ưu tiên phiên đang mở, sau đó là phiên người dùng vừa chọn và phiên đã chốt. Lịch sử có bốn ô: **Đã hoàn thành**, **Đã chốt**, **Lưu trữ** và **Đã xóa**.

## Bật Supabase để test nhiều người dùng

Website đã có sẵn adapter Supabase. Thực hiện một lần theo thứ tự sau:

1. Tạo một project trên [Supabase](https://supabase.com/dashboard).
2. Mở **SQL Editor**, dán toàn bộ nội dung [supabase-schema.sql](./supabase-schema.sql) rồi bấm **Run**.
3. Trong **Connect / API Keys**, sao chép **Project URL** và **Publishable key** (hoặc anon key), rồi cập nhật `supabase-config.js`:

```js
window.SUPABASE_CONFIG = {
  url: "https://ten-project.supabase.co",
  publishableKey: "sb_publishable_..."
};
```

4. Tải lại website trên từ hai trình duyệt hoặc hai thiết bị. Góc trái sẽ hiện **Supabase · đồng bộ trực tiếp** khi kết nối thành công.

Trong lúc test, schema của `food_order_sessions` mở quyền đọc/ghi cho mọi người có link để dễ đồng bộ. Đăng nhập Admin hiện được lưu trong `sessionStorage` của trình duyệt. Vì đây vẫn là frontend tĩnh, người có quyền truy cập mã nguồn có thể kiểm tra hoặc thay đổi cơ chế xác thực; khi dùng nội bộ thực tế, nên bổ sung Supabase Auth và RLS để bảo vệ quyền quản trị ở cấp database.

Không bao giờ dán `service_role key` vào `supabase-config.js` hoặc đưa lên website.
