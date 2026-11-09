drop policy if exists "Artists can read own track events"
on public.track_events;

create policy "Artists can read own track events"
on public.track_events
for select
to authenticated
using (
  exists (
    select 1
    from public.tracks
    where tracks.id = track_events.track_id
      and tracks.artist_id = auth.uid()
  )
);
