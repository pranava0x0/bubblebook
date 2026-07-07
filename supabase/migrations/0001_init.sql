-- Bubble Book — core schema
-- Tables: profiles, stories, pages, characters, story_characters.
-- Every table is owner-scoped with RLS; auth is Supabase email magic link.
-- target_age_months / default_age_months are the foundation for the future
-- dynamic age adjustment feature (longer stories as the child grows).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  child_name text,
  default_age_months integer not null default 24
    check (default_age_months between 6 and 144),
  created_at timestamptz not null default now()
);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  seed text not null,
  status text not null default 'ready'
    check (status in ('generating', 'ready', 'failed')),
  target_age_months integer not null default 24
    check (target_age_months between 6 and 144),
  cover_image_path text,
  created_at timestamptz not null default now()
);

create index stories_owner_created_idx
  on public.stories (owner_id, created_at desc);

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  text text not null,
  image_prompt text not null,
  image_path text,
  unique (story_id, page_number)
);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  -- Precomputed dedupe key; DB-level constraint closes the check-then-insert race.
  name_key text generated always as (lower(btrim(name))) stored,
  look text not null,
  emoji text,
  image_path text,
  created_at timestamptz not null default now(),
  unique (owner_id, name_key)
);

create table public.story_characters (
  story_id uuid not null references public.stories (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  primary key (story_id, character_id)
);

create index story_characters_character_idx
  on public.story_characters (character_id);

-- Auto-create a profile on signup.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(coalesce(new.email, 'reader'), '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security: owners only, on every table.
alter table public.profiles enable row level security;
alter table public.stories enable row level security;
alter table public.pages enable row level security;
alter table public.characters enable row level security;
alter table public.story_characters enable row level security;

create policy "profiles select own" on public.profiles
  for select using ((select auth.uid()) = id);
create policy "profiles insert own" on public.profiles
  for insert with check ((select auth.uid()) = id);
create policy "profiles update own" on public.profiles
  for update using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "stories select own" on public.stories
  for select using ((select auth.uid()) = owner_id);
create policy "stories insert own" on public.stories
  for insert with check ((select auth.uid()) = owner_id);
create policy "stories update own" on public.stories
  for update using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "stories delete own" on public.stories
  for delete using ((select auth.uid()) = owner_id);

create policy "pages select via story" on public.pages
  for select using (exists (
    select 1 from public.stories s
    where s.id = story_id and s.owner_id = (select auth.uid())
  ));
create policy "pages insert via story" on public.pages
  for insert with check (exists (
    select 1 from public.stories s
    where s.id = story_id and s.owner_id = (select auth.uid())
  ));
create policy "pages update via story" on public.pages
  for update using (exists (
    select 1 from public.stories s
    where s.id = story_id and s.owner_id = (select auth.uid())
  ));
create policy "pages delete via story" on public.pages
  for delete using (exists (
    select 1 from public.stories s
    where s.id = story_id and s.owner_id = (select auth.uid())
  ));

create policy "characters select own" on public.characters
  for select using ((select auth.uid()) = owner_id);
create policy "characters insert own" on public.characters
  for insert with check ((select auth.uid()) = owner_id);
create policy "characters update own" on public.characters
  for update using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "characters delete own" on public.characters
  for delete using ((select auth.uid()) = owner_id);

create policy "story_characters select via story" on public.story_characters
  for select using (exists (
    select 1 from public.stories s
    where s.id = story_id and s.owner_id = (select auth.uid())
  ));
-- Insert requires owning BOTH the story and the character, so a user can't
-- link someone else's character into their own story.
create policy "story_characters insert own both" on public.story_characters
  for insert with check (
    exists (
      select 1 from public.stories s
      where s.id = story_id and s.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from public.characters c
      where c.id = character_id and c.owner_id = (select auth.uid())
    )
  );
create policy "story_characters delete via story" on public.story_characters
  for delete using (exists (
    select 1 from public.stories s
    where s.id = story_id and s.owner_id = (select auth.uid())
  ));
