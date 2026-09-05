REVOKE ALL ON FUNCTION public.resolve_farmer_identity(text, text, date) FROM anon;
REVOKE ALL ON FUNCTION public.check_farmer_identity(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_farmer_identity(text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_farmer_identity(text) TO authenticated;