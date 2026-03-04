-- 부분 납품 기능: store_order_items에 delivered_qty 컬럼 추가
ALTER TABLE public.store_order_items
  ADD COLUMN IF NOT EXISTS delivered_qty integer NOT NULL DEFAULT 0;
