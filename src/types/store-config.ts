import { z } from 'zod';

/**
 * Configuration for one Nugget Markets store location.
 * `storeId` is the value used in the `NuggetHomeStore` cookie to make the
 * specials page render that location's prices.
 */
export const StoreConfigSchema = z.object({
  /** Slug used in filenames and data paths, e.g. "rocklin". */
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'id must be lowercase kebab-case'),
  name: z.string().min(1),
  /** Numeric store id used as the NuggetHomeStore cookie value. */
  storeId: z.number().int().positive(),
  city: z.string().min(1),
  state: z.string().default('CA'),
  enabled: z.boolean().default(true),
});

export type StoreConfig = z.infer<typeof StoreConfigSchema>;

export function validateStoreConfig(data: unknown): StoreConfig {
  return StoreConfigSchema.parse(data);
}

export function isValidStoreConfig(data: unknown): boolean {
  return StoreConfigSchema.safeParse(data).success;
}

/** Minimal store descriptor embedded in snapshots. */
export const StoreRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  storeId: z.number(),
});

export type StoreRef = z.infer<typeof StoreRefSchema>;
