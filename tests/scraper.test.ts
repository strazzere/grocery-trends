import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { NuggetScraper } from '../src/scrapers/nugget-scraper.js';
import type { StoreConfig } from '../src/types/index.js';

const CONFIG: StoreConfig = {
  id: 'rocklin',
  name: 'Nugget Markets Rocklin',
  storeId: 22,
  city: 'Rocklin',
  state: 'CA',
  enabled: true,
};

function loadFixture(): cheerio.CheerioAPI {
  const html = fs.readFileSync(
    path.join(import.meta.dirname, 'fixtures', 'specials-rocklin.html'),
    'utf-8',
  );
  return cheerio.load(html);
}

test('parseWeek extracts the ad-week label and dates', () => {
  const scraper = new NuggetScraper(CONFIG) as any;
  const week = scraper.parseWeek(loadFixture());
  assert.equal(week.weekStart, '2026-07-08');
  assert.equal(week.weekEnd, '2026-07-14');
  assert.match(week.weekLabel, /July 8/);
});

test('parseProducts extracts a reasonable number of unique products', async () => {
  const scraper = new NuggetScraper(CONFIG) as any;
  const rows = await scraper.parseProducts(loadFixture());
  // Featured + department cards, before sku-dedup.
  assert.ok(rows.length >= 60, `expected >= 60 raw rows, got ${rows.length}`);
  // Every row must carry a stable sku + name.
  for (const r of rows) {
    assert.ok(r.sku, 'row missing sku');
    assert.ok(r.name, 'row missing name');
  }
});

test('a known product parses with the right fields', async () => {
  const scraper = new NuggetScraper(CONFIG) as any;
  const rows = await scraper.parseProducts(loadFixture());
  const tbone = rows.find((r: any) => /T.?Bone/i.test(r.name));
  assert.ok(tbone, 'T-Bone steak not found');
  assert.equal(tbone.department, 'meat');
  assert.match(tbone.priceText, /\$16\.99/);
  assert.match(tbone.saveText, /\$3/);

  const grapes = rows.find((r: any) => /Seedless Grapes/i.test(r.name));
  assert.ok(grapes, 'grapes not found');
  assert.ok(grapes.labels.includes('Organic'), 'expected Organic label');
});
