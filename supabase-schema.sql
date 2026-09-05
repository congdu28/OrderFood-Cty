-- Ăn Chung · Chia Gọn — Supabase schema cho môi trường TEST
-- Chạy toàn bộ file này trong Supabase Dashboard > SQL Editor > Run.
-- Chính sách dưới đây cho phép bất kỳ ai có link test cùng đọc/ghi dữ liệu.
-- Hãy thay bằng đăng nhập và RLS theo nhóm trước khi đưa vào sử dụng thật.

create table if not exists public.food_order_sessions (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.food_order_sessions enable row level security;

grant select, insert, update, delete on public.food_order_sessions to anon, authenticated;

drop policy if exists "test users can read food orders" on public.food_order_sessions;
drop policy if exists "test users can insert food orders" on public.food_order_sessions;
drop policy if exists "test users can update food orders" on public.food_order_sessions;
drop policy if exists "test users can delete food orders" on public.food_order_sessions;

create policy "test users can read food orders"
  on public.food_order_sessions for select to anon, authenticated using (true);
create policy "test users can insert food orders"
  on public.food_order_sessions for insert to anon, authenticated with check (true);
create policy "test users can update food orders"
  on public.food_order_sessions for update to anon, authenticated using (true) with check (true);
create policy "test users can delete food orders"
  on public.food_order_sessions for delete to anon, authenticated using (true);

-- Bật Realtime cho thay đổi phiên đặt đồ. Khối DO giúp chạy lại SQL an toàn.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'food_order_sessions'
  ) then
    alter publication supabase_realtime add table public.food_order_sessions;
  end if;
end $$;

-- Bucket công khai dành riêng cho mã QR thanh toán trong lúc test.
insert into storage.buckets (id, name, public)
values ('payment-qr', 'payment-qr', true)
on conflict (id) do update set public = true;

drop policy if exists "test users can read payment qr" on storage.objects;
drop policy if exists "test users can upload payment qr" on storage.objects;

create policy "test users can read payment qr"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'payment-qr');
create policy "test users can upload payment qr"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'payment-qr');
