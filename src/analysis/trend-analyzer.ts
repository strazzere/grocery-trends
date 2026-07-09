import type {
  WeeklySnapshot,
  StoreRef,
  Product,
  PricePoint,
  ProductPriceHistory,
  CrossLocationItem,
  WeekOverWeekDiff,
  DiscountStats,
  DepartmentStat,
  BiggestDeal,
  StoreOfWeek,
  TrendsFile,
  Manifest,
  ScoredProduct,
  DealSignals,
} from '../types/index.js';
import { scoreProduct } from './deal-score.js';

interface Cell {
  price: number | null;
  save?: number;
  unitPrice?: number;
  name: string;
  department: string;
}

export interface AnalysisOutput {
  trends: TrendsFile;
  latest: {
    week: string;
    weekLabel: string;
    generatedAt: string;
    stores: { location: StoreRef; products: ScoredProduct[] }[];
  } | null;
  manifest: Manifest;
}

export class TrendAnalyzer {
  /** sku -> location -> week -> Cell */
  private index = new Map<string, Map<string, Map<string, Cell>>>();
  private skuMeta = new Map<string, { name: string; department: string }>();

  analyze(snapshots: WeeklySnapshot[], stores: StoreRef[]): AnalysisOutput {
    const generatedAt = new Date().toISOString();
    this.buildIndex(snapshots);

    const weeks = [...new Set(snapshots.map((s) => s.weekStart))].sort();
    const latestWeek = weeks.length ? weeks[weeks.length - 1] : null;

    // Locations: configured order first, then any extras seen in the data.
    const seenLocations = new Set(snapshots.map((s) => s.location.id));
    const orderedStores: StoreRef[] = [
      ...stores.filter((s) => seenLocations.has(s.id)),
      ...[...seenLocations]
        .filter((id) => !stores.some((s) => s.id === id))
        .map((id) => {
          const snap = snapshots.find((s) => s.location.id === id)!;
          return snap.location;
        }),
    ];
    const locationIds = orderedStores.map((s) => s.id);

    const manifest: Manifest = {
      generatedAt,
      locations: stores.map((s) => ({
        id: s.id,
        name: s.name,
        storeId: s.storeId,
      })),
      weeks,
      latestWeek,
    };

    if (!latestWeek) {
      return {
        trends: {
          generatedAt,
          weeks,
          locations: locationIds,
          latestWeek: null,
          priceHistory: [],
          crossLocation: [],
          weekOverWeek: [],
          discountStats: [],
          storeOfWeek: null,
          biggestDealOfWeek: null,
        },
        latest: null,
        manifest,
      };
    }

    const latestSnaps = snapshots.filter((s) => s.weekStart === latestWeek);

    // --- Deal-score the latest week (also feeds storeOfWeek / biggestDeal) ---
    const scoredStores = orderedStores
      .map((store) => {
        const snap = latestSnaps.find((s) => s.location.id === store.id);
        if (!snap) return null;
        const products = snap.products.map((p) =>
          this.scoreLatestProduct(p, store.id, latestWeek, latestSnaps),
        );
        return { location: store, products };
      })
      .filter(
        (x): x is { location: StoreRef; products: ScoredProduct[] } =>
          x !== null,
      );

    const storeOfWeek = this.computeStoreOfWeek(scoredStores);
    const biggestDealOfWeek = this.computeBiggestDeal(scoredStores);

    const trends: TrendsFile = {
      generatedAt,
      weeks,
      locations: locationIds,
      latestWeek,
      priceHistory: this.buildPriceHistory(locationIds),
      crossLocation: this.buildCrossLocation(latestWeek, locationIds),
      weekOverWeek: this.buildWeekOverWeek(weeks, locationIds),
      discountStats: this.buildDiscountStats(
        snapshots,
        scoredStores,
        latestWeek,
      ),
      storeOfWeek,
      biggestDealOfWeek,
    };

    return {
      latest: {
        week: latestWeek,
        weekLabel: latestSnaps[0]?.weekLabel ?? latestWeek,
        generatedAt,
        stores: scoredStores,
      },
      trends,
      manifest,
    };
  }

  private buildIndex(snapshots: WeeklySnapshot[]): void {
    for (const snap of snapshots) {
      for (const p of snap.products) {
        if (!this.index.has(p.sku)) this.index.set(p.sku, new Map());
        const byLoc = this.index.get(p.sku)!;
        if (!byLoc.has(snap.location.id))
          byLoc.set(snap.location.id, new Map());
        byLoc.get(snap.location.id)!.set(snap.weekStart, {
          price: p.price,
          save: p.saveAmount,
          unitPrice: p.unitPrice,
          name: p.name,
          department: p.department,
        });
        this.skuMeta.set(p.sku, { name: p.name, department: p.department });
      }
    }
  }

  /** Non-null prices for a SKU/location, optionally only weeks strictly before `beforeWeek`. */
  private pricesFor(sku: string, loc: string, beforeWeek?: string): number[] {
    const weeksMap = this.index.get(sku)?.get(loc);
    if (!weeksMap) return [];
    const out: number[] = [];
    for (const [week, cell] of weeksMap) {
      if (beforeWeek && week >= beforeWeek) continue;
      if (cell.price !== null) out.push(cell.price);
    }
    return out;
  }

  private weeksObserved(sku: string, loc: string): number {
    return this.index.get(sku)?.get(loc)?.size ?? 0;
  }

  private scoreLatestProduct(
    p: Product,
    loc: string,
    latestWeek: string,
    latestSnaps: WeeklySnapshot[],
  ): ScoredProduct {
    const historicalPrices = this.pricesFor(p.sku, loc, latestWeek);
    const allObserved = this.pricesFor(p.sku, loc);
    const crossLocationPrices = latestSnaps
      .map((s) => s.products.find((q) => q.sku === p.sku)?.price)
      .filter((v): v is number => typeof v === 'number');
    const isLowestEver =
      p.price !== null &&
      allObserved.length > 0 &&
      p.price <= Math.min(...allObserved) + 1e-9;

    const signals: DealSignals = scoreProduct({
      price: p.price,
      saveAmount: p.saveAmount,
      historicalPrices,
      crossLocationPrices,
      weeksObserved: this.weeksObserved(p.sku, loc),
      isLowestEver,
    });

    return { ...p, deal: signals };
  }

  private buildPriceHistory(locationIds: string[]): ProductPriceHistory[] {
    const out: ProductPriceHistory[] = [];
    for (const [sku, byLoc] of this.index) {
      const meta = this.skuMeta.get(sku)!;
      const series: Record<string, PricePoint[]> = {};
      for (const loc of locationIds) {
        const weeksMap = byLoc.get(loc);
        if (!weeksMap) continue;
        series[loc] = [...weeksMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([week, cell]) => ({
            week,
            price: cell.price,
            save: cell.save,
            unitPrice: cell.unitPrice,
          }));
      }
      out.push({ sku, name: meta.name, department: meta.department, series });
    }
    return out;
  }

  private buildCrossLocation(
    latestWeek: string,
    locationIds: string[],
  ): CrossLocationItem[] {
    const items: CrossLocationItem[] = [];
    for (const [sku, byLoc] of this.index) {
      const prices: Record<string, number | null> = {};
      let present = false;
      for (const loc of locationIds) {
        const cell = byLoc.get(loc)?.get(latestWeek);
        prices[loc] = cell ? cell.price : null;
        if (cell) present = true;
      }
      if (!present) continue;

      const nonNull = Object.entries(prices).filter(
        (e): e is [string, number] => typeof e[1] === 'number',
      );
      let cheapestLocation: string | null = null;
      let spread = 0;
      if (nonNull.length >= 1) {
        const min = Math.min(...nonNull.map((e) => e[1]));
        const max = Math.max(...nonNull.map((e) => e[1]));
        spread = Number((max - min).toFixed(2));
        cheapestLocation = nonNull.find((e) => e[1] === min)?.[0] ?? null;
      }
      const meta = this.skuMeta.get(sku)!;
      items.push({
        sku,
        name: meta.name,
        department: meta.department,
        prices,
        cheapestLocation,
        spread,
      });
    }
    // Most interesting comparisons (biggest price gaps between stores) first.
    return items.sort((a, b) => b.spread - a.spread);
  }

  private skusAt(loc: string, week: string): Set<string> {
    const out = new Set<string>();
    for (const [sku, byLoc] of this.index) {
      if (byLoc.get(loc)?.has(week)) out.add(sku);
    }
    return out;
  }

  private buildWeekOverWeek(
    weeks: string[],
    locationIds: string[],
  ): WeekOverWeekDiff[] {
    if (weeks.length === 0) return [];
    const latestWeek = weeks[weeks.length - 1];
    const out: WeekOverWeekDiff[] = [];

    for (const loc of locationIds) {
      const latestSkus = this.skusAt(loc, latestWeek);
      if (latestSkus.size === 0) continue;

      // Most recent week before latest for which this location has data.
      const prevWeek =
        [...weeks]
          .reverse()
          .find((w) => w < latestWeek && this.skusAt(loc, w).size > 0) ?? null;

      if (!prevWeek) {
        out.push({
          location: loc,
          week: latestWeek,
          prevWeek: null,
          new: [...latestSkus],
          dropped: [],
          returning: [],
          continued: [],
        });
        continue;
      }

      const prevSkus = this.skusAt(loc, prevWeek);
      const beforePrev = new Set<string>();
      for (const w of weeks) {
        if (w >= prevWeek) continue;
        for (const s of this.skusAt(loc, w)) beforePrev.add(s);
      }

      const continued: string[] = [];
      const notInPrev: string[] = [];
      for (const sku of latestSkus) {
        if (prevSkus.has(sku)) continued.push(sku);
        else notInPrev.push(sku);
      }
      const returning = notInPrev.filter((s) => beforePrev.has(s));
      const fresh = notInPrev.filter((s) => !beforePrev.has(s));
      const dropped = [...prevSkus].filter((s) => !latestSkus.has(s));

      out.push({
        location: loc,
        week: latestWeek,
        prevWeek,
        new: fresh,
        dropped,
        returning,
        continued,
      });
    }
    return out;
  }

  private buildDiscountStats(
    snapshots: WeeklySnapshot[],
    scoredStores: { location: StoreRef; products: ScoredProduct[] }[],
    latestWeek: string,
  ): DiscountStats[] {
    const out: DiscountStats[] = [];
    for (const snap of snapshots) {
      const products = snap.products;
      const saves = products.map((p) => p.saveAmount ?? 0).filter((v) => v > 0);
      const avgSave = saves.length
        ? Number((saves.reduce((a, b) => a + b, 0) / saves.length).toFixed(2))
        : 0;

      // by department
      const deptMap = new Map<
        string,
        { count: number; saveSum: number; saveN: number }
      >();
      for (const p of products) {
        const d = deptMap.get(p.department) ?? {
          count: 0,
          saveSum: 0,
          saveN: 0,
        };
        d.count += 1;
        if (p.saveAmount && p.saveAmount > 0) {
          d.saveSum += p.saveAmount;
          d.saveN += 1;
        }
        deptMap.set(p.department, d);
      }
      const byDepartment: DepartmentStat[] = [...deptMap.entries()]
        .map(([department, d]) => ({
          department,
          count: d.count,
          avgSave: d.saveN ? Number((d.saveSum / d.saveN).toFixed(2)) : 0,
        }))
        .sort((a, b) => b.count - a.count);

      // biggest deals (top 8 by save); attach deal score for the latest week
      const scoreBySku =
        snap.weekStart === latestWeek
          ? new Map(
              scoredStores
                .find((s) => s.location.id === snap.location.id)
                ?.products.map((p) => [
                  p.sku as string,
                  (p.deal as DealSignals).dealScore,
                ]) ?? [],
            )
          : new Map<string, number>();

      const biggestDeals: BiggestDeal[] = [...products]
        .filter((p) => (p.saveAmount ?? 0) > 0)
        .sort((a, b) => (b.saveAmount ?? 0) - (a.saveAmount ?? 0))
        .slice(0, 8)
        .map((p) => ({
          sku: p.sku,
          name: p.name,
          department: p.department,
          price: p.price,
          save: p.saveAmount ?? 0,
          dealScore: scoreBySku.get(p.sku),
        }));

      out.push({
        location: snap.location.id,
        week: snap.weekStart,
        count: products.length,
        avgSave,
        byDepartment,
        biggestDeals,
      });
    }
    return out;
  }

  private computeStoreOfWeek(
    scoredStores: { location: StoreRef; products: ScoredProduct[] }[],
  ): StoreOfWeek | null {
    if (scoredStores.length === 0) return null;
    const ranked = scoredStores
      .map((s) => ({
        location: s.location.id,
        strongDeals: s.products.filter(
          (p) => (p.deal as DealSignals).badge === 'strong',
        ).length,
        totalDeals: s.products.length,
      }))
      .sort(
        (a, b) => b.strongDeals - a.strongDeals || b.totalDeals - a.totalDeals,
      );
    return ranked[0];
  }

  private computeBiggestDeal(
    scoredStores: { location: StoreRef; products: ScoredProduct[] }[],
  ): (BiggestDeal & { location: string }) | null {
    let best: (BiggestDeal & { location: string }) | null = null;
    for (const store of scoredStores) {
      for (const p of store.products) {
        const deal = p.deal as DealSignals;
        const candidate = {
          sku: p.sku as string,
          name: p.name as string,
          department: p.department as string,
          price: (p.price as number | null) ?? null,
          save: (p.saveAmount as number | undefined) ?? 0,
          dealScore: deal.dealScore,
          location: store.location.id,
        };
        if (
          !best ||
          (candidate.dealScore ?? 0) > (best.dealScore ?? 0) ||
          ((candidate.dealScore ?? 0) === (best.dealScore ?? 0) &&
            candidate.save > best.save)
        ) {
          best = candidate;
        }
      }
    }
    return best;
  }
}

export const trendAnalyzer = new TrendAnalyzer();
export default trendAnalyzer;
