-- 1. 기존 테이블 및 정책 삭제 (재생성 목적)
drop table if exists public.sales_history cascade;

-- 2. sales_history 테이블 생성 (sold_by가 public.profiles를 참조하도록 수정)
create table if not exists public.sales_history (
  id uuid default gen_random_uuid() primary key,
  inventory_id uuid not null references public.inventory(id) on delete cascade,
  quantity int not null check (quantity > 0),
  sold_by uuid not null references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- 3. RLS 활성화
alter table public.sales_history enable row level security;

-- 4. 정책 설정
create policy "Authenticated can view sales_history"
  on public.sales_history for select
  using (auth.role() = 'authenticated');

create policy "Authenticated can insert sales_history"
  on public.sales_history for insert
  with check (auth.role() = 'authenticated');
