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

-- 4. 본인 및 관리자 조회 정책 (재귀 방지)
-- auth.jwt() 를 직접 사용하여 profiles 테이블 조회 없이 권한 체크
create policy "Admins and owners can view profiles"
  on public.profiles for select
  using (
    auth.uid() = id 
    or (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- 5. 관리자 수동 조작 정책
create policy "Admins can manage profiles"
  on public.profiles for all
  using ( (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' );

-- 6. 최초 로그인 지원 (admin이 없을 때)
create policy "Allow first admin"
  on public.profiles for insert
  with check (
    not exists (select 1 from public.profiles where role = 'admin')
    and role = 'admin'
  );

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
