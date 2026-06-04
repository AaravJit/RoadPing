/**
 * vehicleData.ts — curated make/model dataset + body-type inference (Phase 17).
 *
 * Philosophy: clean and reliable beats fake completeness. This is NOT every
 * vehicle ever made — it's a curated list of common car and motorcycle brands
 * with their best-known models, plus an "Other" path for everything else. The
 * goal is a fast, trustworthy setup flow that infers the vehicle category from
 * the chosen model where it can, and gracefully falls back to a manual body
 * type when it can't.
 *
 * No external/paid APIs. All local, synchronous, and tiny.
 *
 * Body-type values reuse the existing BodyTypeUi union (see services/vehicle.ts).
 */
import type { BodyTypeUi } from './vehicle';

export const OTHER_MAKE = 'Other';

export interface ModelEntry {
  name: string;
  body: BodyTypeUi;
}

/**
 * Makes that only build motorcycles. An unknown/freeform model under one of
 * these still infers `motorcycle` rather than falling through to "ask".
 */
const MOTO_MAKES: ReadonlySet<string> = new Set([
  'Aprilia',
  'BMW Motorrad',
  'Ducati',
  'Harley-Davidson',
  'Kawasaki',
  'KTM',
  'Suzuki',
  'Triumph',
  'Yamaha',
]);

/**
 * Curated models per make. Honda intentionally merges its common cars and
 * motorcycles (one brand, two model families) — inference keys off the model,
 * so CBR500R → motorcycle while Civic → sedan.
 */
const MODELS_BY_MAKE: Readonly<Record<string, readonly ModelEntry[]>> = {
  Acura: [
    { name: 'ILX', body: 'sedan' },
    { name: 'TLX', body: 'sedan' },
    { name: 'Integra', body: 'hatchback' },
    { name: 'RDX', body: 'crossover' },
    { name: 'MDX', body: 'suv' },
    { name: 'NSX', body: 'supercar' },
  ],
  Aprilia: [
    { name: 'RS 660', body: 'motorcycle' },
    { name: 'RSV4', body: 'motorcycle' },
    { name: 'Tuono V4', body: 'motorcycle' },
  ],
  Audi: [
    { name: 'A3', body: 'sedan' },
    { name: 'A4', body: 'sedan' },
    { name: 'A5', body: 'coupe' },
    { name: 'A6', body: 'sedan' },
    { name: 'TT', body: 'coupe' },
    { name: 'Q3', body: 'crossover' },
    { name: 'Q5', body: 'suv' },
    { name: 'Q7', body: 'suv' },
    { name: 'R8', body: 'supercar' },
  ],
  BMW: [
    { name: '2 Series', body: 'coupe' },
    { name: '3 Series', body: 'sedan' },
    { name: '320i', body: 'sedan' },
    { name: '330i', body: 'sedan' },
    { name: '4 Series', body: 'coupe' },
    { name: '5 Series', body: 'sedan' },
    { name: 'M3', body: 'sedan' },
    { name: 'M4', body: 'coupe' },
    { name: 'X1', body: 'crossover' },
    { name: 'X3', body: 'suv' },
    { name: 'X5', body: 'suv' },
    { name: 'Z4', body: 'coupe' },
  ],
  'BMW Motorrad': [
    { name: 'G 310 R', body: 'motorcycle' },
    { name: 'R nineT', body: 'motorcycle' },
    { name: 'R 1250 GS', body: 'motorcycle' },
    { name: 'S 1000 RR', body: 'motorcycle' },
  ],
  Chevrolet: [
    { name: 'Malibu', body: 'sedan' },
    { name: 'Camaro', body: 'coupe' },
    { name: 'Corvette', body: 'sportsCar' },
    { name: 'Bolt', body: 'hatchback' },
    { name: 'Equinox', body: 'crossover' },
    { name: 'Blazer', body: 'crossover' },
    { name: 'Tahoe', body: 'suv' },
    { name: 'Suburban', body: 'suv' },
    { name: 'Colorado', body: 'pickup' },
    { name: 'Silverado', body: 'pickup' },
  ],
  Dodge: [
    { name: 'Charger', body: 'sedan' },
    { name: 'Challenger', body: 'coupe' },
    { name: 'Durango', body: 'suv' },
    { name: 'Ram 1500', body: 'pickup' },
  ],
  Ducati: [
    { name: 'Monster', body: 'motorcycle' },
    { name: 'Panigale V4', body: 'motorcycle' },
    { name: 'Multistrada', body: 'motorcycle' },
    { name: 'Scrambler', body: 'motorcycle' },
    { name: 'Diavel', body: 'motorcycle' },
  ],
  Ford: [
    { name: 'Focus', body: 'hatchback' },
    { name: 'Fusion', body: 'sedan' },
    { name: 'Mustang', body: 'coupe' },
    { name: 'Escape', body: 'crossover' },
    { name: 'Edge', body: 'crossover' },
    { name: 'Explorer', body: 'suv' },
    { name: 'Expedition', body: 'suv' },
    { name: 'Bronco', body: 'suv' },
    { name: 'Ranger', body: 'pickup' },
    { name: 'F-150', body: 'pickup' },
    { name: 'Maverick', body: 'pickup' },
  ],
  'Harley-Davidson': [
    { name: 'Iron 883', body: 'motorcycle' },
    { name: 'Sportster', body: 'motorcycle' },
    { name: 'Softail', body: 'motorcycle' },
    { name: 'Fat Boy', body: 'motorcycle' },
    { name: 'Street Glide', body: 'motorcycle' },
    { name: 'Road King', body: 'motorcycle' },
  ],
  Honda: [
    { name: 'Civic', body: 'sedan' },
    { name: 'Accord', body: 'sedan' },
    { name: 'Fit', body: 'hatchback' },
    { name: 'HR-V', body: 'crossover' },
    { name: 'CR-V', body: 'crossover' },
    { name: 'Pilot', body: 'suv' },
    { name: 'Odyssey', body: 'van' },
    { name: 'Ridgeline', body: 'pickup' },
    { name: 'CBR500R', body: 'motorcycle' },
    { name: 'CBR600RR', body: 'motorcycle' },
    { name: 'Rebel 500', body: 'motorcycle' },
    { name: 'Gold Wing', body: 'motorcycle' },
    { name: 'Grom', body: 'motorcycle' },
  ],
  Hyundai: [
    { name: 'Accent', body: 'sedan' },
    { name: 'Elantra', body: 'sedan' },
    { name: 'Sonata', body: 'sedan' },
    { name: 'Veloster', body: 'hatchback' },
    { name: 'Kona', body: 'crossover' },
    { name: 'Tucson', body: 'crossover' },
    { name: 'Santa Fe', body: 'suv' },
    { name: 'Palisade', body: 'suv' },
  ],
  Infiniti: [
    { name: 'Q50', body: 'sedan' },
    { name: 'Q60', body: 'coupe' },
    { name: 'QX50', body: 'crossover' },
    { name: 'QX60', body: 'suv' },
    { name: 'QX80', body: 'suv' },
  ],
  Jeep: [
    { name: 'Renegade', body: 'crossover' },
    { name: 'Compass', body: 'crossover' },
    { name: 'Cherokee', body: 'suv' },
    { name: 'Grand Cherokee', body: 'suv' },
    { name: 'Wrangler', body: 'suv' },
    { name: 'Gladiator', body: 'pickup' },
  ],
  Kawasaki: [
    { name: 'Ninja 400', body: 'motorcycle' },
    { name: 'Ninja 650', body: 'motorcycle' },
    { name: 'Z900', body: 'motorcycle' },
    { name: 'Vulcan', body: 'motorcycle' },
    { name: 'Versys', body: 'motorcycle' },
  ],
  Kia: [
    { name: 'Forte', body: 'sedan' },
    { name: 'K5', body: 'sedan' },
    { name: 'Stinger', body: 'sedan' },
    { name: 'Soul', body: 'hatchback' },
    { name: 'Seltos', body: 'crossover' },
    { name: 'Sportage', body: 'crossover' },
    { name: 'Sorento', body: 'suv' },
    { name: 'Telluride', body: 'suv' },
  ],
  KTM: [
    { name: '390 Duke', body: 'motorcycle' },
    { name: 'RC 390', body: 'motorcycle' },
    { name: '790 Duke', body: 'motorcycle' },
    { name: '1290 Super Duke', body: 'motorcycle' },
  ],
  Lexus: [
    { name: 'IS', body: 'sedan' },
    { name: 'ES', body: 'sedan' },
    { name: 'RC', body: 'coupe' },
    { name: 'LC', body: 'coupe' },
    { name: 'UX', body: 'crossover' },
    { name: 'NX', body: 'crossover' },
    { name: 'RX', body: 'suv' },
    { name: 'GX', body: 'suv' },
  ],
  Mazda: [
    { name: 'Mazda3', body: 'sedan' },
    { name: 'Mazda6', body: 'sedan' },
    { name: 'MX-5 Miata', body: 'sportsCar' },
    { name: 'CX-30', body: 'crossover' },
    { name: 'CX-5', body: 'crossover' },
    { name: 'CX-9', body: 'suv' },
  ],
  'Mercedes-Benz': [
    { name: 'A-Class', body: 'sedan' },
    { name: 'C-Class', body: 'sedan' },
    { name: 'E-Class', body: 'sedan' },
    { name: 'S-Class', body: 'sedan' },
    { name: 'CLA', body: 'coupe' },
    { name: 'GLA', body: 'crossover' },
    { name: 'GLC', body: 'suv' },
    { name: 'GLE', body: 'suv' },
    { name: 'G-Class', body: 'suv' },
    { name: 'AMG GT', body: 'supercar' },
  ],
  Nissan: [
    { name: 'Versa', body: 'sedan' },
    { name: 'Sentra', body: 'sedan' },
    { name: 'Altima', body: 'sedan' },
    { name: 'Maxima', body: 'sedan' },
    { name: 'Z', body: 'coupe' },
    { name: 'GT-R', body: 'supercar' },
    { name: 'Leaf', body: 'hatchback' },
    { name: 'Rogue', body: 'crossover' },
    { name: 'Murano', body: 'suv' },
    { name: 'Pathfinder', body: 'suv' },
    { name: 'Frontier', body: 'pickup' },
    { name: 'Titan', body: 'pickup' },
  ],
  Subaru: [
    { name: 'Impreza', body: 'sedan' },
    { name: 'Legacy', body: 'sedan' },
    { name: 'WRX', body: 'sedan' },
    { name: 'BRZ', body: 'coupe' },
    { name: 'Crosstrek', body: 'crossover' },
    { name: 'Forester', body: 'crossover' },
    { name: 'Outback', body: 'wagon' },
    { name: 'Ascent', body: 'suv' },
  ],
  Suzuki: [
    { name: 'GSX-R600', body: 'motorcycle' },
    { name: 'GSX-R750', body: 'motorcycle' },
    { name: 'Hayabusa', body: 'motorcycle' },
    { name: 'SV650', body: 'motorcycle' },
    { name: 'V-Strom', body: 'motorcycle' },
  ],
  Tesla: [
    { name: 'Model 3', body: 'sedan' },
    { name: 'Model S', body: 'sedan' },
    { name: 'Model Y', body: 'crossover' },
    { name: 'Model X', body: 'suv' },
    { name: 'Cybertruck', body: 'pickup' },
    { name: 'Roadster', body: 'sportsCar' },
  ],
  Toyota: [
    { name: 'Corolla', body: 'sedan' },
    { name: 'Camry', body: 'sedan' },
    { name: 'Prius', body: 'hatchback' },
    { name: 'GR86', body: 'coupe' },
    { name: 'Supra', body: 'sportsCar' },
    { name: 'Corolla Cross', body: 'crossover' },
    { name: 'RAV4', body: 'crossover' },
    { name: 'Highlander', body: 'suv' },
    { name: '4Runner', body: 'suv' },
    { name: 'Tacoma', body: 'pickup' },
    { name: 'Tundra', body: 'pickup' },
    { name: 'Sienna', body: 'van' },
  ],
  Triumph: [
    { name: 'Street Triple', body: 'motorcycle' },
    { name: 'Speed Triple', body: 'motorcycle' },
    { name: 'Bonneville', body: 'motorcycle' },
    { name: 'Tiger', body: 'motorcycle' },
    { name: 'Rocket 3', body: 'motorcycle' },
  ],
  Volkswagen: [
    { name: 'Jetta', body: 'sedan' },
    { name: 'Passat', body: 'sedan' },
    { name: 'Golf', body: 'hatchback' },
    { name: 'GTI', body: 'hatchback' },
    { name: 'Arteon', body: 'sedan' },
    { name: 'Tiguan', body: 'crossover' },
    { name: 'Atlas', body: 'suv' },
  ],
  Volvo: [
    { name: 'S60', body: 'sedan' },
    { name: 'S90', body: 'sedan' },
    { name: 'V60', body: 'wagon' },
    { name: 'V90', body: 'wagon' },
    { name: 'XC40', body: 'crossover' },
    { name: 'XC60', body: 'suv' },
    { name: 'XC90', body: 'suv' },
  ],
  Yamaha: [
    { name: 'YZF-R3', body: 'motorcycle' },
    { name: 'YZF-R6', body: 'motorcycle' },
    { name: 'YZF-R1', body: 'motorcycle' },
    { name: 'MT-07', body: 'motorcycle' },
    { name: 'MT-09', body: 'motorcycle' },
    { name: 'Bolt', body: 'motorcycle' },
  ],
};

/** Alphabetical make list (curated). "Other" is appended by callers. */
export const VEHICLE_MAKES: readonly string[] = Object.keys(MODELS_BY_MAKE).sort(
  (a, b) => a.localeCompare(b),
);

/** Curated models for a make (empty for unknown makes / "Other"). */
export function modelsForMake(make: string): readonly ModelEntry[] {
  return MODELS_BY_MAKE[make] ?? [];
}

/** True when we have a curated model list for this make. */
export function makeHasModels(make: string): boolean {
  return modelsForMake(make).length > 0;
}

/**
 * Infer the body type for a make/model.
 *   1. Exact curated model match → its body.
 *   2. Otherwise, motorcycle-only make → 'motorcycle'.
 *   3. Otherwise null (caller asks the user via the body-type chips).
 * Never guesses a specific car body from an unknown model — we don't show wrong
 * icons confidently.
 */
export function inferBodyType(make: string, model: string): BodyTypeUi | null {
  const m = model.trim().toLowerCase();
  if (m.length > 0) {
    const hit = modelsForMake(make).find((e) => e.name.toLowerCase() === m);
    if (hit) return hit.body;
  }
  if (MOTO_MAKES.has(make)) return 'motorcycle';
  return null;
}
