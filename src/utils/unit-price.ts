import type { PriceUnit } from './price-parser.js';

/**
 * Normalizes a package price into a comparable per-unit price (lowtein-style),
 * so that e.g. "750 ML" vs "1 LT" or "6 PK" vs "12 PK" can be compared fairly.
 *
 * - Weight/volume items priced "/lb" are reported as price-per-oz.
 * - Package ("each") items use their pack size: OZ/LB/PT → per-oz,
 *   ML/LT/GAL/QT → per-ml, GR → per-g, CT/PK/RL → per-count.
 * Returns an empty object when nothing meaningful can be computed.
 */
export interface UnitPrice {
  packQty?: number;
  packUnit?: string;
  unitPrice?: number;
  unitPriceLabel?: string;
}

const OZ_PER_LB = 16;
const OZ_PER_PT = 16; // fluid pint ≈ 16 fl oz (close enough for comparison)
const ML_PER_LT = 1000;
const ML_PER_GAL = 3785;
const ML_PER_QT = 946;

function round(n: number, places: number): number {
  return Number(n.toFixed(places));
}

function label(unitPrice: number, unit: string): string {
  const decimals = unitPrice < 0.1 ? 3 : 2;
  return `$${unitPrice.toFixed(decimals)}/${unit}`;
}

/** Parse the leading quantity + unit from a pack-size string. Handles ranges (avg). */
function parsePack(packSize: string): { qty: number; rawUnit: string } | null {
  const m = packSize
    .replace(/&ndash;/gi, '–')
    .match(
      /^\s*([\d.]+)\s*(?:[–-]\s*([\d.]+))?\s*(OZ|LB|ML|LT|GR|G|PT|QT|GAL|CT|PK|RL)\b/i,
    );
  if (!m) return null;
  const lo = parseFloat(m[1]);
  const hi = m[2] ? parseFloat(m[2]) : lo;
  if (!Number.isFinite(lo) || lo <= 0) return null;
  const qty = (lo + (Number.isFinite(hi) ? hi : lo)) / 2;
  return { qty, rawUnit: m[3].toUpperCase() };
}

/** Convert a (qty, rawUnit) pack into a canonical (qty, unit) measure. */
function toCanonical(
  qty: number,
  rawUnit: string,
): { qty: number; unit: string } | null {
  switch (rawUnit) {
    case 'OZ':
      return { qty, unit: 'oz' };
    case 'LB':
      return { qty: qty * OZ_PER_LB, unit: 'oz' };
    case 'PT':
      return { qty: qty * OZ_PER_PT, unit: 'oz' };
    case 'ML':
      return { qty, unit: 'ml' };
    case 'LT':
      return { qty: qty * ML_PER_LT, unit: 'ml' };
    case 'GAL':
      return { qty: qty * ML_PER_GAL, unit: 'ml' };
    case 'QT':
      return { qty: qty * ML_PER_QT, unit: 'ml' };
    case 'GR':
    case 'G':
      return { qty, unit: 'g' };
    case 'CT':
    case 'PK':
    case 'RL':
      return { qty, unit: 'ct' };
    default:
      return null;
  }
}

export function normalizeUnitPrice(
  price: number | null,
  priceUnit: PriceUnit | null,
  packSize?: string,
): UnitPrice {
  if (price === null || price <= 0) return {};

  // Priced by the pound → most useful comparison is per ounce.
  if (priceUnit === 'lb') {
    const unitPrice = round(price / OZ_PER_LB, 4);
    return {
      packUnit: 'oz',
      unitPrice,
      unitPriceLabel: label(unitPrice, 'oz'),
    };
  }

  // Package price + a parseable pack size → per canonical unit.
  if (packSize) {
    const parsed = parsePack(packSize);
    if (parsed) {
      const canon = toCanonical(parsed.qty, parsed.rawUnit);
      if (canon && canon.qty > 0) {
        const unitPrice = round(price / canon.qty, 4);
        return {
          packQty: round(canon.qty, 3),
          packUnit: canon.unit,
          unitPrice,
          unitPriceLabel: label(unitPrice, canon.unit),
        };
      }
    }
  }

  return {};
}
