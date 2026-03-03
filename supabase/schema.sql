-- EVERE 앱 초기 DB 설정
-- Supabase SQL Editor에서 실행하세요
-- https://supabase.com/dashboard/project/wohsstrvdmctgyajiwtg/sql/new

-- 1. profiles 테이블 생성
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  role text not null default 'employee'
    check (role in ('admin', 'employee')),
  created_at timestamptz default now()
);

-- 2. RLS 활성화
alter table public.profiles enable row level security;

-- 3. 본인 프로필 조회 허용
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- 4. 관리자 여부를 체크하는 보안 함수 생성 (recursion 방지)
-- security definer는 함수 생성자의 권한으로 실행되어 RLS를 우회하므로 재귀를 막아줍니다.
create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
end;
$$ language plpgsql security definer;

-- 5. 정책 적용 (is_admin() 함수 사용)
create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.is_admin());

create policy "Admins can insert profiles"
  on public.profiles for insert
  with check (public.is_admin());

create policy "Admins can delete profiles"
  on public.profiles for delete
  using (public.is_admin());

-- 8. 신규 auth.users 생성 시 자동으로 profiles 행 생성
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'employee')
  );
  return new;
end;
$$ language plpgsql security definer;

-- 9. 트리거 등록
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
