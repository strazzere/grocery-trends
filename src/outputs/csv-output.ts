import fs from 'node:fs';
import path from 'node:path';
import type { WeeklySnapshot } from '../types/index.js';
import { logger } from '../utils/logger.js';

const COLUMNS = [
  'store',
  'week_start',
  'department',
  'sku',
  'name',
  'pack_size',
  'price',
  'price_unit',
  'unit_price',
  'unit_price_label',
  'save_amount',
  'price_text',
  'save_text',
  'labels',
  'is_featured',
  'product_url',
] as const;

function escapeCsv(value: unknown): string {
  const s = value === undefined || value === null ? '' : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Writes a flattened CSV of all products in a set of snapshots (one row per
 * product per store) to `<dataDir>/csv/<weekStart>.csv`.
 */
export class CsvOutput {
  constructor(private dataDir: string) {}

  write(snapshots: WeeklySnapshot[], weekStart: string): string {
    const rows: string[] = [COLUMNS.join(',')];
    for (const snap of snapshots) {
      for (const p of snap.products) {
        rows.push(
          [
            snap.location.id,
            snap.weekStart,
            p.department,
            p.sku,
            p.name,
            p.packSize,
            p.price ?? '',
            p.priceUnit ?? '',
            p.unitPrice ?? '',
            p.unitPriceLabel ?? '',
            p.saveAmount ?? '',
            p.priceText,
            p.saveText,
            p.labels.join('; '),
            p.isFeatured ? 'yes' : 'no',
            p.productUrl,
          ]
            .map(escapeCsv)
            .join(','),
        );
      }
    }

    const file = path.join(this.dataDir, 'csv', `${weekStart}.csv`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, rows.join('\n'), 'utf-8');
    logger.info(`Wrote CSV ${file} (${rows.length - 1} rows)`);
    return file;
  }
}

export default CsvOutput;
