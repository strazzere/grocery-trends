import type * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { BaseScraper, type WeekInfo } from '../core/base-scraper.js';
import type { RawProductData } from '../types/index.js';

const SPECIALS_URL = 'https://www.nuggetmarket.com/specials/';

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

function isoDate(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

/**
 * Scraper for nuggetmarket.com/specials/. The store is selected upstream via the
 * `NuggetHomeStore` cookie (handled by BaseScraper.fetchContent), so this class
 * only parses the returned HTML.
 */
export class NuggetScraper extends BaseScraper {
  protected url = SPECIALS_URL;

  /**
   * Parses the ad-week label from the sticky header, e.g.
   *   "Weekly Specials July 8–14, 2026"      → Jul 8 – Jul 14, 2026
   *   "Weekly Specials July 29–August 4, 2026" → Jul 29 – Aug 4, 2026
   */
  protected parseWeek($: cheerio.CheerioAPI): WeekInfo {
    const headerText = this.extractText($('.sticky-header p').first()).replace(
      /&ndash;/gi,
      '–',
    );
    const label = headerText.replace(/weekly specials/i, '').trim();

    // Match: <Month> <d>[–[<Month2>] <d2>], <year>
    const m = label.match(
      /([A-Za-z]+)\s+(\d{1,2})\s*[–-]\s*(?:([A-Za-z]+)\s+)?(\d{1,2}),?\s*(\d{4})/,
    );
    if (m) {
      const startMonth = MONTHS[m[1].toLowerCase()];
      const startDay = parseInt(m[2], 10);
      const endMonth = m[3] ? MONTHS[m[3].toLowerCase()] : startMonth;
      const endDay = parseInt(m[4], 10);
      const year = parseInt(m[5], 10);
      if (startMonth !== undefined && endMonth !== undefined) {
        // If the range wraps year-end (e.g. Dec 30 – Jan 5), bump end year.
        const endYear = endMonth < startMonth ? year + 1 : year;
        return {
          weekLabel: label,
          weekStart: isoDate(year, startMonth, startDay),
          weekEnd: isoDate(endYear, endMonth, endDay),
        };
      }
    }

    // Fallback: use the "Starting <Month> <d>, <year>" in the title.
    const title = this.extractText($('title').first());
    const t = title.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
    if (t && MONTHS[t[1].toLowerCase()] !== undefined) {
      const month = MONTHS[t[1].toLowerCase()];
      const day = parseInt(t[2], 10);
      const year = parseInt(t[3], 10);
      const start = Date.UTC(year, month, day);
      const end = new Date(start + 6 * 86400000);
      return {
        weekLabel: label || title,
        weekStart: new Date(start).toISOString().slice(0, 10),
        weekEnd: end.toISOString().slice(0, 10),
      };
    }

    throw new Error(`Could not parse ad-week from header "${headerText}"`);
  }

  protected async parseProducts(
    $: cheerio.CheerioAPI,
  ): Promise<RawProductData[]> {
    const rows: RawProductData[] = [];
    // Featured cards (li#feature-*) and department-grid cards (li#item-*).
    const cards = $('li[id^="feature-"], li[id^="item-"]');

    cards.each((_, el) => {
      const $card = $(el);
      const id = $card.attr('id') || '';
      const isFeatured = id.startsWith('feature-');

      const href =
        $card.find('a[href*="/specials/"]').first().attr('href') || '';
      const linkMatch = href.match(/\/specials\/([a-z0-9-]+)\/([0-9-]+)\/?/i);
      if (!linkMatch) return; // no stable product link → skip
      const department = linkMatch[1];
      const sku = linkMatch[2];

      const name = this.extractText($card.find('h3.name').first());
      if (!name) return;

      const prefix =
        this.extractText($card.find('p.prefix').first()) || undefined;
      const suffix =
        this.extractText($card.find('p.suffix').first()) || undefined;
      const packSize =
        this.extractText($card.find('p.pack-size').first()) || undefined;
      const selectedVarieties = $card.find('p.selected-varieties').length > 0;

      const priceText = this.extractText($card.find('.sale').first());
      const saveEl = $card.find('.save').first();
      const saveText = saveEl.length
        ? saveEl.text().replace(/\s+/g, ' ').trim()
        : undefined;

      const labels = this.extractLabels($, $card);

      const imgSrc = $card.find('figure img').first().attr('src');
      const imageUrl = this.absoluteUrl(imgSrc, this.url);
      const productUrl = this.absoluteUrl(href, this.url);

      rows.push({
        sku,
        name,
        prefix,
        suffix,
        department,
        packSize,
        selectedVarieties,
        priceText,
        saveText,
        labels,
        imageUrl,
        productUrl,
        isFeatured,
      });
    });

    return rows;
  }

  /** Diet/attribute labels from the card's lifestyle icons (alt text). */
  private extractLabels(
    $: cheerio.CheerioAPI,
    $card: cheerio.Cheerio<AnyNode>,
  ): string[] {
    const labels = new Set<string>();
    $card.find('ul.labels li.lifestyle img').each((_, img) => {
      const alt = ($(img).attr('alt') || '').trim();
      if (!alt) return;
      // "Local (within 100 miles)" → "Local"
      const cleaned = alt.replace(/\s*\(.*\)\s*/, '').trim();
      if (cleaned) labels.add(cleaned);
    });
    return [...labels];
  }
}

export default NuggetScraper;
