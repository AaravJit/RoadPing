# RoadPing — App Store Metadata (Draft)

Working draft for App Store Connect. All copy stays inside Apple's character
limits and avoids overpromises ("anonymous", "never tracks you", "secure
police scanner", etc.).

---

## Name

```
RoadPing
```

(30-character limit. Used as: 8 chars.)

## Subtitle

```
Live voice for nearby drivers
```

(30-character limit. Used as: 29 chars.)

## Promotional text (170 chars)

```
Tap Start RoadPing and nearby live drivers can see you're around. Join a room
and hold to talk live to your group. Live only — no recordings, no location history.
```

## Description

```
RoadPing is a live, map-first voice tool for drivers on the road right now.

Tap Start RoadPing and live drivers within your chosen broadcast range can
see you're nearby. Open Nearby to see who's around and what they drive. Join a
Drive Room and hold the talk button to talk live to your group. Release to
listen. That's it.

• Live only — you are invisible until you tap Start
• Map-first — see who's around without scrolling a feed
• Broad distance ranges only — never your coordinates, exact distance or direction
• Drive Rooms — a private group channel with real live group voice
• On the open map, hold to flash a live "speaking" ping to nearby drivers
• Voice is live — nothing is recorded or stored
• Private Zones — automatically disappear near home or work
• Do Not Disturb — mute incoming voice and hide your speaking indicator
• Block and report — keep your drive friendly

Use RoadPing responsibly. Mount your phone. Hold to talk only when it is
safe to do so. RoadPing is not for emergencies or for reporting crimes —
call local services if you need them. Obey all traffic laws.

Privacy is on by default:
• No location history
• No voice recordings
• You disappear the moment you tap Stop or Hide
• You can delete your account from inside the app at any time
```

(4,000-char limit. Used: well under.)

## Keywords (100-char limit, comma-separated, no spaces after commas)

```
drivers,road,voice,walkie,radio,map,nearby,live,community,trip,carpool,ptt,push to talk
```

(Avoid "police", "scanner", "checkpoint", "radar detector", "anonymous".)

## Support URL

```
https://roadping.app/support
```

(Placeholder — confirm before submission. Must return an HTTPS page that
includes a way to contact support.)

## Marketing URL (optional)

```
https://roadping.app
```

## Privacy Policy URL (required)

```
https://roadping.app/privacy
```

(Placeholder — must point to a public, accessible HTML version of
`docs/PRIVACY.md`.)

## Category

- **Primary:** Navigation
- **Secondary:** Social Networking

> Rationale: the core utility is map-based live awareness while driving, so
> Navigation fits. Social Networking is appropriate as a secondary because of
> the live voice interaction and rooms feature.

## Age rating considerations

When filling the App Store Connect age rating questionnaire, the honest
answers are:

| Question | Answer |
|----------|--------|
| Cartoon or Fantasy Violence | None |
| Realistic Violence | None |
| Sexual Content or Nudity | None |
| Profanity or Crude Humor | **Infrequent / Mild** (user-generated voice — moderated via block/report) |
| Alcohol, Tobacco, or Drug Use | None |
| Gambling | None |
| Horror / Fear Themes | None |
| Mature / Suggestive Themes | None |
| Medical / Treatment Information | None |
| Unrestricted Web Access | No |
| Gambling and Contests | No |
| **User-Generated Content** | **Yes** (live voice) — has moderation: block, report, community guidelines |

Expected result: rating around **17+** because of user-generated audio
interaction with moderation, mirroring how Apple rates other live-voice
apps.

## Permission strings (already in `app.json`)

- `NSLocationWhenInUseUsageDescription` —
  "RoadPing uses your location while active to show nearby live drivers and
  let you appear on the live map after you tap Start RoadPing. Your exact
  coordinates are never shared and no location history is stored."
- `NSMicrophoneUsageDescription` —
  "RoadPing uses your microphone when you hold to talk to nearby drivers or
  room members. Voice is live only and not recorded or stored."

We deliberately **do not** request `NSLocationAlwaysAndWhenInUseUsageDescription`
because background location is not used.

## Pricing & availability

- Free.
- Initial territories: **United States** only for first review. Add more
  after stable.

## Review notes

See `docs/APP_REVIEW_NOTES.md` — paste into the App Review Information →
Notes field.

## What we are not claiming

- We do **not** say "anonymous".
- We do **not** say "never tracks you" — location is briefly processed while
  active.
- We do **not** market it as a police scanner / DUI checkpoint finder /
  cop alert / racing tool. Doing so would be a fast rejection under
  guidelines 1.4.1 and 1.1.6.
