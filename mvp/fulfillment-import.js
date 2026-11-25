(() => {
  'use strict';

  const source = 'seller-hub-fulfillment-demo';
  const pageSize = 20;
  const number = value => new Intl.NumberFormat('ja-JP').format(value);
  const money = (currency, value) => new Intl.NumberFormat('ja-JP', {
    style: 'currency', currency, currencyDisplay: 'code'
  }).format(Number(value));
  const escape = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const keysAre = (value, keys) => record(value) && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
  const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max
    && !/[\u0000-\u001f\u007f]/.test(value);
  const nullableText = (value, max) => value === null || text(value, max);
  const amount = value => typeof value === 'string' && /^\d{1,12}(?:\.\d{1,6})?$/.test(value);
  const connectionStates = ['fixture', 'verified', 'not-configured', 'failed'];
  const orderStates = ['planned', 'submitted', 'shipped', 'blocked'];
  const shipmentStates = ['not-submitted', 'suspended', 'pending', 'working', 'shipped', 'cancelled', 'unknown'];
  const reasons = {
    'missing-credentials': '接続設定が必要です',
    'order-ineligible': '注文がテスト出荷の条件を満たしていません',
    'sku-unmapped': '商品の対応付けを確認してください',
    'shipment-mismatch': '既存の出荷依頼と内容が一致しません',
    'submission-uncertain': '受付結果が不明です。再送前に既存の依頼を照合してください',
    'provider-error': '物流側の応答を確認してください'
  };
  const orderLabels = { planned: '依頼前', submitted: '依頼受付済み', shipped: '出荷済み', blocked: '要確認' };
  const shipmentLabels = {
    'not-submitted': '未送信', suspended: '倉庫作業を保留', pending: '受付・準備中',
    working: '倉庫で作業中', shipped: '出荷済み', cancelled: 'キャンセル', unknown: '状態未確認'
  };
  let report = null;
  let error = '';
  let currentPage = 0;
  let loadSequence = 0;

  function validTrackingUrl(value) {
    if (value === null) return true;
    if (!text(value, 1000)) return false;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }

  function validate(input) {
    if (!keysAre(input, ['schemaVersion', 'source', 'mode', 'generatedAt', 'store', 'connection', 'orders'])
      || input.schemaVersion !== 1 || input.source !== source
      || !['fixture', 'openlogi-demo'].includes(input.mode)
      || !text(input.generatedAt, 40) || !/^\d{4}-\d{2}-\d{2}T/.test(input.generatedAt)
      || !Number.isFinite(Date.parse(input.generatedAt))
      || !text(input.store, 125) || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.myshopify\.com$/.test(input.store)
      || !keysAre(input.connection, ['shopify', 'openlogi'])
      || !Object.values(input.connection).every(state => connectionStates.includes(state))
      || !Array.isArray(input.orders) || input.orders.length > 1000) {
      throw new Error('物流デモの結果ファイルの形式と一致しません。出力した結果JSONを選択してください。');
    }
    if (input.mode === 'fixture'
      ? Object.values(input.connection).some(state => state !== 'fixture')
      : Object.values(input.connection).includes('fixture')) {
      throw new Error('サンプルとAPI接続結果の区分が一致しません。');
    }

    const ids = new Set();
    const shipmentIdentifiers = new Set();
    for (const order of input.orders) {
      if (!keysAre(order, ['id', 'reference', 'test', 'currency', 'subtotal', 'shippingCharged', 'status', 'lines', 'shipment', 'shopifyWriteback', 'blockReason'])
        || typeof order.id !== 'string' || !/^SHOP-[a-f0-9]{14}$/.test(order.id) || ids.has(order.id)
        || typeof order.reference !== 'string' || !/^#[A-Za-z0-9-]{1,40}$/.test(order.reference)
        || order.test !== true || typeof order.currency !== 'string' || !/^[A-Z]{3}$/.test(order.currency)
        || !amount(order.subtotal) || !amount(order.shippingCharged)
        || !orderStates.includes(order.status) || order.shopifyWriteback !== 'not-requested'
        || !(order.blockReason === null || Object.hasOwn(reasons, order.blockReason))
        || !Array.isArray(order.lines) || !order.lines.length || order.lines.length > 300
        || order.lines.some(line => !keysAre(line, ['sku', 'title', 'quantity'])
          || !text(line.sku, 30) || !/^[A-Za-z0-9!#$%&'()*+,\-./:;<=>?@[\]^_`{|}~]+$/.test(line.sku)
          || !text(line.title, 100) || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 10000)) {
        throw new Error('注文・商品・金額の形式に問題があります。個人情報を含まない結果JSONを使用してください。');
      }
      const shipment = order.shipment;
      if (!keysAre(shipment, ['id', 'identifier', 'status', 'trackingNumber', 'trackingNumbers', 'trackingUrl', 'carrier', 'actualShippingCost'])
        || !(shipment.id === null || (text(shipment.id, 100) && /^[A-Za-z0-9_-]+$/.test(shipment.id)))
        || typeof shipment.identifier !== 'string' || !/^cbsh-[a-f0-9]{32}$/.test(shipment.identifier)
        || shipmentIdentifiers.has(shipment.identifier) || !shipmentStates.includes(shipment.status)
        || !nullableText(shipment.trackingNumber, 100) || !Array.isArray(shipment.trackingNumbers)
        || shipment.trackingNumbers.length > 100 || shipment.trackingNumbers.some(value => !text(value, 100))
        || new Set(shipment.trackingNumbers).size !== shipment.trackingNumbers.length
        || shipment.trackingNumber !== (shipment.trackingNumbers[0] ?? null)
        || !validTrackingUrl(shipment.trackingUrl)
        || !nullableText(shipment.carrier, 80) || shipment.actualShippingCost !== null
        || (order.status === 'shipped' && shipment.status !== 'shipped')
        || (shipment.status === 'shipped' && order.status !== 'shipped')
        || (order.status === 'planned' && shipment.status !== 'not-submitted')
        || (order.status === 'submitted' && (shipment.id === null || shipment.status === 'not-submitted'))
        || (order.status === 'blocked') !== (order.blockReason !== null)) {
        throw new Error('出荷状況・追跡情報の形式が不正か、注文の状態と一致しません。');
      }
      ids.add(order.id);
      shipmentIdentifiers.add(shipment.identifier);
    }
    return input;
  }

  function sampleReport() {
    const sampleOrder = (index, status, shipmentStatus, blockReason = null) => ({
      id: 'SHOP-' + String(index).padStart(14, '0'), reference: '#DEMO-' + (1000 + index),
      test: true, currency: 'JPY', subtotal: '1980', shippingCharged: '870', status,
      lines: [{ sku: 'TSU-SENCHA-80', title: '宇治 煎茶 80g', quantity: 1 }],
      shipment: {
        id: status === 'blocked' ? null : 'DEMO-S' + index,
        identifier: 'cbsh-' + String(index).padStart(32, '0'), status: shipmentStatus,
        trackingNumber: status === 'shipped' ? 'DEMO-TRACK-0001' : null,
        trackingNumbers: status === 'shipped' ? ['DEMO-TRACK-0001'] : [],
        trackingUrl: null, carrier: status === 'shipped' ? '架空の配送会社' : null,
        actualShippingCost: null
      },
      shopifyWriteback: 'not-requested', blockReason
    });
    return {
      schemaVersion: 1, source, mode: 'fixture', generatedAt: new Date().toISOString(),
      store: 'tea-fulfillment-sample.myshopify.com', connection: { shopify: 'fixture', openlogi: 'fixture' },
      orders: [
        sampleOrder(1, 'shipped', 'shipped'),
        sampleOrder(2, 'submitted', 'suspended'),
        sampleOrder(3, 'blocked', 'not-submitted', 'sku-unmapped')
      ]
    };
  }

  function connectionLabel(value) {
    return {
      fixture: '架空サンプル', verified: '生成時にAPI応答を確認',
      'not-configured': '接続未設定', failed: '接続を確認できず'
    }[value];
  }

  function summary() {
    const isSample = report.mode === 'fixture';
    const generated = new Intl.DateTimeFormat('ja-JP', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo'
    }).format(new Date(report.generatedAt));
    const counts = Object.fromEntries(orderStates.map(state => [state, report.orders.filter(order => order.status === state).length]));
    return `<section class="panel section-gap fulfillment-summary" aria-labelledby="fulfillment-summary-title">
      <div class="panel-head"><div><span class="tag ${isSample ? 'warn' : ''}">${isSample ? '架空のサンプル結果' : 'OPENLOGIデモAPIの実行記録'}</span>
        <h2 id="fulfillment-summary-title">${escape(report.store)}</h2>
        <p class="sub">${escape(generated)} JST 時点のレポート</p></div>
        <button class="button" type="button" data-fulfillment-action="clear">結果をクリア</button></div>
      <div class="panel-inner">
        <div class="fulfillment-connections">
          <p><strong>Shopify</strong><span class="tag ${report.connection.shopify === 'failed' ? 'danger' : 'gray'}">${connectionLabel(report.connection.shopify)}</span></p>
          <p><strong>OPENLOGI</strong><span class="tag ${report.connection.openlogi === 'failed' ? 'danger' : 'gray'}">${connectionLabel(report.connection.openlogi)}</span></p>
        </div>
        <dl class="tiles fulfillment-counts">
          <div class="tile"><dt>取込テスト注文</dt><dd>${number(report.orders.length)}件</dd></div>
          <div class="tile"><dt>出荷依頼受付済み</dt><dd>${number(counts.submitted)}件</dd><small>出荷済みの注文を除く</small></div>
          <div class="tile"><dt>${isSample ? '模擬出荷済み' : 'デモAPIで出荷済み'}</dt><dd>${number(counts.shipped)}件</dd></div>
          <div class="tile"><dt>要確認</dt><dd>${number(counts.blocked)}件</dd></div>
        </dl>
        <p class="sub">${isSample
          ? 'すべて架空の状態です。実際の接続・倉庫への依頼・配送は行っていません。'
          : '接続状態はレポート生成時の確認結果です。現在の接続状況や、その後の出荷状況を自動更新する画面ではありません。'}</p>
      </div>
    </section>`;
  }

  function progress(order) {
    const submitted = order.shipment.id !== null;
    const shipped = order.status === 'shipped';
    const stages = [
      ['テスト注文', '読み取り済み', true],
      ['出荷依頼', shipmentLabels[order.shipment.status], submitted],
      ['発送結果', shipped ? (report.mode === 'fixture' ? '模擬出荷済み' : '出荷済み') : '未確認', shipped]
    ];
    return `<ol class="fulfillment-progress" aria-label="${escape(order.reference)}の処理状況">${stages.map(([label, detail, done]) =>
      `<li${done ? ' class="complete"' : ''}><strong>${label}</strong><span>${detail}</span></li>`
    ).join('')}</ol>`;
  }

  function orderCard(order) {
    const shipment = order.shipment;
    const tracking = shipment.trackingNumbers.length
      ? `${shipment.trackingNumbers.map(value => `<strong class="fulfillment-tracking">${escape(value)}</strong>`).join('')}${shipment.carrier ? `<small>${escape(shipment.carrier)}</small>` : ''}`
      : '<span class="sub">未取得</span>';
    return `<article class="panel fulfillment-order">
      <div class="panel-head"><div><h3>${escape(order.reference)} <span class="tag ${order.status === 'blocked' ? 'danger' : 'gray'}">${orderLabels[order.status]}</span></h3>
        <p class="sub">${order.lines.map(line => `${escape(line.title)} ×${number(line.quantity)}`).join('、')}</p></div>
        <span class="tag gray">テスト注文</span></div>
      <div class="panel-inner">
        ${progress(order)}
        ${order.blockReason ? `<p class="fulfillment-alert">${reasons[order.blockReason]}</p>` : ''}
        ${shipment.status === 'suspended' ? '<p class="fulfillment-note">出荷依頼は受け付けられています。倉庫の作業開始は保留しています。</p>' : ''}
        <dl class="fulfillment-details">
          <div><dt>商品小計</dt><dd>${money(order.currency, order.subtotal)}</dd></div>
          <div><dt>購入者への請求送料</dt><dd>${money(order.currency, order.shippingCharged)}</dd></div>
          <div><dt>実績配送費</dt><dd>未取得</dd></div>
          <div><dt>追跡番号</dt><dd>${tracking}</dd></div>
          <div><dt>Shopifyへの出荷反映</dt><dd>未実施</dd></div>
          <div><dt>物流側の依頼番号</dt><dd>${shipment.id ? escape(shipment.id) : '未取得'}</dd></div>
        </dl>
        <details class="fulfillment-identifiers"><summary>照合に使うID・商品コード</summary>
          <p>注文ID：<code>${escape(order.id)}</code></p><p>出荷照合ID：<code>${escape(shipment.identifier)}</code></p>
          <ul>${order.lines.map(line => `<li><code>${escape(line.sku)}</code> ×${number(line.quantity)}</li>`).join('')}</ul>
        </details>
      </div>
    </article>`;
  }

  function results() {
    if (!report) return '';
    const start = currentPage * pageSize;
    const visible = report.orders.slice(start, start + pageSize);
    return `${summary()}
      <section class="section-gap" aria-labelledby="fulfillment-orders-title">
        <div class="fulfillment-section-head"><h2 id="fulfillment-orders-title">注文と出荷の照合</h2>
          <p class="sub">購入者への請求送料と、物流事業者に支払う実績配送費は別に表示します。</p></div>
        <div class="fulfillment-orders">${visible.map(orderCard).join('') || '<p class="panel status-copy">注文の実行結果はまだありません。レポートの接続状態を確認してください。</p>'}</div>
        ${report.orders.length > pageSize ? `<div class="pagination section-gap"><span>${start + 1}–${Math.min(start + pageSize, report.orders.length)} / ${number(report.orders.length)}件</span>
          <button class="button" type="button" data-fulfillment-action="previous" ${currentPage === 0 ? 'disabled' : ''}>前へ</button>
          <button class="button" type="button" data-fulfillment-action="next" ${start + pageSize >= report.orders.length ? 'disabled' : ''}>次へ</button></div>` : ''}
      </section>`;
  }

  function render() {
    return `<section class="panel section-gap" aria-labelledby="fulfillment-import-title">
      <div class="panel-head"><div><h2 id="fulfillment-import-title">物流連携の実行結果</h2>
        <p class="sub">テスト注文とOPENLOGIへの出荷依頼を照合する結果ファイルを選択します。</p></div></div>
      <div class="panel-inner">
        <div class="store-controls fulfillment-upload"><label for="fulfillment-file">結果JSON</label>
          <input type="file" id="fulfillment-file" accept=".json,application/json" aria-describedby="fulfillment-file-help fulfillment-report-error">
          <button class="button" type="button" data-fulfillment-action="sample">架空の物流サンプルを見る</button></div>
        <p class="sub" id="fulfillment-file-help">この画面は結果の確認用です。取込内容はこのページを開いている間だけ保持し、36店舗の架空集計には加えません。</p>
        <p class="fulfillment-error" id="fulfillment-report-error" role="alert">${escape(error)}</p>
      </div>
    </section>${results()}`;
  }

  function bind(container, repaint) {
    const input = container.querySelector('#fulfillment-file');
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const sequence = ++loadSequence;
      try {
        if (file.size > 6_000_000) throw new Error('6 MB以下の結果JSONを選んでください。');
        const parsed = validate(JSON.parse(await file.text()));
        if (sequence !== loadSequence || !input.isConnected) return;
        report = parsed;
        currentPage = 0;
        error = '';
      } catch (failure) {
        if (sequence !== loadSequence || !input.isConnected) return;
        report = null;
        currentPage = 0;
        error = failure instanceof SyntaxError ? 'JSONを読み取れませんでした。結果ファイルを確認してください。' : failure.message;
      }
      repaint();
      container.querySelector('#fulfillment-file')?.focus();
    });
    for (const button of container.querySelectorAll('[data-fulfillment-action]')) {
      button.addEventListener('click', () => {
        loadSequence++;
        const action = button.dataset.fulfillmentAction;
        if (action === 'sample') { report = validate(sampleReport()); currentPage = 0; }
        else if (action === 'clear') { report = null; currentPage = 0; }
        else if (action === 'previous') currentPage = Math.max(0, currentPage - 1);
        else if (action === 'next' && report) currentPage = Math.min(Math.ceil(report.orders.length / pageSize) - 1, currentPage + 1);
        error = '';
        repaint();
        if (action === 'next' || action === 'previous') container.querySelector('#fulfillment-orders-title')?.scrollIntoView({ block: 'start' });
        container.querySelector(action === 'sample' ? '[data-fulfillment-action="sample"]' : '#fulfillment-file')?.focus({ preventScroll: true });
      });
    }
  }

  globalThis.FulfillmentDemoImport = { render, bind };
})();
