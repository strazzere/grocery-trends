import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrice, parseSave } from '../src/utils/price-parser.js';
import { normalizeUnitPrice } from '../src/utils/unit-price.js';

test('parsePrice: per-pound', () => {
  const r = parsePrice('$16.99/lb.');
  assert.equal(r.price, 16.99);
  assert.equal(r.unit, 'lb');
});

test('parsePrice: plain dollar amount is treated as each', () => {
  const r = parsePrice('$5.99');
  assert.equal(r.price, 5.99);
  assert.equal(r.unit, 'ea');
});

test('parsePrice: explicit each and whole dollars', () => {
  assert.equal(parsePrice('$18/ea.').price, 18);
  assert.equal(parsePrice('$7').price, 7);
});

test('parsePrice: multi-buy resolves to per-item price', () => {
  const r = parsePrice('2/$5');
  assert.equal(r.price, 2.5);
  assert.equal(r.unit, 'ea');
  assert.equal(r.multiBuyQty, 2);
  assert.equal(parsePrice('10/$10').price, 1);
});

test('parsePrice: cents-only', () => {
  assert.equal(parsePrice('79¢').price, 0.79);
});

test('parsePrice: percentage-only has no numeric price', () => {
  assert.equal(parsePrice('Up To 25% Off').price, null);
});

test('parseSave: dollars, cents, and "on N" split', () => {
  assert.equal(parseSave('Save $3/lb.').amount, 3);
  assert.equal(parseSave('Save 50¢/ea.').amount, 0.5);
  const onTwo = parseSave('Save $1.58 on 2');
  assert.equal(onTwo.perItems, 2);
  assert.equal(onTwo.amount, 0.79);
});

test('normalizeUnitPrice: per-lb becomes per-oz', () => {
  const u = normalizeUnitPrice(16.99, 'lb');
  assert.equal(u.packUnit, 'oz');
  assert.equal(u.unitPrice, Number((16.99 / 16).toFixed(4)));
  assert.match(u.unitPriceLabel!, /\/oz$/);
});

test('normalizeUnitPrice: ml volume', () => {
  const u = normalizeUnitPrice(21.99, 'ea', '750 ML. bottle');
  assert.equal(u.packUnit, 'ml');
  assert.equal(u.unitPrice, Number((21.99 / 750).toFixed(4)));
});

test('normalizeUnitPrice: ounce package', () => {
  const u = normalizeUnitPrice(4, 'ea', '8 OZ. package');
  assert.equal(u.packUnit, 'oz');
  assert.equal(u.unitPrice, 0.5);
});

test('normalizeUnitPrice: count pack and range midpoint', () => {
  assert.equal(normalizeUnitPrice(6, 'ea', '6 PK. cans').packUnit, 'ct');
  const range = normalizeUnitPrice(4, 'ea', '1.41–1.55 OZ. package');
  assert.equal(range.packQty, Number(((1.41 + 1.55) / 2).toFixed(3)));
});

test('normalizeUnitPrice: null price yields nothing', () => {
  assert.deepEqual(normalizeUnitPrice(null, 'ea', '8 OZ.'), {});
});
