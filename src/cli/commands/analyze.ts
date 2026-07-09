import { Command } from 'commander';
import path from 'node:path';
import { registry } from '../../scrapers/registry.js';
import { DataStore } from '../../outputs/data-store.js';
import { TrendAnalyzer } from '../../analysis/trend-analyzer.js';
import { logger } from '../../utils/logger.js';
import type { StoreRef } from '../../types/index.js';

const DEFAULT_DATA_DIR = path.join('public', 'data');

export const analyzeCommand = new Command('analyze')
  .description(
    'Compute trend analysis + deal scores from accumulated snapshots',
  )
  .option(
    '-d, --data-dir <dir>',
    'Directory to read/write data',
    DEFAULT_DATA_DIR,
  )
  .action(async (opts) => {
    const dataDir = path.resolve(opts.dataDir);
    const store = new DataStore(dataDir);

    const snapshots = store.readAllSnapshots();
    if (snapshots.length === 0) {
      logger.error(`No snapshots found in ${dataDir}. Run "scrape" first.`);
      process.exit(1);
    }

    const stores: StoreRef[] = registry
      .getAllStores()
      .map((s) => ({ id: s.id, name: s.name, storeId: s.storeId }));

    logger.info(
      `Analyzing ${snapshots.length} snapshot(s) across ${store.allWeeks(snapshots).length} week(s)`,
    );

    const analyzer = new TrendAnalyzer();
    const { trends, latest, manifest } = analyzer.analyze(snapshots, stores);

    store.writeTrends(trends);
    store.writeManifest(manifest);
    if (latest) store.writeLatest(latest);

    // Summary highlights
    if (trends.storeOfWeek) {
      const name =
        stores.find((s) => s.id === trends.storeOfWeek!.location)?.name ??
        trends.storeOfWeek.location;
      logger.info(
        `Store of the week: ${name} (${trends.storeOfWeek.strongDeals} strong deals)`,
      );
    }
    if (trends.biggestDealOfWeek) {
      const d = trends.biggestDealOfWeek;
      logger.info(
        `Biggest deal: ${d.name} — save $${d.save} (score ${d.dealScore ?? 'n/a'})`,
      );
    }
    logger.info(
      `Wrote trends.json (${trends.priceHistory.length} tracked products), ` +
        `latest.json, manifest.json → ${dataDir}`,
    );
  });

export default analyzeCommand;
