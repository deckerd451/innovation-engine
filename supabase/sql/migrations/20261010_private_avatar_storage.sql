-- Dedicated private profile-avatar storage. Existing hacksbucket assets remain
-- untouched; migrate profile images into this bucket before switching reads.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('private-avatars', 'private-avatars', false, 5242880,
        ARRAY['image/jpeg','image/png','image/webp','image/gif']::text[])
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Private avatars can be read by owner admin or consented member" ON storage.objects;
CREATE POLICY "Private avatars can be read by owner admin or consented member"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'private-avatars'
    AND (storage.foldername(name))[1] = 'avatars'
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.community viewer
        WHERE viewer.user_id = auth.uid() AND viewer.user_role = 'Admin'
      )
      OR EXISTS (
        SELECT 1 FROM public.community owner
        WHERE owner.user_id::text = (storage.foldername(name))[2]
          AND owner.photo_visible = true
          AND owner.photo_consent_at IS NOT NULL
      )
    )
  );

DROP POLICY IF EXISTS "Private avatar owners can upload" ON storage.objects;
CREATE POLICY "Private avatar owners can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'private-avatars'
    AND (storage.foldername(name))[1] = 'avatars'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Private avatar owners can update" ON storage.objects;
CREATE POLICY "Private avatar owners can update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'private-avatars'
    AND (storage.foldername(name))[1] = 'avatars'
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'private-avatars'
    AND (storage.foldername(name))[1] = 'avatars'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Private avatar owners can delete" ON storage.objects;
CREATE POLICY "Private avatar owners can delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'private-avatars'
    AND (storage.foldername(name))[1] = 'avatars'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

COMMIT;
