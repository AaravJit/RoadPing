# RoadPing — Visual Handoff for Image Generation

This document is the source of truth for what RoadPing **actually looks like
right now** (Phase 13). Use it to brief ChatGPT (or any image generator) when
generating app icon concepts, splash screens, or App Store screenshots so the
generated artwork matches the real UI rather than a wishful version of it.

Every claim below was verified against the current code in `app/` and
`src/components/`. If you redesign the app, update this file before
generating new art.

---

## A. Overall brand style

- **Personality:** confident, calm, driver-first. Not flashy, not retro CB
  radio, not a video-game UI. The closest reference is Apple Maps' dark mode
  with a single warm accent color.
- **Mood:** night-drive cockpit. Dark surfaces, low ambient brightness,
  one accent that feels like dashboard lighting.
- **Dark mode:** permanent. The app declares `userInterfaceStyle: "dark"`
  in `app.json` — there is no light theme.
- **Main colors (from `src/theme/colors.ts`):**
  - Background `#0A0A0A` (true deep)
  - Surface `#111111` (cards, sheets)
  - Elevated surface `#1A1A1A` (modals, inner cards)
  - Pressed surface `#222222`
  - Border `#242424`, focused border `#404040`
- **Accent (the "RoadPing orange"):**
  - Primary `#FF6B35` (vivid amber-orange)
  - Primary dim `#CC4F1C`
  - Primary muted `rgba(255, 107, 53, 0.15)` (used as halo/fill)
  - Accent `#FFB347` (warm amber)
- **Live / speaking red:** `#FF3B30` with `rgba(255, 59, 48, 0.30)` glow.
  Used **only** for live indicator dots, the speaking marker ring, and
  Hide-from-radar destructive actions.
- **Online green/teal:** `#34D399` for heartbeat freshness pills.
- **Text colors:** primary `#FFFFFF`, secondary `#A0A0B0`, tertiary
  `#50505F`, disabled `#383840`.
- **Typography:** iOS system font (SF Pro). Sizes scale from 11 (micro) →
  16 (body) → 24 (heading) → 48 (jumbo). Body text is always ≥16pt for
  driving-safe readability. Weights used: 400, 500, 600, 700.
- **Border radius:** consistent — 4 (chips), 8 (inputs), **12 (default
  card)**, 16 (large cards), 24 (sheets/modals), 9999 (full pills). This
  rounded-but-not-bubbly language is the most visible stylistic tell.
- **Shadows / glass:** sparing. iOS-style soft shadow on the recenter
  button and selected marker (offset y=3–4, opacity ~0.45, blur 5–6). The
  floating top header and bottom sheet are translucent (~88–96% opacity
  over the map) — true frosted-glass would be nice but is not implemented
  yet.
- **Animation style:** quiet, native springs. PTT button press is a 0.95
  scale + bounce on release. Speaking ring pulses 0→1 over ~750 ms on a
  loop. No bouncy 3D, no parallax, no skeumorphism.
- **Reference points:** Apple Maps dark mode (basemap), Apple Find My
  (people pins), Apple Wallet (sheet hierarchy). Explicitly **not**:
  Waze (cartoony), Citizen (alarmist), Zello (utilitarian), Snap Map
  (social).

## B. Drive screen — visual description

`app/drive.tsx` is the product. Two states share one map.

### Shared map surface (`src/components/NearbyMap.tsx`)

- **Full-screen Apple Maps** with `userInterfaceStyle="dark"` on iOS.
  Roads, water, subtle place labels are all visible — never a flat black
  rectangle. On Android the same is achieved with `DARK_MAP_STYLE` JSON.
- **No POI clutter:** business / school / medical POIs are turned off.
  Transit and compass are off. Buildings off. The map reads as roads +
  water + subtle administrative labels.
- **Fallback region** when no GPS fix yet: continental US wide-zoom so it
  never looks broken.
- **Range ring (Circle):** orange stroke `rgba(255, 107, 53, 0.55)` width
  2, fill `rgba(255, 107, 53, 0.08)`. Rendered only when LIVE + coords
  available.
- **User pin (YOU):** a 44pt orange-tinted halo (`rgba(255, 107, 53, 0.18)`)
  with an inner 16pt solid `#FF6B35` dot wrapped in a 2pt white border.
  Reads as "you" instantly.
- **Recenter button:** 44pt circular dark glass (`rgba(10,10,20,0.92)`)
  with an orange `◎` glyph, drop shadow. Floats top-right, just below the
  header card.

### Floating top header (always visible)

- Pill-shaped dark glass card, rounded 16 (Radius.lg), border `#242424`,
  background `rgba(10, 10, 20, 0.88)`.
- Row 1: brand wordmark **RoadPing** (24pt, semibold, white) on the left,
  avatar circle on the right (38pt circle, orange muted fill with orange
  border, bold initial inside).
- Row 1 also shows the LIVE/OFFLINE pill when offline.
- Row 2 (LIVE only): LIVE pill (red dot + red label) · "5 nearby" count ·
  range chip ("2 km", dark pill) · timer (00:42, bold white) · heartbeat
  freshness ("4s", green-tinted pill).

### When LIVE — bottom sheet (`SHEET_COLLAPSED 116pt → SHEET_EXPANDED 380pt`)

- Translucent `rgba(17, 17, 17, 0.96)` rounded-top 24 sheet with a dark
  hairline border.
- **Collapsed:** 40×4 drag handle, "5 drivers nearby" line plus a red
  "· Miguel is speaking" tag when applicable. Two pill buttons on the
  right: **Stop** (secondary) and **Hide** (destructive red).
- **Expanded:** scrollable content.
  - **Selected driver card** at top: vehicle avatar (50pt rounded square
    holding the vehicle emoji), then a stack of three lines —
    `Midnight Blue Tesla Model 3` (18pt semibold), `Miguel · @miguel_speed`
    (12pt secondary), `~50 m · Speaking` (11pt micro with status word in
    color: red `Speaking`, secondary `Silent`, tertiary `DND`). A
    `~50 m` pill sits at the right edge.
  - **Compact list** of remaining drivers — each row a translucent
    surface card with a 40pt circular vehicle bubble (border + bg tinted
    red when speaking, orange when selected), 3-line text stack identical
    to the selected card's hierarchy, and a small `~` speaking equalizer
    indicator on the right when applicable.
- **Empty state** ("No drivers nearby yet · You're live within 2 km") uses
  the shared `EmptyState` component — large 🛣 emoji + heading + muted
  body, no map blocker.

### When LIVE — Hold-to-Talk button

- **120×120pt circle** floating above the collapsed sheet, centered
  horizontally. `Colors.primary` `#FF6B35` fill with `Colors.primaryDim`
  4pt border. Contains a 32pt 🎙 emoji + label `HOLD TO TALK` (13pt bold,
  letter-spacing 1).
- **Speaking state:** background flips to `Colors.live` `#FF3B30`, an
  outer ring pulses (scale 1 → 1.5, opacity 0.7 → 0) on a 900 ms loop.
- **Disabled state:** dark surface fill, border `#242424`.

### When OFFLINE — bottom panel (max 60% height)

Same translucent surface as the live sheet, but presented as a panel (not
a sheet with handle). Stack of:

1. **Primary vehicle shortcut row** — 28pt vehicle emoji, label
   ("Midnight Blue Tesla Model 3"), `2018 Tesla Model 3` sub, chevron.
2. **Range selector** (chips: 500 m / 1 km / 2 km / 3 km / 5 km, the active
   chip uses orange muted fill + orange border + orange text).
3. **Do Not Disturb row** — toggle.
4. **Location permission card** (only when not granted) — `Colors.surfaceElevated`
   with an orange border, title "📍 Location needed to go live", body
   explaining no history / no shared exact coordinates, then a primary
   button labeled either "Enable location" or "Open iOS Settings" depending
   on iOS's prior answer.
5. **Private-zone banner** (only when relevant) — warning-tinted
   `rgba(251,191,36,0.15)` card.
6. **Start RoadPing →** large primary button.
7. **Privacy footer** — two muted lines: "🔒 Invisible until you go live.
   No location history. No recordings." + "Use RoadPing only when it is
   safe and legal to do so."

### Empty / denied / no-driver states

- **Empty drivers in LIVE:** `EmptyState` 🛣 + "No drivers nearby yet" +
  "You're live within 2 km. Updates every few seconds." The map remains
  fully visible behind the sheet.
- **No GPS fix yet:** `NearbyMap` overlays a translucent "Map ready / Tap
  Start RoadPing to share your live position and see nearby drivers."
  card centered on the map. The map basemap is still drawn behind it.
- **Location denied:** Drive screen offline panel renders the orange-
  bordered permission card; Start button is disabled.

## C. Vehicle / driver identity

Vehicle identity is **always** primary; person identity is secondary.

### Card hierarchy (`DriverCard.tsx`)

```
┌──────────────────────────────────────────────────────┐
│ 🚗  Midnight Blue Tesla Model 3                ~50m │  ← vehicle line
│     Miguel · @miguel_speed                          │  ← person line
│     ~50 m · Speaking                                │  ← meta line
├──────────────────────────────────────────────────────┤
│ [Speaking indicator]            [Report] [Block]    │  ← footer
└──────────────────────────────────────────────────────┘
```

- Vehicle line: built from `vehicle_color + vehicle_make + vehicle_model`
  with sane fallbacks to `vehicle_label` then "Unknown vehicle".
- Person line: `display_name · @handle` (handle omitted when null).
- Meta line: `~Xm · STATUS` where STATUS is one of `Speaking` (live red,
  semibold), `Silent` (secondary), `DND` (tertiary, semibold).
- Distance pill: rounded-full dark surface, `~50m` / `~1.0 km` / etc. The
  meta line is duplicate-by-design — it scans as a single status sentence
  even when the pill is partially occluded.

### Compact row (`DriverListItem.tsx`)

- 40pt circular emoji bubble on the left. Border + background change to
  red-muted for speaking, orange-muted for selected.
- Identical three-line text stack to the card.
- Speaking pill ("eq" SpeakingIndicator) on the right when applicable.

### Marker (`DriverMarker.tsx`)

> Removed in Phase 2 (docs/PHASE2_PROXIMITY_PRIVACY.md): other drivers are
> no longer drawn on the map. Kept here as design history only.

- 40pt circular pill body (52pt when selected), `rgba(20,20,28,0.96)`
  background, 2pt border.
- **Color halo:** when `vehicle_color` matches a known swatch (black,
  white, silver, red, blue, green, yellow, orange, purple, pink, brown,
  gold) a thin 2pt colored ring sits behind the body.
- **Speaking pulse:** 3pt red `#FF3B30` ring pulses (1 → 1.55 scale,
  opacity 0.25 → 0.85) over 1.5 s on loop.
- **Selected:** body fills with `Colors.primaryMuted`, border becomes
  `Colors.primary`, emoji grows to 26pt.
- Tiny 6pt anchor dot beneath the body so it reads as "pinned" rather
  than floating.

### Vehicle emoji set

`car 🚗` · `motorcycle 🏍` · `truck 🛻` · `van 🚐` · `bicycle 🚲` · `other 🛞`.

## D. Other screens (visual style)

### Onboarding (`app/onboarding.tsx`)

- Dark background. Centered hero: a 96×96 rounded-24 box with orange
  muted fill, orange border, holding a 48pt 🚗 emoji.
- Below the box: `RoadPing` in 36pt bold display, then tagline
  "One-tap voice alerts for nearby drivers." in muted secondary.
- Four feature rows — translucent dark cards with an emoji on the left,
  bold title, muted body line: 📡 Nearby drivers radar · 🎙 Hold-to-talk
  alerts · 🚗 Drive Rooms · 🔒 Private Zones.
- Two CTAs: "Get Started" (large primary orange), "Sign In" (ghost).
- Footer privacy lines: "No location history stored. No recordings
  saved." and "Use RoadPing only when it is safe and legal to do so."

### Auth (`app/auth.tsx`)

- Same dark background. Top-of-screen tab switcher: two pills "Sign In"
  / "Sign Up". Active pill: orange fill, white text.
- Form: large `AppInput` fields with floating labels and visible
  borders, 8pt radius. Error text in red beneath fields.
- Bottom: primary CTA full-width. Secondary "Check your email" success
  card appears after sign-up.

### Profile setup (`app/profile.tsx`)

- Dark background, centered SafeArea content. Inputs for `@handle` and
  display name, both validated as you type. Primary save button.

### Vehicle setup (`app/vehicle.tsx`)

- Card per existing vehicle (vehicle emoji avatar + label + sub line +
  primary chip). Add-vehicle modal with body-type chips (sedan, coupe,
  hatchback, wagon, SUV, pickup, van, crossover, sports car, supercar,
  motorcycle), make/model/color/year inputs.

### Private zones (`app/private-zones.tsx`)

- List of zones, each a translucent card showing emoji + name + radius
  (e.g. "🏠 Home · 200 m"). Add zone modal with name field and a
  preset chip (home / work / other) — radius selector below.

### Rooms (`app/rooms.tsx`, `app/room/[roomId].tsx`)

- Rooms list: cards with room emoji, name, member count, "joined"
  chip if you are in it. Create / Join CTAs at the top.
- Room screen: large room title at top, members rendered with the same
  vehicle-first card hierarchy as nearby drivers, group PTT button
  identical to Drive's HoldToTalkButton at the bottom.

### Settings (`app/settings.tsx`)

- Sectioned list with all-caps tertiary labels: PREFERENCES, COMMUNITY,
  PRIVACY, LEGAL & SUPPORT, ACCOUNT, ABOUT.
- Toggle rows (DND), chip groups (default range), and link rows ("📄
  Privacy Policy", "🛡 Safety & Community", "✉ Contact Support", etc.).
- Sign Out (danger red button) + Delete account underlined danger link.

### Privacy & Safety screens (`app/privacy.tsx`, `app/safety.tsx`)

- Same dark sectioned cards. Each section: subheading title + paragraphs
  + bullets (orange dot, white-secondary text). Mailto link to
  `support@roadping.app` styled as orange.
- Safety screen leads with a `Colors.primaryMuted` hero card titled
  "Drive first. Talk second."

### Delete account (`app/delete-account.tsx`)

- Two stacked translucent cards ("What gets deleted", "What we keep")
  with bulleted lists.
- A red-bordered warning card "This cannot be undone" beneath them.
- Danger destructive primary "Delete my account" then ghost "Cancel".
- Support email footer line.

## E. App icon concepts (five proposals)

Rules: simple at small sizes; no tiny text; no realistic car bodywork;
dark background; **RoadPing orange** as the only accent; must hint at
map + voice + road/proximity.

### Concept 1 — Pinned voice burst

- **Central symbol:** a stylized map pin whose drop shape morphs into a
  speech-bubble tail at the bottom. Inside the pin head is a small
  filled orange dot (the "live" pulse).
- **Background:** solid `#0A0A0A` with a subtle radial vignette to make
  the icon read at small sizes.
- **Colors:** pin outline `#FF6B35`, inner dot `#FF6B35`, faint orange
  halo behind the pin.
- **Style:** flat, 2.5D, generous rounded corners; reads like an
  Apple-grade utility icon.
- **Why it fits:** the speech-bubble pin is the single move — it
  literally is "voice + location" without saying it.

### Concept 2 — Concentric radar rings + dot

- **Central symbol:** three concentric thin orange rings expanding from
  a solid orange center dot — the visual idiom for "you, and the live
  area around you".
- **Background:** `#0A0A0A`; rings at 100% / 60% / 30% orange opacity
  from inside out.
- **Style:** geometric, almost typographic. Strokes ~6% of icon side.
- **Why it fits:** clearest single-glance read of "live proximity".
  Pairs naturally with the Drive screen's range ring.

### Concept 3 — Tilted road horizon

- **Central symbol:** a perspective road with two converging lane lines
  meeting at a horizon point that is itself an orange dot (the live
  beacon). The road is a soft grey gradient on black.
- **Background:** the road IS the background. Top half black, bottom
  half darkest grey `#1A1A1A`.
- **Colors:** lane lines `#FF6B35`, horizon dot orange, optional thin
  orange glow at the horizon.
- **Style:** filmic. A little more atmospheric than concepts 1/2.
- **Why it fits:** says "drivers / road" without using a car. Works
  beautifully at large sizes (App Store hero) but also reads at 60pt.

### Concept 4 — Wordmark mark "RP" with a live dot

- **Central symbol:** a bespoke `RP` ligature in a heavy semi-rounded
  sans, with a small filled orange dot replacing the counter of the P.
- **Background:** `#0A0A0A`.
- **Colors:** `RP` in `#F5F5F5`, dot `#FF6B35`.
- **Style:** Apple-developer-grade typographic mark, like the Apple
  Podcasts or Apple News icons.
- **Why it fits:** strongest brand recall on a crowded home screen.
  Pairs with anything visual elsewhere.

### Concept 5 — Halo pin with speaker waves

- **Central symbol:** a circular orange-rimmed pin (echoing the YOU
  marker from the map) with two thin orange arcs radiating from the
  right side — the universal "broadcasting" glyph.
- **Background:** `#0A0A0A` with a soft orange halo behind the pin.
- **Colors:** pin border `#FF6B35`, inner dot orange, arcs orange.
- **Style:** geometric, friendly, very iOS-native.
- **Why it fits:** matches the in-app YOU marker exactly — the icon and
  the live map share one symbol.

## F. Splash screen concepts (three proposals)

Rules: dark background, RoadPing icon/logo centered, optional tagline,
simple, App Store-safe, no unsafe driving language.

### Splash A — Mark + tagline

- Solid `#0A0A0A`.
- Selected app icon (concept TBD) centered, 96–120pt.
- Below: `RoadPing` wordmark in 28pt bold white.
- Underneath: tagline `One-tap voice alerts for nearby drivers.` in
  16pt muted secondary.
- No animation; instant.

### Splash B — Pulsing live ring

- `#0A0A0A` background.
- A single orange ring scaled to ~30% of screen height pulses once
  (1.0 → 1.08 → 1.0) over 700ms, with a small orange dot at its center.
- Wordmark fades in beneath at +200ms.
- Tagline underneath, 16pt muted.

### Splash C — Map horizon

- A tightly cropped slice of the dark Apple-Maps-style road from icon
  Concept 3, with the horizon point glowing orange.
- `RoadPing` wordmark centered, 28pt bold.
- No tagline — the image carries it.
- Most atmospheric. Use only if Splash B feels too plain.

## G. App Store screenshot prompts (overview)

We are generating five screenshots; the headline + screen pairing
mirrors `docs/SCREENSHOT_CAPTURE_PLAN.md`:

1. **Drive map live** — "Go live on the road map"
2. **Selected nearby driver** — "See nearby active drivers"
3. **Hold to talk** — "Hold to talk"
4. **Private drive rooms** — "Create private drive rooms"
5. **Live-only privacy / Stop & Hide** — "Disappear when you stop"

Each prompt below is intended for an image generator that frames the
RoadPing UI inside an iPhone bezel and renders the marketing overlay.

---

## Final prompts for ChatGPT image generation

### 1. App icon prompt

> A square iOS app icon for "RoadPing", a live voice tool for nearby
> drivers. Solid deep-black background (#0A0A0A) with a subtle radial
> glow in vivid amber orange (#FF6B35). Central symbol: a flat,
> geometric map pin whose drop shape morphs gently into a speech-bubble
> tail at its bottom. The pin's outline is a 2.5D orange stroke at ~7%
> of the icon side; inside the pin head sits a solid orange dot
> representing a live beacon. Three faint concentric orange rings
> radiate outward from the pin at decreasing opacity (60%, 30%, 15%) so
> it reads as live proximity even at small sizes. No text, no realistic
> car, no roads, no human figures. Style: modern Apple-utility icon,
> clean vectors, soft inner shadow inside the pin head, gentle outer
> glow behind it. Render at 1024×1024px with rounded-square iOS icon
> mask in mind (no opacity at edges). Color palette strictly limited to
> `#0A0A0A`, `#1A1A1A`, `#FF6B35`, white at very low opacity.

### 2. Splash screen prompt

> A vertical iPhone 6.9" splash screen for "RoadPing", a live voice
> tool for nearby drivers. Solid deep-black background (#0A0A0A) edge
> to edge. Vertically centered: the RoadPing app icon at ~120pt — a
> dark rounded-square holding a single orange map pin with a speech-
> bubble tail, surrounded by three faint concentric orange rings
> (#FF6B35 at 60%, 30%, 15% opacity). 24pt below the icon: the
> wordmark `RoadPing` in bold white sans-serif, letter-spacing -0.5,
> 28pt. 12pt below the wordmark: tagline `One-tap voice alerts for
> nearby drivers.` in 16pt soft grey (#A0A0B0). No other UI, no status
> bar, no navigation. Color palette strictly: `#0A0A0A`, white,
> `#A0A0B0`, `#FF6B35`. The mood is night-drive cockpit — quiet,
> dark, deliberate.

### 3. App Store screenshot — Drive map live

> Vertical iPhone 6.9" App Store screenshot for "RoadPing". Top third
> of the canvas: marketing overlay on a deep-black background
> (#0A0A0A). Headline in vivid amber orange (#FF6B35), 56pt bold,
> centered: `Go live on the road map`. Subheadline below in white at
> 80% opacity, 20pt regular, centered: `Tap Start RoadPing to appear
> and see other drivers nearby.` Bottom two-thirds: a realistic
> iPhone-frame mockup containing the RoadPing Drive screen in LIVE
> state. The Drive screen shows a permanent dark Apple-Maps-style
> basemap with visible thin grey roads, a subtle water polygon, and
> very faint administrative labels — never a flat black sheet.
> Centered on the map: a small orange map pin (a 16pt orange dot with
> 2pt white border, wrapped in a 44pt orange halo). A 2pt orange
> stroke circle surrounds the pin at ~2 km map radius with a soft
> 8%-opacity orange fill. Five custom driver markers scatter around
> the ring: four are 40pt circular dark pills with a vehicle emoji
> (car, motorcycle, car, car) and a thin colored halo (blue, black,
> red, yellow); one pill nearest the user pulses with a 3pt red ring.
> Top of the iPhone frame: a translucent dark "glass" header card
> with the RoadPing wordmark, a small red LIVE pill, the text "5
> nearby", a small "2 km" chip, a "00:42" timer, and a small green
> heartbeat pill "4s". Bottom of the iPhone frame: a translucent
> dark bottom sheet with a small grey drag handle and the line
> "5 drivers nearby · Miguel is speaking" plus two pill buttons
> "Stop" and "Hide". No real text address. Colors strictly limited
> to `#0A0A0A`, `#111111`, `#FF6B35`, `#FF3B30`, white, `#A0A0B0`.

### 4. App Store screenshot — Selected nearby driver

> Vertical iPhone 6.9" App Store screenshot for "RoadPing". Top third:
> marketing overlay on `#0A0A0A`. Headline in `#FF6B35`, 56pt bold:
> `See nearby active drivers`. Subheadline in white at 80% opacity,
> 20pt: `Approximate distance only. Exact coordinates are never
> shared.` Bottom two-thirds: iPhone frame containing the RoadPing
> Drive screen with the bottom sheet expanded. The dark Apple-Maps
> basemap shows roads behind. The bottom sheet contains a tall
> "selected driver" card at the top: a 50pt rounded-square dark
> avatar holding a 🚗 emoji, with a blue thin halo ring; three text
> lines next to it — `Midnight Blue Tesla Model 3` (18pt semibold
> white), `Miguel · @miguel_speed` (12pt soft grey), `~50 m ·
> Speaking` (11pt with the word "Speaking" in red #FF3B30
> semibold). A small `~50m` dark pill sits at the card's right. A
> divider line beneath. Below: two compact driver list rows in the
> same hierarchy showing `Black Honda Civic / Anita · @drivequeen /
> ~350 m · Silent` and `Red BMW 320i / Jordan · @redm3 / ~900 m ·
> Silent`. Ghost "Report" and secondary "Block" pills at the
> selected card's footer. Colors strictly: `#0A0A0A`, `#111111`,
> `#1A1A1A`, `#FF6B35`, `#FF3B30`, white, `#A0A0B0`.

### 5. App Store screenshot — Hold to talk

> Vertical iPhone 6.9" App Store screenshot for "RoadPing". Top third:
> marketing overlay on `#0A0A0A`. Headline in `#FF6B35`, 56pt bold:
> `Hold to talk`. Subheadline in white at 80% opacity, 20pt: `Send a
> live voice burst to nearby drivers. Live only, never recorded.`
> Bottom two-thirds: iPhone frame containing the RoadPing Drive
> screen mid-press. Centered horizontally, ~25% from the bottom: a
> 120×120pt round button glowing vivid red `#FF3B30` with a soft
> red outer halo ring pulsing outward; inside the button a 32pt 🎙
> emoji over the bold label `SPEAKING` (13pt, letter-spacing 1,
> white). Above the button, a 40pt circular dark map-marker pill
> containing a 🚗 emoji also pulses with a 3pt red ring — Miguel,
> the speaking driver. Top of the iPhone: same translucent
> header card with `RoadPing`, a LIVE pill, "5 nearby", "2 km",
> "00:14", and a green "3s" heartbeat pill. Bottom sheet shows just
> the collapsed handle and the line "5 drivers nearby · Miguel is
> speaking". Map basemap is the same dark Apple-Maps style. Colors
> strictly: `#0A0A0A`, `#111111`, `#FF6B35`, `#FF3B30`, white,
> `#A0A0B0`.

### 6. App Store screenshot — Private drive rooms

> Vertical iPhone 6.9" App Store screenshot for "RoadPing". Top third:
> marketing overlay on `#0A0A0A`. Headline in `#FF6B35`, 56pt bold:
> `Create private drive rooms`. Subheadline in white at 80%, 20pt:
> `Group hold-to-talk with the people you actually ride with.`
> Bottom two-thirds: iPhone frame containing the RoadPing Room
> screen. At the top a translucent dark header card with a 🚗 emoji
> and the room name `Sunday Run` (24pt semibold white) and a
> `Private · 4 members` line in soft grey. Beneath it: three
> vertically-stacked member cards using the same vehicle-first
> hierarchy from the Drive screen — `Midnight Blue Tesla Model 3 /
> Miguel · @miguel_speed / Speaking` (with a red pulse on the
> avatar), `Black Honda Civic / Anita · @drivequeen / Silent`,
> `Red BMW 320i / Jordan · @redm3 / Silent`. At the bottom of the
> iPhone, a 120pt round Hold-to-Talk button in vivid orange
> `#FF6B35` with `HOLD TO TALK` label. No public text chat, no
> message bubbles, no emojis other than the per-member vehicle
> emoji. Colors strictly: `#0A0A0A`, `#111111`, `#FF6B35`,
> `#FF3B30`, white, `#A0A0B0`.

### 7. App Store screenshot — Live-only privacy / Stop & Hide

> Vertical iPhone 6.9" App Store screenshot for "RoadPing". Top third:
> marketing overlay on `#0A0A0A`. Headline in `#FF6B35`, 56pt bold:
> `Disappear when you stop`. Subheadline in white at 80%, 20pt: `No
> location history. No saved voice clips. You appear only while
> active.` Bottom two-thirds: iPhone frame containing the RoadPing
> Drive screen in OFFLINE state. The map basemap is the same dark
> Apple-Maps style with thin roads — but there are no driver markers
> and no range ring (the user just hid). Above the map sits the
> translucent header card showing `RoadPing` and a small grey
> "Offline" pill. The bottom panel covers ~50% of the iPhone and
> contains, top to bottom: a vehicle shortcut row showing `🚗
> Midnight Blue Tesla Model 3 · 2018 Tesla Model 3`, a range
> selector with chips `500 m / 1 km / 2 km (selected, orange-filled)
> / 3 km / 5 km`, a Do Not Disturb toggle row, then a large
> primary `Start RoadPing →` button in orange, then two small
> muted footer lines: `🔒 Invisible until you go live. No location
> history. No recordings.` and `Use RoadPing only when it is safe
> and legal to do so.` Colors strictly: `#0A0A0A`, `#111111`,
> `#1A1A1A`, `#FF6B35`, white, `#A0A0B0`. No people, no cars in
> the artwork beyond the small vehicle emoji.
