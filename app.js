const state = {
  manifest: null,
  latest: null,
  trends: null,
  store: 'all',
  dept: '',
  labels: new Set(),
  search: '',
  strongOnly: false,
  sort: 'score',
  watchlist: new Set(
    JSON.parse(localStorage.getItem('nugget-watchlist') || '[]'),
  ),
  charts: {},
};

const BADGE_LABEL = {
  strong: '★★ Strong',
  good: '★ Good',
  decent: 'Decent',
  regular: '',
};
const $ = (sel) => document.querySelector(sel);
const money = (n) =>
  n === null || n === undefined ? '—' : `$${Number(n).toFixed(2)}`;
const pct = (n) =>
  n === null || n === undefined ? null : `${Math.round(n * 100)}%`;

async function boot() {
  try {
    const [manifest, latest, trends] = await Promise.all([
      fetchJson('./data/manifest.json'),
      fetchJson('./data/latest.json'),
      fetchJson('./data/trends.json'),
    ]);
    state.manifest = manifest;
    state.latest = latest;
    state.trends = trends;
  } catch (_e) {
    $('#week-sub').textContent =
      'No data published yet — check back after the first run.';
    return;
  }
  if (!state.latest?.stores?.length) {
    $('#week-sub').textContent = 'No specials data available yet.';
    return;
  }
  initChrome();
  wireEvents();
  render();
  const initial = location.hash.slice(1);
  if (
    ['compare', 'trends', 'changes', 'insights', 'watchlist'].includes(initial)
  ) {
    switchTab(initial);
  }
  window.addEventListener('hashchange', () => {
    const t = location.hash.slice(1);
    if (
      [
        'deals',
        'compare',
        'trends',
        'changes',
        'insights',
        'watchlist',
      ].includes(t)
    )
      switchTab(t);
  });
}

function fetchJson(url) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(url);
    return r.json();
  });
}

// ---------- data helpers ----------
function storeName(id) {
  const loc = state.manifest.locations.find((l) => l.id === id);
  return loc ? loc.name.replace(/^Nugget Markets\s*/, '') : id;
}
function focusStoreId() {
  return state.store === 'all'
    ? state.latest.stores[0].location.id
    : state.store;
}
function productsForStore(id) {
  const s = state.latest.stores.find((x) => x.location.id === id);
  return s ? s.products : [];
}
// For "all", merge by sku picking the lowest-priced offering.
function currentProducts() {
  if (state.store !== 'all') return productsForStore(state.store);
  const bySku = new Map();
  for (const s of state.latest.stores) {
    for (const p of s.products) {
      const cur = bySku.get(p.sku);
      const price = p.price ?? Infinity;
      if (!cur || price < (cur.price ?? Infinity)) bySku.set(p.sku, p);
    }
  }
  return [...bySku.values()];
}
function skuNameMap() {
  const m = new Map();
  for (const ph of state.trends.priceHistory) m.set(ph.sku, ph.name);
  return m;
}

// ---------- chrome ----------
function initChrome() {
  $('#week-sub').textContent =
    `Week of ${state.latest.weekLabel} · updated ${new Date(
      state.latest.generatedAt,
    ).toLocaleDateString()}`;

  // banners
  const t = state.trends;
  const banners = [];
  if (t.storeOfWeek) {
    banners.push(
      bannerHtml(
        '🏆',
        'Store of the week',
        `${storeName(t.storeOfWeek.location)}`,
        `${t.storeOfWeek.strongDeals} strong deals`,
      ),
    );
  }
  if (t.biggestDealOfWeek) {
    const d = t.biggestDealOfWeek;
    banners.push(
      bannerHtml(
        '🔥',
        'Biggest deal',
        d.name,
        `save $${d.save} @ ${storeName(d.location)}`,
      ),
    );
  }
  const _totalDeals = state.latest.stores.reduce(
    (a, s) => a + s.products.length,
    0,
  );
  banners.push(
    bannerHtml(
      '🛍️',
      'This week',
      `${state.latest.stores[0].products.length} specials`,
      `${state.manifest.weeks.length} week(s) tracked`,
    ),
  );
  $('#banners').innerHTML = banners.join('');

  // store toggle
  const buttons = [
    '<button data-store="all" class="active">All stores</button>',
  ].concat(
    state.latest.stores.map(
      (s) =>
        `<button data-store="${s.location.id}">${storeName(s.location.id)}</button>`,
    ),
  );
  $('#store-toggle').innerHTML = buttons.join('');

  // departments
  const depts = [
    ...new Set(currentAllProducts().map((p) => p.department)),
  ].sort();
  $('#dept-select').innerHTML =
    '<option value="">All departments</option>' +
    depts.map((d) => `<option value="${d}">${titleCase(d)}</option>`).join('');

  // label chips
  const labels = [
    ...new Set(currentAllProducts().flatMap((p) => p.labels || [])),
  ].sort();
  $('#label-chips').innerHTML = labels
    .map((l) => `<span class="chip" data-label="${l}">${l}</span>`)
    .join('');

  $('#footer-note').textContent =
    `Data scraped from nuggetmarket.com/specials · ${state.manifest.weeks.length} week(s) on record · not affiliated with Nugget Markets.`;
}
function currentAllProducts() {
  return state.latest.stores.flatMap((s) => s.products);
}
function bannerHtml(emoji, label, value, small) {
  return `<div class="banner"><span class="emoji">${emoji}</span><div>
    <div class="label">${label}</div>
    <div class="value">${value} <small>${small}</small></div></div></div>`;
}
function titleCase(s) {
  return s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------- events ----------
function wireEvents() {
  document
    .querySelectorAll('nav.tabs button')
    .forEach((b) =>
      b.addEventListener('click', () => switchTab(b.dataset.tab)),
    );
  $('#store-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.store = btn.dataset.store;
    document
      .querySelectorAll('#store-toggle button')
      .forEach((x) => x.classList.toggle('active', x === btn));
    render();
  });
  $('#search').addEventListener('input', (e) => {
    state.search = e.target.value.toLowerCase();
    renderDeals();
  });
  $('#dept-select').addEventListener('change', (e) => {
    state.dept = e.target.value;
    renderDeals();
  });
  $('#sort-select').addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderDeals();
  });
  $('#strong-only').addEventListener('change', (e) => {
    state.strongOnly = e.target.checked;
    renderDeals();
  });
  $('#label-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const l = chip.dataset.label;
    if (state.labels.has(l)) state.labels.delete(l);
    else state.labels.add(l);
    chip.classList.toggle('active');
    renderDeals();
  });
  $('#trend-pick').addEventListener('change', renderTrendChart);
}

function switchTab(tab) {
  if (location.hash.slice(1) !== tab) history.replaceState(null, '', `#${tab}`);
  document
    .querySelectorAll('nav.tabs button')
    .forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  ['deals', 'compare', 'trends', 'changes', 'insights', 'watchlist'].forEach(
    (t) => {
      $(`#tab-${t}`).hidden = t !== tab;
    },
  );
  if (tab === 'compare') renderCompare();
  if (tab === 'trends') renderTrends();
  if (tab === 'changes') renderChanges();
  if (tab === 'insights') renderInsights();
  if (tab === 'watchlist') renderWatchlist();
}

// ---------- render ----------
function render() {
  renderDeals();
}

function filteredProducts() {
  let items = currentProducts();
  if (state.dept) items = items.filter((p) => p.department === state.dept);
  if (state.search)
    items = items.filter((p) => p.name.toLowerCase().includes(state.search));
  if (state.strongOnly) items = items.filter((p) => p.deal.badge === 'strong');
  if (state.labels.size)
    items = items.filter((p) =>
      (p.labels || []).some((l) => state.labels.has(l)),
    );
  return sortProducts(items);
}
function sortProducts(items) {
  const by = {
    score: (a, b) => b.deal.dealScore - a.deal.dealScore,
    discount: (a, b) => (b.deal.discountPct || 0) - (a.deal.discountPct || 0),
    save: (a, b) => (b.saveAmount || 0) - (a.saveAmount || 0),
    unit: (a, b) => (a.unitPrice ?? Infinity) - (b.unitPrice ?? Infinity),
    'price-asc': (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
    'price-desc': (a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity),
  };
  return [...items].sort(by[state.sort] || by.score);
}

function renderDeals() {
  const items = filteredProducts();
  const grid = $('#deals-grid');
  if (!items.length) {
    grid.innerHTML = '<p class="empty">No specials match these filters.</p>';
    return;
  }
  grid.innerHTML = items.map(cardHtml).join('');
  wireCards(grid);
}

function cardHtml(p) {
  const deal = p.deal || {};
  const badge =
    deal.badge && deal.badge !== 'regular'
      ? `<span class="badge ${deal.badge}">${BADGE_LABEL[deal.badge]}</span>`
      : '';
  const star = state.watchlist.has(p.sku) ? 'star on' : 'star';
  const below =
    deal.pctBelowUsual && deal.pctBelowUsual > 0.02
      ? `<span class="chip-low">${pct(deal.pctBelowUsual)} below usual</span>`
      : '';
  const low = deal.lowestInWeeks
    ? `<span class="chip-low">⬇ lowest in ${deal.lowestInWeeks} wks</span>`
    : '';
  const unit = p.unitPriceLabel
    ? `<span class="unit">${p.unitPriceLabel}</span>`
    : '';
  const save = p.saveAmount
    ? `<span class="save">Save $${p.saveAmount}</span>`
    : '';
  const img = p.imageUrl
    ? `<div class="photo"><img loading="lazy" src="${p.imageUrl}" alt=""></div>`
    : '';
  const diet = (p.labels || [])
    .map((l) => `<span class="tag diet">${l}</span>`)
    .join('');
  return `<div class="card">
    ${img}${badge}
    <button class="${star}" data-sku="${p.sku}" title="Track price">★</button>
    <div class="body">
      <div class="dept">${titleCase(p.department)}</div>
      ${p.prefix ? `<div class="prefix">${p.prefix}</div>` : ''}
      <div class="name">${p.name}</div>
      <div class="price-row"><span class="price">${p.price === null ? p.priceText : money(p.price)}</span>${unit}</div>
      <div class="meta">${save} ${below} ${low}</div>
      ${p.packSize ? `<div class="prefix">${p.packSize}</div>` : ''}
      <div class="meta">${diet}</div>
    </div>
  </div>`;
}

function wireCards(root) {
  root
    .querySelectorAll('.star')
    .forEach((btn) =>
      btn.addEventListener('click', () => toggleWatch(btn.dataset.sku)),
    );
}
function toggleWatch(sku) {
  if (state.watchlist.has(sku)) state.watchlist.delete(sku);
  else state.watchlist.add(sku);
  localStorage.setItem(
    'nugget-watchlist',
    JSON.stringify([...state.watchlist]),
  );
  renderDeals();
  if (!$('#tab-watchlist').hidden) renderWatchlist();
}

// ---------- compare ----------
function renderCompare() {
  const locs = state.trends.locations;
  const items = state.trends.crossLocation.filter(
    (it) => Object.values(it.prices).filter((v) => v !== null).length >= 1,
  );
  const withSpread = items.filter((it) => it.spread > 0).length;
  $('#compare-note').textContent =
    withSpread === 0
      ? 'All three stores are running identical prices this week — no differences to report yet. Gaps will appear here when they diverge.'
      : `${withSpread} item(s) differ in price between stores this week (largest gaps first).`;

  const head = `<tr><th>Product</th><th>Dept</th>${locs
    .map((l) => `<th>${storeName(l)}</th>`)
    .join('')}<th>Spread</th></tr>`;
  const rows = items
    .slice(0, 200)
    .map((it) => {
      const cells = locs
        .map((l) => {
          const v = it.prices[l];
          const cheap = it.cheapestLocation === l && it.spread > 0;
          return `<td class="num${cheap ? ' cheapest' : ''}">${v === null ? '—' : money(v)}</td>`;
        })
        .join('');
      return `<tr><td>${it.name}</td><td class="muted">${titleCase(it.department)}</td>${cells}<td class="num">${it.spread ? money(it.spread) : '—'}</td></tr>`;
    })
    .join('');
  $('#compare-table').innerHTML = head + rows;
}

// ---------- trends ----------
function trendPointCount(ph) {
  return Object.values(ph.series).reduce(
    (n, pts) => n + pts.filter((p) => p.price !== null).length,
    0,
  );
}
function renderTrends() {
  const pick = $('#trend-pick');
  const _names = skuNameMap();
  // A trend needs a line, not a lone dot — only offer items with >1 data point.
  const trendable = state.trends.priceHistory
    .filter((ph) => trendPointCount(ph) > 1)
    .sort((a, b) => a.name.localeCompare(b.name));
  const opts = trendable
    .map((ph) => `<option value="${ph.sku}">${ph.name}</option>`)
    .join('');
  pick.innerHTML = opts;
  const single = state.manifest.weeks.length < 2;
  if (trendable.length === 0) {
    $('#trend-note').textContent = single
      ? 'Only one week on record so far — trend lines fill in as new weekly ads are captured.'
      : 'No items with more than one price observation yet — trends fill in as SKUs recur.';
    drawChart('trend', 'trend-chart', {
      type: 'line',
      data: { labels: state.trends.weeks, datasets: [] },
      options: chartOpts('$'),
    });
    return;
  }
  $('#trend-note').textContent = single
    ? 'Only one week on record so far — trend lines fill in as new weekly ads are captured.'
    : `Tracking ${state.manifest.weeks.length} weeks of prices.`;
  renderTrendChart();
}
function renderTrendChart() {
  const sku = $('#trend-pick').value;
  const ph = state.trends.priceHistory.find((p) => p.sku === sku);
  if (!ph) return;
  const weeks = state.trends.weeks;
  const palette = ['#2f7d32', '#b3541e', '#1f6feb'];
  const datasets = Object.entries(ph.series).map(([loc, pts], i) => ({
    label: storeName(loc),
    data: weeks.map((w) => {
      const found = pts.find((x) => x.week === w);
      return found ? found.price : null;
    }),
    borderColor: palette[i % palette.length],
    backgroundColor: palette[i % palette.length],
    spanGaps: true,
    tension: 0.2,
    pointRadius: 4,
  }));
  drawChart('trend', 'trend-chart', {
    type: 'line',
    data: { labels: weeks, datasets },
    options: chartOpts('$'),
  });
}

// ---------- changes ----------
function renderChanges() {
  const loc = focusStoreId();
  const wow = state.trends.weekOverWeek.find((w) => w.location === loc);
  const names = skuNameMap();
  if (!wow) {
    $('#changes-cols').innerHTML = '<p class="empty">No change data.</p>';
    return;
  }
  $('#changes-note').textContent = wow.prevWeek
    ? `Comparing week of ${wow.week} vs ${wow.prevWeek} at ${storeName(loc)}.`
    : `First week on record for ${storeName(loc)} — everything is new. Come back next week to see what changed.`;
  const col = (
    title,
    emoji,
    skus,
  ) => `<div><h4>${emoji} ${title} <span class="count-pill">${skus.length}</span></h4>
    <ul class="diff-list">${
      skus
        .slice(0, 100)
        .map((s) => `<li>${names.get(s) || s}</li>`)
        .join('') || '<li class="muted">None</li>'
    }</ul></div>`;
  $('#changes-cols').innerHTML =
    col('New this week', '🆕', wow.new) +
    col('Returning', '🔁', wow.returning) +
    col('Dropped off', '👋', wow.dropped);
}

// ---------- insights ----------
function renderInsights() {
  const loc = focusStoreId();
  const stats = state.trends.discountStats.find(
    (s) => s.location === loc && s.week === state.latest.week,
  );
  if (!stats) {
    $('#leaderboard').innerHTML = '<li class="muted">No data.</li>';
    return;
  }

  const depts = stats.byDepartment.slice(0, 12);
  drawChart('dept', 'dept-chart', {
    type: 'bar',
    data: {
      labels: depts.map((d) => titleCase(d.department)),
      datasets: [
        {
          label: 'Specials',
          data: depts.map((d) => d.count),
          backgroundColor: '#2f7d32',
        },
      ],
    },
    options: {
      ...chartOpts('', true),
      indexAxis: 'y',
      plugins: { legend: { display: false } },
    },
  });

  const saveDepts = stats.byDepartment
    .filter((d) => d.avgSave > 0)
    .sort((a, b) => b.avgSave - a.avgSave)
    .slice(0, 12);
  drawChart('save', 'save-chart', {
    type: 'bar',
    data: {
      labels: saveDepts.map((d) => titleCase(d.department)),
      datasets: [
        {
          label: 'Avg save',
          data: saveDepts.map((d) => d.avgSave),
          backgroundColor: '#b3541e',
        },
      ],
    },
    options: { ...chartOpts('$'), plugins: { legend: { display: false } } },
  });

  const _names = skuNameMap();
  $('#leaderboard').innerHTML = stats.biggestDeals
    .map(
      (d, i) =>
        `<li><span class="rank">${i + 1}</span><span class="grow">${d.name}
      <div class="muted" style="font-size:.75rem">${titleCase(d.department)}${d.dealScore ? ` · score ${d.dealScore}` : ''}</div></span>
      <span class="amt">$${d.save}</span></li>`,
    )
    .join('');
}

// ---------- watchlist ----------
function renderWatchlist() {
  const grid = $('#watchlist-grid');
  const all = new Map(currentAllProducts().map((p) => [p.sku, p]));
  const items = [...state.watchlist].map((s) => all.get(s)).filter(Boolean);
  $('#watchlist-empty').hidden = items.length > 0;
  grid.innerHTML = items.map(cardHtml).join('');
  wireCards(grid);
}

// ---------- charts ----------
function chartOpts(prefix, horizontal) {
  const grid = getComputedStyle(document.body).getPropertyValue('--border');
  const text = getComputedStyle(document.body).getPropertyValue('--muted');
  const valueAxis = horizontal ? 'x' : 'y';
  const catAxis = horizontal ? 'y' : 'x';
  const scales = {};
  scales[valueAxis] = {
    ticks: {
      color: text,
      callback: (v) => (prefix === '$' ? `$${Number(v).toFixed(2)}` : v),
    },
    grid: { color: grid },
  };
  scales[catAxis] = {
    ticks: { color: text, autoSkip: false },
    grid: { color: grid },
  };
  return {
    responsive: true,
    scales,
    plugins: { legend: { labels: { color: text } } },
  };
}
function drawChart(key, canvasId, config) {
  if (state.charts[key]) state.charts[key].destroy();
  state.charts[key] = new Chart($(`#${canvasId}`), config);
}

boot();
