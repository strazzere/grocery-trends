import type { DealBadge, DealSignals } from '../types/index.js';

export function median(values: number[]): number | null {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function mean(values: number[]): number | null {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round(n: number, places = 3): number {
  return Number(n.toFixed(places));
}

function badgeFor(score: number): DealBadge {
  if (score >= 65) return 'strong';
  if (score >= 40) return 'good';
  if (score >= 18) return 'decent';
  return 'regular';
}

export interface ScoreInput {
  /** Current sale price (per item / per lb). */
  price: number | null;
  /** Parsed savings amount. */
  saveAmount?: number;
  /** Prices for this SKU/location in weeks BEFORE the current one. */
  historicalPrices: number[];
  /** Prices for this SKU across the other stores in the CURRENT week (incl. this one). */
  crossLocationPrices: number[];
  /** Number of distinct weeks this SKU/location has been observed (including now). */
  weeksObserved: number;
  /** True if the current price is the lowest ever observed for this SKU/location. */
  isLowestEver: boolean;
}

/**
 * Blends three "is this a good deal?" signals into a 0–100 score + badge:
 *  - the flyer's own advertised discount,
 *  - how far below this SKU's usual (median) price it is (needs history),
 *  - how far below the cross-store average it is this week.
 * A "+10" bonus applies when it's the lowest price ever seen for the item.
 * Weights are renormalized over whichever signals are available, so the score is
 * meaningful on week one and sharpens as history accumulates.
 */
export function scoreProduct(input: ScoreInput): DealSignals {
  const {
    price,
    saveAmount,
    historicalPrices,
    crossLocationPrices,
    weeksObserved,
    isLowestEver,
  } = input;

  // --- discount depth (flyer's own) ---
  let discountPct: number | null = null;
  if (price !== null && saveAmount && saveAmount > 0) {
    discountPct = round(saveAmount / (price + saveAmount));
  }

  // --- historical baseline ---
  const usualPrice = historicalPrices.length ? median(historicalPrices) : null;
  let pctBelowUsual: number | null = null;
  if (usualPrice !== null && usualPrice > 0 && price !== null) {
    pctBelowUsual = round((usualPrice - price) / usualPrice);
  }

  // --- cross-location baseline (only when ≥2 stores carry it) ---
  let pctBelowStoresAvg: number | null = null;
  let cheapestStore = false;
  if (price !== null && crossLocationPrices.length >= 2) {
    const avg = mean(crossLocationPrices);
    if (avg !== null && avg > 0) {
      pctBelowStoresAvg = round((avg - price) / avg);
    }
    cheapestStore = price <= Math.min(...crossLocationPrices) + 1e-9;
  }

  // --- blended score over available signals ---
  const components: { weight: number; value: number }[] = [];
  if (discountPct !== null) {
    components.push({ weight: 0.5, value: clamp01(discountPct / 0.5) });
  }
  if (pctBelowUsual !== null) {
    components.push({ weight: 0.35, value: clamp01(pctBelowUsual / 0.4) });
  }
  if (pctBelowStoresAvg !== null) {
    components.push({ weight: 0.15, value: clamp01(pctBelowStoresAvg / 0.25) });
  }

  let base = 0;
  const totalWeight = components.reduce((a, c) => a + c.weight, 0);
  if (totalWeight > 0) {
    base = components.reduce((a, c) => a + c.weight * c.value, 0) / totalWeight;
  }

  const lowestBonus = isLowestEver && weeksObserved >= 2 ? 10 : 0;
  const dealScore = Math.round(Math.min(100, base * 90 + lowestBonus));

  return {
    dealScore,
    badge: badgeFor(dealScore),
    discountPct,
    pctBelowUsual,
    usualPrice: usualPrice !== null ? round(usualPrice, 2) : null,
    pctBelowStoresAvg,
    lowestInWeeks: isLowestEver && weeksObserved >= 2 ? weeksObserved : null,
    cheapestStore,
  };
}
