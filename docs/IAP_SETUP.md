# RoadPing Plus — IAP Native Setup (when enabling real purchases)

Phase 16C ships **no native IAP module**. The app is launch-stable and the
purchase service reports "unavailable." This doc is the recipe for turning on
real Apple In-App Purchases later.

> Apple In-App Purchase / StoreKit only. No Stripe, web checkout, external
> payment links, Apple Pay, or Android billing.

---

## 1. Choose a package

Two maintained, iOS-compatible options:

- **`expo-in-app-purchases`** — Expo-maintained wrapper. Simplest fit for an
  Expo SDK 54 app, installs as a config plugin, no manual Xcode wiring. Good
  default for a small subscription set.
- **`react-native-iap`** — Most widely used community library; richer features
  (subscription offers, StoreKit 2). Heavier; still works with Expo via config
  plugin + prebuild.

**Recommendation:** start with `expo-in-app-purchases` for minimal surface and
clean Expo integration. Move to `react-native-iap` only if you need StoreKit 2
offer codes / intro-offer features it exposes more directly.

Either way: this is a **native** dependency → a **new EAS build + TestFlight
upload is required**. It will NOT work in Expo Go.

---

## 2. Install (example with expo-in-app-purchases)

```bash
npx expo install expo-in-app-purchases
```

No `app.json` change is required beyond what the package's config plugin adds.
The bundle ID stays `com.aarav.jit.roadping`. Then rebuild:

```bash
eas build --platform ios --profile preview
eas submit --platform ios --profile preview --latest
```

---

## 3. Implement `src/services/purchases.ts`

Replace the foundation bodies. The function signatures already match the UI, so
no screen changes are needed.

- `isPurchasesAvailable()` → return `true` once the module is present and
  `connectAsync()` succeeds.
- `getAvailableProducts()` → `getProductsAsync([roadping_plus_monthly, roadping_plus_yearly])`,
  map to `PlusProduct[]` with the **localized** `priceLabel` from the store
  (never hardcode prices).
- `purchasePlus(productId)` → `purchaseItemAsync(productId)`, then **verify the
  transaction** and resolve entitlement; return `{status:'success'}` only after
  a real, verified transaction.
- `restorePurchases()` → query purchase history / current entitlements; return
  `restored` / `nothing_to_restore`.
- `getEntitlementStatus()` → derive `tier` from current StoreKit entitlements.

**Security:** no secrets in the app. If you add server-side receipt validation,
do it in a Supabase Edge Function (service_role stays server-side) — never ship
service_role to the client.

---

## 4. Entitlement persistence

- Source of truth = StoreKit current entitlements, checked on launch + after
  purchase/restore, then pushed into `useEntitlement` via `refresh()`.
- Optional: cache last-known tier in AsyncStorage for instant paint, but always
  reconcile with StoreKit. Never treat an editable local value as production
  truth for unlocking Plus.

---

## 5. Testing

- **Sandbox:** create a Sandbox Apple ID in App Store Connect → Users and
  Access → Sandbox Testers. Sign into the Sandbox account on the device
  (Settings → App Store → Sandbox Account on newer iOS, or it prompts at
  purchase). Sandbox renewals are accelerated.
- **TestFlight:** TestFlight builds use the Sandbox environment for IAP
  automatically; testers can exercise purchase + restore without real charges.
- Verify: purchase monthly, purchase yearly, cancel mid-flow, restore on a
  fresh install, and the graceful unavailable path (no products configured).

See `docs/APP_STORE_IAP_CHECKLIST.md` for the App Store Connect product setup.
