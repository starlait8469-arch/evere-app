-- 1. Create a secure helper function to check admin status
-- This function queries the profiles table directly instead of trusting the JWT.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- 2. Drop the old vulnerable policies on profiles
DROP POLICY IF EXISTS "Admins and owners can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow first admin" ON public.profiles;

-- 3. Recreate profiles policies securely using is_admin()
CREATE POLICY "Admins and owners can view profiles"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id OR public.is_admin()
  );

CREATE POLICY "Admins can manage profiles"
  ON public.profiles FOR ALL
  USING ( public.is_admin() );

CREATE POLICY "Allow first admin"
  ON public.profiles FOR INSERT
  WITH CHECK (
    NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin')
    AND role = 'admin'
  );

-- 4. Find and replace vulnerable policies on sewing_factories and any other table
-- using a DO block to automatically clean up any remaining user_metadata references
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (qual ILIKE '%user_metadata%' OR with_check ILIKE '%user_metadata%')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
        
        -- Default replacement for sewing_factories (assumes Admins can manage all)
        IF pol.tablename = 'sewing_factories' THEN
            EXECUTE format('CREATE POLICY "Admins can manage %I" ON public.%I FOR ALL USING (public.is_admin())', pol.tablename, pol.tablename);
            
            -- Also ensure everyone authenticated can read sewing factories
            EXECUTE format('DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.%I', pol.tablename);
            EXECUTE format('CREATE POLICY "Enable read access for all authenticated users" ON public.%I FOR SELECT USING (auth.role() = ''authenticated'')', pol.tablename);
        END IF;

        IF pol.tablename = 'production_slips' THEN
            EXECUTE format('CREATE POLICY "Admins can manage %I" ON public.%I FOR ALL USING (public.is_admin())', pol.tablename, pol.tablename);
        END IF;
    END LOOP;
END
$$;
