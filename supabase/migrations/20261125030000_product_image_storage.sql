BEGIN;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('product-images','product-images',true,2097152,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO UPDATE SET public=true,file_size_limit=2097152,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE POLICY product_images_read ON storage.objects FOR SELECT TO anon,authenticated USING(bucket_id='product-images');
CREATE POLICY product_images_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(
 bucket_id='product-images' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND is_active AND role IN ('owner','admin','inventory'))
);
CREATE POLICY product_images_delete ON storage.objects FOR DELETE TO authenticated USING(
 bucket_id='product-images' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND is_active AND role IN ('owner','admin','inventory'))
);
COMMIT;
