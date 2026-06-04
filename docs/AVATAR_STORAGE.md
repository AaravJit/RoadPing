# Profile Photo Storage Setup (Phase 17, Part C)

Profile photos upload to a Supabase Storage bucket named **`avatars`** at the
path `avatars/<user-id>/avatar.jpg`. The app uses **only the anon client + the
signed-in user's session** — no `service_role` key is in the app. Storage RLS
restricts every write to the caller's own `<uid>/` folder.

Until the steps below are done, photo upload fails with a clear
"Couldn't save your photo" message (never a fake success).

## 1. Create the bucket

Dashboard → **Storage → New bucket**:
- Name: `avatars`
- **Public bucket: ON** (see the privacy note below)

…or via SQL (Dashboard → SQL Editor):

```sql
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;
```

## 2. Add RLS policies on `storage.objects`

Public **read**, but **insert/update/delete only within the caller's own
`<uid>/` folder**:

```sql
-- Public read of avatars (the bucket is public).
create policy "Avatars are publicly readable"
  on storage.objects for select
  using ( bucket_id = 'avatars' );

-- A user may only write to avatars/<their-uid>/...
create policy "Users upload their own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users update their own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users delete their own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

`storage.foldername(name)[1]` is the first path segment, i.e. the `<uid>` folder.
Because the app always uploads to `<uid>/avatar.jpg`, this lets a user manage
only their own photo while everyone can read avatars.

## 3. Public vs private — the tradeoff

**Recommended: public** (as above).

- **Public bucket:** the avatar URL is stable and works everywhere a profile is
  shown — including nearby-driver cards — with normal HTTP caching and no
  expiry. Anyone who has the URL can view the image (URLs are not secret and
  contain the `<uid>` path), which is acceptable for a profile photo that is
  intentionally shown to nearby drivers. Uploads are still locked down by the
  RLS above.
- **Private bucket:** images are only reachable via short-lived **signed URLs**.
  Every place that displays an avatar (including `get_nearby_drivers` results)
  would need to generate/refresh a signed URL, which breaks caching and adds
  server work. Not worth it for non-sensitive profile pictures.

No schema migration is required — `profiles.avatar_url` already exists and just
stores the resulting public URL.

## 4. App side (already wired)

- `src/services/avatar.ts` — `pickAvatar` (library/camera), `uploadAvatar`
  (`<uid>/avatar.jpg`, upsert, `image/jpeg`, 6 MB guard), `removeAvatarFile`.
- `app/profile.tsx` — Choose from Library / Take Photo / Remove Photo.
- `app.json` — `NSPhotoLibraryUsageDescription` added; `NSCameraUsageDescription`
  updated for profile photos.

A **new EAS build** is required because `expo-image-picker` is a native module
(it does not run in Expo Go).
