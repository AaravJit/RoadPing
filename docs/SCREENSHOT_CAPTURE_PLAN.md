# RoadPing — App Store Screenshot Capture Plan

App Store Connect requires screenshots for at least one iPhone display size.
RoadPing ships five hero shots that tell the product story: live map → people
nearby → talk to them → private rooms → privacy.

All copy below has been pre-cleared against Apple guideline 1.4.1 (physical
harm) and 1.1.6 (objectionable content) — no "cop", "checkpoint", "race",
"speed up", "police avoidance", or dating language.

---

## 0. Devices to capture on

Capture on a real iPhone in **portrait**:

| Display | Device suggestion | App Store Connect bucket |
|---|---|---|
| 6.9" / 6.7" | iPhone 16 Pro Max / 15 Pro Max | 6.9" Display |
| 6.5" | iPhone 11 Pro Max / XS Max | 6.5" Display (fallback) |

A single 6.9" set will satisfy the modern requirement; only add the 6.5" set
if Apple still asks for it during the submission flow.

## 1. Pre-flight on the capture device

1. `cp .env.example .env` and set `EXPO_PUBLIC_SCREENSHOT_MODE=true`.
2. Sign into a clean QA account (`appreview@roadping.app` or similar).
3. Add a primary vehicle with a vivid color (Midnight Blue is the best).
4. Stand near a residential street so the dark Apple Maps tile actually
   shows roads behind the markers — empty grid blocks look bad.
5. Set the broadcast range to **1 mi** (1.6 km) so the range ring is fully
   visible around you.
6. Enable iOS **Do Not Disturb** so no banner notifications creep in.
7. Hide the battery percentage and route the device through a USB-C
   connection to keep the status bar identical across shots.
8. Take screenshots with **side button + volume up** as usual; iOS saves
   to Photos at the device's native point resolution — that is what App
   Store Connect wants.

Once captured, delete `.env`'s `EXPO_PUBLIC_SCREENSHOT_MODE` line so the
build is not accidentally shipped with the demo flag.

---

## 2. The five hero shots

> **Phase 2 (docs/PHASE2_PROXIMITY_PRIVACY.md):** the app no longer draws
> other drivers on the map and shows distance ranges ("½–1 mi"), not
> distances ("~50 m"). The current `assets/appstore` shots 01 and 02 show
> stranger map markers and point distances and must be retaken before they
> are uploaded. Shots 1 and 2 below describe the Phase 2 screens.

### Shot 1 — Drive map live

- **Screen:** Drive screen, LIVE state.
- **Setup:** Demo mode on → header reads "5 nearby"; your vehicle and range
  circle on the map (no other drivers are drawn on it). Miguel is speaking,
  so the speaker capsule shows "Miguel · Tesla Model 3 · Within ½ mi".
- **Headline overlay:** "Go live on the road map"
- **Subheadline overlay:** "Tap Start RoadPing to appear and see other
  drivers nearby."
- **What it sells:** the map-first product surface; LIVE = visible to
  others.

### Shot 2 — Selected nearby driver

- **Screen:** Drive screen, LIVE, Miguel selected.
- **Setup:** Tap the speaker capsule or Nearby → Miguel's detail in the
  Nearby sheet, with the distance range and Report / Block.
- **Headline:** "See nearby active drivers"
- **Subheadline:** "Broad distance ranges only. Never exact location or
  direction."
- **What it sells:** vehicle-first identity ("Midnight Blue Tesla Model 3"),
  distance-range-only privacy, block/report present.

### Shot 3 — Hold to talk

- **Screen:** Drive screen, LIVE, PTT mid-press (SPEAKING state).
- **Setup:** Hold the talk button so it is in SPEAKING with the red glow
  ring. Demo Miguel below also pulses.
- **Headline:** "Hold to talk"
- **Subheadline:** "Send a live voice burst to nearby drivers. Live only,
  never recorded."
- **What it sells:** voice = the whole interaction. Reinforces "never
  recorded".

### Shot 4 — Private drive rooms

- **Screen:** `app/room/[roomId]` after joining a demo room.
- **Setup:** Create a room called "Sunday Run" with two members; PTT
  button visible at bottom; member cards showing vehicle-first identity.
- **Headline:** "Create private drive rooms"
- **Subheadline:** "Group hold-to-talk with the people you actually ride
  with."
- **What it sells:** the rooms feature without leaking into "social network"
  framing.

### Shot 5 — Live-only privacy / Stop & Hide

- **Screen:** Drive screen, just after tapping **Stop & Hide** — offline
  panel visible, "Invisible until you go live. No location history. No
  recordings." footer prominent.
- **Setup:** Hide UI state — bottom panel shows Start RoadPing, the
  privacy footer, and the "Use RoadPing only when it is safe and legal to
  do so." line. Map behind shows the same dark Apple Maps tile.
- **Headline:** "Disappear when you stop"
- **Subheadline:** "No location history. No saved voice clips. You appear
  only while active."
- **What it sells:** explicit privacy guarantee — answers the natural App
  Review concern in one shot.

---

## 3. Copy guardrails

Always use these phrasings; never the unsafe versions:

| Use | Don't use |
|---|---|
| "live road awareness" | "checkpoint alert" / "cop ahead" |
| "nearby drivers" | "all drivers around you" |
| "hold to talk" | "anonymous broadcast" |
| "private rooms" | "secret rooms" |
| "disappear when you stop" | "stay anonymous" / "untraceable" |
| "no location history" | "we never know where you are" |
| "no saved voice clips" | "no recordings ever" (still true but soft "saved" is safer) |
| "use only when safe and legal" | "drive faster" / "race friends" |

---

## 4. Layout template (for overlay artwork)

Recommended structure for every shot when laid out in Figma or an image
generator:

```
┌─────────────────────────────────────┐
│                                     │
│        [HEADLINE — 1 line]          │  ← 44–56pt, RoadPing orange #FF6B35
│        [Subheadline — 2 lines]      │  ← 18–22pt, white at 80% opacity
│                                     │
│   ┌───────────────────────────┐     │
│   │                           │     │
│   │   iPhone frame containing │     │  ← actual captured PNG
│   │   the real RoadPing UI    │     │
│   │                           │     │
│   └───────────────────────────┘     │
│                                     │
│           [bottom safe area]        │
└─────────────────────────────────────┘
```

Background: same `#0A0A0A` as the app's `Colors.background` with a soft
radial orange glow centered behind the device for visual lift.

---

## 5. Submission checklist

- [ ] Five hero shots captured on a real iPhone in portrait.
- [ ] Each shot wears the same headline/subheadline template.
- [ ] No personally identifying real data anywhere in any shot.
- [ ] Status bar is clean (full battery, no notifications, full signal).
- [ ] Demo mode disabled before next non-screenshot build.
- [ ] Screenshots uploaded to App Store Connect in the order above (Shot 1
      first).
