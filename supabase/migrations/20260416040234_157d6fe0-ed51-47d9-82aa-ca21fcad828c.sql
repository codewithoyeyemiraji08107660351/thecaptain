-- Revoke execute on purchase_credits from public and authenticated roles
-- Only service_role (used by Edge Functions) should be able to call this
REVOKE EXECUTE ON FUNCTION public.purchase_credits(integer, integer) FROM public;
REVOKE EXECUTE ON FUNCTION public.purchase_credits(integer, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.purchase_credits(integer, integer) FROM anon;