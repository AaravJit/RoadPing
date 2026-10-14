# RoadPing — Real-Device iPhone QA Checklist

Run this on a real iPhone (a TestFlight or `eas build` install — not the
simulator) before any App Store submission. Anything that fails is a stop on
submission unless explicitly waived.

Reset between sessions: delete and reinstall the app to verify cold-launch
behavior; revoke and re-grant location/microphone permissions in iOS Settings
to exercise the permission gates from scratch.

---

## 0. Setup

- Device: iPhone running iOS 17 or newer.
- Build: TestFlight build (preferred) **or** `eas build -p ios --profile preview` install via dev client.
- Backend: Supabase project is the same one referenced in `EXPO_PUBLIC_SUPABASE_URL`.
- `EXPO_PUBLIC_SCREENSHOT_MODE` is **unset** (or `false`).
- Migrations through `20260528000009_reports_anonymize.sql` are applied.
- Edge Function `delete-account` is deployed.

---

## 1. Install + cold launch

- [ ] Fresh install from TestFlight.
- [ ] Cold launch — no red error box, no spinner that never finishes.
- [ ] App lands on `onboarding` when signed out.
- [ ] No console runtime errors (check Console.app on Mac, filter by bundle id).

## 2. Auth

- [ ] Tap **Get Started** → `auth?mode=signup` opens.
- [ ] Sign up with a new email; receive confirmation email; confirm.
- [ ] Sign in succeeds; profile/vehicle gates fire as expected.
- [ ] Sign back out from Settings; sign in again; session restores.

## 3. Profile setup

- [ ] After sign-in, `profile` opens because `handle` is null.
- [ ] Set handle + display name; save succeeds.
- [ ] Back/forward navigation does not lose state.

## 4. Vehicle setup

- [ ] After profile, `vehicle` opens because the user has zero vehicles.
- [ ] Add a primary vehicle (type + body + make/model/color/year).
- [ ] Save succeeds; primary vehicle appears on Drive offline panel.

## 5. Location permission — Allow

- [ ] On first **Start RoadPing** tap, iOS prompts for location.
- [ ] Choose **Allow While Using App**.
- [ ] Drive transitions to LIVE; map recenters; range ring appears.

## 6. Location permission — Deny

- [ ] Reinstall app (or revoke location in iOS Settings).
- [ ] Tap **Start RoadPing** → iOS prompts → tap **Don't Allow**.
- [ ] Drive shows the **📍 Location needed to go live** card.
- [ ] Start button is disabled.
- [ ] **Open iOS Settings** button opens the system Settings app at the RoadPing page.
- [ ] Re-enabling location in Settings → returning to app → state recovers (permission card hides, Start button enables).

## 7. Microphone permission — Allow

- [ ] While LIVE, hold the talk button → iOS prompts for microphone (first time only).
- [ ] Choose **Allow** → button enters SPEAKING state (red glow, pulse).
- [ ] Release → button returns to idle without crash.
- [ ] Heartbeat continues unaffected during a PTT cycle.

## 8. Microphone permission — Deny

- [ ] Revoke microphone in iOS Settings → return to LIVE drive.
- [ ] Hold the talk button → "Mic access denied — allow it in Settings" caption appears.
- [ ] No crash, no infinite spinner.
- [ ] Re-grant in Settings → PTT works again.

## 9. Start / Stop / Hide

- [ ] **Start RoadPing** → status pill flips to LIVE, timer starts at 00:00.
- [ ] **Stop** in bottom sheet → session ends, returns to offline panel.
- [ ] **Hide** in bottom sheet → native confirm → "You will disappear from nearby radar immediately" → tap Hide → session ends silently, no toast.
- [ ] Stop & Hide do NOT show your dot to other devices afterward (verify with a second device if available).

## 10. Heartbeat

- [ ] During a 2-minute live session, the heartbeat freshness pill stays under 20s most of the time.
- [ ] Brief Wi-Fi / cellular toggle → freshness goes "away" briefly → recovers when network returns.
- [ ] Session does not end on the device side when heartbeats fail.

## 11. Map (you only) + nearby presence

- [ ] Map renders with visible roads, water, subtle labels (not a flat black sheet).
- [ ] User pin appears as an orange ring + white-bordered dot at your real position.
- [ ] Range ring (orange) hugs the user pin and matches the chosen broadcast range.
- [ ] No other driver is ever drawn on the map (Phase 2: RoadPing has no position or direction for them).
- [ ] Nearby drivers appear only in the header count, the Nearby sheet and the speaker capsule.
- [ ] A speaking driver shows in the speaker capsule with the same distance range as in Nearby.
- [ ] Before touching the map: it follows you, pitched, and turns with the phone's heading; the recenter button is highlighted.
- [ ] Drag with one finger: the map pans and stays where you left it. It does not jump back on the next GPS fix or compass change, and the recenter button is no longer highlighted.
- [ ] Pinch to zoom, two-finger rotate and two-finger tilt each work and each stop following in the same way.
- [ ] A single tap on the map (no drag) does not stop following. If it does on a device, note it: the touch-cancel heuristic in NearbyMap may need tuning.
- [ ] While browsing, the compass shows the map's heading as you rotated it, not the phone's.
- [ ] Recenter returns to your position, pitched, resumes heading-follow, and the button is highlighted again.
- [ ] Browse far away and back: no other driver appears anywhere on the map.
- [ ] Range sheet offers ½ / 1 / 2 / 3 mi (800 m / 1.6 / 3.2 / 4.8 km in metric), nothing smaller.
- [ ] Account whose saved default was ¼ mi (set one in the database): the dock shows "Set range", Go Live opens the range sheet, and nothing goes live until a range is picked.

## 12. Bottom sheet

- [ ] Drag-handle tap toggles expanded / collapsed without animation glitch.
- [ ] Selected driver card shows vehicle, name, speaking/DND state and a distance range (e.g. "½–1 mi"), never a single distance.
- [ ] List rows match the card hierarchy; tapping a row selects that driver.
- [ ] **No drivers nearby yet** empty state appears when list is empty.

## 13. Hold-to-Talk

- [ ] Button visible above the bottom sheet collapsed handle.
- [ ] Pressing and holding shows STARTING → SPEAKING.
- [ ] Releasing shows STOPPING → idle.
- [ ] Hold-to-talk works while panning the map.
- [ ] Hold-to-talk works inside a private drive room.
- [ ] Voice builds: run the full two-iPhone plan in docs/PHASE3_VOICE_PTT.md
      (background, Lock Screen, headset, CarPlay, DND, block, rooms).

## 14. Report / Block

- [ ] Tap a driver → **Report** opens the modal → submit a reason + context → success alert.
- [ ] Tap a driver → **Block** → native confirm → blocked user disappears from nearby.
- [ ] Settings → Blocked Drivers shows the blocked user; unblock removes them.

## 15. Private zones

- [ ] Profile → Settings → Private Zones → create a new zone at the current location.
- [ ] Start RoadPing while inside the zone → session is blocked OR ends quickly with the "🔒 Hidden in private zone" banner.
- [ ] Drive away (or delete the zone) → Start RoadPing succeeds normally.

## 16. Rooms

- [ ] Settings → Rooms → create a new private room.
- [ ] Copy invite code; have a second account join with the code.
- [ ] Inside the room, member list shows vehicle-first identity.
- [ ] PTT inside a room is scoped to the room (other members hear; non-members do not).

## 17. Privacy + Safety screens

- [ ] Settings → Privacy Policy renders without scroll bug.
- [ ] Settings → Safety & Community renders, links to mailto:support@roadping.app.
- [ ] Settings → Contact Support opens the iOS Mail composer with the right recipient.

## 18. Delete account

- [ ] Settings → Delete account → screen opens with explanation cards.
- [ ] Tap **Delete my account** → native confirm → **Delete forever**.
- [ ] App returns to onboarding.
- [ ] Attempt sign-in with the deleted account → fails with friendly error.

## 19. App lifecycle

- [ ] Send the app to background while LIVE → stays live (Phase 3): blue
      location indicator shown, second device keeps seeing you, heartbeats
      continue (server `location_presence.updated_at` advances).
- [ ] Lock the phone for 10 minutes while LIVE → still live; Live Activity
      shows "Live"; unlock → app recovers cleanly.
- [ ] Force-quit while LIVE → second device stops seeing you within ~25 s;
      reopen → "Your live session ended" notice, app is NOT live, Live
      Activity is gone.
- [ ] Drive into a private zone with the phone locked → session ends, Live
      Activity ends, second device stops seeing you.
- [ ] iOS Settings → Location → Never while LIVE → session ends with the
      "Location was turned off" notice.
- [ ] Build without the native module (Expo Go): backgrounding while LIVE
      still ends the session (old behaviour).

## 20. Stability + console

- [ ] No redboxes encountered during the full QA pass.
- [ ] No `console.error` runtime warnings on the Metro / Xcode device log.
- [ ] Memory does not climb unbounded across a 5-minute LIVE session.

## 21. Security greps (run locally, not on device)

```bash
grep -R "location_presence" app src --exclude-dir=node_modules
grep -R "service_role"      app src --exclude-dir=node_modules
```

- [ ] No `.from('location_presence').select(...)` results.
- [ ] No `service_role` results.
- [ ] No location-history table / write introduced.
- [ ] No permanent audio storage path introduced (no upload, no cache, no recording-to-disk).

---

## Sign-off

| QA Owner | Date | Build | Result |
|---|---|---|---|
| | | | ☐ pass · ☐ fail |
