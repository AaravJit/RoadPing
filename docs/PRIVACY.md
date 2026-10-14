# RoadPing — Privacy Policy

_Last updated: 2026-10-01_

This is the canonical privacy policy for RoadPing. The in-app screen at
`app/privacy.tsx` mirrors this text. Both must be kept in sync. The public URL
of this document is what is linked from App Store Connect.

## Summary

RoadPing is a live, map-first voice tool for nearby drivers. We collect the
minimum information needed to make that work and we do not sell your data.

- Your location is used only while you are live, from when you tap Go Live
  until you end it. RoadPing never goes live on its own.
- We do not store location history.
- Voice is live only — nothing is recorded or saved.
- You can delete your account from inside the app.

## What we collect

When you create an account we collect:

- Email and password (handled by Supabase Auth).
- Profile: display name, handle, avatar URL, preferences (Do Not Disturb, default broadcast range).
- Vehicles you add (label, type, make, model, year, color).
- Private zones you create (center coordinate + radius).

While RoadPing is active we briefly process:

- Your current location (latitude, longitude, accuracy, heading, speed).
- Live session and voice session metadata (start time, broadcast range,
  expires_at).
- While you are live with voice on: a push-to-talk token for this iPhone
  (issued by Apple, deleted when your live session ends), and short-lived
  records of each time you talk (who, when, and in which room; deleted within
  about an hour). Never what you said.

## Location

RoadPing only requests "While Using the App" location access. It never asks
for "Always". We do not store location history.

Once you tap Go Live, RoadPing keeps using your location while you stay live,
including when RoadPing is in the background or your screen is locked, so
nearby drivers keep seeing you and private zones keep working. iOS shows a
location indicator in the status bar the whole time. This stops the moment
your live session ends. If RoadPing is closed while you are live, the session
ends and does not restart when you open the app again.

Your current position is held only as your live presence record. It is deleted
when:

- You end your live session.
- You sign out, or RoadPing is closed (force-quit or ended by iOS).
- Your session expires from inactivity (server-side heartbeat timeout).
- You drive into a private zone.

Other drivers are never shown your coordinates, your exact distance, or which
direction you are from them, and RoadPing does not place you on their map.
While you are both live and within each other's range, they see only a broad
distance range, such as "½–1 mi" or "0.8–1.6 km". Our servers work that range
out from positions snapped to a coarse grid (about 250 m) and keep it the same
for about 30 seconds at a time. A broad range still says you are somewhere
nearby: someone who can see you on the road, or who keeps comparing ranges
while moving around, may be able to narrow down roughly where you are. The
ranges you can choose (½, 1, 2 or 3 mi) sit on the same edges as these
distance ranges, so changing your own range never tells anyone more. Use
Private Zones and Stop & Hide wherever that matters to you.

## Microphone and voice

The microphone is only used while you talk: while you hold the talk button,
or use iOS push to talk from the Lock Screen, a headset button or CarPlay.
Each time you talk, our servers decide who may hear it (live drivers within
range, or the members of the room you have open), and each listener gets a
private, short-lived pass for that one moment. Voice is delivered live through
Agora and is not recorded, stored, or transcribed by RoadPing.

Do Not Disturb pauses incoming voice: while it is on, no one's voice is played
to you. You stay visible and can still talk.

## Blocks and reports

Blocks are stored so we can keep both users invisible to each other.

Reports are stored to let us review abuse and keep the community safe. The
reported user is never told they were reported. If you delete your account,
reports you filed are kept for safety review but your identity as the reporter
is removed (anonymized via `reporter_id = NULL`).

## What we do not do

- We do not sell your personal data.
- We do not use your data for advertising.
- We do not track you across other apps or websites.
- We do not store location history.
- We do not record voice.
- We do not run third-party analytics SDKs.

## Third parties

RoadPing uses:

- **Supabase** — authentication, Postgres database, Edge Functions, Realtime.
  Acts as a data processor on our behalf.
- **Agora** — live voice delivery. Agora carries the audio of a talk in real
  time and sees technical data such as your IP address and a random
  per-talk ID. RoadPing does not ask Agora to record anything.
- **Apple Push Notification Service** — push to talk (so you can hear nearby
  drivers with RoadPing in the background), and notifications if you opt in.
- **Apple Maps** — for map tile rendering on iOS via `react-native-maps`.

These providers process data on our behalf so RoadPing can function.

## Your choices

- You can revoke location or microphone access in iOS Settings at any time.
- You can turn on Do Not Disturb to stop hearing incoming voice.
- You can stop being visible at any time by ending your live session.
- You can delete your account from Settings → Delete account. The deletion is
  immediate and irreversible.

## Children

RoadPing is not directed at children under 13 and we do not knowingly collect
data from them.

## Contact

For privacy questions or deletion help, contact: **support@roadping.app**
