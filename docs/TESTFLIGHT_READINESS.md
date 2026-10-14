# RoadPing — TestFlight Readiness Checklist

Pre-submission stop-list. Every box must be ticked before pushing the
TestFlight build that you intend to promote to App Store review.

Cross-references:
- `docs/IOS_RELEASE_CHECKLIST.md` — end-to-end release runbook (Phase 12).
- `docs/REAL_DEVICE_QA.md` — full real-iPhone QA pass (Phase 14).
- `docs/SCREENSHOT_CAPTURE_PLAN.md` — how to capture App Store screenshots.
- `docs/APP_REVIEW_NOTES.md` — text pasted into App Review Information.
- `docs/APP_STORE_METADATA.md` — name, subtitle, description, keywords.
- `docs/APP_PRIVACY_LABELS.md` — App Privacy questionnaire answers.
- `docs/VISUAL_HANDOFF_FOR_IMAGE_GENERATION.md` — icon, splash, screenshot
  prompts.

---

## 1. Backend

- [ ] Supabase project URL + anon key set in build env (`EXPO_PUBLIC_SUPABASE_URL`,
      `EXPO_PUBLIC_SUPABASE_ANON_KEY`).
- [ ] All migrations applied up to and including
      `20260528000009_reports_anonymize.sql`.
- [ ] `expire-stale-sessions` pg_cron job confirmed scheduled.
- [ ] All Edge Functions deployed: `start-live-session`, `stop-live-session`,
      `update-live-location`, `get-nearby-drivers`, `block-user`, `report-user`,
      `create-room`, `join-room`, `leave-room`, `get-room-members`,
      `start-voice-session`, `stop-voice-session`, `expire-stale-sessions`,
      **`delete-account`**.
- [ ] Edge Function logs accessible during the review window.

## 2. App build config

- [ ] `app.json` `version` bumped if metadata changed.
- [ ] `app.json` iOS `buildNumber` bumped (App Store Connect rejects
      duplicates).
- [ ] `app.json` `platforms: ["ios"]` — no Android leakage.
- [ ] Bundle ID matches App Store Connect record (`com.roadping.app`).
- [ ] `eas.json` `submit.production.ios.appleId`, `ascAppId`, and
      `appleTeamId` placeholders replaced with real values.
- [ ] `EXPO_PUBLIC_SCREENSHOT_MODE` is **NOT set** (or `false`) in the
      submitted build.

## 3. iOS permissions and capabilities (Phase 3)

Check the built app's Info.plist / entitlements (see docs/PHASE3_VOICE_PTT.md
→ Native capabilities):

- [ ] `NSLocationWhenInUseUsageDescription` matches app.json (mentions use in
      the background while live).
- [ ] `NSLocationAlways*` strings exist only because expo-location always
      writes them; they say RoadPing never needs Always. The app never
      requests Always (scripts/client-test/phase3Native.test.mjs).
- [ ] `NSMicrophoneUsageDescription` matches app.json.
- [ ] `UIBackgroundModes`: `location` in every build; `push-to-talk` only in
      voice builds. Never `audio` or `voip`.
- [ ] Entitlements: `com.apple.developer.push-to-talk` and `aps-environment`
      only in voice builds; no CarPlay entitlement in any build sent to
      TestFlight unless Apple has granted it.
- [ ] `NSSupportsLiveActivities: true`; the `RoadPingLiveActivity` widget
      extension (bundle id `<app>.liveactivity`) is embedded.
- [ ] `ITSAppUsesNonExemptEncryption: false`.

## 4. Apple Developer / App Store Connect

- [ ] Active Apple Developer Program membership.
- [ ] App record exists in App Store Connect under bundle ID
      `com.roadping.app`.
- [ ] **Privacy Policy URL** set (mirrors `docs/PRIVACY.md`).
- [ ] **Support URL** set (resolves over HTTPS, includes contact path).
- [ ] App Privacy questionnaire answers match
      `docs/APP_PRIVACY_LABELS.md`.
- [ ] "Does your app support account deletion?" answered **Yes**, pointer
      = "Settings → Delete account".
- [ ] Age rating saved per `docs/APP_STORE_METADATA.md`.
- [ ] App Review Information → Notes contains
      `docs/APP_REVIEW_NOTES.md` text with a real demo password.

## 5. Demo / reviewer access

- [ ] Demo account `appreview@roadping.app` exists with: confirmed email,
      profile + handle, one primary vehicle.
- [ ] Demo password current and noted in App Review Information.
- [ ] Demo account is **not** banned, shadow-banned, or rate-limited.
- [ ] If screenshot mode was used for capture, it is now disabled.

## 6. Assets

- [ ] App icon delivered (single 1024×1024 PNG, no transparency, no
      rounded corners — Apple applies the mask). Source brief:
      `docs/VISUAL_HANDOFF_FOR_IMAGE_GENERATION.md` Section E.
- [ ] Splash screen / launch image consistent with the icon. Source brief:
      Section F.
- [ ] Screenshots captured for at least 6.9" (or 6.7") iPhone. Source
      brief: `docs/SCREENSHOT_CAPTURE_PLAN.md`.
- [ ] Marketing copy (name, subtitle, description, keywords, promotional
      text) finalized per `docs/APP_STORE_METADATA.md`.

## 7. In-app reviewer-facing requirements

- [ ] Privacy Policy reachable in-app: Settings → Privacy Policy.
- [ ] Safety / Community guidelines reachable: Settings → Safety &
      Community.
- [ ] Support reachable: Settings → Contact Support (mailto opens iOS
      Mail composer).
- [ ] Account deletion reachable: Settings → Delete account → confirm →
      destructive confirm (Phase 12).

## 8. Real-device behavior

Run the full `docs/REAL_DEVICE_QA.md` on the same TestFlight build that
will be submitted:

- [ ] No redbox crashes encountered.
- [ ] No runtime `console.error` warnings on the device log.
- [ ] App memory does not climb unbounded across a 5-minute LIVE session.
- [ ] Cold launch < 3s on iPhone 11 or newer.
- [ ] Location prompt copy matches §3.
- [ ] Microphone prompt copy matches §3.
- [ ] Hide/Stop drop presence immediately (confirmed on a second device).
- [ ] Voice builds: the two-iPhone plan in docs/PHASE3_VOICE_PTT.md passes.
- [ ] Account deletion fully clears the local session and the auth user.

## 9. Pre-flight greps (run from repo root)

```bash
npm run typecheck
npx expo-doctor
grep -R "location_presence" app src --exclude-dir=node_modules
grep -R "service_role"      app src --exclude-dir=node_modules
```

- [ ] `npm run typecheck` exits 0.
- [ ] `npx expo-doctor` reports no critical issues.
- [ ] `location_presence` grep returns only docstring matches, never a
      client `.from('location_presence').select(...)`.
- [ ] `service_role` grep returns no results.

## 10. Submit

```bash
eas build -p ios --profile production
eas submit -p ios --latest
```

- [ ] Build successful.
- [ ] Submission accepted by App Store Connect.
- [ ] Backend on call for the review window.
- [ ] Support email monitored.

---

## Sign-off

| Role | Name | Date | Decision |
|---|---|---|---|
| Release owner | | | ☐ ship · ☐ hold |
| QA owner | | | ☐ ship · ☐ hold |
