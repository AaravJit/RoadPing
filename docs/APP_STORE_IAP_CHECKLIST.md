# App Store Connect — RoadPing Plus Subscription Checklist

Manual steps to configure the subscriptions in App Store Connect. **None of this
is done automatically by the app, and nothing here submits to App Review.**

App: **RoadPing** · Bundle ID: **com.aarav.jit.roadping** (unchanged)

---

## 1. Agreements (one-time)

- App Store Connect → **Business** → **Agreements, Tax, and Banking**.
- Accept the **Paid Applications Agreement** and complete tax + banking.
  Subscriptions cannot be created or tested until this is **Active**.

## 2. Create the subscription group

- App Store Connect → **RoadPing** → **Monetization → Subscriptions**.
- Create a subscription group: **`RoadPing Plus`**.
  (A group lets monthly/yearly be alternatives at the same tier; users hold one
  active subscription in the group.)

## 3. Add the two products

Create **two auto-renewable subscriptions** in the `RoadPing Plus` group:

| Reference Name    | Product ID              | Duration |
| ----------------- | ----------------------- | -------- |
| RoadPing Plus Monthly | `roadping_plus_monthly` | 1 Month  |
| RoadPing Plus Yearly  | `roadping_plus_yearly`  | 1 Year   |

> Product IDs must match `PLUS_PRODUCT_IDS` in `src/services/purchases.ts`
> **exactly** (case-sensitive). They cannot be changed after creation.

For **each** product:
- **Pricing:** choose a price tier (set yearly below 12× monthly only if you
  genuinely intend the discount — do not advertise a discount that isn't real).
- **Localization:** add at least English — Display Name (e.g. "RoadPing Plus
  Monthly") and Description. No "limited time"/urgency or pressure language.
- **App Store promotion image** (optional, 1024×1024) if you promote it.
- **Subscription review information:** notes for the reviewer + a screenshot of
  the paywall if requested.

## 4. Subscription group localization

- Add a group **display name** (e.g. "RoadPing Plus") shown in the user's
  Apple subscription management.

## 5. Review information & legal

- Ensure the paywall shows: price, billing period, auto-renew terms, **Terms
  (EULA)** and **Privacy** links, and **Restore Purchases**. (The app's
  `app/plus.tsx` already includes these.)
- Confirm **no** safety/privacy feature is paywalled (App Review + our own rule).

## 6. Sandbox + TestFlight testing

- Create a **Sandbox Tester** (Users and Access → Sandbox).
- Install a build that includes the IAP native module (see `docs/IAP_SETUP.md`).
- Test purchase (monthly + yearly), cancel, and **Restore Purchases** on a
  fresh install. TestFlight uses the Sandbox environment automatically.

## 7. Submit (LATER — manual, not now)

- Subscriptions are reviewed alongside an app version submission. **Do not
  submit to App Review as part of this phase.** Submit only when you're ready.

---

## Status summary

- ✅ App-side foundation done (paywall, entitlement, service abstraction, docs).
- ⛔ Native IAP module: not installed yet → requires new EAS build.
- ⛔ App Store Connect products: must be created manually (steps above).
- ⛔ Real purchase/restore: pending the two items above.
