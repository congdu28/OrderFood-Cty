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

-- Hồ sơ tài khoản email. Nickname được lưu theo auth.users để dùng lại trên mọi thiết bị.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(trim(nickname)) between 1 and 30),
  color text not null default '#628d76',
  provider text not null default 'email',
  avatar_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

grant select, insert, update on public.profiles to authenticated;

drop policy if exists "users can read own profile" on public.profiles;
drop policy if exists "users can insert own profile" on public.profiles;
drop policy if exists "users can update own profile" on public.profiles;

create policy "users can read own profile"
  on public.profiles for select to authenticated using (auth.uid() = id);
create policy "users can insert own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "users can update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Tự tạo hồ sơ ngay khi đăng ký. Nickname vẫn đồng thời nằm trong Auth metadata,
-- nhờ đó đăng nhập không phụ thuộc tuyệt đối vào bảng profiles.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, nickname, color, provider, avatar_url)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''), split_part(new.email, '@', 1), 'Thành viên'),
    coalesce(nullif(new.raw_user_meta_data ->> 'color', ''), '#628d76'),
    'email',
    coalesce(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- Bổ sung hồ sơ cho các tài khoản đã được tạo trước khi thêm trigger.
insert into public.profiles (id, nickname, color, provider, avatar_url)
select
  users.id,
  coalesce(nullif(trim(users.raw_user_meta_data ->> 'nickname'), ''), split_part(users.email, '@', 1), 'Thành viên'),
  coalesce(nullif(users.raw_user_meta_data ->> 'color', ''), '#628d76'),
  'email',
  coalesce(users.raw_user_meta_data ->> 'avatar_url', '')
from auth.users as users
on conflict (id) do nothing;

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
