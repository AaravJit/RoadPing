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
import { Redirect } from 'expo-router';

import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useVehicles } from '@/hooks/useVehicles';
import { LoadingState } from '@/components/LoadingState';

export default function IndexScreen() {
  const { user, isLoading: authLoading } = useAuth();
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
