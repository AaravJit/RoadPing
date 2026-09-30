/**
 * app/plus.tsx — RoadPing Plus is hidden for 1.0 (no in-app purchase).
 *
 * The route is kept so an old deep link lands somewhere sensible instead of
 * an unmatched-route screen; it simply returns to Settings.
 */
import React from 'react';
import { Redirect } from 'expo-router';

export default function PlusScreen() {
  return <Redirect href="/settings" />;
}
