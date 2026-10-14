# RoadPing — App Privacy Labels (App Store Connect)

How to fill the **App Privacy** section in App Store Connect, derived from
what the code actually does. Be conservative and truthful.

> **Tracking:** No. RoadPing does not track users across other apps or
> websites and does not share data with third parties for advertising or
> measurement. There are no ad SDKs, no analytics SDKs, no IDFA usage.

---

## Data types collected

For each category below, select the category and disclose:
purpose, linkage to user, and use for tracking.

| Category | Items | Purpose | Linked to user | Used for tracking |
|---|---|---|---|---|
| **Contact Info** | Email address | App functionality (authentication, account recovery) | **Yes** | **No** |
| **User Content** | Other user content (display name, handle, avatar URL, vehicle details, private zone locations, report details) | App functionality | **Yes** | **No** |
| **Identifiers** | User ID (Supabase auth UUID); Device ID (the Apple push-to-talk token, stored only while live with voice on, deleted when the live session ends; voice builds only) | App functionality | **Yes** | **No** |
| **Location** | Precise location | App functionality (live nearby presence, only while live, including in the background after Go Live) | **Yes** | **No** |
| **Diagnostics** | _None disclosed unless a crash SDK is added before submission_ | — | — | — |
| **Audio Data** | _None — voice is live only. It is relayed in real time by Agora and never recorded or stored, which is not "collection" under Apple's definition (data kept no longer than needed to service the request in real time)._ | — | — | — |

### Why "Linked to user: Yes" for Location

Location is processed only while the user is signed in and live: from Go
Live until the session ends (Phase 3: also while RoadPing is in the
background, under When In Use authorization; never Always). The current presence row is keyed by `user_id`. We do
not store any historical location. Apple still requires "Linked" because the
processing happens against an identified account.

### Why "Used for tracking: No"

We do not share any of this data with third parties for advertising,
analytics across apps, or measurement. We also do not use IDFA.

---

## Data types **not** collected

Explicitly choose **Not Collected** for:

- Health & Fitness
- Financial Info
- Sensitive Info
- Contacts
- Search History
- Browsing History
- Purchases
- Usage Data (we do not log per-screen analytics)
- Audio Data (voice is real-time, not stored)
- Photos or Videos (no avatar upload — only URL strings)
- Customer Support (using a separate mailto channel; no support data is
  collected through the app)

If a crash SDK (e.g. Sentry) is added before submission, update the
Diagnostics row accordingly.

---

## Account deletion disclosure

Apple's App Store Connect now asks "Does your app support account
deletion?". Answer **Yes** and point to: in-app **Settings → Delete
account** (`app/delete-account.tsx`), which calls the `delete-account` Edge
Function.
