/**
 * purchases.ts — RoadPing Plus purchase abstraction (Phase 16C foundation).
 *
 * This is a SAFE FOUNDATION. No StoreKit / native IAP module is wired up yet,
 * so every entry point honestly reports "unavailable / pending setup" — it
 * NEVER fakes a successful purchase and NEVER pretends the user is Plus.
 *
 * When a real IAP package is added later (see docs/IAP_SETUP.md), this file is
 * the single seam to implement: query products, buy, restore, and resolve the
 * entitlement from a verified transaction. The rest of the app already depends
 * only on these function signatures, so the UI won't need to change.
 *
 * iOS-only by design. No Stripe / web checkout / external payment links. No
 * secrets live here.
 */

// ─── Plan model ────────────────────────────────────────────────────────────────

export type PlanTier = 'free' | 'plus';

/** App Store Connect product identifiers (auto-renewable subscriptions). */
export const PLUS_PRODUCT_IDS = {
  monthly: 'roadping_plus_monthly',
  yearly: 'roadping_plus_yearly',
} as const;

export type PlusProductId =
  (typeof PLUS_PRODUCT_IDS)[keyof typeof PLUS_PRODUCT_IDS];

export type BillingPeriod = 'monthly' | 'yearly';

export interface PlusProduct {
  id: PlusProductId;
  period: BillingPeriod;
  /** Human title, e.g. "Monthly". */
  title: string;
  /** Localized store price (e.g. "$2.99"); null until a real store loads it. */
  priceLabel: string | null;
}

// ─── Result types ───────────────────────────────────────────────────────────────

export type ProductsResult =
  | { available: true; products: PlusProduct[] }
  | { available: false; reason: string };

export type PurchaseResult =
  | { status: 'success'; tier: 'plus' }
  | { status: 'cancelled' }
  | { status: 'unavailable'; reason: string }
  | { status: 'error'; message: string };

export type RestoreResult =
  | { status: 'restored'; tier: 'plus' }
  | { status: 'nothing_to_restore' }
  | { status: 'unavailable'; reason: string }
  | { status: 'error'; message: string };

export interface EntitlementStatus {
  tier: PlanTier;
  /** Where the tier came from. 'default' until a verified purchase/restore. */
  source: 'default' | 'purchase' | 'restore';
  /** True only when a real IAP layer is wired up and products can be bought. */
  purchasesAvailable: boolean;
}

// ─── Foundation state ───────────────────────────────────────────────────────────

/**
 * User-facing explanation shown wherever purchasing is attempted before the
 * native IAP layer + App Store Connect products exist.
 */
export const UNAVAILABLE_REASON =
  'RoadPing Plus isn’t available to purchase yet. It’ll arrive in an upcoming update.';

/**
 * Whether the in-app purchase layer is ready. False in this foundation phase —
 * no StoreKit/native module is installed. Flip to a real capability check when
 * IAP is added.
 */
export function isPurchasesAvailable(): boolean {
  return false;
}

// ─── Public API ──────────────────────────────────────────────────────────────────

/** Load purchasable RoadPing Plus products. Returns an unavailable result until IAP is wired up. */
export async function getAvailableProducts(): Promise<ProductsResult> {
  if (!isPurchasesAvailable()) {
    return { available: false, reason: UNAVAILABLE_REASON };
  }
  // Future: fetch StoreKit products for PLUS_PRODUCT_IDS and map to PlusProduct[].
  return { available: false, reason: UNAVAILABLE_REASON };
}

/**
 * Begin a RoadPing Plus purchase. Never returns success in the foundation —
 * purchases are not faked. Wire StoreKit here later.
 */
export async function purchasePlus(
  _productId: PlusProductId,
): Promise<PurchaseResult> {
  return { status: 'unavailable', reason: UNAVAILABLE_REASON };
}

/** Restore a previous purchase. Safe no-op that never crashes until IAP is wired up. */
export async function restorePurchases(): Promise<RestoreResult> {
  if (!isPurchasesAvailable()) {
    return { status: 'unavailable', reason: UNAVAILABLE_REASON };
  }
  // Future: ask StoreKit to restore and resolve the entitlement.
  return { status: 'nothing_to_restore' };
}

/**
 * Resolve the current entitlement. Defaults to Free and only ever returns Plus
 * when a verified purchase/restore says so — which cannot happen yet, so this
 * always returns Free in the foundation phase.
 */
export async function getEntitlementStatus(): Promise<EntitlementStatus> {
  return {
    tier: 'free',
    source: 'default',
    purchasesAvailable: isPurchasesAvailable(),
  };
}
