(() => {
  'use strict';

  const { horizon, demandEstimate } = InventoryForecast;
  const { escape } = BrokerDocuments;
  const source = 'shopify-dev-inventory';
  const dayMs = 86400000;
  const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const dates = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const format = value => formatter.format(value);
  const validText = value => typeof value === 'string' && value.length > 0 && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value);
  const quantity = value => Number.isSafeInteger(value) && Math.abs(value) <= 2147483647;
  let report = null;
  let selectedId = '';
  let error = '';
  let loadSequence = 0;

  function validate(value) {
    if (value?.schemaVersion !== 1 || value.source !== source || !['api', 'fixture'].includes(value.mode)
      || typeof value.store !== 'string' || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.myshopify\.com$/.test(value.store)
      || typeof value.exportedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value.exportedAt)
      || !Number.isFinite(Date.parse(value.exportedAt)) || !quantity(value.testOrdersRead)
      || value.testOrdersRead < 0 || value.testOrdersRead > 1000 || !Array.isArray(value.items) || value.items.length > 250) {
      throw new Error('This file does not match the Shopify inventory snapshot format.');
    }
    const itemIds = new Set();
    for (const item of value.items) {
      if (!/^INV-[a-f0-9]{14}$/.test(item?.id) || itemIds.has(item.id) || !validText(item.name)
        || !(item.sku === null || validText(item.sku)) || !Array.isArray(item.demand) || item.demand.length !== 14
        || item.demand.some(units => !quantity(units) || units < 0)
        || !Array.isArray(item.levels) || item.levels.length > 100) {
        throw new Error('A Shopify inventory item has invalid source data.');
      }
      itemIds.add(item.id);
      const locationIds = new Set();
      for (const level of item.levels) {
        if (!/^LOC-[a-f0-9]{14}$/.test(level?.id) || locationIds.has(level.id) || !validText(level.name)
          || typeof level.online !== 'boolean' || !['onHand', 'available', 'committed', 'incoming'].every(key => quantity(level[key]))) {
          throw new Error('A Shopify inventory location or quantity is invalid.');
        }
        locationIds.add(level.id);
      }
    }
    return value;
  }

  function sample() {
    return { schemaVersion: 1, source, mode: 'fixture', store: 'tea-inventory-sample.myshopify.com',
      exportedAt: '2026-11-28T04:00:00.000Z', testOrdersRead: 18, items: [
        { id: 'INV-00000000000001', sku: 'TSU-MATCHA-30', name: 'Uji Matcha · 30 g',
          demand: [1, 2, 0, 3, 1, 0, 2, 3, 1, 2, 2, 0, 3, 2], levels: [
            { id: 'LOC-00000000000001', name: 'Online fulfillment', online: true, onHand: 37, available: 22, committed: 10, incoming: 24 },
            { id: 'LOC-00000000000002', name: 'Retail reserve', online: false, onHand: 40, available: 40, committed: 0, incoming: 0 }
          ] },
        { id: 'INV-00000000000002', sku: 'TSU-SENCHA-80', name: 'Uji Sencha · 80 g',
          demand: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0], levels: [
            { id: 'LOC-00000000000001', name: 'Online fulfillment', online: true, onHand: 20, available: 18, committed: 2, incoming: 0 }
          ] }
      ] };
  }

  function projection(item) {
    if (!item.sku || report.items.some(other => other.id !== item.id && other.sku === item.sku)) {
      return '<p class="sub">A unique SKU is required to match test orders to inventory.</p>';
    }
    const locations = item.levels.filter(level => level.online);
    if (locations.length !== 1) return '<p class="sub">Stockout estimates require one active online fulfillment location. Review the location quantities below.</p>';
    const { available } = locations[0];
    const observedDays = item.demand.filter(units => units > 0).length;
    const { baseline } = demandEstimate(item.demand);
    if (observedDays < 2 && available > 0) return '<p class="sub">Forecast unavailable. This SKU needs test demand on at least two complete days in the 14-day window.</p>';
    const today = Date.parse(report.exportedAt.slice(0, 10));
    let days = 0;
    while (days <= horizon && Math.round(days * baseline) < available) days++;
    const stockout = days ? days > horizon ? 'None in 30 days' : dates.format(today + days * dayMs) : 'Out of stock in the snapshot';
    return `<dl class="inventory-forecast-summary">
      <div><dt>Shopify available</dt><dd>${format(available)} units</dd></div>
      <div><dt>Test demand estimate</dt><dd>${observedDays >= 2 ? format(baseline) + ' units/day' : 'Insufficient history'}</dd></div>
      <div><dt>Estimated stockout</dt><dd>${stockout}</dd></div>
    </dl>
    <p class="sub">Uses Shopify’s available quantity and weighted demand from paid, uncanceled test orders over the last 14 complete UTC days. Incoming stock is listed below. A dated receipt is needed to include it in the estimate.</p>`;
  }

  function inventory() {
    if (!report) return '';
    const item = report.items.find(row => row.id === selectedId);
    const timestamp = new Date(report.exportedAt).toISOString().slice(0, 16).replace('T', ' ');
    return `<section class="panel section-gap" aria-labelledby="shopify-inventory-results">
      <div class="panel-head"><div><span class="tag ${report.mode === 'fixture' ? 'warn' : ''}">${report.mode === 'fixture' ? 'Sample data' : 'Imported API snapshot'}</span>
        <h2 id="shopify-inventory-results">${escape(report.store)}</h2>
        <p class="sub">${timestamp} UTC · ${format(report.testOrdersRead)} test orders read · ${format(report.items.length)} tracked inventory items</p></div>
        <button class="button" type="button" data-shopify-inventory="clear">Clear snapshot</button></div>
      <div class="panel-inner">${item ? `<div class="filter-bar"><label for="shopify-inventory-item">Product or SKU <select id="shopify-inventory-item">
        ${report.items.map(row => `<option value="${row.id}"${row.id === selectedId ? ' selected' : ''}>${escape(row.name)}${row.sku && row.sku !== row.name ? ' · ' + escape(row.sku) : ''}</option>`).join('')}</select></label></div>
        ${projection(item)}` : '<p class="sub">The snapshot contains no tracked inventory items. Check inventory tracking in the development store.</p>'}</div>
      ${item ? `<div class="table-scroll"><table><thead><tr><th scope="col">Shopify location</th><th scope="col">Online fulfillment</th>
        <th scope="col" class="num">On hand</th><th scope="col" class="num">Available</th><th scope="col" class="num">Committed</th><th scope="col" class="num">Incoming</th></tr></thead><tbody>
        ${item.levels.map(level => `<tr><td>${escape(level.name)}</td><td>${level.online ? 'Active' : 'Outside online supply'}</td>
          ${['onHand', 'available', 'committed', 'incoming'].map(key => '<td class="num">' + format(level[key]) + '</td>').join('')}</tr>`).join('')
          || '<tr><td colspan="6">No inventory locations were returned for this item.</td></tr>'}</tbody></table></div>` : ''}
    </section>`;
  }

  function render() {
    return `<section class="panel section-gap" aria-labelledby="shopify-inventory-heading">
      <div class="panel-head"><div><h2 id="shopify-inventory-heading">Shopify inventory snapshot</h2>
        <p class="sub">Review development-store inventory by SKU and location alongside demand from test orders.</p></div></div>
      <div class="panel-inner">
        <div class="store-controls fulfillment-upload"><label for="shopify-inventory-file">Snapshot JSON</label>
          <input type="file" id="shopify-inventory-file" accept=".json,application/json" aria-describedby="shopify-inventory-help shopify-inventory-error">
          <button type="button" class="button" data-shopify-inventory="sample">Load sample inventory snapshot</button></div>
        <p class="sub" id="shopify-inventory-help">Use the development-store exporter with <code>--inventory</code>. The imported snapshot stays in this browser tab until reload.</p>
        <p class="fulfillment-error" id="shopify-inventory-error" role="alert">${escape(error)}</p>
      </div>
    </section>${inventory()}`;
  }

  function setReport(value) {
    report = value;
    selectedId = value?.items[0]?.id || '';
    error = '';
  }

  function bind(container, repaint) {
    const file = container.querySelector('#shopify-inventory-file');
    file.addEventListener('change', async () => {
      const upload = file.files?.[0];
      if (!upload) return;
      const sequence = ++loadSequence;
      try {
        if (upload.size > 6_000_000) throw new Error('Choose a snapshot JSON file no larger than 6 MB.');
        const next = validate(JSON.parse(await upload.text()));
        if (sequence !== loadSequence || !file.isConnected) return;
        setReport(next);
      } catch (failure) {
        if (sequence !== loadSequence || !file.isConnected) return;
        error = failure instanceof SyntaxError ? 'Could not read the snapshot JSON.' : failure.message;
      }
      repaint();
      container.querySelector('#shopify-inventory-file')?.focus();
    });
    container.querySelector('#shopify-inventory-item')?.addEventListener('change', event => {
      selectedId = event.target.value;
      repaint();
      container.querySelector('#shopify-inventory-item')?.focus();
    });
    for (const button of container.querySelectorAll('[data-shopify-inventory]')) {
      button.addEventListener('click', () => {
        loadSequence++;
        setReport(button.dataset.shopifyInventory === 'sample' ? sample() : null);
        repaint();
        container.querySelector('#shopify-inventory-file')?.focus();
      });
    }
  }

  globalThis.ShopifyInventoryImport = { render, bind };
})();
