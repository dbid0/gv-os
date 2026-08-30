-- Workspace uploads: Supabase Storage bucket + RLS policies.
--
-- This file is DELIBERATELY OUTSIDE the drizzle journal (drizzle/meta), so
-- `npm run db:migrate` never runs it. Storage lives in the `storage` schema,
-- owned by `supabase_storage_admin`, and creating policies there can require
-- privileges the migration role lacks — so it must not be able to break the
-- normal migration chain.
--
-- WHEN YOU NEED THIS: only if you upload WITHOUT setting SUPABASE_SERVICE_ROLE_KEY.
-- With the service-role key set, the app creates the bucket itself and bypasses
-- RLS, and none of this is required.
--
-- HOW TO APPLY (each of staging + prod, once): paste into the Supabase project's
-- SQL editor (it runs as a privileged role) and run. Idempotent.

-- 1) The bucket (public-read).
insert into storage.buckets (id, name, public)
values ('workspace-uploads', 'workspace-uploads', true)
on conflict (id) do update set public = true;

-- 2) Let a signed-in (authenticated) user upload into this bucket.
drop policy if exists "workspace-uploads authenticated insert" on storage.objects;
create policy "workspace-uploads authenticated insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'workspace-uploads');

-- 3) Public read (the bucket is public, but an explicit SELECT policy keeps the
--    storage API happy for both anon and authenticated readers).
drop policy if exists "workspace-uploads public read" on storage.objects;
create policy "workspace-uploads public read"
  on storage.objects for select to public
  using (bucket_id = 'workspace-uploads');
