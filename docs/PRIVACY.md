# RoadPing — Privacy Policy

_Last updated: 2026-09-30_

This is the canonical privacy policy for RoadPing. The in-app screen at
`app/privacy.tsx` mirrors this text. Both must be kept in sync. The public URL
of this document is what is linked from App Store Connect.

## Summary

RoadPing is a live, map-first voice tool for nearby drivers. We collect the
minimum information needed to make that work and we do not sell your data.

- Your location is used only while RoadPing is active.
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

## Location

RoadPing only requests "While Using the App" location access. We do not
request background location. We do not store location history.

Your current position is held only as your live presence record. It is deleted
when:

- You end your live session.
- You sign out, close, or background the app.
- Your session expires from inactivity (server-side heartbeat timeout).
- You drive into a private zone.

Other drivers never see your exact coordinates — only a rounded, approximate
distance within your broadcast range. The map places drivers at approximate
positions and does not show which direction they are.

## Microphone and voice

The microphone is only used while you hold the talk button. Voice is delivered
live to nearby drivers or room members. RoadPing does not record, store, or
transcribe voice.

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
- **Apple Push Notification Service** — only if you opt in to notifications.
- **Apple Maps** — for map tile rendering on iOS via `react-native-maps`.

These providers process data on our behalf so RoadPing can function.

## Your choices

- You can revoke location or microphone access in iOS Settings at any time.
- You can turn on Do Not Disturb in Settings to hide your speaking indicator
  from nearby drivers.
- You can stop being visible at any time by ending your live session.
- You can delete your account from Settings → Delete account. The deletion is
  immediate and irreversible.

## Children

RoadPing is not directed at children under 13 and we do not knowingly collect
data from them.

## Contact

For privacy questions or deletion help, contact: **support@roadping.app**
