ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS order_number TEXT UNIQUE;
