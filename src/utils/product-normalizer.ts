import {
  type Product,
  ProductSchema,
  type RawProductData,
} from '../types/index.js';
import { parsePrice, parseSave } from './price-parser.js';
import { normalizeUnitPrice } from './unit-price.js';
import { logger } from './logger.js';

/**
 * Turns raw scraped card fields into a validated Product, computing the numeric
 * price/savings and the normalized unit price. Returns null if the row lacks the
 * minimum viable data (a sku and a name).
 */
export class ProductNormalizer {
  normalize(raw: RawProductData): Product | null {
    if (!raw.sku || !raw.name) {
      return null;
    }

    const parsedPrice = parsePrice(raw.priceText ?? '');
    const parsedSave = raw.saveText ? parseSave(raw.saveText) : undefined;
    const unit = normalizeUnitPrice(
      parsedPrice.price,
      parsedPrice.unit,
      raw.packSize,
    );

    const candidate = {
      sku: raw.sku,
      name: raw.name,
      prefix: raw.prefix,
      suffix: raw.suffix,
      department: raw.department ?? 'unknown',
      packSize: raw.packSize,
      selectedVarieties: raw.selectedVarieties ?? false,
      price: parsedPrice.price,
      priceUnit: parsedPrice.unit,
      priceText: parsedPrice.text || raw.priceText || '',
      saveText: raw.saveText,
      saveAmount: parsedSave?.amount,
      labels: raw.labels ?? [],
      imageUrl: raw.imageUrl,
      productUrl: raw.productUrl,
      isFeatured: raw.isFeatured ?? false,
      ...unit,
    };

    const result = ProductSchema.safeParse(candidate);
    if (!result.success) {
      logger.warn(
        `Skipping product "${raw.name}" (sku ${raw.sku}): ${result.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
      );
      return null;
    }
    return result.data;
  }
}

export const productNormalizer = new ProductNormalizer();
export default productNormalizer;
