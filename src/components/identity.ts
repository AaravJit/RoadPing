/**
 * How other road users are named and described across Drive, Rooms and
 * reports. One implementation so the map label, speaker capsule, nearby
 * list and room roster always agree.
 *
 * Vehicle emoji are used as vehicle identity (content), never as system
 * icons.
 */
import type { VehicleType } from '@/services/types';

const VEHICLE_EMOJI: Record<VehicleType, string> = {
  car: '🚗',
  motorcycle: '🏍️',
  truck: '🛻',
  van: '🚐',
  bicycle: '🚲',
  other: '🚗',
};

const VEHICLE_NOUN: Record<VehicleType, string> = {
  car: 'Car',
  motorcycle: 'Motorcycle',
  truck: 'Truck',
  van: 'Van',
  bicycle: 'Bicycle',
  other: 'Vehicle',
};

export function vehicleEmoji(type: VehicleType | null | undefined): string {
  return VEHICLE_EMOJI[type ?? 'car'] ?? VEHICLE_EMOJI.car;
}

interface PersonLike {
  display_name: string | null;
  handle: string | null;
}

interface VehicleLike {
  vehicle_type: VehicleType | null;
  vehicle_label: string | null;
  vehicle_color: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
}

/** Display name, then @handle, then a neutral fallback. Never an email. */
export function personName(p: PersonLike): string {
  const name = p.display_name?.trim();
  if (name) return name;
  const handle = p.handle?.trim();
  if (handle) return `@${handle}`;
  return 'Driver';
}

/** "@handle" when there is one and it adds information beyond the name. */
export function personHandle(p: PersonLike): string | null {
  const handle = p.handle?.trim();
  return handle ? `@${handle}` : null;
}

/** "Blue Honda Civic" — how you'd recognise them on the road. */
export function vehicleDescription(v: VehicleLike): string {
  const parts = [v.vehicle_color, v.vehicle_make, v.vehicle_model].filter(
    (p): p is string => typeof p === 'string' && p.trim().length > 0,
  );
  if (parts.length > 0) return parts.join(' ');
  if (v.vehicle_label !== null && v.vehicle_label.trim().length > 0) return v.vehicle_label;
  return VEHICLE_NOUN[v.vehicle_type ?? 'other'];
}

/** Short make + model for tight spaces (speaker capsule). */
export function vehicleShort(v: VehicleLike): string {
  const parts = [v.vehicle_make, v.vehicle_model].filter(
    (p): p is string => typeof p === 'string' && p.trim().length > 0,
  );
  if (parts.length > 0) return parts.join(' ');
  return VEHICLE_NOUN[v.vehicle_type ?? 'other'];
}

/**
 * Swatch for a free-text vehicle color ("Blue", "silver"), used as a thin
 * identity ring on map markers and vehicle cards. These are depictions of
 * the car's paint, not UI colors, so they don't come from the palette.
 * Unknown colors return null and the UI simply omits the ring.
 */
const VEHICLE_SWATCH: Record<string, string> = {
  black: '#1A1A1E',
  white: '#E8E8EA',
  silver: '#BFBFC6',
  gray: '#8E8E93',
  grey: '#8E8E93',
  red: '#E0271C',
  blue: '#0A84FF',
  green: '#34C759',
  yellow: '#FFD60A',
  orange: '#FF9F0A',
  purple: '#BF5AF2',
  pink: '#FF375F',
  brown: '#8B6F47',
  gold: '#D4AF37',
};

export function vehicleSwatch(color: string | null | undefined): string | null {
  if (color == null) return null;
  return VEHICLE_SWATCH[color.trim().toLowerCase()] ?? null;
}
