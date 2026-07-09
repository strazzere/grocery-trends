import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type {
  StoreConfig,
  Product,
  ScrapeResult,
  ScraperError,
  RawProductData,
  WeeklySnapshot,
} from '../types/index.js';
import { type HttpClient, httpClient } from '../utils/http-client.js';
import {
  type ProductNormalizer,
  productNormalizer,
} from '../utils/product-normalizer.js';
import { createStoreLogger } from '../utils/logger.js';
import type winston from 'winston';

const VERSION = '1.0.0';

export interface WeekInfo {
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
}

/**
 * Template-method base for store scrapers. Subclasses implement the two abstract
 * hooks (`parseProducts`, `parseWeek`); the base handles fetching (with the store
 * cookie), cheerio loading, normalization, dedup-by-sku, and never-throwing error
 * wrapping into a ScrapeResult.
 */
export abstract class BaseScraper {
  protected config: StoreConfig;
  protected http: HttpClient;
  protected normalizer: ProductNormalizer;
  protected logger: winston.Logger;
  protected abstract url: string;

  constructor(config: StoreConfig) {
    this.config = config;
    this.http = httpClient;
    this.normalizer = productNormalizer;
    this.logger = createStoreLogger(config.id);
  }

  async scrape(): Promise<ScrapeResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    this.logger.info(
      `Starting scrape for ${this.config.name} (store ${this.config.storeId})`,
    );

    try {
      const html = await this.fetchContent();
      const $ = cheerio.load(html);

      const week = this.parseWeek($);
      const rawProducts = await this.parseProducts($);
      this.logger.info(`Found ${rawProducts.length} raw product cards`);

      const bySku = new Map<string, Product>();
      for (const raw of rawProducts) {
        const product = this.normalizer.normalize(raw);
        if (!product) {
          warnings.push(
            `Could not normalize product: ${raw.name || raw.sku || 'unknown'}`,
          );
          continue;
        }
        // Dedupe by sku; prefer the featured card (richer prefix/suffix/labels).
        const existing = bySku.get(product.sku);
        if (!existing || (product.isFeatured && !existing.isFeatured)) {
          bySku.set(product.sku, product);
        }
      }

      const products = [...bySku.values()];
      this.logger.info(`Normalized ${products.length} unique products`);

      const snapshot: WeeklySnapshot = {
        location: {
          id: this.config.id,
          name: this.config.name,
          storeId: this.config.storeId,
        },
        weekLabel: week.weekLabel,
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        scrapedAt: new Date().toISOString(),
        productCount: products.length,
        products,
      };

      return {
        success: true,
        snapshot,
        errors: [],
        warnings,
        metadata: this.metadata(startTime),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Scrape failed: ${message}`);
      const err: ScraperError = {
        code: 'SCRAPE_ERROR',
        message,
        details: error,
      };
      return {
        success: false,
        errors: [err],
        warnings,
        metadata: this.metadata(startTime),
      };
    }
  }

  protected metadata(startTime: number) {
    return {
      storeId: this.config.id,
      storeName: this.config.name,
      url: this.url,
      scrapedAt: new Date().toISOString(),
      duration: Date.now() - startTime,
      version: VERSION,
    };
  }

  protected async fetchContent(): Promise<string> {
    return this.http.get(this.url, {
      cookie: `NuggetHomeStore=${this.config.storeId}`,
    });
  }

  /** Extract the current ad-week label + start/end dates from the page. */
  protected abstract parseWeek($: cheerio.CheerioAPI): WeekInfo;

  /** Extract raw product rows from the page. */
  protected abstract parseProducts(
    $: cheerio.CheerioAPI,
  ): Promise<RawProductData[]>;

  protected extractText($el: cheerio.Cheerio<AnyNode>): string {
    return $el.text().trim().replace(/\s+/g, ' ');
  }

  protected absoluteUrl(
    href: string | undefined,
    base: string,
  ): string | undefined {
    if (!href) return undefined;
    if (href.startsWith('http')) return href;
    if (href.startsWith('//')) return `https:${href}`;
    if (href.startsWith('/')) return `${new URL(base).origin}${href}`;
    return href;
  }
}

export default BaseScraper;
