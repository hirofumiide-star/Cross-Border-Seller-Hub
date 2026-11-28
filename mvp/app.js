(() => {
  'use strict';

  const { stores, markets, channels, categories, themes, statusLabels, exports, summarize, dateAt } = TeaMarket;
  const sample = stores[0];
  const storeById = new Map(stores.map(store => [store.id, store]));
  const shopifyStorefront = 'https://uji-tsukino-sabo-demo.myshopify.com/';
  const keys = { orders: 'tea-market-test-orders-v1', actions: 'tea-market-actions-v1' };
  const filters = { days: 30, market: 'all', store: 'all' };
  const $ = id => document.getElementById(id);
  const content = $('content');
  const dialog = $('dialog');
  const numberFormat = new Intl.NumberFormat('en-US');
  const n = value => numberFormat.format(value);
  const money = value => `NT$${n(value)}`;
  const rate = value => `${(value * 100).toFixed(1)}%`;
  const shortDate = value => `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`;
  const describeOrder = row => row.lines.map(line => `${categories[line.type].name} ×${line.quantity}`).join(', ');

  let shopSearch = '';
  let shopsPage = 0;
  let toastTimer;

  function read(key) {
    try {
      const data = JSON.parse(localStorage.getItem(key));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function save(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      // Keep the current browser session functional when storage is unavailable.
    }
  }

  const testOrders = read(keys.orders).filter(order => (
    order && typeof order.id === 'string' && /^test-[a-z0-9-]{1,60}$/.test(order.id)
    && Object.hasOwn(markets, order.market)
    && Array.isArray(order.lines) && order.lines.length > 0
    && order.lines.every(line => line && sample.products.some(product => product.id === line.productId)
      && Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 8)
  )).map(order => ({
    id: order.id, storeId: sample.id, date: dateAt(0), market: order.market,
    channel: order.market === 'TW' && order.channel === 'GROUP' ? 'GROUP' : 'DIRECT',
    status: order.status === 'delivered' ? 'delivered' : 'paid', test: true,
    topic: Object.hasOwn(themes, order.topic) ? order.topic : null,
    lines: order.lines.map(line => {
      const product = sample.products.find(item => item.id === line.productId);
      return { productId: product.id, type: product.type, quantity: line.quantity, unitPrice: product.price, unitCost: product.cost };
    })
  }));

  const actions = read(keys.actions).filter(action => action && Object.hasOwn(themes, action.topic)
    && typeof action.scope === 'string' && /^[0-9]+\|[A-Za-z]+\|[a-z0-9-]+$/.test(action.scope))
    .map(action => ({ topic: action.topic, scope: action.scope, complete: action.complete === true }));

  function joinedSources() {
    const demo = exports[0];
    return [
      {
        ...demo,
        orders: [...demo.orders, ...testOrders],
        shipments: [...demo.shipments, ...testOrders.filter(order => order.status === 'delivered').map(order => ({
          orderId: order.id, freight: markets[order.market].freight + order.lines.reduce((sum, line) => sum + line.quantity * 13, 0)
        }))],
        reviews: [...demo.reviews, ...testOrders.filter(order => order.status === 'delivered' && order.topic).map(order => ({
          orderId: order.id, topic: order.topic
        }))]
      },
      ...exports.slice(1)
    ];
  }

  function activeRoute() {
    const value = location.hash.slice(1);
    return ['overview', 'insights', 'shops', 'sources', 'shopify', 'fulfillment', 'broker', 'store'].includes(value) ? value : 'overview';
  }

  function toast(message) {
    const box = $('toast');
    box.textContent = message;
    box.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { box.hidden = true; }, 3200);
  }

  function options(items, selected) {
    return items.map(([value, label]) =>
      `<option value="${value}"${String(value) === String(selected) ? ' selected' : ''}>${label}</option>`
    ).join('');
  }

  function marketOptions(selected) {
    const items = Object.entries(markets).map(([key, market]) => [key, market.name]);
    return options([['all', 'All markets'], ...items], selected);
  }

  function page(crumb, title, note, body, label = 'Sample data') {
    document.title = `Seller Hub | ${title}`;
    return `<div class="content-wrap">
      <div class="topbar"><span>Seller Hub / ${crumb}</span><div><span class="tag gray">${label}</span><a class="button" href="${shopifyStorefront}">Open Shopify demo store</a></div></div>
      <header class="page-head"><div><h1>${title}</h1><p class="sub">${note}</p></div></header>
      ${body}
    </div>`;
  }

  function filterBar(data) {
    return `<div class="filter-bar">
      <label>Period <select id="filter-days">${options([[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']], filters.days)}</select></label>
      <label>Market <select id="filter-market">${marketOptions(filters.market)}</select></label>
      <label>Store <select id="filter-store">${options([['all', `All ${stores.length} stores`], ...stores.map(store => [store.id, store.name])], filters.store)}</select></label>
      <span class="filter-period">${data.start} – ${data.end} · TWD</span>
    </div>`;
  }

  function chart(daily) {
    const days = [...daily.entries()];
    const width = Math.ceil(days.length / 9);
    const buckets = [];
    for (let offset = 0; offset < days.length; offset += width) {
      const segment = days.slice(offset, offset + width);
      buckets.push({
        label: shortDate(segment[0][0]),
        end: shortDate(segment.at(-1)[0]),
        value: Math.round(segment.reduce((sum, [, value]) => sum + value, 0) / segment.length)
      });
    }
    const size = Math.max(1, ...buckets.map(bucket => bucket.value));
    const step = Math.max(1, 10 ** (Math.floor(Math.log10(size)) - 1));
    const top = Math.ceil(size / (3 * step)) * 3 * step;
    const axis = value => value >= 1000 ? `${n(Math.round(value / 1000))}k` : n(value);
    return `<figure class="figure" style="--bars:${buckets.length}">
      <figcaption class="sr-only">Average daily net product sales. ${buckets.map(bucket => `${bucket.label} through ${bucket.end}, ${money(bucket.value)}`).join('. ')}.</figcaption>
      <div class="chart-axis" aria-hidden="true">${[top, top * 2 / 3, top / 3, 0].map(value => `<span>${axis(value)}</span>`).join('')}</div>
      <div class="chart-bars" aria-hidden="true">${buckets.map(bucket => `<div class="chart-bar" style="--height:${bucket.value / top * 100}%" title="${bucket.label}–${bucket.end} ${money(bucket.value)}"></div>`).join('')}</div>
      <div class="chart-labels" aria-hidden="true">${buckets.map(bucket => `<span>${bucket.label}</span>`).join('')}</div>
    </figure>`;
  }

  function marketPanel(data) {
    const overall = data.sales || 1;
    const rows = Object.entries(data.marketStats).sort((a, b) => b[1].sales - a[1].sales);
    return `<section class="panel">
      <div class="panel-head"><div><h2>Sales by market</h2><p class="sub">Product sales for the selected period</p></div></div>
      <div class="panel-inner market-list">${rows.map(([code, stat]) =>
        `<div class="market-row"><span>${markets[code].name}</span><div class="track" aria-hidden="true"><i style="--share:${stat.sales / overall * 100}%"></i></div><strong>${money(stat.sales)}</strong></div>`
      ).join('')}</div>
    </section>`;
  }

  function rankingPanel(data) {
    return `<section class="panel">
      <div class="panel-head"><div><h2>Store performance</h2><p class="sub">${data.storeList.length} ${data.storeList.length === 1 ? 'store' : 'stores'} in scope</p></div><a class="button inline" href="#shops">View all stores</a></div>
      <div class="table-scroll"><table><thead><tr><th scope="col">Store</th><th scope="col" class="num">Valid orders</th><th scope="col" class="num">Net product sales</th></tr></thead><tbody>
      ${data.storeList.slice(0, 5).map(({ store, count, sales }) => `<tr><td><button class="table-button" data-action="filter-shop" data-store="${store.id}">${store.name}</button><small>${store.region}</small></td><td class="num">${n(count)}</td><td class="num">${money(sales)}</td></tr>`).join('')}
      </tbody></table></div>
    </section>`;
  }

  function overview(data) {
    const lead = data.themeList[0];
    const evidence = lead.count ? themes[lead.key] : null;
    const metrics = [
      ['Net product sales', money(data.sales), 'Excludes fully refunded and canceled orders'],
      ['Valid orders', n(data.orders), data.testOrders ? `Includes ${n(data.testOrders)} saved demo ${data.testOrders === 1 ? 'order' : 'orders'}` : 'Paid or delivered orders'],
      ['Taiwan group-buy orders', n(data.groupOrders), data.orders ? `${rate(data.groupOrders / data.orders)} of valid orders` : 'No valid orders'],
      ['Freight-to-sales ratio', data.freightRate === null ? '—' : rate(data.freightRate), 'Freight divided by product sales for the corresponding delivered orders']
    ];
    return page('Sales analytics', 'Japanese Tea Sales Analytics', `Compare orders, shipments, and reviews across ${stores.length} fictional stores.`, `
      ${filterBar(data)}
      <dl class="tiles">${metrics.map(([label, value, helper], i) => `<div class="tile"><dt>${label}</dt><dd id="kpi-${i}">${value}</dd><small>${helper}</small></div>`).join('')}</dl>
      <div class="grid-top">
        <section class="panel">
          <div class="panel-head"><div><h2>Sales trend</h2><p class="sub">Average daily net product sales</p></div><span class="tag gray">TWD</span></div>
          <div class="panel-inner">${chart(data.daily)}</div>
        </section>
        <section class="panel insight-card">
          <div class="panel-head"><span class="tag">AI insights demo</span></div>
          <div class="panel-inner">
            <p class="meta">Recommendation from customer reviews</p>
            <h3>${evidence ? evidence.action : 'No reviews in this selection'}</h3>
            <p class="sub">${evidence ? `${n(lead.count)} of ${n(data.reviews)} reviews mention “${evidence.name}.”` : 'Try a wider date range or market.'}</p>
            <a class="button" href="#insights">View insights and evidence</a>
          </div>
        </section>
      </div>
      <div class="grid-more">${marketPanel(data)}${rankingPanel(data)}</div>
    `);
  }

  function scopeKey() {
    return `${filters.days}|${filters.market}|${filters.store}`;
  }

  function insights(data) {
    const lead = data.themeList[0];
    const theme = lead.count ? themes[lead.key] : null;
    const pair = data.pairList[0];
    const cohortActions = actions.filter(action => action.scope === scopeKey());
    const searchReferrals = data.channelStats.AI.count;
    return page('AI insights', 'Market Insights', 'Explore ideas for the next sales experiment. This demo uses rules and sample data to generate recommendations.', `
      ${filterBar(data)}
      <div class="evidence-grid">
        <article class="evidence">
          <span class="tag">Customer feedback</span>
          <h2>${theme ? theme.action : 'No reviews in this selection'}</h2>
          ${theme ? `
            <p>${n(lead.count)} of ${n(data.reviews)} reviews from delivered orders (${rate(lead.count / data.reviews)}) mention “${theme.name}.”</p>
            <blockquote>${theme.en}<small>Translated from Traditional Chinese</small></blockquote>
            <p>Measure next time · ${theme.metric}</p>
            <div class="row-actions"><button class="button" data-action="review-evidence" data-topic="${lead.key}">View supporting orders</button>
            <button class="button primary" data-action="add-experiment" data-topic="${lead.key}" ${cohortActions.some(item => item.topic === lead.key) ? 'disabled' : ''}>Save experiment</button></div>`
            : '<p>Try a wider date range or market to see more orders.</p>'}
        </article>
        <article class="evidence">
          <span class="tag">Bought together</span>
          <h2>${pair ? pair.types.map(type => categories[type].name).join(' × ') : 'No product pairs in this selection'}</h2>
          <p>${pair ? `Bought together in ${n(pair.count)} of ${n(pair.eligible)} valid orders (${rate(pair.count / pair.eligible)}) at stores that sell both products.` : 'This metric uses valid orders with at least two product types.'}</p>
          ${pair ? `<button class="button" data-action="pair-evidence" data-pair="${pair.key}">View orders with both products</button>` : ''}
        </article>
        <article class="evidence">
          <span class="tag">Pricing and freight</span>
          <h2>Test a price that includes shipping</h2>
          <p>Freight totaled ${money(data.freight)} on ${money(data.deliveredSales)} in delivered product sales. ${money(data.deliveredBalance)} remained after product and freight costs.</p>
          <p>Compare order volume and profit per order at different prices in the same market and under the same shipping terms.</p>
        </article>
        <article class="evidence">
          <span class="tag">Sales channels</span>
          <h2>Compare Taiwan group buys and AI search referrals</h2>
          <p>Among valid demo orders, ${n(data.groupOrders)} came from Taiwan group buys and ${n(searchReferrals)} were attributed to AI search.</p>
          <p>Use a separate campaign link for each channel to verify the source of new orders.</p>
        </article>
      </div>
      <section class="panel">
        <div class="panel-head"><div><h2>Saved experiments</h2><p class="sub">Experiments for the current selection</p></div></div>
        ${cohortActions.length ? `<div class="table-scroll"><table><thead><tr><th>Experiment and metric</th><th>Status</th><th>Action</th></tr></thead><tbody>
          ${cohortActions.map(action => `<tr><td><strong>${themes[action.topic].action}</strong><small>${themes[action.topic].metric}</small></td><td><span class="tag">${action.complete ? 'Completed' : 'Planned'}</span></td>
          <td><button class="button inline" data-action="toggle-experiment" data-topic="${action.topic}">${action.complete ? 'Mark as planned' : 'Mark complete'}</button></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="status-copy">Save a recommendation from customer feedback to track it here.</p>'}
      </section>
    `);
  }

  function allShopRows(target) {
    const query = shopSearch.trim().toLowerCase();
    const results = stores.filter(store => `${store.name} ${store.region}`.toLowerCase().includes(query));
    const pageSize = 12;
    const start = shopsPage * pageSize;
    const source = joinedSources();
    target.innerHTML = `
      <div class="table-scroll"><table><thead><tr><th scope="col">Store</th><th scope="col">Region</th><th scope="col" class="num">Products listed</th><th scope="col" class="num">Imported orders</th><th scope="col">Action</th></tr></thead><tbody>
      ${results.slice(start, start + pageSize).map(store => `<tr><td><strong>${store.name}</strong>${store.id === sample.id ? '<small>Sample analytics for the Shopify demo store</small>' : ''}</td><td>${store.region}</td><td class="num">${store.products.length}</td>
        <td class="num">${n(source.find(item => item.storeId === store.id).orders.length)}</td><td><button class="table-button" data-action="filter-shop" data-store="${store.id}">View analytics</button></td></tr>`).join('')
        || '<tr><td colspan="5">No stores match your search.</td></tr>'}
      </tbody></table></div>
      <div class="panel-foot pagination">
        <span>${results.length ? `${start + 1}–${Math.min(start + pageSize, results.length)} of ${results.length}` : '0 stores'}</span>
        <button class="button" data-action="shops-page" data-page="${shopsPage - 1}" ${shopsPage === 0 ? 'disabled' : ''}>Previous</button>
        <button class="button" data-action="shops-page" data-page="${shopsPage + 1}" ${start + pageSize >= results.length ? 'disabled' : ''}>Next</button>
      </div>`;
  }

  function shops() {
    return page('Connected stores', 'Connected Stores', `Browse ${stores.length} stores with sample data or open the Uji Tsukino Tea House demo on Shopify.`, `
      <section class="panel section-gap">
        <div class="panel-head"><div class="store-controls"><label for="shop-search" class="sr-only">Search by store name or region</label><input id="shop-search" class="search" type="search" placeholder="Search stores or regions"></div><a class="button primary" href="${shopifyStorefront}">Open Shopify demo store</a></div>
        <div id="shop-results"></div>
      </section>`);
  }

  function sources(data) {
    const shipments = data.records.filter(row => row.shipment).length;
    const latestRows = data.records.slice(0, 14);
    return page('Data sources', 'Data Sources', 'Explore sample orders, shipments, and reviews matched by store ID and order ID.', `
      ${filterBar(data)}
      <section class="panel">
        <div class="panel-head"><div><h2>Matched order records</h2><p class="sub">${n(data.records.length)} orders · ${n(shipments)} freight records · ${n(data.reviews)} reviews</p></div>
        <button class="button" data-action="download" ${!data.records.length ? 'disabled' : ''}>Download CSV</button></div>
        <div class="table-scroll">
          <table><thead><tr><th scope="col">Order ID and date</th><th scope="col">Store</th><th scope="col">Market and channel</th><th scope="col">Status</th><th scope="col" class="num">Product amount</th><th scope="col" class="num">Freight</th><th scope="col">Review topic</th></tr></thead><tbody>
            ${latestRows.map(({ order, value, shipment, review }) => `<tr>
              <td><strong>${order.id}</strong><small>${order.date}${order.test ? ' · Test order' : ''}</small></td>
              <td>${storeById.get(order.storeId).name}</td><td>${markets[order.market].name}<small>${channels[order.channel]}</small></td>
              <td><span class="tag ${order.status === 'refunded' ? 'warn' : 'gray'}">${statusLabels[order.status]}</span></td>
              <td class="num">${money(value)}</td><td class="num">${shipment ? money(shipment.freight) : '—'}</td><td>${review ? themes[review.topic].name : '—'}</td></tr>`).join('')
              || '<tr><td colspan="7">No orders match these filters.</td></tr>'}
          </tbody></table>
        </div>
        <p class="panel-foot">Showing the latest ${latestRows.length} records. Product amounts are before refunds and cancellations. The CSV includes all records in the selection.</p>
      </section>`);
  }

  function render() {
    const route = activeRoute();
    for (const link of document.querySelectorAll('[data-nav]')) {
      if (link.dataset.nav === route) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }

    if (route === 'store') {
      content.innerHTML = page('Shopify', 'Uji Tsukino Tea House', 'Opening the Shopify development store.', '');
      location.replace(shopifyStorefront);
      return;
    }
    if (route === 'broker') {
      content.innerHTML = page('Taiwan group buy', 'Customs Broker Portal', 'Review the shipment, prepare customs documents, and track the case through clearance and local delivery.', BrokerDemo.render(), 'Demo case');
      BrokerDemo.bind(content, render, toast, openDialog);
      return;
    }
    if (route === 'shopify') {
      content.innerHTML = page('Shopify import', 'Shopify Test Orders', 'Review test orders from one development store by product and payment status. Reloading the page clears the import.', ShopifyTestImport.render(), 'Development store');
      ShopifyTestImport.bind(content, render);
      return;
    }
    if (route === 'fulfillment') {
      content.innerHTML = page('Fulfillment', 'Test Order Fulfillment', 'Review orders, shipment requests, and dispatch results. Reports identify sample data and OPENLOGI demo API results.', FulfillmentDemoImport.render(), 'Fulfillment demo');
      FulfillmentDemoImport.bind(content, render);
      return;
    }
    if (route === 'shops') {
      content.innerHTML = shops();
      $('shop-search').value = shopSearch;
      allShopRows($('shop-results'));
      return;
    }
    const data = summarize(joinedSources(), filters);
    content.innerHTML = (route === 'insights' ? insights : route === 'sources' ? sources : overview)(data);
  }

  function openDialog(title, body) {
    dialog.innerHTML = `<div class="panel-head"><h2 id="dialog-title">${title}</h2><form method="dialog"><button class="button" type="submit">Close</button></form></div><div class="dialog-body">${body}</div>`;
    if (!dialog.open) dialog.showModal();
  }

  function showEvidence(title, rows, extra = '') {
    openDialog(title, `<p class="sub">Showing the latest ${Math.min(8, rows.length)} of ${n(rows.length)} matching orders.</p>
      <div class="table-scroll"><table><thead><tr><th scope="col">Order</th><th scope="col">Store</th><th scope="col">Market</th><th scope="col">Products</th></tr></thead><tbody>
      ${rows.slice(0, 8).map(({ order }) => `<tr><td>${order.date}<small>${order.id}</small></td><td>${storeById.get(order.storeId).name}</td><td>${markets[order.market].name}</td><td>${describeOrder(order)}</td></tr>`).join('')}
      </tbody></table></div>${extra}`);
  }

  function allScoped() {
    return summarize(joinedSources(), filters);
  }

  function downloadRows() {
    const headers = ['order_id','store_id','store_name','date','market','channel','status','product_sales_before_refund_twd','product_cost_twd','freight_twd','review_topic','test'];
    const rows = allScoped().records.map(({ order, value, cost, shipment, review }) => [
      order.id, order.storeId, storeById.get(order.storeId).name, order.date, order.market, order.channel, order.status, value, cost,
      shipment?.freight ?? '', review?.topic ?? '', order.test ? 'yes' : 'no'
    ]);
    const csv = [headers, ...rows].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'seller-hub-demo-orders.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function viewStoreAnalytics(id) {
    if (!storeById.has(id)) return;
    filters.store = id;
    if (activeRoute() === 'overview') {
      render();
      $('filter-store').focus();
    } else location.hash = 'overview';
  }

  document.addEventListener('change', event => {
    const id = event.target.id;
    const value = event.target.value;
    if (id === 'filter-days') filters.days = Number(value);
    else if (id === 'filter-market') filters.market = value;
    else if (id === 'filter-store') filters.store = value;
    else return;
    render();
    $(id).focus();
  });

  content.addEventListener('input', event => {
    if (event.target.id !== 'shop-search') return;
    shopSearch = event.target.value;
    shopsPage = 0;
    allShopRows($('shop-results'));
  });

  document.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    const { action, topic, store, pair } = button.dataset;

    switch (action) {
      case 'filter-shop':
        viewStoreAnalytics(store);
        break;
      case 'shops-page': {
        const selectedPage = Number(button.dataset.page);
        const delta = Math.sign(selectedPage - shopsPage);
        shopsPage = selectedPage;
        allShopRows($('shop-results'));
        const sameDirection = $('shop-results').querySelector(`[data-page="${shopsPage + delta}"]:not([disabled])`);
        (sameDirection ?? $('shop-search')).focus();
        break;
      }
      case 'review-evidence': {
        const target = themes[topic];
        showEvidence(target.name, allScoped().records.filter(row => row.order.status === 'delivered' && row.review?.topic === topic),
          `<p class="sub">${target.en}</p>`);
        break;
      }
      case 'pair-evidence': {
        const types = pair.split('|');
        showEvidence('Orders with both products', allScoped().records.filter(({ order }) => (
          (order.status === 'delivered' || order.status === 'paid')
          && types.every(type => order.lines.some(line => line.type === type))
        )));
        break;
      }
      case 'add-experiment':
        if (!actions.some(item => item.topic === topic && item.scope === scopeKey())) {
          actions.push({ topic, scope: scopeKey(), complete: false });
          save(keys.actions, actions);
          render();
          content.querySelector('[data-action="toggle-experiment"]')?.focus();
          toast('Experiment saved.');
        }
        break;
      case 'toggle-experiment': {
        const item = actions.find(value => value.topic === topic && value.scope === scopeKey());
        if (!item) break;
        item.complete = !item.complete;
        save(keys.actions, actions);
        render();
        content.querySelector(`[data-action="toggle-experiment"][data-topic="${topic}"]`)?.focus();
        break;
      }
      case 'download':
        downloadRows();
        break;
    }
  });

  document.querySelector('.skip').addEventListener('click', event => {
    event.preventDefault();
    content.focus();
  });
  window.addEventListener('hashchange', () => {
    if (dialog.open) dialog.close();
    render();
    content.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  });

  $('shop-count').textContent = stores.length;
  render();
})();
