# Ăn Chung · Chia Gọn

MVP website nội bộ để một nhóm cùng chọn món, chốt tiền và theo dõi trạng thái chuyển khoản.

## Cách chạy

Mở trực tiếp file `index.html` bằng trình duyệt. Dự án không dùng thư viện hay bước cài đặt nào.

## Luồng chính

1. Lần truy cập đầu tiên, mỗi người tạo một **nickname dùng lại**. Nickname này tự điền ở các phiên sau trên cùng trình duyệt; có thể đăng nhập Google để lưu vào Supabase và dùng lại trên thiết bị khác.
2. Bất kỳ ai cũng có thể bấm **Tạo phiên đặt đồ**, nhập quán, hạn chốt và **danh sách món kèm giá** trước khi mở phiên. Người tạo chỉ có quyền quản lý, chưa được tính là người tham gia đặt món.
3. Người muốn đặt cùng bấm **Tham gia** bằng nickname đã lưu. Người tạo cũng cần bấm Tham gia nếu muốn gọi món. Tổng tiền/chia đều chỉ cập nhật theo số người đã tham gia.
4. Người tạo phiên chọn một trong hai cách tính:
   - **Chia đều:** nhập tổng hóa đơn cuối cùng.
   - **Theo từng món:** hệ thống cộng món mỗi người chọn; phí ship và giảm giá được chia đều.
5. Nhập thông tin tài khoản, nội dung chuyển khoản và tải ảnh QR nếu có.
6. Bấm **Chốt & gửi tổng tiền** để khóa món/giá và mở checkbox **Đã chuyển**. Mỗi tài khoản chỉ tick được trạng thái của chính mình.
7. Người tạo có thể **lưu trữ** phiên để khôi phục sau, hoặc **xóa hẳn** sau bước xác nhận. Phiên lưu trữ nằm trong bộ lọc **Kho lưu trữ** ở màn Lịch sử.
8. Hoàn tất phiên để giữ lại số liệu trong màn Lịch sử; có bộ lọc ngày, tuần, tháng, năm và nút xuất JSON.

## Lưu ý của MVP

Dữ liệu phiên đặt đồ được đồng bộ vào Supabase nếu đã cấu hình. Nickname không đăng nhập chỉ được lưu trong trình duyệt hiện tại; nickname đi kèm Google được lưu vào bảng profile có RLS và có thể dùng lại trên máy khác.

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

## Bật đăng nhập Google và profile lâu dài

1. Sau khi pull bản mới, chạy lại toàn bộ [supabase-schema.sql](./supabase-schema.sql) trong **Supabase → SQL Editor** để tạo bảng `food_order_profiles` cùng RLS.
2. Trong Google Cloud, tạo OAuth Client loại **Web application**, thêm URL Vercel vào **Authorized JavaScript origins**, rồi thêm chính xác callback URL hiển thị trong trang **Supabase → Authentication → Providers → Google** vào **Authorized redirect URIs**.
3. Trong Supabase, vào **Authentication → Providers → Google**, bật Google và dán Client ID/Client Secret vừa tạo.
4. Vào **Authentication → URL Configuration**, đặt Site URL là URL Vercel và thêm URL đó vào Redirect URLs. Sau khi Google trả về website, người dùng chọn nickname lần đầu; các lần sau hệ thống sẽ nhận lại đúng profile.

Trong lúc test, schema của `food_order_sessions` vẫn mở quyền đọc/ghi cho mọi người có link để dễ đồng bộ. RLS chỉ bảo vệ bảng profile; để dùng nội bộ thực tế cần bước tiếp theo là tách bảng session/members và áp RLS theo nhóm/người tạo phiên.

Không bao giờ dán `service_role key` vào `supabase-config.js` hoặc đưa lên website.
