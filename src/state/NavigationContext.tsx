// Minimal flow router. The prototype itself routes with a single screen-id
// string; we mirror that to keep the slice dependency-light. Swap for React
// Navigation later without touching the screens (they only call navigate()).

import React, { createContext, useContext, useState } from 'react';

export type Route =
  | 'profile'
  | 'vehicle'
  | 'zones'
  | 'addZone'
  | 'hidden';

interface NavState {
  route: Route;
  navigate: (route: Route) => void;
}

const NavigationContext = createContext<NavState | null>(null);

export function NavigationProvider({
  initialRoute,
  children,
}: {
  initialRoute: Route;
  children: React.ReactNode;
}) {
  const [route, setRoute] = useState<Route>(initialRoute);
  return (
    <NavigationContext.Provider value={{ route, navigate: setRoute }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation(): NavState {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within a NavigationProvider');
  return ctx;
}
