# Nugget Markets Specials Tracker

Scrapes the weekly specials from [nuggetmarket.com/specials](https://www.nuggetmarket.com/specials/)
for a configurable set of store locations every week, then computes deal-quality scores and
week-over-week / cross-location trends and publishes an interactive dashboard to a GitHub Pages
(`gh-pages`) branch.

Built on the same modular pattern as the sibling `event-search` project (Zod-schema-first types,
a template-method scraper, config-driven locations, a commander CLI).

## What it does

- **Scrapes** every configured store in one pass. Nugget selects a store via the `NuggetHomeStore`
  cookie, so each store is fetched with `Cookie: NuggetHomeStore=<id>` (one HTTP request per
  store). ~63 specials per store across 15 departments.
- **Normalizes** each special: numeric price/savings, dietary labels, and a **unit price**
  (`$0.87/oz`, `$0.029/ml`, …) parsed from the pack size so different sizes compare fairly.
- **Scores deals** (`★★ Strong / ★ Good / Decent`) by blending the flyer's discount, how far
  below the item's own usual price it is (needs history), and how it compares across stores.
- **Analyzes trends**: per-product price history, cross-location price differences,
  new/dropped/returning items each week, discount-depth stats, "store of the week", and the
  biggest deal of the week.
- **Publishes** a self-contained dashboard (deals grid with filters/sort, store comparison,
  price-history charts, weekly changes, insights, and a localStorage watchlist).

## Data model

Each run appends one snapshot per store to the published data, so history accumulates:

```
<gh-pages>/
  index.html  app.js  style.css      the dashboard
  data/
    manifest.json                    index of locations + weeks
    latest.json                      current week, all stores, with deal scores
    trends.json                      full trend analysis
    <store>/<weekStart>.json         per-store weekly snapshots (accumulate)
    csv/<weekStart>.csv              flattened spreadsheet export
```

## Usage

```bash
npm install
npm run build

# List / validate configured stores
npm run list
npm run validate

# Scrape all stores into a data dir (defaults to ./public/data)
npm run scrape -- --all --data-dir ./public/data
npm run scrape -- --store <store-id>        # a single store
npm run scrape -- --all --dry-run           # fetch + parse, write nothing

# Compute trends + deal scores from accumulated snapshots
npm run analyze -- --data-dir ./public/data

# Preview the dashboard locally
cp site/index.html site/app.js site/style.css public/
cd public && python3 -m http.server 8000     # → http://localhost:8000

# Tests (price/unit parsing + fixture-based scraper checks)
npm test
```

## Automation

`.github/workflows/scrape.yml` runs every **Wednesday at 08:00 PT** (`cron: '0 15 * * 3'`), just
after the new ad goes live, and can also be triggered manually. Each run:

1. checks out the existing `gh-pages` data (so the analyzer sees full history),
2. scrapes → analyzes → copies the dashboard into `public/`,
3. publishes `public/` back to `gh-pages` via `peaceiris/actions-gh-pages`.

**One-time setup:** after the first successful run, enable GitHub Pages for the repo
(Settings → Pages → *Deploy from a branch* → `gh-pages` / root).

## Adding a store

Drop a JSON file in `config/stores/` (find the numeric `storeId` from the `/locations/mine/<id>/`
link on nuggetmarket.com), then `npm run validate`:

```json
{
  "id": "davis-covell",
  "name": "Nugget Markets Davis Covell",
  "storeId": 2,
  "city": "Davis",
  "state": "CA",
  "enabled": true
}
```

## Project structure

```
src/
  types/       Zod schemas (product, store-config, snapshot, trends)
  core/        BaseScraper (fetch-with-cookie → parse → normalize → ScrapeResult)
  scrapers/    NuggetScraper (parses feature + department cards) + registry
  utils/       http-client, logger, price-parser, unit-price, product-normalizer
  analysis/    deal-score, trend-analyzer
  outputs/     data-store (gh-pages layout), csv-output
  cli/         commander commands: scrape, analyze, validate, list
config/stores/ one JSON per store
site/          static dashboard (index.html, app.js, style.css)
tests/         parser + fixture tests
```

Not affiliated with Nugget Markets. For personal, informational use.
