import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NuggetScraper } from '../src/scrapers/nugget-scraper.js';

const html = fs.readFileSync(
  path.join(import.meta.dirname, 'fixtures', 'specials-rocklin.html'),
  'utf-8',
);
const config = {
  id: 'rocklin',
  name: 'Nugget Markets Rocklin',
  storeId: 22,
  city: 'Rocklin',
  state: 'CA',
  enabled: true,
};

function scraperReturning(page: string) {
  const s = new NuggetScraper(config) as any;
  s.fetchContent = async () => page;
  return s as NuggetScraper;
}

test('a real page scrapes successfully', async () => {
  const result = await scraperReturning(html).scrape();
  assert.equal(result.success, true);
  assert.ok((result.snapshot?.productCount ?? 0) > 30);
});

test('a page with no product cards is a failure, not an empty snapshot', async () => {
  const stripped = html.replace(/<li id="(feature|item)-/g, '<li data-x="');
  const result = await scraperReturning(stripped).scrape();
  assert.equal(result.success, false);
  assert.match(result.errors[0].message, /0 products/);
});
