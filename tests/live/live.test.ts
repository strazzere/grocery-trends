// Hits the real site. Run with `npm run test:live` (not part of `npm test`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registry } from '../../src/scrapers/registry.js';

for (const config of registry.getEnabledStores()) {
  test(`live: ${config.id} still parses`, async () => {
    const result = await registry.createScraper(config.id)!.scrape();
    assert.equal(
      result.success,
      true,
      result.errors.map((e) => e.message).join('; '),
    );
    assert.ok(result.snapshot!.productCount >= 30, 'suspiciously few products');
    assert.match(result.snapshot!.weekStart, /^\d{4}-\d{2}-\d{2}$/);
  });
}
