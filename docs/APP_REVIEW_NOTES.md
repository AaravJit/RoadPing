# RoadPing — App Review Notes

Use this as the **App Review Information → Notes** field in App Store Connect.
Trim/paste as needed.

---

## What RoadPing does

RoadPing is a live, map-first push-to-talk tool for nearby drivers. After
signing in, adding a vehicle, and tapping **Go Live**, the user appears in
other live drivers' Nearby list, with a broad distance range only, within
their selected range (½, 1, 2 or 3 mi). They can hold a button (or use iOS
push to talk) to talk live to nearby drivers or to a private room they've
joined.

Users are invisible by default and only appear after explicitly tapping Go
Live, until they end the session.

## Why we need each permission and background mode

- **Location (When In Use only; never Always)** — Used only while the user is
  **live**: from tapping **Go Live** until they end it. While live, location
  continues in the background (UIBackgroundModes `location`, the blue location
  indicator is shown) so the driver stays visible to nearby drivers and the
  server keeps enforcing their private zones while the phone is locked in a
  mount. RoadPing never goes live on its own: if the app is closed while
  live, the session ends and is not resumed on the next launch. No location
  history. Other users are never shown coordinates, an exact distance or a
  direction — only a broad distance range (for example "½–1 mi").
- **Push to Talk (UIBackgroundModes `push-to-talk`, PushToTalk entitlement)**
  — RoadPing is a walkie-talkie for drivers. While live, the app joins one
  Apple PushToTalk channel ("RoadPing Nearby", or the open room). The driver
  can talk from the system Lock Screen / Dynamic Island UI, a Bluetooth or
  wired headset button, or CarPlay's play/pause control, and hears nearby
  drivers with the app in the background, delivered by `pushtotalk` APNs
  pushes. Leaving the channel from the system UI ends the live session.
- **Microphone** — Used only while the user talks (holding the button, or a
  system push-to-talk transmission). Never recorded, stored, or transcribed.
- **Live Activity** — While live, a Live Activity on the Lock Screen,
  Dynamic Island and CarPlay shows "Live", "Talking" or who is talking. It has
  no buttons. It ends when the session ends.

RoadPing does **not** use the `audio` or `voip` background modes.

## Live audio (Agora) — how it works

RoadPing uses **Agora** purely as a real-time audio **transport**. Supabase
owns identity, live sessions, range, rooms and moderation.

- Every press creates its own private Agora channel on the server. The server
  decides who may hear that press (live drivers within range or members of
  the room the speaker has open, minus blocked users, Do Not Disturb users
  and banned accounts) and gives each listener a personal token valid for at
  most 45 seconds, re-checked on renewal. There is no shared channel.
- The Agora App Certificate and the APNs key stay on the server.
- No audio persistence anywhere: no recordings, files, transcripts or uploads.

## How to test background live and push to talk

Needs two iPhones signed in to two accounts, both live within ½ mile (or in
the same room).

1. Phone A: Go Live, then lock the screen. The location indicator and the
   RoadPing Live Activity stay visible.
2. Phone B: hold the talk button. Phone A plays the voice with its screen
   locked and shows the speaker in the system push-to-talk UI.
3. Phone A: talk from the Lock Screen push-to-talk button. Phone B hears it.
4. Phone A: tap **Leave** in the system UI → the live session ends.

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
  exists, and it is deleted on End / sign out / app closed / expiry /
  private zone entry.
- **Who hears a press is decided by the server for every press**, and
  re-checked at every token renewal (≤ 45 s); blocking someone cuts any
  audio between the two immediately.
- Coordinates, exact distances and directions are **never returned** to
  other users — the `get-nearby-drivers` Edge Function snaps both positions
  to a ~250 m grid server-side and returns only a broad distance band, held
  for ~30 s (docs/PHASE2_PROXIMITY_PRIVACY.md).
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
