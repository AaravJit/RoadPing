/**
 * app/index.tsx — Route gate.
 *
 * Decides where to send the user on every launch:
 *
 *   Not authenticated                       → /onboarding
 *   Authenticated, no handle                → /profile  (initial setup)
 *   Authenticated + profile, no vehicle     → /vehicle  (vehicle setup)
 *   Authenticated + profile + vehicle       → /drive    (Phase 6 — mock)
 *
 * <Redirect> is used for render-time routing, which prevents
 * flash-of-wrong-screen.
 */
import React from 'react';
import { Redirect, type Href } from 'expo-router';

import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useVehicles } from '@/hooks/useVehicles';
import { useOnboardingSeen } from '@/hooks/useOnboardingSeen';
import { LoadingState } from '@/components/LoadingState';

export default function IndexScreen() {
  const { user, isLoading: authLoading } = useAuth();
  const { seen: onboardingSeen, loading: onboardingLoading } =
    useOnboardingSeen();
  const { isLoading: profileLoading, isComplete } = useProfile(user?.id ?? null);
  const {
    isLoading: vehiclesLoading,
    hasLoaded: vehiclesLoaded,
    hasVehicle,
  } = useVehicles(isComplete && user !== null ? user.id : null);

  // ── 1. Wait for initial auth hydration ───────────────────────────────────
  if (authLoading) {
    return <LoadingState message="Starting RoadPing…" />;
  }

  // ── 2. Not signed in → onboarding ────────────────────────────────────────
  if (user === null) {
    return <Redirect href="/onboarding" />;
  }

  // ── 2b. Signed in but hasn't seen the first-time education → /welcome ─────
  if (onboardingLoading) {
    return <LoadingState message="Starting RoadPing…" />;
  }
  if (!onboardingSeen) {
    // `/welcome` is a new route; the cast keeps tsc happy until expo-router
    // regenerates its typed-routes on the next dev-server/build run.
    return <Redirect href={'/welcome' as Href} />;
  }

  // ── 3. Signed in — wait for profile fetch ────────────────────────────────
  if (profileLoading) {
    return <LoadingState message="Loading your profile…" />;
  }

  // ── 4. Profile incomplete → setup ─────────────────────────────────────────
  if (!isComplete) {
    return <Redirect href="/profile" />;
  }

  // ── 5. Wait for vehicles fetch ───────────────────────────────────────────
  if (vehiclesLoading && !vehiclesLoaded) {
    return <LoadingState message="Loading your vehicles…" />;
  }

  // ── 6. No vehicle → vehicle setup ────────────────────────────────────────
  if (!hasVehicle) {
    return <Redirect href="/vehicle" />;
  }

  // ── 7. Everything ready → drive ──────────────────────────────────────────
  return <Redirect href="/drive" />;
}
