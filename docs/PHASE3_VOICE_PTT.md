# Phase 3 / 3.5 — Real nearby voice, Apple Push to Talk, background live, Live Activity, CarPlay

Status: implemented on branch `claude/phase3-native-ptt-carplay-zm0lpv`, not
deployed. Production Agora stays disabled (kill switch
`EXPO_PUBLIC_DISABLE_AGORA=true`). Validation results are in the PR report.

This supersedes the v1 decision "foreground-only while live" (2026-09-30).
RoadPing Plus stays hidden.

---

## 1. What changed for a driver

- **Go Live keeps working with the phone locked.** Location continues under
  **When In Use** authorization (never Always) with the blue location
  indicator; the server keeps enforcing private zones.
- **Real Nearby voice.** Hold to talk reaches live drivers within range,
  decided by the server for every press. Room voice reaches room members only.
- **Apple Push to Talk.** Talk and hear from the Lock Screen / Dynamic Island
  system UI, Bluetooth or wired headset buttons, and CarPlay's play/pause
  control, with RoadPing in the background.
- **Live Activity** on the Lock Screen, Dynamic Island and (iOS 26+) CarPlay:
  Live / Talking / who is talking / Reconnecting. No buttons.
- **Never automatic.** Only Go Live starts a session. A cold launch ends any
  session a previous run left behind and says so. There is no "go live while
  driving" mode.
- **Do Not Disturb = no incoming voice.** A DND driver stays visible and can
  still talk.

## 2. Architecture

```
 Speaker iPhone                     Supabase                          Listener iPhone
 ──────────────                     ────────                          ───────────────
 press (button / Lock Screen /      voice-transmission begin
 headset / CarPlay)        ───────▶   voice_begin_transmission  ──┐
   transmissionMachine               (private.voice_transmissions │
                                      opaque channel rpt_<hex>,   │  fan-out (background):
   ◀── publisher token (≤45 s) ──     random speaker uid)         ├─ voice_fanout_targets
   joinChannelEx(publish mic)                                     │   (private.voice_can_listen)
   PUBLISHING → confirm ─────────▶  voice_confirm_transmission    │  APNs pushtotalk push per
                                     (voice_sessions row: the      │  listener: its own
                                      public "talking" signal)    │  subscriber token (≤45 s)
                                                                   └──────────────▶ PTChannelManager
                                                                        incomingPushResult →
                                                                        activeRemoteParticipant →
                                                                        audio session activated →
                                                                        joinChannelEx(audience,
                                                                        allowlist = speaker uid)
   token will expire → begin again (same client_tx_id): server re-checks, new token or refuse
   listener token will expire → grant again: server re-checks, new token or leave (fail closed)
```

Server pieces (migration `20261001000013_voice_transmissions`):

| Object | Purpose |
|---|---|
| `private.voice_transmissions` | One row per press: speaker, live session, room or Nearby, opaque `rpt_<32 hex>` channel, random speaker uid, state `arming → live → ended`, 70 s hard end. One open press per speaker. |
| `private.voice_contexts` | The driver's ONE active voice context per live session (room id; no row = Nearby). |
| `private.ptt_push_tokens` | Ephemeral PushToTalk APNs token per installation, bound to the live session, 12 h max, deleted when the session ends. |
| `private.voice_can_listen(listener, tx)` | The single authorization predicate (below). Used by fan-out, listener grants and renewals. |
| `public.voice_*`, `register_ptt_token`, … | SECURITY DEFINER RPCs granted to `service_role` only; called by Edge Functions. |

`voice_can_listen` requires ALL of: the press is open and before its hard
end; the speaker's live session is active and unexpired and is the press's
session; speaker not banned or shadow-banned; listener live, not banned, not
DND, not the speaker, not transmitting; both drivers' voice contexts equal the
press's context; no block in either direction; for Nearby, the Phase 2
`private.nearby_pair_band(listener, speaker)` is not null (mutual range on
the snapped grid, exactly what decides Nearby visibility); for a room, both
are members.

Edge Functions:

| Function | Change |
|---|---|
| `voice-transmission` (new) | `begin` (publisher token + background fan-out), `confirm`, `end`, `grant` (listener token), `context`. Every denial for `grant` is the same `403 denied`. Rate-limited except `end`. |
| `ptt-token` (new) | Register / unregister this device's PushToTalk token. |
| `stop-live-session` | Optional `{session_id, reason}`; only ends a matching session. |
| `block-user` | After a block, kicks the two users out of any open press channel between them (Agora kicking-rule, when the optional customer credentials are set); tokens are refused at renewal regardless. |
| `delete-account` | Removes PushToTalk tokens and ends open presses. |
| `create-agora-token` | Retired: always `410`. It minted long-lived shared-channel tokens (and passed an absolute timestamp where agora-token expects a relative TTL). |

App pieces:

| File | Role |
|---|---|
| `src/services/voice/transmissionMachine.ts` | Pure, tested reducer: the one transmission state machine for every press source. |
| `src/services/voice/voiceController.ts` | Runs the machine's effects; owns transport mode, voice context, incoming presses (max 3), renewals, DND, Realtime fallback. |
| `src/services/agoraVoice.ts` | One Agora engine, one connection per press (`joinChannelEx`), allowlisted playback, token renewal, fail-closed on expiry / ban / invalid token. |
| `src/services/live/liveController.ts` | The live session: start, native background location heartbeats, private zone / expiry / location-off endings, Live Activity, cold-launch cleanup, logout. |
| `modules/roadping-native` | Local Expo module (Swift): PushToTalk channel manager, background location manager, Live Activity, launch hook, CarPlay scaffold. |
| `targets/live-activity` | ActivityKit widget extension (via `@bacons/apple-targets`). |
| `plugins/withRoadPingNative.js` | Info.plist / entitlements, gated by build. |

### Transport modes

| Mode | When | Background voice |
|---|---|---|
| `ptt` | PushToTalk channel joined (iOS 16+, voice build) | Yes |
| `direct` | PushToTalk unavailable (join refused, simulator, older build) | No: voice pauses in the background with a notice; live presence continues |
| `indicator` | Expo Go or kill switch on | No audio at all; "talking" status only (the pre-Phase 3 behaviour) |

### Half- vs full-duplex: half-duplex (deliberate)

RoadPing uses `PTTransmissionMode.halfDuplex` and the state machine refuses a
press while receiving. Reasons: drivers should not talk over each other on a
one-button radio; full duplex would need echo cancellation across several
simultaneous speakers through car speakers, which is where Agora's AEC is
weakest; and Apple's half-duplex mode makes the system UI enforce the same
rule. If a push arrives while the driver is transmitting (a race: the remote
press started first server-side), the native side stops the local
transmission before returning the remote participant. The server never fans
out to a driver who is transmitting.

### Listener paths

1. **Push (any app state, `ptt` mode).** The server's fan-out sends a
   `pushtotalk` push carrying that listener's own subscriber token. The
   native `incomingPushResult` returns the speaker as the active remote
   participant; iOS activates the audio session; JS joins the press channel.
2. **Realtime (foreground only).** The public `voice_sessions` insert (made at
   `confirm`) triggers a `grant` by voice-session id; the server re-checks
   everything. In `ptt` mode the app then shows the speaker through
   `setActiveRemoteParticipant` so iOS activates audio. Deduplicated by
   transmission and speaker.

A listener whose push failed simply misses that press: no retries, no queue.

## 3. Security guarantees

- **No shared channel, no client-side filtering.** A press is a fresh random
  channel; only the speaker (publisher token) and each server-authorized
  listener (subscriber token for its own random uid) can join it.
- **Short-lived tokens, renewed by asking again.** Tokens live
  `min(45 s, time to hard end + 5 s)`; token and privilege expiry are equal,
  so expiry removes the user from the channel. Renewal re-runs the same
  authorization; refusal leaves the channel (fail closed). Agora's
  `TokenExpired`, `InvalidToken`, `BannedByServer` and `RejectedByServer`
  states also leave.
- **Uniform denials.** `grant` returns `403 denied` for unknown presses,
  out-of-range listeners, blocks, DND, bans and ended presses alike.
- **No location in voice.** Push payloads and responses carry no position,
  distance or band; the speaker's name, a random uid and a channel name only.
- **Secrets stay server-side.** `AGORA_APP_CERTIFICATE`, `APNS_PRIVATE_KEY`,
  `AGORA_CUSTOMER_SECRET` are Edge Function secrets; the app bundle carries
  the public Agora App ID only (delivered per press). A client test greps for
  certificate / key material.
- **Phase 1 / 2 intact.** No change to RLS on existing tables, to
  `get_nearby_drivers_v3`, to the band model or to range rounding. No stranger
  map pins. The Phase 2 regression tests run in the suite.
- **Room isolation.** Room presses reach only members who also have that room
  open as their voice context; Nearby pauses for a driver while a room is open.

## 4. Background location design

- Authorization: `requestForegroundPermissionsAsync` (When In Use). Nothing
  in the app calls `requestBackgroundPermissionsAsync`,
  `requestAlwaysAuthorization` or `startLocationUpdatesAsync` (client test).
- `expo-location` still writes the two `NSLocationAlways*` strings into
  Info.plist; they say RoadPing never needs Always. Its plugin keeps
  `isIosBackgroundLocationEnabled: false`.
- The native module's own `CLLocationManager`, started in the foreground when
  the driver taps Go Live: `allowsBackgroundLocationUpdates = true`,
  `showsBackgroundLocationIndicator = true`, `pausesLocationUpdatesAutomatically
  = false`, `activityType = .automotiveNavigation`, 100 m accuracy, 50 m
  distance filter, plus `CLBackgroundActivitySession` on iOS 17+. A 12 s
  native timer emits the latest fix (≤ 120 s old) for the heartbeat.
- Why not expo-location's background API: it runs through expo-task-manager,
  whose task iOS relaunches after termination (conflicts with "never resume
  on cold launch"), and Expo pairs it with background (Always) permission.
  (Inferred from the expo-location / task-manager design; Expo's docs site was
  not reachable from this environment.)
- Endings: heartbeat `session_ended` (private zone) → end locally with the
  zone notice; `404 No active session` or `403 Account suspended` → end with
  "expired"; authorization lost → end with "location off"; force quit →
  server expiry within 25 s, next launch shows "Your live session ended".
- Without the native module (Expo Go), backgrounding while live still ends
  the session, so a driver never looks live while not reporting.
- iOS `inactive` (Control Center, call banners) is not treated as background.
- Keep-awake only while Drive is focused and live (`useFocusEffect`).

## 5. Audio session / Bluetooth design

- `ptt` mode: PushToTalk activates and deactivates the session. The native
  side sets `.playAndRecord` / `.voiceChat` / `[.allowBluetooth,
  .defaultToSpeaker]` at join; Agora is told
  `setAudioSessionOperationRestriction(All)` so it never reconfigures or
  deactivates it. Agora joins only after `didActivate`.
- `direct` mode: Agora manages the session with
  `setDefaultAudioRouteToSpeakerphone(true)` — the loudspeaker is the default
  only, so Bluetooth, CarPlay and wired routes take over when present. The old
  `setEnableSpeakerphone(true)` forced the built-in speaker even with CarPlay
  connected; it is removed.
- Audio scenario `Chatroom` (designed for frequent mic on/off).
- An interruption mid-press (call, Siri) releases the press as
  `interrupted` and tells the server.

## 6. Live Activity / Dynamic Island

- Widget extension `RoadPingLiveActivity` (bundle `<app>.liveactivity`,
  deployment target iOS 18), generated at prebuild from `targets/live-activity`.
- Started from the foreground at Go Live (`Activity.request`, no push type).
  Updated on state changes and at least every 60 s while healthy, each time
  with `staleDate = now + 180 s`, so a Live Activity left by a killed process
  shows "Not updating. Open RoadPing." within 3 minutes.
- Ended (dismissal `.immediate`) on stop, private zone, expiry, location off,
  logout and at every launch (`RoadPingAppDelegateSubscriber`).
- `.supplementalActivityFamilies([.small])` for CarPlay (iOS 26+) and the
  Watch Smart Stack; no buttons (they do not act in CarPlay).
- Content: status, speaker name while receiving, context name, DND. No
  location, distance or band.

## 7. Phase 3.5 CarPlay

What ships without any CarPlay entitlement:

- **PushToTalk in CarPlay.** With the PTT channel active, the car's
  play/pause control begins / ends a transmission (Apple: "The system
  automatically interprets play or pause toggle events from wired headsets
  and CarPlay devices when the system has an active PTT channel").
- **Live Activity in CarPlay** (iOS 26+), via the `.small` family.

What is scaffolded but **not** in any shipping configuration:

- `RoadPingCarPlaySceneDelegate`: a `CPListTemplate` with live status and a
  Talk / Stop item, refreshed at most every 10 s, and
  `RoadPingPhoneSceneDelegate` to move the RN window onto a scene.
- Enabled only when `ROADPING_CARPLAY_ENTITLEMENT=driving-task` is set at
  prebuild; the plugin refuses an EAS `production` profile build. Neither
  `app.json` nor `eas.json` names a CarPlay entitlement (client test).
- Untested: requires a Mac with CarPlay Simulator and an entitlement-bearing
  provisioning profile. RoadPing holds no CarPlay entitlement today.

## 8. Native capabilities and entitlements

| Item | Voice build (`voice-test`, development) | Kill switch on / production profile (default) |
|---|---|---|
| `UIBackgroundModes` `location` | yes | yes |
| `UIBackgroundModes` `push-to-talk` | yes | no |
| `com.apple.developer.push-to-talk` | yes | no |
| `aps-environment` | `development` in the plist; export signs with the profile's value | no |
| `NSSupportsLiveActivities` | yes | yes |
| Widget extension `.liveactivity` | yes | yes |
| CarPlay entitlement / scene manifest | only with `ROADPING_CARPLAY_ENTITLEMENT`, never production | no |
| `audio` / `voip` background modes | no | no |

A production build gets PushToTalk only with `ROADPING_PTT_IN_PRODUCTION=true`
in its build environment (and the kill switch off).

Apple Developer portal (Aarav): enable **Push to Talk** and **Push
Notifications** on the App ID; register the `.liveactivity` extension App ID
(EAS offers to do this during the first build); create an APNs auth key
(.p8). Never commit the key.

## 9. Backend / migrations / secrets

- Migration `20261001000013_voice_transmissions.sql` + rollback
  `supabase/rollback/20261001000013_voice_transmissions.down.sql`.
  Migrations 001–012 untouched.
- Supabase Edge Function secret NAMES (values never in the repo):
  `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `APNS_TEAM_ID`, `APNS_KEY_ID`,
  `APNS_PRIVATE_KEY` (the .p8 PEM), `APNS_BUNDLE_ID`; optional
  `AGORA_CUSTOMER_ID`, `AGORA_CUSTOMER_SECRET` (RESTful API credentials for
  immediate kicks after a block).
- Agora Console: enable **co-host authentication** on the project so the
  subscriber role in listener tokens is enforced (otherwise any valid token
  may publish; see residual risks).

## 10. Voice-test TestFlight deployment order

Aarav runs every step; nothing here was executed.

1. Apple portal: Push to Talk + Push Notifications on the App ID; APNs key;
   `.liveactivity` App ID.
2. Agora Console: co-host authentication on.
3. `eas build -p ios --profile voice-test` (kill switch off for this build
   only via `eas.json` env; production env untouched). First build registers
   the extension and regenerates profiles.
4. `supabase db push` (applies 013 only).
5. Set the secrets above (`supabase secrets set …`) on the target project.
6. Deploy functions individually, in order: `voice-transmission`,
   `ptt-token`, `stop-live-session`, `delete-account`, `block-user`; then
   `create-agora-token` (retired) last. Never a blanket deploy.
7. `eas submit -p ios --profile voice-test`; TestFlight internal testers only.
8. Run the two-iPhone plan below.

Production keeps `EXPO_PUBLIC_DISABLE_AGORA=true` and gets no PushToTalk
entitlement until a separate decision.

## 11. Physical two-iPhone test plan

Phones A and B, two accounts, both on the voice-test build, both live within
½ mi (same car park is fine), Wi-Fi off on one to exercise cellular.

| # | Steps | Expected |
|---|---|---|
| 1 | A and B Go Live | Both see each other in Nearby with a band; Live Activity "Live"; blue location indicator |
| 2 | B holds to talk, A in foreground | A hears B within ~1 s; A's capsule shows B talking; B's button "Talking" |
| 3 | A locks the screen; B talks | A hears B; system PTT UI shows B; Live Activity "Receiving" with B's name |
| 4 | A talks from the Lock Screen PTT button | B hears A |
| 5 | A with AirPods / car Bluetooth: press the stem / steering-wheel button | Transmission begins / ends; audio routes to the headset or car |
| 6 | CarPlay (or CarPlay Simulator on a Mac): play/pause | Begins / ends a transmission; Live Activity in CarPlay Dashboard (iOS 26+) |
| 7 | Both press at once | One wins; the other is refused ("Someone is talking"); no duplex echo |
| 8 | Hold 65 s | Auto-release at 60 s; B's audio stops |
| 9 | A turns on DND; B talks | A hears nothing; B still sees A; A can still talk to B |
| 10 | A blocks B mid-press | B's audio to A stops (immediately with Agora kick credentials, else within 45 s); no further presses either way |
| 11 | Move B beyond range (or B lowers range to ½ mi at >1 mi) | B's presses no longer reach A within one band hold (30 s) |
| 12 | A opens a room both joined; B stays on Nearby; B talks | A does not hear B (different contexts); B opens the room → A hears |
| 13 | A drives into a private zone, locked | Session ends; Live Activity ends; B stops seeing A |
| 14 | Force-quit A while live | B stops seeing A within ~25 s; reopening A shows "Your live session ended", not live, no Live Activity |
| 15 | Airplane mode on A for 30 s while live | Header "Reconnecting…", Live Activity "Reconnecting"; recovers when back |
| 16 | A taps Leave in the system PTT UI | A's live session ends |
| 17 | Phone call during a press | Press ends as interrupted; no stuck "Talking" anywhere |
| 18 | Sign out while live | Session, PTT channel, token and Live Activity all gone |
| 19 | Battery: 30 min live, locked, 5 presses | Note battery % used on both phones |

Server checks after the run (read-only SQL): no `private.voice_transmissions`
row left open, no `private.ptt_push_tokens` row for ended sessions.

## 12. CarPlay entitlement request (draft for developer.apple.com/carplay)

- **Category requested:** CarPlay **driving task** app
  (`com.apple.developer.carplay-driving-task`, iOS 16+).
- **Why:** RoadPing is push-to-talk for drivers: one Talk / Stop control and
  a live status, used while driving to coordinate with nearby drivers or a
  convoy room. The CarPlay screen shows only template UI (a list with status
  and Talk), no map, no POIs, no text.
- **Already working without an entitlement:** PushToTalk play/pause control
  and the Live Activity in CarPlay.
- **Note:** the communication category requires SiriKit messaging or CallKit
  VoIP calling, which RoadPing does not implement; Apple may judge that
  driving task does not fit a voice app either. The request may be declined;
  nothing ships until approved.
- **Not claimed:** RoadPing holds no CarPlay entitlement today.

## 13. Battery / performance

- Location: 100 m accuracy, 50 m distance filter, automotive activity type —
  GPS is still active while live (driving), which is the main cost.
- Heartbeat every 12 s (unchanged from Phase 2), now also in the background:
  a small HTTPS request each time keeps the cellular radio warm. Residual.
- Voice idle cost is zero: no Agora connection exists between presses (also
  avoids Agora per-minute billing for idle channel members). PushToTalk keeps
  no socket open; APNs wakes the app.
- Fan-out: one push per eligible listener per press, ≤ 200, 20 concurrent.
- Live Activity: ≤ 1 update/min while idle plus state changes.
- Keep-awake only on a focused, live Drive screen.

## 14. Residual risks

- Agora subscriber role is enforced only with co-host authentication enabled
  in the Agora Console; until then a listener's token could publish into a
  press channel it was authorized to hear.
- A listener keeps audio for up to 45 s after losing authorization (block
  without kick credentials, range change, DND toggle) until renewal.
- Push delivery is best effort; a missed push means a missed press.
- The 12 s background heartbeat costs battery; consider adaptive cadence.
- PushToTalk, Live Activity, background location and CarPlay behaviour are
  untested on hardware in this change (no Mac / device here).
- `aps-environment` is `development` in the generated entitlements; App
  Store / TestFlight export re-signs with the profile's value (as with
  expo-notifications). Verify on the first voice-test build.

## Sources (Apple)

- Creating a Push to Talk app — https://developer.apple.com/documentation/pushtotalk/creating-a-push-to-talk-app
- PTChannelManagerDelegate — https://developer.apple.com/documentation/pushtotalk/ptchannelmanagerdelegate
- PTChannelRestorationDelegate — https://developer.apple.com/documentation/pushtotalk/ptchannelrestorationdelegate
- PTTransmissionMode — https://developer.apple.com/documentation/pushtotalk/pttransmissionmode
- PTPushResult — https://developer.apple.com/documentation/pushtotalk/ptpushresult
- Push to Talk entitlement — https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.push-to-talk
- APS Environment entitlement — https://developer.apple.com/documentation/bundleresources/entitlements/aps-environment
- Sending notification requests to APNs — https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
- Establishing a token-based connection to APNs — https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns
- Handling notification responses from APNs — https://developer.apple.com/documentation/usernotifications/handling-notification-responses-from-apns
- Handling location updates in the background — https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background
- allowsBackgroundLocationUpdates — https://developer.apple.com/documentation/corelocation/cllocationmanager/allowsbackgroundlocationupdates
- CLBackgroundActivitySession — https://developer.apple.com/documentation/corelocation/clbackgroundactivitysession-3mzv3
- Displaying live data with Live Activities — https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities
- CarPlay — https://developer.apple.com/documentation/carplay ; Requesting CarPlay entitlements — https://developer.apple.com/documentation/carplay/requesting-carplay-entitlements
- CarPlay Developer Guide (June 2026, PDF) — https://developer.apple.com/carplay/documentation/CarPlay-Developer-Guide.pdf
