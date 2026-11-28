(() => {
  'use strict';

  const source = 'seller-hub-fulfillment-demo';
  const pageSize = 20;
  const number = value => new Intl.NumberFormat('en-US').format(value);
  const money = (currency, value) => new Intl.NumberFormat('en-US', {
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
    'missing-credentials': 'Connection setup required.',
    'order-ineligible': 'The order is ineligible for test shipment.',
    'sku-unmapped': 'Check the SKU mapping.',
    'shipment-mismatch': 'The details differ from the existing shipment request.',
    'submission-uncertain': 'Request acceptance is uncertain. Check for an existing request before retrying.',
    'provider-error': 'Check the fulfillment provider response.'
  };
  const orderLabels = { planned: 'Not requested', submitted: 'Request accepted', shipped: 'Dispatched', blocked: 'Needs review' };
  const shipmentLabels = {
    'not-submitted': 'Not submitted', suspended: 'Warehouse processing on hold', pending: 'Accepted and preparing',
    working: 'Processing at warehouse', shipped: 'Dispatched', cancelled: 'Canceled', unknown: 'Status unverified'
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
      throw new Error('This file does not match the fulfillment demo format. Select the exported results JSON.');
    }
    if (input.mode === 'fixture'
      ? Object.values(input.connection).some(state => state !== 'fixture')
      : Object.values(input.connection).includes('fixture')) {
      throw new Error('The report mode does not match its connection statuses.');
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
        throw new Error('The order, product, or amount format is invalid. Use the redacted results JSON.');
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
        throw new Error('Shipment or tracking details are invalid or inconsistent with the order status.');
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
      lines: [{ sku: 'TSU-SENCHA-80', title: 'Uji Sencha, 80 g', quantity: 1 }],
      shipment: {
        id: status === 'blocked' ? null : 'DEMO-S' + index,
        identifier: 'cbsh-' + String(index).padStart(32, '0'), status: shipmentStatus,
        trackingNumber: status === 'shipped' ? 'DEMO-TRACK-0001' : null,
        trackingNumbers: status === 'shipped' ? ['DEMO-TRACK-0001'] : [],
        trackingUrl: null, carrier: status === 'shipped' ? 'Sample carrier' : null,
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
      fixture: 'Sample data', verified: 'API response verified at report time',
      'not-configured': 'Connection not configured', failed: 'Connection unverified'
    }[value];
  }

  function summary() {
    const isSample = report.mode === 'fixture';
    const generated = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo'
    }).format(new Date(report.generatedAt));
    const counts = Object.fromEntries(orderStates.map(state => [state, report.orders.filter(order => order.status === state).length]));
    return `<section class="panel section-gap fulfillment-summary" aria-labelledby="fulfillment-summary-title">
      <div class="panel-head"><div><span class="tag ${isSample ? 'warn' : ''}">${isSample ? 'Sample results' : 'OPENLOGI demo API report'}</span>
        <h2 id="fulfillment-summary-title">${escape(report.store)}</h2>
        <p class="sub">Report generated ${escape(generated)} JST</p></div>
        <button class="button" type="button" data-fulfillment-action="clear">Clear report</button></div>
      <div class="panel-inner">
        <div class="fulfillment-connections">
          <p><strong>Shopify</strong><span class="tag ${report.connection.shopify === 'failed' ? 'danger' : 'gray'}">${connectionLabel(report.connection.shopify)}</span></p>
          <p><strong>OPENLOGI</strong><span class="tag ${report.connection.openlogi === 'failed' ? 'danger' : 'gray'}">${connectionLabel(report.connection.openlogi)}</span></p>
        </div>
        <dl class="tiles fulfillment-counts">
          <div class="tile"><dt>Imported test orders</dt><dd>${number(report.orders.length)}</dd></div>
          <div class="tile"><dt>Requests accepted</dt><dd>${number(counts.submitted)}</dd><small>Excludes dispatched orders</small></div>
          <div class="tile"><dt>${isSample ? 'Simulated dispatches' : 'Dispatched via demo API'}</dt><dd>${number(counts.shipped)}</dd></div>
          <div class="tile"><dt>Needs review</dt><dd>${number(counts.blocked)}</dd></div>
        </dl>
        <p class="sub">${isSample
          ? 'Sample data illustrates the connection, warehouse request, and dispatch statuses.'
          : 'This report shows connection and dispatch statuses at the time it was generated.'}</p>
      </div>
    </section>`;
  }

  function progress(order) {
    const submitted = order.shipment.id !== null;
    const shipped = order.status === 'shipped';
    const stages = [
      ['Test order', 'Imported', true],
      ['Shipment request', shipmentLabels[order.shipment.status], submitted],
      ['Dispatch result', shipped ? (report.mode === 'fixture' ? 'Simulated dispatch' : 'Dispatched') : 'Unverified', shipped]
    ];
    return `<ol class="fulfillment-progress" aria-label="Fulfillment progress for ${escape(order.reference)}">${stages.map(([label, detail, done]) =>
      `<li${done ? ' class="complete"' : ''}><strong>${label}</strong><span>${detail}</span></li>`
    ).join('')}</ol>`;
  }

  function orderCard(order) {
    const shipment = order.shipment;
    const tracking = shipment.trackingNumbers.length
      ? `${shipment.trackingNumbers.map(value => `<strong class="fulfillment-tracking">${escape(value)}</strong>`).join('')}${shipment.carrier ? `<small>${escape(shipment.carrier)}</small>` : ''}`
      : '<span class="sub">Unavailable</span>';
    return `<article class="panel fulfillment-order">
      <div class="panel-head"><div><h3>${escape(order.reference)} <span class="tag ${order.status === 'blocked' ? 'danger' : 'gray'}">${orderLabels[order.status]}</span></h3>
        <p class="sub">${order.lines.map(line => `${escape(line.title)} ×${number(line.quantity)}`).join(', ')}</p></div>
        <span class="tag gray">Test order</span></div>
      <div class="panel-inner">
        ${progress(order)}
        ${order.blockReason ? `<p class="fulfillment-alert">${reasons[order.blockReason]}</p>` : ''}
        ${shipment.status === 'suspended' ? '<p class="fulfillment-note">The provider accepted the request. Warehouse processing is on hold.</p>' : ''}
        <dl class="fulfillment-details">
          <div><dt>Product subtotal</dt><dd>${money(order.currency, order.subtotal)}</dd></div>
          <div><dt>Shipping charged to buyer</dt><dd>${money(order.currency, order.shippingCharged)}</dd></div>
          <div><dt>Actual freight cost</dt><dd>Unavailable</dd></div>
          <div><dt>Tracking number</dt><dd>${tracking}</dd></div>
          <div><dt>Shopify fulfillment update</dt><dd>Not performed</dd></div>
          <div><dt>Provider request ID</dt><dd>${shipment.id ? escape(shipment.id) : 'Unavailable'}</dd></div>
        </dl>
        <details class="fulfillment-identifiers"><summary>Matching IDs and SKUs</summary>
          <p>Order ID <code>${escape(order.id)}</code></p><p>Shipment matching ID <code>${escape(shipment.identifier)}</code></p>
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
        <div class="fulfillment-section-head"><h2 id="fulfillment-orders-title">Orders and shipments</h2>
          <p class="sub">Compare the shipping charge paid by the buyer with the cost charged by the fulfillment provider.</p></div>
        <div class="fulfillment-orders">${visible.map(orderCard).join('') || '<p class="panel status-copy">There are no order results yet. Check the connection status in the report.</p>'}</div>
        ${report.orders.length > pageSize ? `<div class="pagination section-gap"><span>${start + 1}–${Math.min(start + pageSize, report.orders.length)} of ${number(report.orders.length)}</span>
          <button class="button" type="button" data-fulfillment-action="previous" ${currentPage === 0 ? 'disabled' : ''}>Previous</button>
          <button class="button" type="button" data-fulfillment-action="next" ${start + pageSize >= report.orders.length ? 'disabled' : ''}>Next</button></div>` : ''}
      </section>`;
  }

  function render() {
    return `<section class="panel section-gap" aria-labelledby="fulfillment-import-title">
      <div class="panel-head"><div><h2 id="fulfillment-import-title">Fulfillment report</h2>
        <p class="sub">Select the results file that links Shopify test orders to OPENLOGI shipment requests.</p></div></div>
      <div class="panel-inner">
        <div class="store-controls fulfillment-upload"><label for="fulfillment-file">Results JSON</label>
          <input type="file" id="fulfillment-file" accept=".json,application/json" aria-describedby="fulfillment-file-help fulfillment-report-error">
          <button class="button" type="button" data-fulfillment-action="sample">Load sample fulfillment report</button></div>
        <p class="sub" id="fulfillment-file-help">Imported results stay in this page until you reload it. The 36-store sample analytics uses a separate dataset.</p>
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
        if (file.size > 6_000_000) throw new Error('Choose a results JSON file no larger than 6 MB.');
        const parsed = validate(JSON.parse(await file.text()));
        if (sequence !== loadSequence || !input.isConnected) return;
        report = parsed;
        currentPage = 0;
        error = '';
      } catch (failure) {
        if (sequence !== loadSequence || !input.isConnected) return;
        report = null;
        currentPage = 0;
        error = failure instanceof SyntaxError ? 'Could not read the JSON. Check the results file.' : failure.message;
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
