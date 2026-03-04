-- Supabase SQL Editor에서 실행
-- Create fabric_payments table
CREATE TABLE IF NOT EXISTS public.fabric_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES public.fabric_suppliers(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    payment_date DATE NOT NULL,
    memo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- set up RLS for fabric_payments
ALTER TABLE public.fabric_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.fabric_payments FOR SELECT USING (true);
CREATE POLICY "Enable all access for authenticated users" ON public.fabric_payments FOR ALL USING (auth.role() = 'authenticated');
