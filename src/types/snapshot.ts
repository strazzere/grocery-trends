import { z } from 'zod';
import { ProductSchema } from './product.js';
import { StoreRefSchema } from './store-config.js';

/**
 * One store's set of weekly specials for one ad week. This is the unit that gets
 * written to `data/<store>/<weekStart>.json` and accumulated on the gh-pages branch.
 */
export const WeeklySnapshotSchema = z.object({
  location: StoreRefSchema,
  /** Ad-week label as printed on the page, e.g. "July 8–14, 2026". */
  weekLabel: z.string(),
  /** ISO date (YYYY-MM-DD) for the first day of the ad week (Wednesday). */
  weekStart: z.string(),
  /** ISO date (YYYY-MM-DD) for the last day of the ad week (Tuesday). */
  weekEnd: z.string(),
  scrapedAt: z.string(),
  productCount: z.number().int().nonnegative(),
  products: z.array(ProductSchema),
});

export type WeeklySnapshot = z.infer<typeof WeeklySnapshotSchema>;

export function validateWeeklySnapshot(data: unknown): WeeklySnapshot {
  return WeeklySnapshotSchema.parse(data);
}

export interface ScraperError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ScraperMetadata {
  storeId: string;
  storeName: string;
  url: string;
  scrapedAt: string;
  duration: number;
  version: string;
}

/** Result of scraping one store — never throws; failures are captured here. */
export interface ScrapeResult {
  success: boolean;
  snapshot?: WeeklySnapshot;
  errors: ScraperError[];
  warnings: string[];
  metadata: ScraperMetadata;
}

/** Raw fields a scraper extracts from a card before normalization. */
export interface RawProductData {
  sku?: string;
  name?: string;
  prefix?: string;
  suffix?: string;
  department?: string;
  packSize?: string;
  selectedVarieties?: boolean;
  priceText?: string;
  saveText?: string;
  labels?: string[];
  imageUrl?: string;
  productUrl?: string;
  isFeatured?: boolean;
}
