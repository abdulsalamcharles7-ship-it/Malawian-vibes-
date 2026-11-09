
-- MALAWIAN VIBES DATABASE SETUP

create extension if not exists pgcrypto;

-- ARTIST PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  artist_name text,
  email text,
  role text not null default 'artist'
    check (role in ('artist', 'admin')),
  created_at timestamptz default now()
);

-- MUSIC TRACKS
create table if not exists public.tracks (
  id uuid primary key,
  artist_id uuid not null references public.profiles(id),
  title text not null,
  genre text,
  audio_path text not null,
  cover_path text,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'published', 'rejected')),
  created_at timestamptz default now()
);

-- PAYMENT REQUESTS
create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.profiles(id),
  track_id uuid not null references public.tracks(id),
  amount_mwk integer not null default 3000,
  method text not null,
  transaction_reference text not null,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected')),
  created_at timestamptz default now()
);

-- CREATE PROFILE AUTOMATICALLY AFTER SIGNUP
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, artist_name, email)
  values (
    new.id,
    new.raw_user_meta_data ->> 'artist_name',
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ADMIN CHECK FUNCTION
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

-- ENABLE SECURITY
alter table public.profiles enable row level security;
alter table public.tracks enable row level security;
alter table public.payment_requests enable row level security;

-- PROFILES POLICIES
drop policy if exists "Read profiles" on public.profiles;

create policy "Read profiles"
on public.profiles for select
to authenticated, anon
using (
  id = (select auth.uid())
  or public.is_admin()
  or exists (
    select 1 from public.tracks
    where tracks.artist_id = profiles.id
      and tracks.status = 'published'
  )
);

-- TRACK POLICIES
drop policy if exists "Read tracks" on public.tracks;
drop policy if exists "Artists add tracks" on public.tracks;
drop policy if exists "Admins update tracks" on public.tracks;

create policy "Read tracks"
on public.tracks for select
to authenticated, anon
using (
  status = 'published'
  or artist_id = (select auth.uid())
  or public.is_admin()
);

create policy "Artists add tracks"
on public.tracks for insert
to authenticated
with check (artist_id = (select auth.uid()));

create policy "Admins update tracks"
on public.tracks for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- PAYMENT POLICIES
drop policy if exists "Read payment requests" on public.payment_requests;
drop policy if exists "Artists submit payments" on public.payment_requests;
drop policy if exists "Admins manage payments" on public.payment_requests;

create policy "Read payment requests"
on public.payment_requests for select
to authenticated
using (
  artist_id = (select auth.uid())
  or public.is_admin()
);

create policy "Artists submit payments"
on public.payment_requests for insert
to authenticated
with check (
  artist_id = (select auth.uid())
  and amount_mwk = 3000
);

create policy "Admins manage payments"
on public.payment_requests for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- PUBLIC STORAGE BUCKETS
insert into storage.buckets (id, name, public)
values
  ('music', 'music', true),
  ('covers', 'covers', true)
on conflict (id) do update set public = true;

-- STORAGE POLICIES
drop policy if exists "Public can listen to music" on storage.objects;
drop policy if exists "Artists upload music" on storage.objects;
drop policy if exists "Public can view covers" on storage.objects;
drop policy if exists "Artists upload covers" on storage.objects;

create policy "Public can listen to music"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'music');

create policy "Artists upload music"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'music'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Public can view covers"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'covers');

create policy "Artists upload covers"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'covers'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
