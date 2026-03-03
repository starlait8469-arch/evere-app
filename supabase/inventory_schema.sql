-- 1. 기존 재고 데이터 초기화
truncate table public.inventory;

-- 2. inventory 테이블 구조 업데이트 (category → main_category + sub_category)
alter table public.inventory
  drop column if exists category,
  add column if not exists main_category text not null default 'hombre' check (main_category in ('hombre', 'mujer')),
  add column if not exists sub_category text not null default '';

-- 3. 서브 카테고리 관리 테이블 생성
create table if not exists public.categories (
  id uuid default gen_random_uuid() primary key,
  main_category text not null check (main_category in ('hombre', 'mujer')),
  name text not null,
  created_at timestamptz default now(),
  unique (main_category, name)
);

alter table public.categories enable row level security;

-- 로그인한 사용자 조회 가능
create policy "Authenticated can view categories"
  on public.categories for select
  using (auth.role() = 'authenticated');

-- 로그인한 사용자 추가/삭제 가능 (관리자 체크는 앱에서)
create policy "Authenticated can insert categories"
  on public.categories for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated can delete categories"
  on public.categories for delete
  using (auth.role() = 'authenticated');
