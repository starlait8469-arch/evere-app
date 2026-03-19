-- 1. production_orders 테이블에 누락된 컬럼 추가 (이미 있으면 무시됨)
ALTER TABLE public.production_orders
    ADD COLUMN IF NOT EXISTS sewing_sent_at     TIMESTAMPTZ,  -- cutting → sewing 발송 시각
    ADD COLUMN IF NOT EXISTS sewing_returned_at TIMESTAMPTZ,  -- sewing → returned 입고 시각
    ADD COLUMN IF NOT EXISTS finishing_sent_at  TIMESTAMPTZ,  -- returned → finishing(plancha) 발송 시각
    ADD COLUMN IF NOT EXISTS done_at            TIMESTAMPTZ;  -- finishing → done 완료 시각

-- 2. production_orders RLS 설정 및 정책 복구
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage production_orders" ON public.production_orders;
DROP POLICY IF EXISTS "Authenticated can view production_orders" ON public.production_orders;

CREATE POLICY "Admins can manage production_orders"
  ON public.production_orders FOR ALL
  USING (public.is_admin());

CREATE POLICY "Authenticated can view production_orders"
  ON public.production_orders FOR SELECT
  USING (auth.role() = 'authenticated');


-- 3. inventory RLS 설정 및 정책 복구 (재확인)
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage inventory" ON public.inventory;
DROP POLICY IF EXISTS "Authenticated can view inventory" ON public.inventory;

CREATE POLICY "Admins can manage inventory"
  ON public.inventory FOR ALL
  USING (public.is_admin());

CREATE POLICY "Authenticated can view inventory"
  ON public.inventory FOR SELECT
  USING (auth.role() = 'authenticated');

-- 4. [중요] 스키마 캐시 갱신을 위한 팁
-- 만약 계속 'sewing_sent_at' 컬럼을 찾을 수 없다고 나오면, 
-- Supabase 대시보드에서 API 설정을 건드리거나 (예: API 스키마 변경 시도 후 취소) 
-- 아래 주석 처리된 명령어를 실행해 보세요 (권한에 따라 안 될 수도 있음)
-- NOTIFY pgrst, 'reload schema';
