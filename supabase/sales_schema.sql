-- sales_history 테이블 생성
create table if not exists public.sales_history (
  id uuid default gen_random_uuid() primary key,
  inventory_id uuid not null references public.inventory(id) on delete cascade,
  quantity int not null check (quantity > 0),
  sold_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- RLS 활성화
alter table public.sales_history enable row level security;

-- 조회: 모든 인증된 사용자(직원, 관리자)가 판매 기록을 볼 수 있음
create policy "Authenticated can view sales_history"
  on public.sales_history for select
  using (auth.role() = 'authenticated');

-- 삽입: 모든 인증된 사용자(직원, 관리자)가 판매 기록을 남길 수 있음
create policy "Authenticated can insert sales_history"
  on public.sales_history for insert
  with check (auth.role() = 'authenticated');

-- [선택] 삭제/수정은 관리자만 가능하도록 제한 (보안 목적)
-- 기본적으로 판매 기록은 수정/삭제 불가 (또는 나중에 추가)
