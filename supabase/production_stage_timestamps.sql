-- 생산 공정 단계 전환 타임스탬프 컬럼 추가
ALTER TABLE production_orders
    ADD COLUMN IF NOT EXISTS sewing_sent_at     TIMESTAMPTZ,  -- cutting → sewing 발송 시각
    ADD COLUMN IF NOT EXISTS sewing_returned_at TIMESTAMPTZ,  -- sewing → returned 입고 시각
    ADD COLUMN IF NOT EXISTS finishing_sent_at  TIMESTAMPTZ,  -- returned → finishing(plancha) 발송 시각
    ADD COLUMN IF NOT EXISTS done_at            TIMESTAMPTZ;  -- finishing → done 완료 시각
-- 참고: created_at 이 이미 재단 시작 시각으로 사용됨
