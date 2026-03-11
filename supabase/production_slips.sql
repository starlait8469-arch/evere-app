-- 봉제/Plancha 출고전표 저장 테이블
CREATE TABLE IF NOT EXISTS production_slips (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slip_type    TEXT NOT NULL CHECK (slip_type IN ('sewing', 'plancha')),
    factory_name TEXT,                            -- 봉제공장명 (sewing 타입)
    slip_date    TEXT NOT NULL,                   -- 화면상 날짜 (es-AR)
    orders       JSONB NOT NULL DEFAULT '[]',     -- 출고 품목 스냅샷 배열
    created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE production_slips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin only slips"
    ON production_slips FOR ALL TO authenticated
    USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
