-- production_orders 테이블의 stage 컬럼에 'returned' 값 추가
-- Supabase SQL Editor에서 실행하세요:
-- https://supabase.com/dashboard/project/<your-project>/sql/new

-- 1. 기존 check constraint 이름 확인 후 삭제 (이름이 다를 수 있음)
--    아래 쿼리로 먼저 constraint 이름 확인:
-- SELECT conname FROM pg_constraint WHERE conrelid = 'production_orders'::regclass AND contype = 'c';

-- 2. stage 컬럼의 기존 check constraint 제거
ALTER TABLE public.production_orders
  DROP CONSTRAINT IF EXISTS production_orders_stage_check;

-- 3. 새 check constraint 추가 (returned 포함)
ALTER TABLE public.production_orders
  ADD CONSTRAINT production_orders_stage_check
  CHECK (stage IN ('cutting', 'sewing', 'returned', 'finishing', 'done'));
