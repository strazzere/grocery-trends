/**
 * Types for the trend-analysis output (`trends.json`) and the deal-scoring layer
 * that enriches the current week (`latest.json`). These are generated internally,
 * so they are plain TypeScript interfaces rather than Zod-validated inputs.
 */

/** A single price observation for a SKU at a location in a given week. */
export interface PricePoint {
  week: string; // weekStart YYYY-MM-DD
  price: number | null;
  save?: number;
  unitPrice?: number;
}

/** Price history for one SKU across weeks, split by location. */
export interface ProductPriceHistory {
  sku: string;
  name: string;
  department: string;
  /** location id -> chronological series of price points */
  series: Record<string, PricePoint[]>;
}

/** Same-week price comparison of one SKU across the three stores. */
export interface CrossLocationItem {
  sku: string;
  name: string;
  department: string;
  /** location id -> price this week (null if not on special there) */
  prices: Record<string, number | null>;
  cheapestLocation: string | null;
  /** max - min across locations that carry it */
  spread: number;
}

/** New / dropped / returning / continued SKUs for a location vs the prior week. */
export interface WeekOverWeekDiff {
  location: string;
  week: string;
  prevWeek: string | null;
  new: string[];
  dropped: string[];
  returning: string[];
  continued: string[];
}

export interface DepartmentStat {
  department: string;
  count: number;
  avgSave: number;
}

export interface BiggestDeal {
  sku: string;
  name: string;
  department: string;
  price: number | null;
  save: number;
  dealScore?: number;
}

/** Aggregate discount stats for one location in one week. */
export interface DiscountStats {
  location: string;
  week: string;
  count: number;
  avgSave: number;
  byDepartment: DepartmentStat[];
  biggestDeals: BiggestDeal[];
}

/** Deal-quality badge levels (best → worst). */
export type DealBadge = 'strong' | 'good' | 'decent' | 'regular';

/** Deal-quality signals computed for a product in the current week. */
export interface DealSignals {
  /** 0–100 blended score. */
  dealScore: number;
  badge: DealBadge;
  /** Flyer's own advertised percent off, 0–1. */
  discountPct: number | null;
  /** How far below this SKU's own usual price (median of history), 0–1. Positive = cheaper. */
  pctBelowUsual: number | null;
  /** Usual (median) price used as the historical baseline. */
  usualPrice: number | null;
  /** How far below the cross-location average this week, 0–1. */
  pctBelowStoresAvg: number | null;
  /** True when this is the lowest price seen for this SKU in the available history. */
  lowestInWeeks: number | null;
  /** True when this location is the cheapest of the three for this SKU this week. */
  cheapestStore: boolean;
}

/** A product enriched with deal signals, as written into latest.json. */
export interface ScoredProduct {
  // product fields are spread in; deal signals live under `deal`
  [key: string]: unknown;
  deal: DealSignals;
}

export interface StoreOfWeek {
  location: string;
  strongDeals: number;
  totalDeals: number;
}

/** Top-level trends.json payload. */
export interface TrendsFile {
  generatedAt: string;
  weeks: string[]; // sorted ascending
  locations: string[];
  latestWeek: string | null;
  priceHistory: ProductPriceHistory[];
  crossLocation: CrossLocationItem[];
  weekOverWeek: WeekOverWeekDiff[];
  discountStats: DiscountStats[];
  storeOfWeek: StoreOfWeek | null;
  biggestDealOfWeek: (BiggestDeal & { location: string }) | null;
}

/** manifest.json — a lightweight index the dashboard loads first. */
export interface Manifest {
  generatedAt: string;
  locations: { id: string; name: string; storeId: number }[];
  weeks: string[];
  latestWeek: string | null;
}
