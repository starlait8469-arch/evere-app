-- Supabase SQL Editor에서 실행
-- 1. Add last_restocked_at column to fabric_inventory table
ALTER TABLE public.fabric_inventory 
ADD COLUMN IF NOT EXISTS last_restocked_at TIMESTAMP WITH TIME ZONE;
