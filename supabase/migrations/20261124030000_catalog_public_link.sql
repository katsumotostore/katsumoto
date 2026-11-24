GRANT SELECT (category_id) ON public.products TO anon;
NOTIFY pgrst,'reload schema';
