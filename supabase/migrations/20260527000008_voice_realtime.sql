-- Enable Supabase Realtime on voice_sessions so clients receive near-instant
-- speaking-state changes without polling.
--
-- RLS already filters what each user can see (own sessions, room-member
-- sessions, or open-channel sessions). The realtime channel honours the same
-- policies because postgres_changes events are row-level filtered.
--
-- After this migration, run: supabase db push

ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_sessions;
