# RoadPing — App Review Notes

Use this as the **App Review Information → Notes** field in App Store Connect.
Trim/paste as needed.

---

## What RoadPing does

RoadPing is a live, map-first voice tool for nearby drivers. After signing in,
adding a vehicle, and tapping **Start RoadPing**, the user appears as a live
presence dot to other RoadPing users within their selected broadcast range
(500 m – 5 km). They can hold a button to broadcast a short live voice alert
to nearby drivers or to a private room they've joined.

The app is map-first and live-only. Users are invisible by default and only
appear after explicitly tapping Start.

## Why we need each permission

- **Location (When In Use only)** — Used **only while RoadPing is active** to
  show nearby live drivers and to place the user on the live map. No
  background location. No location history. Exact coordinates are never
  shown to other users — only an approximate distance and direction.
- **Microphone** — Used **only while the user holds the talk button** to send
  live voice. In a **Drive Room**, the held audio is transmitted to other room
  members in real time over Agora's voice channel (transport only). For the
  open **nearby** map, holding currently raises a **live speaking indicator**
  to nearby drivers (see "Live audio status" below). Voice is never recorded,
  stored, or transcribed in either mode — releasing the button ends the mic.

## Live audio (Agora) — implementation status

RoadPing uses **Agora** purely as a real-time audio **transport**. Supabase
still owns identity, live sessions, nearby range, rooms, and moderation; a
Supabase Edge Function (`create-agora-token`) mints a short-lived RTC token
only after verifying the caller's live session (nearby) or room membership
(room). The Agora App Certificate never leaves the server.

- **Drive Rooms → real group audio.** All members of a room share one Agora
  channel (`roadping-room-<id>`). Hold to talk → others hear you live.
- **Nearby (open map) → live speaking indicator only.** Real geo-grouped
  nearby audio requires server-side channel assignment and is intentionally
  deferred, so we never put a user "on a channel with the whole world."
- **No audio persistence anywhere** — no recordings, files, transcripts, or
  uploads. Agora carries live frames only.
- Live audio requires the native build (TestFlight / App Store). It does not
  run in Expo Go.

## Demo account

```
Email:    appreview@roadping.app
Password: <PASTE-IN-APP-STORE-CONNECT-AT-SUBMISSION>
```

This account is seeded with a profile, a primary vehicle, and a sample
private zone, so reviewers can immediately reach the Drive screen without
running through profile/vehicle setup.

> If the demo account is locked or you need a fresh one, please email
> **support@roadping.app** and we will provision a new one within 1 business
> day.

## How to test the core flow

1. **Sign in** with the demo account above.
2. The Drive screen opens with the user offline (invisible by default).
3. Tap **Start RoadPing** → iOS will prompt for **Location** ("Allow Once" or
   "Allow While Using App" is fine).
4. The map switches to a live view, the LIVE pill appears at the top, and any
   nearby demo drivers (if any are active in the same region) appear as
   amber dots.
5. **Hold the round mic button** → iOS will prompt for **Microphone** the
   first time. Hold = transmitting; release = stop. Nothing is recorded.
6. Tap **Stop** to end the session normally, or **Hide** to disappear from
   the map immediately.
7. Tap a driver dot → driver card shows up with **Block** and **Report**
   actions. Both work end-to-end against the live backend.

## How to test moderation

- From the Drive screen or any room, tap a driver → **Report** opens a modal
  with reason/context and an optional note. Tap submit → a `reports` row is
  created server-side.
- Tap **Block** on the same card → confirmation alert → mutual invisibility
  immediately. The blocked user can be viewed and unblocked at
  Settings → Blocked Drivers.

## How to test account deletion

1. Tap profile avatar (top-right of Drive) → **Settings** → **Delete
   account**.
2. The Delete Account screen explains exactly what is deleted and what is
   kept.
3. Tap **Delete my account** → native confirm → **Delete forever**.
4. The Edge Function ends the active session, removes presence and personal
   data, anonymizes any reports filed by the user (kept for safety), then
   deletes the auth user. The app returns to onboarding.

## Privacy guarantees enforced by code

- Voice is **live only** — there is no recording API, no storage bucket
  upload, no transcription. The microphone session ends as soon as the
  user releases the talk button.
- **Location history is not stored.** Only the current live presence row
  exists, and it is deleted on Stop / Hide / sign out / app background /
  expiry / private zone entry.
- Exact coordinates are **never returned** to other users — the
  `get-nearby-drivers` Edge Function snaps positions to a coarse bucket and
  only returns approximate distance + bearing.
- Other users' positions reach the client **only** through the
  `get-nearby-drivers` Edge Function. Direct reads of `location_presence`
  are blocked by RLS.
- The **service-role key is never embedded** in the mobile app. All
  privileged operations run inside Edge Functions.

## Support

- Support email: **support@roadping.app**
- Privacy policy: in-app at Settings → Privacy Policy, and at
  `https://roadping.app/privacy` (placeholder URL — confirm before
  submission).
- Safety guidelines: in-app at Settings → Safety & Community.

## Notes for the reviewer

- The app is iOS-only at this time. Android builds are not configured.
- Backend (Supabase) is live during the review window. If you encounter a
  500 / network error, email support and we will investigate immediately.
- There is no public text chat, DMs, social feed, or follower system. The
  only public interactions are live voice (live only, not recorded) and
  member lists inside private rooms the user joined.
