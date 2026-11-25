(() => {
  'use strict';

  const { stores, markets, channels, categories, themes, statusLabels, exports, summarize, dateAt } = TeaMarket;
  const sample = stores[0];
  const storeById = new Map(stores.map(store => [store.id, store]));
  const imageIndex = { sencha: 0, matcha: 1, hojicha: 2, bundle: 3 };
  const imageFiles = ['images/tea-0.webp', 'images/tea-1.webp', 'images/tea-2.webp', 'images/tea-3.webp'];
  const imageFor = type => imageFiles[imageIndex[type]];
  const keys = { orders: 'tea-market-test-orders-v1', actions: 'tea-market-actions-v1' };
  const filters = { days: 30, market: 'all', store: 'all' };
  const $ = id => document.getElementById(id);
  const content = $('content');
  const dialog = $('dialog');
  const n = value => new Intl.NumberFormat('ja-JP').format(value);
  const money = value => `NT$${n(value)}`;
  const rate = value => `${(value * 100).toFixed(1)}%`;
  const shortDate = value => `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`;
  const latest = () => testOrders.at(-1);
  const describeOrder = row => row.lines.map(line => `${categories[line.type].name} ×${line.quantity}`).join('、');

  let cart = {};
  let cartMarket = 'TW';
  let cartChannel = 'DIRECT';
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
    return ['overview', 'insights', 'shops', 'sources', 'shopify', 'store'].includes(value) ? value : 'overview';
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

  function marketOptions(selected, withAll = true) {
    const items = Object.entries(markets).map(([key, market]) => [key, market.name]);
    return options(withAll ? [['all', 'すべての市場'], ...items] : items, selected);
  }

  function page(crumb, title, note, body, label = '架空データ') {
    return `<div class="content-wrap">
      <div class="topbar"><span>Seller Hub / ${crumb}</span><div><span class="tag gray">${label}</span><a class="button" href="#store">お茶の販売サンプル</a></div></div>
      <header class="page-head"><div><h1>${title}</h1><p class="sub">${note}</p></div></header>
      ${body}
    </div>`;
  }

  function filterBar(data) {
    return `<div class="filter-bar">
      <label>期間 <select id="filter-days">${options([[7, '直近7日'], [30, '直近30日'], [90, '直近90日']], filters.days)}</select></label>
      <label>市場 <select id="filter-market">${marketOptions(filters.market)}</select></label>
      <label>店舗 <select id="filter-store">${options([['all', `${stores.length}店舗すべて`], ...stores.map(store => [store.id, store.name])], filters.store)}</select></label>
      <span class="filter-period">${data.start} – ${data.end} · 通貨 TWD</span>
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
    const axis = value => value >= 1000 ? `${n(Math.round(value / 1000))}千` : n(value);
    return `<figure class="figure" style="--bars:${buckets.length}">
      <figcaption class="sr-only">純商品売上の1日平均。${buckets.map(bucket => `${bucket.label}から${bucket.end}、${money(bucket.value)}`).join('。')}</figcaption>
      <div class="chart-axis" aria-hidden="true">${[top, top * 2 / 3, top / 3, 0].map(value => `<span>${axis(value)}</span>`).join('')}</div>
      <div class="chart-bars" aria-hidden="true">${buckets.map(bucket => `<div class="chart-bar" style="--height:${bucket.value / top * 100}%" title="${bucket.label}–${bucket.end} ${money(bucket.value)}"></div>`).join('')}</div>
      <div class="chart-labels" aria-hidden="true">${buckets.map(bucket => `<span>${bucket.label}</span>`).join('')}</div>
    </figure>`;
  }

  function marketPanel(data) {
    const overall = data.sales || 1;
    const rows = Object.entries(data.marketStats).sort((a, b) => b[1].sales - a[1].sales);
    return `<section class="panel">
      <div class="panel-head"><div><h2>市場別売上</h2><p class="sub">対象期間の商品売上</p></div></div>
      <div class="panel-inner market-list">${rows.map(([code, stat]) =>
        `<div class="market-row"><span>${markets[code].name}</span><div class="track" aria-hidden="true"><i style="--share:${stat.sales / overall * 100}%"></i></div><strong>${money(stat.sales)}</strong></div>`
      ).join('')}</div>
    </section>`;
  }

  function rankingPanel(data) {
    return `<section class="panel">
      <div class="panel-head"><div><h2>店舗別実績</h2><p class="sub">${data.storeList.length}店舗を対象に集計</p></div><a class="button inline" href="#shops">全店舗を見る</a></div>
      <div class="table-scroll"><table><thead><tr><th scope="col">店舗</th><th scope="col" class="num">有効注文</th><th scope="col" class="num">純商品売上</th></tr></thead><tbody>
      ${data.storeList.slice(0, 5).map(({ store, count, sales }) => `<tr><td><button class="table-button" data-action="filter-shop" data-store="${store.id}">${store.name}</button><small>${store.region}</small></td><td class="num">${n(count)}</td><td class="num">${money(sales)}</td></tr>`).join('')}
      </tbody></table></div>
    </section>`;
  }

  function overview(data) {
    const lead = data.themeList[0];
    const evidence = lead.count ? themes[lead.key] : null;
    const metrics = [
      ['純商品売上', money(data.sales), '全額返金・キャンセルを除外'],
      ['有効注文', `${n(data.orders)}件`, data.testOrders ? `今回のテスト注文 ${n(data.testOrders)}件を含む` : '入金済み＋配送完了'],
      ['台湾團購からの注文', `${n(data.groupOrders)}件`, data.orders ? `有効注文の ${rate(data.groupOrders / data.orders)}` : '有効注文なし'],
      ['配送費率', data.freightRate === null ? '—' : rate(data.freightRate), '配送費 ÷ 対応する配送完了注文の商品売上']
    ];
    return page('販売分析', '日本茶の販売分析', `${stores.length}の架空ショップから取り込んだ注文・配送・レビューを比較。`, `
      ${filterBar(data)}
      <dl class="tiles">${metrics.map(([label, value, helper], i) => `<div class="tile"><dt>${label}</dt><dd id="kpi-${i}">${value}</dd><small>${helper}</small></div>`).join('')}</dl>
      <div class="grid-top">
        <section class="panel">
          <div class="panel-head"><div><h2>売上の推移</h2><p class="sub">純商品売上の1日平均 · 台湾ドル</p></div><span class="tag gray">TWD</span></div>
          <div class="panel-inner">${chart(data.daily)}</div>
        </section>
        <section class="panel insight-card">
          <div class="panel-head"><span class="tag">AI分析デモ</span></div>
          <div class="panel-inner">
            <p class="meta">レビューからの提案</p>
            <h3>${evidence ? evidence.action : 'この範囲のレビューを確認する'}</h3>
            <p class="sub">${evidence ? `対象のレビュー ${n(data.reviews)}件のうち、${n(lead.count)}件が「${evidence.name}」に言及。` : '集計条件を広げると、提案の根拠を確認できます。'}</p>
            <a class="button" href="#insights">分析と根拠を見る</a>
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
    return page('AIインサイト', '市場インサイト', '集計値から、次回の販売で検証する施策を作ります。提案はルールで生成したAI分析デモです。', `
      ${filterBar(data)}
      <div class="evidence-grid">
        <article class="evidence">
          <span class="tag">顧客の声</span>
          <h2>${theme ? theme.action : 'レビューの根拠がありません'}</h2>
          ${theme ? `
            <p>配送完了注文のレビュー ${n(data.reviews)}件のうち ${n(lead.count)}件（${rate(lead.count / data.reviews)}）が「${theme.name}」に言及。</p>
            <blockquote lang="zh-Hant">${theme.zh}<small lang="ja">訳｜${theme.ja}</small></blockquote>
            <p>次回の評価｜${theme.metric}</p>
            <div class="row-actions"><button class="button" data-action="review-evidence" data-topic="${lead.key}">根拠の注文を見る</button>
            <button class="button primary" data-action="add-experiment" data-topic="${lead.key}" ${cohortActions.some(item => item.topic === lead.key) ? 'disabled' : ''}>施策に登録する</button></div>`
            : '<p>期間や市場を広げて対象注文を変更できます。</p>'}
        </article>
        <article class="evidence">
          <span class="tag">併買</span>
          <h2>${pair ? pair.types.map(type => categories[type].name).join(' × ') : '併買データがありません'}</h2>
          <p>${pair ? `${n(pair.count)}件で同時購入。両商品を扱う店舗の有効注文 ${n(pair.eligible)}件が分母（${rate(pair.count / pair.eligible)}）。` : '2種類以上を購入した有効注文から集計します。'}</p>
          ${pair ? `<button class="button" data-action="pair-evidence" data-pair="${pair.key}">併買の注文明細を見る</button>` : ''}
        </article>
        <article class="evidence">
          <span class="tag">価格・配送費</span>
          <h2>配送込み価格を検証する</h2>
          <p>送料実績 ${money(data.freight)} · 対応する配送完了注文の商品売上 ${money(data.deliveredSales)}。商品原価と配送費を差し引くと ${money(data.deliveredBalance)}。</p>
          <p>市場・配送条件を固定し、価格を変えたときの注文件数と注文当たり利益を比較する。</p>
        </article>
        <article class="evidence">
          <span class="tag">販売経路</span>
          <h2>台湾團購と参照元を比較する</h2>
          <p>台湾團購 ${n(data.groupOrders)}件 · AI検索として記録された参照元 ${n(searchReferrals)}件。いずれも模擬の有効注文。</p>
          <p>次の募集で販促リンクを分け、注文と経路を照合する。</p>
        </article>
      </div>
      <section class="panel">
        <div class="panel-head"><div><h2>次回の施策</h2><p class="sub">現在選択している範囲の施策を表示</p></div></div>
        ${cohortActions.length ? `<div class="table-scroll"><table><thead><tr><th>施策と評価指標</th><th>状態</th><th>操作</th></tr></thead><tbody>
          ${cohortActions.map(action => `<tr><td><strong>${themes[action.topic].action}</strong><small>${themes[action.topic].metric}</small></td><td><span class="tag">${action.complete ? '実施済み' : '次回に実施'}</span></td>
          <td><button class="button inline" data-action="toggle-experiment" data-topic="${action.topic}">${action.complete ? '実施予定に戻す' : '実施済みにする'}</button></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="status-copy">顧客の声から試したい提案を選ぶと、ここで実施状況を確認できます。</p>'}
      </section>
    `);
  }

  function allShopRows(target) {
    const query = shopSearch.trim().toLocaleLowerCase('ja-JP');
    const results = stores.filter(store => `${store.name} ${store.region}`.toLocaleLowerCase('ja-JP').includes(query));
    const pageSize = 12;
    const start = shopsPage * pageSize;
    const source = joinedSources();
    target.innerHTML = `
      <div class="table-scroll"><table><thead><tr><th scope="col">店舗</th><th scope="col">産地</th><th scope="col" class="num">掲載商品</th><th scope="col" class="num">取込注文</th><th scope="col">操作</th></tr></thead><tbody>
      ${results.slice(start, start + pageSize).map(store => `<tr><td><strong>${store.name}</strong>${store.id === sample.id ? '<small>操作できる販売サンプル</small>' : ''}</td><td>${store.region}</td><td class="num">${store.products.length}</td>
        <td class="num">${n(source.find(item => item.storeId === store.id).orders.length)}件</td><td><button class="table-button" data-action="filter-shop" data-store="${store.id}">店舗を分析</button></td></tr>`).join('')
        || '<tr><td colspan="5">一致する店舗がありません。</td></tr>'}
      </tbody></table></div>
      <div class="panel-foot pagination">
        <span>${results.length ? `${start + 1}–${Math.min(start + pageSize, results.length)} / ${results.length}店舗` : '0店舗'}</span>
        <button class="button" data-action="shops-page" data-page="${shopsPage - 1}" ${shopsPage === 0 ? 'disabled' : ''}>前へ</button>
        <button class="button" data-action="shops-page" data-page="${shopsPage + 1}" ${start + pageSize >= results.length ? 'disabled' : ''}>次へ</button>
      </div>`;
  }

  function shops() {
    return page('取り込み店舗', '取り込み店舗', `${stores.length}店舗の独立した架空データ。宇治 月野茶房でテスト注文を試せます。`, `
      <section class="panel section-gap">
        <div class="panel-head"><div class="store-controls"><label for="shop-search" class="sr-only">店舗名・産地で検索</label><input id="shop-search" class="search" type="search" placeholder="店舗名・産地で検索"></div><a class="button primary" href="#store">販売サンプルを開く</a></div>
        <div id="shop-results"></div>
      </section>`);
  }

  function sources(data) {
    const shipments = data.records.filter(row => row.shipment).length;
    const latestRows = data.records.slice(0, 14);
    return page('取り込みデータ', '取り込みデータ', '店舗ごとの注文・配送・レビューの模擬データを、店舗IDと注文IDで照合。', `
      ${filterBar(data)}
      <section class="panel">
        <div class="panel-head"><div><h2>突合した注文明細</h2><p class="sub">${n(data.records.length)}注文 · 配送費 ${n(shipments)}件 · レビュー ${n(data.reviews)}件</p></div>
        <button class="button" data-action="download" ${!data.records.length ? 'disabled' : ''}>CSVをダウンロード</button></div>
        <div class="table-scroll">
          <table><thead><tr><th scope="col">注文ID・日付</th><th scope="col">店舗</th><th scope="col">市場・経路</th><th scope="col">状態</th><th scope="col" class="num">商品額</th><th scope="col" class="num">配送費</th><th scope="col">VOC</th></tr></thead><tbody>
            ${latestRows.map(({ order, value, shipment, review }) => `<tr>
              <td><strong>${order.id}</strong><small>${order.date}${order.test ? ' · テスト注文' : ''}</small></td>
              <td>${storeById.get(order.storeId).name}</td><td>${markets[order.market].name}<small>${channels[order.channel]}</small></td>
              <td><span class="tag ${order.status === 'refunded' ? 'warn' : 'gray'}">${statusLabels[order.status]}</span></td>
              <td class="num">${money(value)}</td><td class="num">${shipment ? money(shipment.freight) : '—'}</td><td>${review ? themes[review.topic].name : '—'}</td></tr>`).join('')
              || '<tr><td colspan="7">該当する注文がありません。</td></tr>'}
          </tbody></table>
        </div>
        <p class="panel-foot">最新${latestRows.length}件を表示。明細の商品額は返金・取消前の値。CSVには選択範囲の全明細を含みます。</p>
      </section>`);
  }

  function cartLines() {
    return sample.products.filter(product => cart[product.id]).map(product => ({ ...product, quantity: cart[product.id] }));
  }

  function storefront() {
    const count = cartLines().reduce((sum, line) => sum + line.quantity, 0);
    const order = latest();
    return `<div class="store-app">
      <header class="store-head"><div class="store-brand"><span class="brand-mark" aria-hidden="true">月</span>${sample.name}</div>
        <div class="store-links"><span class="tag gray">架空ショップ</span><a class="button" href="#overview">販売分析へ</a><button class="button primary" data-action="cart" id="cart-button">カート（${count}）</button></div></header>
      <section class="store-hero">
        <div class="hero-copy"><small>京都・宇治の日本茶</small><h1>毎日を彩る、<br>宇治のお茶。</h1><p>煎茶、抹茶、ほうじ茶。香りと味わいを楽しむ日本茶の販売サンプルです。</p>
          <button class="button primary" data-action="show-products">商品を見る</button></div>
        <figure class="hero-visual"><img class="hero-photo" src="${imageFor('sencha')}" alt="急須と、湯のみの煎茶"></figure>
      </section>
      <section aria-labelledby="products-title" id="products">
        <div class="panel-head"><div><h2 id="products-title" tabindex="-1">お茶を選ぶ</h2><p class="sub">デモ価格 · 台湾ドル</p></div></div>
        <div class="product-grid">
          ${sample.products.map(product => `<article class="product">
            <img src="${imageFor(product.type)}" alt="" loading="lazy" width="560" height="390">
            <div class="product-info"><h3>${product.name}</h3><p class="sub">${product.size} · ${product.description}</p><p class="price">${money(product.price)}</p>
              <button class="button" data-action="add-to-cart" data-product="${product.id}" aria-label="${product.name}をカートに入れる">カートに入れる</button></div>
          </article>`).join('')}
        </div>
      </section>
      ${order ? `<section class="receipt" aria-labelledby="receipt-title" id="receipt">
        <h2 id="receipt-title" tabindex="-1">直近のテスト注文</h2><p class="sub">${order.id} · ${markets[order.market].name} · ${channels[order.channel]} · ${statusLabels[order.status]}</p>
        <p>${describeOrder(order)}</p>
        ${order.topic ? `<p class="sub">模擬レビューを登録済み｜${themes[order.topic].name}</p>` : ''}
        <div class="row-actions">
          ${order.status === 'paid' ? '<button class="button" data-action="deliver">模擬配送とレビューを登録</button>' : ''}
          <button class="button primary" data-action="show-test-order">分析で確認する</button>
        </div>
      </section>` : ''}
    </div>`;
  }

  function render() {
    const route = activeRoute();
    $('shell').classList.toggle('commerce', route === 'store');
    for (const link of document.querySelectorAll('[data-nav]')) {
      if (link.dataset.nav === route) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }

    if (route === 'store') {
      content.innerHTML = storefront();
      document.title = `${sample.name} | 日本茶の販売サンプル`;
      return;
    }
    document.title = 'Seller Hub | 日本茶の販売分析';
    if (route === 'shopify') {
      content.innerHTML = page('Shopify取込', 'Shopifyテスト注文', '開発ストア1店の注文を読み取り、商品別・入金状態別に確認。ページを再読み込みすると取り込み結果はクリアされます。', ShopifyTestImport.render(), '開発ストア');
      ShopifyTestImport.bind(content, render);
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
    dialog.innerHTML = `<div class="panel-head"><h2 id="dialog-title">${title}</h2><form method="dialog"><button class="button" type="submit">閉じる</button></form></div><div class="dialog-body">${body}</div>`;
    if (!dialog.open) dialog.showModal();
  }

  function drawCart() {
    const lines = cartLines();
    const total = lines.reduce((sum, line) => sum + line.quantity * line.price, 0);
    const channelControl = cartMarket === 'TW'
      ? `<label>注文経路 <select id="cart-channel">${options([['DIRECT', channels.DIRECT], ['GROUP', channels.GROUP]], cartChannel)}</select></label>` : '';
    openDialog('お茶のカート', lines.length ? `
      ${lines.map(line => `<div class="cart-line"><strong>${line.name}</strong><div class="qty">
        <button class="button" data-action="cart-change" data-product="${line.id}" data-change="-1" aria-label="${line.name}を1点減らす">−</button><span>${line.quantity}</span>
        <button class="button" data-action="cart-change" data-product="${line.id}" data-change="1" aria-label="${line.name}を1点増やす" ${line.quantity >= 8 ? 'disabled' : ''}>+</button></div>
        <span>${money(line.price * line.quantity)}</span></div>`).join('')}
      <div class="filter-bar"><label>配送先 <select id="cart-market">${marketOptions(cartMarket, false)}</select></label>${channelControl}</div>
      <p class="cart-totals">商品小計 <strong>${money(total)}</strong></p>
      <div class="cart-actions"><p class="meta">模擬決済。個人情報や支払いは不要です。</p><button class="button primary" data-action="checkout">テスト注文を確定</button></div>`
      : '<p class="status-copy">カートは空です。商品を選んで追加してください。</p>');
  }

  function showEvidence(title, rows, extra = '') {
    openDialog(title, `<p class="sub">対象 ${n(rows.length)}件から、最近の ${Math.min(8, rows.length)}件を表示。</p>
      <div class="table-scroll"><table><thead><tr><th scope="col">注文</th><th scope="col">店舗</th><th scope="col">市場</th><th scope="col">商品</th></tr></thead><tbody>
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

  function recordOrder() {
    const lines = cartLines();
    if (!lines.length) return;
    const key = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    testOrders.push({
      id: 'test-' + key.slice(0, 10), storeId: sample.id, date: dateAt(0), market: cartMarket,
      channel: cartMarket === 'TW' ? cartChannel : 'DIRECT', status: 'paid', test: true, topic: null,
      lines: lines.map(line => ({ productId: line.id, type: line.type, quantity: line.quantity, unitPrice: line.price, unitCost: line.cost }))
    });
    save(keys.orders, testOrders);
    cart = {};
    dialog.close();
    render();
    $('receipt-title').focus();
    toast('テスト注文を記録しました。');
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
    else if (id === 'cart-market') {
      cartMarket = value;
      if (value !== 'TW') cartChannel = 'DIRECT';
      drawCart();
      $(id).focus();
      return;
    } else if (id === 'cart-channel') {
      cartChannel = value;
      return;
    } else return;
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
    const { action, product, topic, store, pair } = button.dataset;

    switch (action) {
      case 'filter-shop':
        viewStoreAnalytics(store);
        break;
      case 'shops-page': {
        shopsPage = Number(button.dataset.page);
        const delta = button.textContent.trim() === '次へ' ? 1 : -1;
        allShopRows($('shop-results'));
        const sameDirection = $('shop-results').querySelector(`[data-page="${shopsPage + delta}"]:not([disabled])`);
        (sameDirection ?? $('shop-search')).focus();
        break;
      }
      case 'show-products':
        $('products-title').focus();
        break;
      case 'add-to-cart': {
        const quantity = cart[product] || 0;
        if (quantity >= 8) {
          toast('1商品の注文上限は8点です。');
          break;
        }
        cart[product] = quantity + 1;
        $('cart-button').textContent = `カート（${cartLines().reduce((sum, line) => sum + line.quantity, 0)}）`;
        toast(`${sample.products.find(item => item.id === product).name}を追加しました。`);
        break;
      }
      case 'cart':
        drawCart();
        break;
      case 'cart-change': {
        cart[product] = Math.max(0, Math.min(8, cart[product] + Number(button.dataset.change)));
        $('cart-button').textContent = `カート（${cartLines().reduce((sum, line) => sum + line.quantity, 0)}）`;
        drawCart();
        (dialog.querySelector(`[data-product="${product}"][data-change="${button.dataset.change}"]:not([disabled])`) ?? dialog.querySelector('form button')).focus();
        break;
      }
      case 'checkout':
        recordOrder();
        break;
      case 'deliver':
        openDialog('模擬配送とレビュー', `<p class="sub">配送完了と実績配送費を記録し、選択した架空レビューを取り込みます。</p>
          <div class="filter-bar"><label>レビューのテーマ <select id="delivery-topic">${options(Object.entries(themes).map(([key, item]) => [key, item.name]), 'brewing')}</select></label></div>
          <button class="button primary" data-action="confirm-delivery">配送完了とレビューを登録</button>`);
        break;
      case 'confirm-delivery': {
        const order = latest();
        if (!order || order.status !== 'paid') break;
        order.status = 'delivered';
        order.topic = $('delivery-topic').value;
        save(keys.orders, testOrders);
        dialog.close();
        render();
        $('receipt-title').focus();
        toast('配送費とレビューを分析データに反映しました。');
        break;
      }
      case 'show-test-order':
        filters.market = latest().market;
        viewStoreAnalytics(sample.id);
        break;
      case 'review-evidence': {
        const target = themes[topic];
        showEvidence(`${target.name}の根拠`, allScoped().records.filter(row => row.order.status === 'delivered' && row.review?.topic === topic),
          `<p class="sub" lang="zh-Hant">${target.zh}</p>`);
        break;
      }
      case 'pair-evidence': {
        const types = pair.split('|');
        showEvidence('併買の根拠', allScoped().records.filter(({ order }) => (
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
          toast('次回の施策に登録しました。');
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
