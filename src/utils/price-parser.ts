/**
 * Parsers for the Nugget Markets flyer price/savings strings.
 *
 * Observed sale forms: "$16.99/lb.", "$5.99", "$7", "$18/ea.", "10/$10",
 * "2/$5", "79¢", "Up To 25% Off".
 * Observed save forms: "Save $3/lb.", "Save $2", "Save 50¢/ea.",
 * "Save $1.58 on 2", "Save up to $5".
 */

export type PriceUnit = 'lb' | 'ea';

export interface ParsedPrice {
  /** Per-item (or per-lb) price as a number; null when not numeric (e.g. "% Off"). */
  price: number | null;
  unit: PriceUnit | null;
  /** For multi-buy deals like "2/$5", the group quantity (2). undefined otherwise. */
  multiBuyQty?: number;
  /** Original cleaned text. */
  text: string;
}

export interface ParsedSave {
  /** Per-item savings in dollars (multi-item "on N" savings are divided by N). */
  amount: number;
  /** How many items the original savings applied to (1 unless "on N"). */
  perItems: number;
  text: string;
}

/** Normalize a cents glyph / entity to a plain "¢". */
function normalizeText(text: string): string {
  return text
    .replace(/&cent;/gi, '¢')
    .replace(/&ndash;/gi, '–')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Round to at most `places` decimals without floating-point cruft. */
function round(n: number, places = 4): number {
  return Number(n.toFixed(places));
}

export function parsePrice(raw: string): ParsedPrice {
  const text = normalizeText(raw);
  const lower = text.toLowerCase();

  const unit: PriceUnit | null = lower.includes('/lb')
    ? 'lb'
    : lower.includes('/ea')
      ? 'ea'
      : null;

  // Multi-buy: "2/$5", "10/$10"
  const multi = text.match(/^(\d+)\s*\/\s*\$\s*([\d,]+(?:\.\d+)?)/);
  if (multi) {
    const qty = parseInt(multi[1], 10);
    const total = parseFloat(multi[2].replace(/,/g, ''));
    return {
      price: qty > 0 ? round(total / qty) : null,
      unit: 'ea',
      multiBuyQty: qty,
      text,
    };
  }

  // Cents-only: "79¢"
  const cents = text.match(/^(\d+)\s*¢/);
  if (cents) {
    return {
      price: round(parseInt(cents[1], 10) / 100),
      unit: unit ?? 'ea',
      text,
    };
  }

  // Dollar amount: "$16.99/lb.", "$5.99", "$7", "$18/ea."
  const dollars = text.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (dollars) {
    const value = parseFloat(dollars[1].replace(/,/g, ''));
    // No explicit unit and a plain dollar amount → a per-package ("each") price.
    return { price: round(value), unit: unit ?? 'ea', text };
  }

  // Non-numeric (e.g. "Up To 25% Off") — no comparable price.
  return { price: null, unit, text };
}

export function parseSave(raw: string): ParsedSave {
  const text = normalizeText(raw);

  // "... on N" — savings applies to a group of N items.
  const onN = text.match(/on\s+(\d+)\s*$/i);
  const perItems = onN ? Math.max(1, parseInt(onN[1], 10)) : 1;

  let total = 0;
  const cents = text.match(/(\d+)\s*¢/);
  const dollars = text.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (dollars) {
    total = parseFloat(dollars[1].replace(/,/g, ''));
  } else if (cents) {
    total = parseInt(cents[1], 10) / 100;
  }

  return { amount: round(total / perItems), perItems, text };
}
