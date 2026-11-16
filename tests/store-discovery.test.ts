import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { diffStores, parseStoreList } from '../src/utils/store-discovery.js';

const html = fs.readFileSync(
  path.join(import.meta.dirname, 'fixtures', 'specials-rocklin.html'),
  'utf-8',
);

test('parseStoreList reads the home-store selector', () => {
  const stores = parseStoreList(html);
  assert.equal(stores.length, 15);
  assert.deepEqual(
    stores.find((s) => s.storeId === 22),
    { storeId: 22, name: 'Rocklin' },
  );
});

test('diffStores reports new and vanished stores', () => {
  const live = [
    { storeId: 1, name: 'A' },
    { storeId: 2, name: 'B' },
  ];
  const diff = diffStores(live, [2, 3]);
  assert.deepEqual(diff.untracked, [{ storeId: 1, name: 'A' }]);
  assert.deepEqual(diff.missing, [3]);
});
