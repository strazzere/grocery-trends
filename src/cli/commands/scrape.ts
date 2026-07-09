import { Command } from 'commander';
import path from 'node:path';
import { registry } from '../../scrapers/registry.js';
import { DataStore } from '../../outputs/data-store.js';
import { CsvOutput } from '../../outputs/csv-output.js';
import { logger } from '../../utils/logger.js';
import type { WeeklySnapshot, Manifest } from '../../types/index.js';

const DEFAULT_DATA_DIR = path.join('public', 'data');

export const scrapeCommand = new Command('scrape')
  .description('Scrape Nugget Markets weekly specials for configured stores')
  .option('-a, --all', 'Scrape all enabled stores (default)')
  .option('-s, --store <id>', 'Scrape a single store by id')
  .option(
    '-d, --data-dir <dir>',
    'Directory to write data into',
    DEFAULT_DATA_DIR,
  )
  .option('--dry-run', 'Run scrapers but do not write any files')
  .action(async (opts) => {
    const dataDir = path.resolve(opts.dataDir);
    const store = new DataStore(dataDir);

    const configs = opts.store
      ? [registry.getConfig(opts.store)].filter(Boolean)
      : registry.getEnabledStores();

    if (configs.length === 0) {
      logger.error(
        opts.store ? `Unknown store: ${opts.store}` : 'No enabled stores found',
      );
      process.exit(1);
    }

    logger.info(
      `Scraping ${configs.length} store(s) → ${dataDir}${opts.dryRun ? ' (dry run)' : ''}`,
    );

    const snapshots: WeeklySnapshot[] = [];
    let failures = 0;

    for (const config of configs) {
      const scraper = registry.createScraper(config!.id);
      if (!scraper) {
        failures++;
        continue;
      }
      const result = await scraper.scrape();
      if (result.success && result.snapshot) {
        snapshots.push(result.snapshot);
        if (!opts.dryRun) store.writeSnapshot(result.snapshot);
        logger.info(
          `✓ ${config!.name}: ${result.snapshot.productCount} specials (week ${result.snapshot.weekStart})` +
            (result.warnings.length
              ? ` — ${result.warnings.length} warning(s)`
              : ''),
        );
      } else {
        failures++;
        logger.error(
          `✗ ${config!.name}: ${result.errors.map((e) => e.message).join('; ')}`,
        );
      }
    }

    if (snapshots.length === 0) {
      logger.error('All stores failed to scrape.');
      process.exit(1);
    }

    if (!opts.dryRun) {
      // CSV for this week's freshly scraped stores.
      const week = snapshots[0].weekStart;
      new CsvOutput(dataDir).write(snapshots, week);
      // Refresh the manifest from everything currently on disk.
      writeManifest(store);
    }

    // Summary
    const total = snapshots.reduce((a, s) => a + s.productCount, 0);
    logger.info(
      `Done. ${snapshots.length}/${configs.length} stores, ${total} specials total` +
        (failures ? `, ${failures} failed` : ''),
    );
  });

/** Build a manifest from all snapshots on disk plus the configured stores. */
export function writeManifest(store: DataStore): Manifest {
  const snapshots = store.readAllSnapshots();
  const weeks = store.allWeeks(snapshots);
  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    locations: registry
      .getAllStores()
      .map((s) => ({ id: s.id, name: s.name, storeId: s.storeId })),
    weeks,
    latestWeek: weeks.length ? weeks[weeks.length - 1] : null,
  };
  store.writeManifest(manifest);
  return manifest;
}

export default scrapeCommand;
