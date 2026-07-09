import { z } from 'zod';

/**
 * A single weekly-special product scraped from a Nugget Markets specials page.
 * The `sku` (from the product detail URL `/specials/<dept>/<sku>/`) is a stable
 * identifier that lets us join the same product across weeks and locations.
 */
export const ProductSchema = z.object({
  /** Stable product id parsed from the detail URL (UPC/SKU-like). Primary join key. */
  sku: z.string().min(1),
  name: z.string().min(1),
  /** Short lead-in line above the name, e.g. "Fresh to Market" or "Grown in Yakima, WA". */
  prefix: z.string().optional(),
  /** Short qualifier below the name, e.g. "Top 1/3 USDA Choice. Raw.". */
  suffix: z.string().optional(),
  /** Department slug, e.g. "meat", "produce", "adult-beverages". */
  department: z.string(),
  /** Raw pack-size text, e.g. "750 ML. bottle", "8 OZ. package", "6 PK. cans". */
  packSize: z.string().optional(),
  selectedVarieties: z.boolean().default(false),

  /** Sale price as a number, e.g. 16.99. Null if it could not be parsed. */
  price: z.number().nullable(),
  /** Unit the sale price is measured in as advertised on the flyer. */
  priceUnit: z.enum(['lb', 'ea']).nullable(),
  /** Original price text as shown, e.g. "$16.99/lb.". */
  priceText: z.string(),

  /** Original savings text, e.g. "Save $3/lb." or "Save 50¢/ea.". */
  saveText: z.string().optional(),
  /** Parsed savings amount in dollars, e.g. 3 or 0.5. */
  saveAmount: z.number().optional(),

  /** Diet/attribute labels from the card icons, e.g. ["Organic", "Local", "California Grown"]. */
  labels: z.array(z.string()).default([]),

  imageUrl: z.string().optional(),
  productUrl: z.string().optional(),

  /** True when this came from the highlighted "features" section rather than a department grid. */
  isFeatured: z.boolean().default(false),

  // ---- Normalized unit pricing (computed from packSize + price) ----
  /** Numeric quantity parsed from the pack size, e.g. 750, 8, 6. */
  packQty: z.number().optional(),
  /** Canonical unit the quantity is measured in, e.g. "ml", "oz", "ct", "lb", "ea". */
  packUnit: z.string().optional(),
  /** Price per canonical unit, e.g. 0.87 (dollars per oz). */
  unitPrice: z.number().optional(),
  /** Human-readable unit price, e.g. "$0.87/oz". */
  unitPriceLabel: z.string().optional(),
});

export type Product = z.infer<typeof ProductSchema>;

export function validateProduct(data: unknown): Product {
  return ProductSchema.parse(data);
}

export function isValidProduct(data: unknown): boolean {
  return ProductSchema.safeParse(data).success;
}
