import * as cheerio from 'cheerio';

export interface DiscoveredStore {
  storeId: number;
  name: string;
}

/**
 * Parses the "Select your home store" list from any nuggetmarket.com page, e.g.
 *   <li><a href="/locations/mine/22/">Rocklin</a></li>
 */
export function parseStoreList(html: string): DiscoveredStore[] {
  const $ = cheerio.load(html);
  const found = new Map<number, string>();
  $('#home-store-select a[href*="/locations/mine/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/\/locations\/mine\/(\d+)\//);
    if (!m) return;
    found.set(Number(m[1]), $(el).text().replace(/\s+/g, ' ').trim());
  });
  return [...found].map(([storeId, name]) => ({ storeId, name }));
}

export interface StoreDiff {
  /** On the site but not in config/stores. */
  untracked: DiscoveredStore[];
  /** In config/stores but no longer on the site. */
  missing: number[];
}

export function diffStores(
  discovered: DiscoveredStore[],
  configuredIds: number[],
): StoreDiff {
  const configured = new Set(configuredIds);
  const live = new Set(discovered.map((d) => d.storeId));
  return {
    untracked: discovered.filter((d) => !configured.has(d.storeId)),
    missing: configuredIds.filter((id) => !live.has(id)),
  };
}
