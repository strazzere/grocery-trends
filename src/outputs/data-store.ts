import fs from 'node:fs';
import path from 'node:path';
import {
  type WeeklySnapshot,
  WeeklySnapshotSchema,
  type Manifest,
  type TrendsFile,
  type ScoredProduct,
} from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Manages the on-disk data layout that gets published to the gh-pages branch:
 *
 *   <dataDir>/
 *     manifest.json                 index of locations + weeks
 *     latest.json                   current week, all stores, enriched with deal scores
 *     trends.json                   full trend analysis
 *     <store>/<weekStart>.json      per-store weekly snapshots (accumulate over time)
 *
 * On each run the existing gh-pages data is checked out into <dataDir> first, so
 * reads here see the full accumulated history.
 */
export class DataStore {
  constructor(private dataDir: string) {}

  private ensureDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
  }

  private writeJson(file: string, data: unknown): string {
    this.ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    return file;
  }

  /** data/<store>/<weekStart>.json */
  snapshotPath(storeId: string, weekStart: string): string {
    return path.join(this.dataDir, storeId, `${weekStart}.json`);
  }

  writeSnapshot(snapshot: WeeklySnapshot): string {
    const file = this.snapshotPath(snapshot.location.id, snapshot.weekStart);
    logger.info(`Writing snapshot ${file} (${snapshot.productCount} products)`);
    return this.writeJson(file, snapshot);
  }

  /** Read every per-store weekly snapshot currently on disk. */
  readAllSnapshots(): WeeklySnapshot[] {
    if (!fs.existsSync(this.dataDir)) return [];
    const snapshots: WeeklySnapshot[] = [];
    for (const entry of fs.readdirSync(this.dataDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const storeDir = path.join(this.dataDir, entry.name);
      for (const file of fs.readdirSync(storeDir)) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = JSON.parse(
            fs.readFileSync(path.join(storeDir, file), 'utf-8'),
          );
          snapshots.push(WeeklySnapshotSchema.parse(raw));
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.warn(
            `Skipping unreadable snapshot ${entry.name}/${file}: ${msg}`,
          );
        }
      }
    }
    return snapshots;
  }

  /** Sorted ascending list of all week-start dates present on disk. */
  allWeeks(snapshots?: WeeklySnapshot[]): string[] {
    const snaps = snapshots ?? this.readAllSnapshots();
    return [...new Set(snaps.map((s) => s.weekStart))].sort();
  }

  writeManifest(manifest: Manifest): string {
    return this.writeJson(path.join(this.dataDir, 'manifest.json'), manifest);
  }

  /** latest.json holds the current week's snapshots with deal-scored products. */
  writeLatest(payload: {
    week: string;
    weekLabel: string;
    generatedAt: string;
    stores: {
      location: WeeklySnapshot['location'];
      products: ScoredProduct[];
    }[];
  }): string {
    return this.writeJson(path.join(this.dataDir, 'latest.json'), payload);
  }

  readLatest(): {
    week: string;
    weekLabel: string;
    stores: {
      location: WeeklySnapshot['location'];
      products: ScoredProduct[];
    }[];
  } | null {
    const file = path.join(this.dataDir, 'latest.json');
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      return null;
    }
  }

  writeTrends(trends: TrendsFile): string {
    return this.writeJson(path.join(this.dataDir, 'trends.json'), trends);
  }
}

export default DataStore;
