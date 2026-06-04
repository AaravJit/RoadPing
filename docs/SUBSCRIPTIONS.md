# RoadPing Plus — Subscriptions Overview

Phase 16C added the **foundation** for a paid plan: paywall UI, an entitlement
model, and a purchase-service abstraction. **No real purchases happen yet** — the
service intentionally reports "unavailable / pending setup" and never fakes a
successful purchase or a Plus entitlement.

Payments are **Apple In-App Purchase (StoreKit) only**. No Stripe, no web
checkout, no external payment links, no Apple Pay, no Android billing.

---

## Plans

### Free (default for everyone)
- Core RoadPing access
- Basic live map
- Basic private rooms
- One primary vehicle
- Basic cockpit themes (Amber Glow, Midnight Blue, OEM Gray)
- **Always free:** block / report / privacy / safety / delete account / Stop
  RoadPing / Stop & Hide / basic live-visibility & location privacy

### RoadPing Plus
- Premium cockpit themes (Redline, Ice White, JDM Purple, Track Green, Luxury Beige)
- More saved vehicles
- More private rooms
- Larger room / member limits
- Expanded private zones
- Advanced customization
- Future enhanced nearby features

> **Never paywalled.** Safety, privacy, blocking, reporting, account deletion,
> Stop RoadPing, Stop & Hide, and basic visibility/location privacy are free and
> must stay free.

---

## Product IDs

| Period  | Product ID              |
| ------- | ----------------------- |
| Monthly | `roadping_plus_monthly` |
| Yearly  | `roadping_plus_yearly`  |

Defined once in `src/services/purchases.ts` as `PLUS_PRODUCT_IDS`.

---

## Architecture

| Piece | File | Role |
| ----- | ---- | ---- |
| Purchase abstraction | `src/services/purchases.ts` | `getAvailableProducts`, `purchasePlus`, `restorePurchases`, `getEntitlementStatus`, `isPurchasesAvailable`. Returns honest unavailable states today. |
| Entitlement state | `src/hooks/useEntitlement.tsx` | App-wide `{ tier, isPlus, purchasesAvailable, refresh }`. Defaults to Free. Mounted in `app/_layout.tsx`. |
| Paywall | `app/plus.tsx` | RoadPing Plus screen. Graceful unavailable state, Continue Free, Restore. |
| Settings entry | `app/settings.tsx` | "Subscription → RoadPing Plus" row showing plan state; opens the paywall. |
| Theme marking | `src/theme/themes.ts` + `src/components/ThemePicker.tsx` | Premium themes carry `plus: true` and show a **PLUS** badge. **Not gated yet.** |

### Entitlement model
```ts
type PlanTier = 'free' | 'plus';
```
- Default is always **Free**.
- Tier becomes **Plus** ONLY when a verified purchase/restore says so — which
  cannot happen until StoreKit is wired up. We never pretend the user is Plus.
- Gated UI shows upgrade prompts; core flows are never hard-locked.

### Entitlement persistence (future)
Today entitlement is recomputed on launch as Free. When IAP is wired up, the
source of truth is **StoreKit's current entitlements** (queried on launch +
after purchase/restore). Optionally cache the last-known tier in AsyncStorage
for instant paint, but always reconcile against StoreKit — never trust a cached
"plus" as production truth. Do **not** store entitlement as plaintext truth that
can be edited to unlock Plus.

---

## What works now vs. what's left

**Implemented now (no native build needed):**
- Paywall screen, Settings entry, entitlement provider, PLUS theme badges.
- Purchase service that never crashes and never fakes success.
- Continue Free + Restore Purchases (graceful "nothing/unavailable").

**Still required before real purchases work:**
1. Add a StoreKit-capable IAP package + minimal native wiring (see
   `docs/IAP_SETUP.md`). Requires a new EAS/TestFlight build.
2. Create the subscription group + both products in App Store Connect
   (see `docs/APP_STORE_IAP_CHECKLIST.md`).
3. Implement the real bodies of `getAvailableProducts` / `purchasePlus` /
   `restorePurchases` / `getEntitlementStatus` in `purchases.ts`.
4. (Optional) Enable real theme gating once entitlement is trustworthy.
