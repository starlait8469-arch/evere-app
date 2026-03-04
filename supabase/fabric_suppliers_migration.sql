-- Supabase SQL Editor에서 실행
-- 1. Create fabric_suppliers table
CREATE TABLE IF NOT EXISTS public.fabric_suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    contact_info TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- set up RLS for fabric_suppliers
ALTER TABLE public.fabric_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.fabric_suppliers FOR SELECT USING (true);
CREATE POLICY "Enable all access for authenticated users" ON public.fabric_suppliers FOR ALL USING (auth.role() = 'authenticated');

-- 2. Create fabric_deliveries table
CREATE TABLE IF NOT EXISTS public.fabric_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES public.fabric_suppliers(id) ON DELETE CASCADE,
    fabric_name TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    unit TEXT,
    cost NUMERIC,
    delivery_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- set up RLS for fabric_deliveries
ALTER TABLE public.fabric_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.fabric_deliveries FOR SELECT USING (true);
CREATE POLICY "Enable all access for authenticated users" ON public.fabric_deliveries FOR ALL USING (auth.role() = 'authenticated');
