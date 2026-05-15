-- 교회 전도회 생일 조사를 위한 테이블

CREATE TABLE if not exists public.church_survey (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    birthdate DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 활성화
ALTER TABLE public.church_survey ENABLE ROW LEVEL SECURITY;

-- 1. 누구나 설문을 작성(INSERT)할 수 있도록 허용 (익명 / 로그인 사용자 모두)
CREATE POLICY "Allow anonymous inserts" ON public.church_survey
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- 2. 로그인한 관리자만 설문 결과를 조회(SELECT)할 수 있도록 허용
CREATE POLICY "Allow authenticated to view" ON public.church_survey
    FOR SELECT TO authenticated
    USING (true);
