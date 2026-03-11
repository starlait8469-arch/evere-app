CREATE TABLE public.custom_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_order_id UUID REFERENCES public.store_orders(id) ON DELETE CASCADE UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    customer_name TEXT,
    items JSONB NOT NULL
);

ALTER TABLE public.custom_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for authenticated users" 
ON public.custom_invoices 
FOR ALL 
USING (auth.role() = 'authenticated');
