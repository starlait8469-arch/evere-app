-- special_orders 테이블에 order_number 컬럼 추가
-- 기존 데이터는 NULL로 유지 (이전 주문은 번호 없음)
ALTER TABLE special_orders
  ADD COLUMN IF NOT EXISTS order_number TEXT;
