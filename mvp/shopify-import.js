(() => {
  'use strict';

  const formatNumber = value => new Intl.NumberFormat('ja-JP').format(value);
  const formatMoney = (currency, value) => new Intl.NumberFormat('ja-JP', {
    style: 'currency', currency, currencyDisplay: 'code'
  }).format(value);
  const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const escape = value => value.replace(/[&<>"']/g, character => escapeMap[character]);
  const storePattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.myshopify\.com$/;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const amountPattern = /^\d{1,12}(?:\.\d{1,6})?$/;
  const states = {
    PAID: '入金済み', AUTHORIZED: '承認済み', PENDING: '保留中', REFUNDED: '返金済み',
    PARTIALLY_REFUNDED: '一部返金', PARTIALLY_PAID: '一部入金', VOIDED: '無効',
    FULFILLED: 'フルフィルメント済み', UNFULFILLED: '未処理', PARTIALLY_FULFILLED: '一部処理済み',
    IN_PROGRESS: '処理中', ON_HOLD: '保留', UNKNOWN: '不明'
  };
  const fixture = {
    schemaVersion: 1, source: 'shopify-dev-test-orders', store: 'tea-sandbox-sample.myshopify.com',
    exportedAt: '2026-11-25T09:00:00.000Z', from: '2026-10-26', orders: [
      { id: 'SHOP-00000000000001', date: '2026-11-24', test: true, cancelled: false,
        payment: 'PAID', fulfillment: 'FULFILLED', currency: 'JPY', subtotal: '3800',
        lines: [{ title: '宇治煎茶', quantity: 2 }, { title: 'ほうじ茶', quantity: 1 }] },
      { id: 'SHOP-00000000000002', date: '2026-11-25', test: true, cancelled: false,
        payment: 'PAID', fulfillment: 'UNFULFILLED', currency: 'JPY', subtotal: '2400',
        lines: [{ title: '宇治煎茶', quantity: 2 }] },
      { id: 'SHOP-00000000000003', date: '2026-11-25', test: true, cancelled: true,
        payment: 'REFUNDED', fulfillment: 'UNFULFILLED', currency: 'JPY', subtotal: '1200',
        lines: [{ title: '宇治煎茶', quantity: 1 }] }
    ]
  };
  let report = null;
  let isSample = false;
  let error = '';
  let loadSequence = 0;

  function validate(input) {
    if (input?.schemaVersion !== 1 || input.source !== 'shopify-dev-test-orders'
      || typeof input.store !== 'string' || !storePattern.test(input.store) || input.store.length > 125
      || typeof input.from !== 'string' || !datePattern.test(input.from)
      || typeof input.exportedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(input.exportedAt)
      || !Number.isFinite(Date.parse(input.exportedAt)) || !Array.isArray(input.orders)
      || input.orders.length > 1000) {
      throw new Error('Shopifyテスト注文のエクスポート形式と一致しません。');
    }

    const identifiers = new Set();
    for (const order of input.orders) {
      if (order?.test !== true || typeof order.id !== 'string' || !/^SHOP-[a-f0-9]{14}$/.test(order.id)
        || identifiers.has(order.id) || typeof order.cancelled !== 'boolean'
        || typeof order.date !== 'string' || !datePattern.test(order.date)
        || order.date < input.from || order.date > input.exportedAt.slice(0, 10)
        || typeof order.payment !== 'string' || !/^[A-Z_]{1,40}$/.test(order.payment)
        || typeof order.fulfillment !== 'string' || !/^[A-Z_]{1,40}$/.test(order.fulfillment)
        || typeof order.currency !== 'string' || !/^[A-Z]{3}$/.test(order.currency)
        || typeof order.subtotal !== 'string' || !amountPattern.test(order.subtotal)
        || !Array.isArray(order.lines) || order.lines.length > 300
        || order.lines.some(line => typeof line?.title !== 'string' || !line.title || line.title.length > 100
          || !Number.isSafeInteger(line.quantity) || line.quantity <= 0)) {
        throw new Error('テスト注文のID・ステータス・商品明細に不正なデータがあります。');
      }
      identifiers.add(order.id);
    }
    return input;
  }

  function summarize(orders) {
    const paid = orders.filter(order => !order.cancelled && order.payment === 'PAID');
    const byCurrency = new Map();
    const counts = new Map();
    for (const order of paid) {
      byCurrency.set(order.currency, (byCurrency.get(order.currency) || 0) + Number(order.subtotal));
      for (const { title, quantity } of order.lines) counts.set(title, (counts.get(title) || 0) + quantity);
    }
    return {
      paid, byCurrency,
      fulfilled: paid.filter(order => order.fulfillment === 'FULFILLED').length,
      products: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
    };
  }

  const status = key => states[key] && Object.hasOwn(states, key) ? states[key] : key;

  function results() {
    if (!report) return '';
    const { orders, store, from, exportedAt } = report;
    const stats = summarize(orders);
    const amounts = [...stats.byCurrency].map(([currency, total]) => formatMoney(currency, total)).join(' / ') || '—';
    const top = stats.products[0];
    const latest = [...orders].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
    return `<section class="panel section-gap">
      <div class="panel-head"><div><h2>${escape(store)}</h2><p class="sub">${from} – ${exportedAt.slice(0, 10)} · ${isSample ? '架空のサンプル' : 'Shopifyテスト注文の取込結果'} · 日付はUTC</p></div>
      <button type="button" class="button" data-shopify-action="clear">取り込みをクリア</button></div>
      <div class="panel-inner">
        <dl class="tiles">
          <div class="tile"><dt>取込注文</dt><dd>${formatNumber(orders.length)}件</dd></div>
          <div class="tile"><dt>入金済み</dt><dd>${formatNumber(stats.paid.length)}件</dd></div>
          <div class="tile"><dt>処理済み（入金済み内）</dt><dd>${formatNumber(stats.fulfilled)}件</dd></div>
          <div class="tile"><dt>入金済みの商品小計</dt><dd>${amounts}</dd></div>
        </dl>
        ${top ? `<p class="sub"><strong>商品分析</strong>　${escape(top[0])}が入金済み${formatNumber(stats.paid.length)}件の中で${formatNumber(top[1])}点。最も注文された商品から、次の販売テスト候補を選べます。</p>` : '<p class="sub">この範囲の入金済み商品がありません。</p>'}
      </div>
      <div class="table-scroll"><table><thead><tr><th scope="col">日付・注文ID</th><th scope="col">商品</th><th scope="col">入金</th><th scope="col">処理</th><th class="num" scope="col">商品小計</th></tr></thead><tbody>
        ${latest.map(order => `<tr><td>${order.date}<small>${order.id}</small></td><td>${order.lines.map(line => `${escape(line.title)} ×${formatNumber(line.quantity)}`).join('、') || '—'}</td>
          <td>${order.cancelled ? 'キャンセル' : status(order.payment)}</td><td>${status(order.fulfillment)}</td><td class="num">${formatMoney(order.currency, Number(order.subtotal))}</td></tr>`).join('') || '<tr><td colspan="5">この期間にテスト注文はありません。</td></tr>'}
      </tbody></table></div>
      <p class="panel-foot">最新${latest.length}件。小計の集計は、キャンセルされていない入金済み注文のみ。通貨はShopifyのストア通貨。</p>
    </section>`;
  }

  function render() {
    return `<section class="panel section-gap">
      <div class="panel-head"><div><h2>開発ストアの注文ファイル</h2><p class="sub">読み取り用のエクスポーターで作成したJSONを選択します。架空36店の比較とは別の画面で確認できます。</p></div></div>
      <div class="panel-inner">
        <div class="store-controls">
          <label for="shopify-file">注文JSON</label><input type="file" id="shopify-file" accept=".json,application/json" aria-describedby="shopify-report-error">
          <button type="button" class="button" data-shopify-action="sample">架空サンプルを読み込む</button>
        </div>
        <p class="sub" id="shopify-report-error" role="alert">${escape(error)}</p>
      </div>
    </section>${results()}`;
  }

  function bind(container, repaint) {
    const form = container.querySelector('#shopify-file');
    form.addEventListener('change', async () => {
      const file = form.files?.[0];
      if (!file) return;
      const sequence = ++loadSequence;
      try {
        if (file.size > 6_000_000) throw new Error('6 MB以下のJSONを選んでください。');
        const parsed = validate(JSON.parse(await file.text()));
        if (sequence !== loadSequence) return;
        report = parsed;
        isSample = false;
        error = '';
      } catch (failure) {
        if (sequence !== loadSequence) return;
        error = failure instanceof SyntaxError ? 'JSONを読み取れませんでした。' : failure.message;
      }
      if (form.isConnected) {
        repaint();
        container.querySelector('#shopify-file').focus();
      }
    });

    for (const button of container.querySelectorAll('[data-shopify-action]')) {
      button.addEventListener('click', () => {
        loadSequence++;
        isSample = button.dataset.shopifyAction === 'sample';
        report = isSample ? fixture : null;
        error = '';
        repaint();
        container.querySelector('#shopify-file').focus();
      });
    }
  }

  globalThis.ShopifyTestImport = { render, bind };
})();
