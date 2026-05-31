# RoadPing — iOS Release Checklist

iOS-only. There is no Android target.

---

## 0. Pre-flight (local)

```bash
npm run typecheck
npx expo-doctor
npx expo start -c
```

- [ ] `npm run typecheck` exits 0.
- [ ] `npx expo-doctor` reports no critical issues.
- [ ] App launches in Expo Go / dev client without a redbox.

## 1. Apple Developer prerequisites

- [ ] Active Apple Developer Program membership.
- [ ] App ID `com.roadping.app` exists in Apple Developer portal (or let EAS
      create it).
- [ ] App record exists in App Store Connect with bundle ID
      `com.roadping.app`.
- [ ] **Privacy Policy URL** is set in App Store Connect → App Privacy
      (`https://roadping.app/privacy`, mirroring `docs/PRIVACY.md`).
- [ ] **Support URL** is set (`https://roadping.app/support`).

## 2. App config audit

- [ ] `app.json` bundle ID = `com.roadping.app`.
- [ ] `app.json` `buildNumber` bumped if re-submitting same `version`.
- [ ] iOS permission strings match user-facing language in
      `docs/APP_STORE_METADATA.md`.
- [ ] No `NSLocationAlwaysAndWhenInUseUsageDescription` (background
      location is not used).
- [ ] No background modes (`UIBackgroundModes`) declared in `infoPlist`.
- [ ] `ITSAppUsesNonExemptEncryption = false` is set (we only use OS HTTPS).

## 3. Backend audit

- [ ] All Supabase Edge Functions are deployed:
      `start-live-session`, `stop-live-session`, `update-live-location`,
      `get-nearby-drivers`, `block-user`, `report-user`, `create-room`,
      `join-room`, `leave-room`, `get-room-members`,
      `start-voice-session`, `stop-voice-session`, `expire-stale-sessions`,
      **and the new `delete-account`**.
- [ ] Migration `20260528000009_reports_anonymize.sql` applied to prod DB.
- [ ] `expire-stale-sessions` pg_cron schedule is running.
- [ ] No `SUPABASE_SERVICE_ROLE_KEY` reference in any client-side file
      (verified by `grep`).
- [ ] No direct client reads of `location_presence` (RLS blocks it; verify
      no service code attempts it).

## 4. App Review prep

- [ ] Demo account `appreview@roadping.app` exists with: confirmed email,
      profile + handle, one primary vehicle, one private zone (optional).
- [ ] `docs/APP_REVIEW_NOTES.md` pasted into App Review Information →
      Notes, with the demo password filled in.
- [ ] App Privacy answers in App Store Connect match
      `docs/APP_PRIVACY_LABELS.md`.
- [ ] Account deletion question answered **Yes** and points to in-app
      Settings → Delete account.

## 5. EAS build

```bash
eas login
eas build:configure                       # only once
eas build -p ios --profile preview        # internal TestFlight
# or
eas build -p ios --profile production     # release build
```

- [ ] Build succeeds.
- [ ] Build install on a real iPhone via TestFlight without crash on
      launch.

## 6. TestFlight smoke test (real device)

- [ ] Cold launch → no crash, no red error.
- [ ] Sign up new account → email confirmation → sign in.
- [ ] Profile setup → handle + display name accepted.
- [ ] Vehicle setup → primary vehicle created.
- [ ] Drive screen loads with map.
- [ ] Tap Start RoadPing → location prompt fires → LIVE state shown.
- [ ] Hold mic button → microphone prompt fires (first time) → voice state
      shown → release works.
- [ ] Stop and Hide both work; user disappears from any second device.
- [ ] Open driver card → Block works → user disappears.
- [ ] Open driver card → Report submits → success.
- [ ] Settings → Privacy Policy renders.
- [ ] Settings → Safety renders.
- [ ] Settings → Delete account → confirm → account is gone; relaunch lands
      on onboarding.

## 7. Submit

```bash
eas submit -p ios --latest
```

Or upload the `.ipa` through Transporter.

- [ ] App Review Notes filled in.
- [ ] Screenshots uploaded for at least 6.7" and 6.5" iPhone displays.
- [ ] Age rating questionnaire matches `docs/APP_STORE_METADATA.md`.

## 8. After submission

- [ ] Backend is on call for the review window.
- [ ] Support email is monitored.
- [ ] If rejected: read every word of the reviewer note before changing
      code. Most rejections in this domain are about missing demo access,
      missing account deletion, or unclear permission strings — none of
      which require a feature change.
