-- 1. production_orders 테이블 RLS 활성화 및 정책 복구
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 (중복 방지)
DROP POLICY IF EXISTS "Admins can manage production_orders" ON public.production_orders;
DROP POLICY IF EXISTS "Authenticated can view production_orders" ON public.production_orders;

-- 관리자: 모든 권한 (is_admin() 함수 사용)
CREATE POLICY "Admins can manage production_orders"
  ON public.production_orders FOR ALL
  USING (public.is_admin());

-- 인증된 사용자: 조회 권한
CREATE POLICY "Authenticated can view production_orders"
  ON public.production_orders FOR SELECT
  USING (auth.role() = 'authenticated');


-- 2. inventory 테이블 RLS 활성화 및 정책 복구
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Admins can manage inventory" ON public.inventory;
DROP POLICY IF EXISTS "Authenticated can view inventory" ON public.inventory;

-- 관리자: 모든 권한
CREATE POLICY "Admins can manage inventory"
  ON public.inventory FOR ALL
  USING (public.is_admin());

-- 인증된 사용자: 조회 권한
CREATE POLICY "Authenticated can view inventory"
  ON public.inventory FOR SELECT
  USING (auth.role() = 'authenticated');
