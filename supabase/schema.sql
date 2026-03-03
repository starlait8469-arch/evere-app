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

-- 4. 관리자는 모든 프로필 조회 가능
create policy "Admins can view all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- 5. 관리자만 직원 계정 생성 가능
create policy "Admins can insert profiles"
  on public.profiles for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- 6. 최초 관리자 생성 허용 (admin이 아무도 없을 때)
create policy "Allow first admin creation"
  on public.profiles for insert
  with check (
    not exists (select 1 from public.profiles where role = 'admin')
    and role = 'admin'
  );

-- 7. 관리자만 삭제 가능
create policy "Admins can delete profiles"
  on public.profiles for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
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
