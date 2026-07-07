-- Bubble Book — storage bucket for story art.
-- Public read (illustrations only, no personal photos); writes are scoped to
-- the uploader's own folder: story-images/<user_id>/<story_id>/page-N.ext
-- Kept separate from 0001 so a storage-permission failure can't block the
-- core schema.

insert into storage.buckets (id, name, public)
values ('story-images', 'story-images', true)
on conflict (id) do nothing;

create policy "story images public read"
  on storage.objects for select
  using (bucket_id = 'story-images');

create policy "story images owner insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'story-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Upload with upsert needs update too.
create policy "story images owner update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'story-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "story images owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'story-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
