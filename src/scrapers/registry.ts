import fs from 'node:fs';
import path from 'node:path';
import { type StoreConfig, StoreConfigSchema } from '../types/index.js';
import type { BaseScraper } from '../core/base-scraper.js';
import { NuggetScraper } from './nugget-scraper.js';
import { logger } from '../utils/logger.js';

const DEFAULT_CONFIG_DIR = path.join(process.cwd(), 'config', 'stores');

/**
 * Loads and validates store configs and instantiates scrapers. There is a single
 * scraper implementation (NuggetScraper) shared by every store, so no per-store
 * class map is needed.
 */
export class StoreRegistry {
  private configs: Map<string, StoreConfig> = new Map();

  constructor(private configDir: string = DEFAULT_CONFIG_DIR) {
    this.loadConfigs();
  }

  private loadConfigs(): void {
    if (!fs.existsSync(this.configDir)) {
      logger.warn(`Store config dir not found: ${this.configDir}`);
      return;
    }
    const files = fs
      .readdirSync(this.configDir)
      .filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const full = path.join(this.configDir, file);
      try {
        const parsed = JSON.parse(fs.readFileSync(full, 'utf-8'));
        const config = StoreConfigSchema.parse(parsed);
        this.configs.set(config.id, config);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Invalid store config ${file}: ${msg}`);
      }
    }
    logger.info(`Loaded ${this.configs.size} store config(s)`);
  }

  getConfig(id: string): StoreConfig | undefined {
    return this.configs.get(id);
  }

  getAllStores(): StoreConfig[] {
    return [...this.configs.values()];
  }

  getEnabledStores(): StoreConfig[] {
    return this.getAllStores().filter((s) => s.enabled);
  }

  listStores(): {
    id: string;
    name: string;
    storeId: number;
    enabled: boolean;
  }[] {
    return this.getAllStores().map((s) => ({
      id: s.id,
      name: s.name,
      storeId: s.storeId,
      enabled: s.enabled,
    }));
  }

  createScraper(id: string): BaseScraper | null {
    const config = this.getConfig(id);
    if (!config) {
      logger.error(`No store config for id: ${id}`);
      return null;
    }
    return new NuggetScraper(config);
  }
}

export const registry = new StoreRegistry();
export default registry;
