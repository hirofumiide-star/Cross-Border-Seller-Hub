(() => {
  'use strict';

  const { asOf, horizon, replenishmentWindow, items, dateLabel, forecast } = InventoryForecast;
  const bySku = new Map(items.map(item => [item.sku, item]));
  const storageKey = 'seller-hub-replenishment-drafts-v1';
  const scenarios = { 0: 'Baseline demand', 35: 'Group-buy uplift (+35%)', 60: 'Demand spike (+60%)' };
  const number = new Intl.NumberFormat('en-US');
  const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
  const fmt = value => number.format(value);
  const settings = new Map();
  let sku = items[0].sku;
  let uplift = 0;
  let storageIssue = false;

  function readDrafts() {
    const result = new Map();
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (!Array.isArray(saved)) return result;
      for (const draft of saved) {
        if (draft && bySku.has(draft.sku) && Number.isInteger(draft.quantity) && draft.quantity > 0
          && Number.isInteger(draft.orderDay) && draft.orderDay >= 0 && draft.orderDay <= horizon
          && Number.isInteger(draft.arrivalDay) && draft.arrivalDay > draft.orderDay && draft.arrivalDay <= horizon
          && Object.hasOwn(scenarios, draft.uplift)) result.set(draft.sku, draft);
      }
    } catch {
      // Continue with an empty draft list if storage is unavailable.
    }
    return result;
  }

  let drafts = readDrafts();
  function updateDraft(selectedSku, draft) {
    const next = storageIssue ? new Map(drafts) : readDrafts();
    if (draft) next.set(selectedSku, draft);
    else next.delete(selectedSku);
    drafts = next;
    try {
      localStorage.setItem(storageKey, JSON.stringify([...drafts.values()]));
      storageIssue = false;
    } catch {
      storageIssue = true;
    }
  }

  const planFor = item => forecast(item, { uplift, ...settings.get(item.sku) });
  const dateOf = point => point ? dateLabel(point.day) : 'None in 30 days';
  const option = (value, label, selected) => `<option value="${value}"${String(value) === String(selected) ? ' selected' : ''}>${label}</option>`;

  function overview(plans) {
    const atRisk = plans.filter(plan => plan.stockout).length;
    const belowBuffer = plans.filter(plan => plan.buffer && !plan.stockout).length;
    const results = [
      ['Available now', fmt(plans.reduce((sum, plan) => sum + plan.opening, 0)), 'On hand minus reserved units'],
      ['Projected stockouts', atRisk, 'SKUs reaching zero within 30 days'],
      ['Below safety stock', belowBuffer, 'Additional SKUs below their buffer'],
      ['Open inbound units', fmt(plans.flatMap(plan => plan.receipts).reduce((sum, receipt) => sum + receipt.units, 0)), 'Confirmed and in-transit receipts']
    ];
    return `<dl class="tiles inventory-kpis">${results.map(([label, value, context]) =>
      `<div class="tile"><dt>${label}</dt><dd>${value}</dd><small>${context}</small></div>`).join('')}</dl>
    <section class="panel inventory-list" aria-labelledby="inventory-list-heading">
      <div class="panel-head"><div><h2 id="inventory-list-heading">Inventory by SKU and location</h2>
        <p class="sub">Kansai warehouse and Taipei receiving hub · Sample snapshot on ${asOf}</p></div></div>
      <div class="table-scroll"><table><thead><tr>
        <th scope="col">Product</th><th scope="col" class="num">On hand</th>
        <th scope="col" class="num">Reserved</th><th scope="col" class="num">Available</th>
        <th scope="col">Next inbound</th><th scope="col">Projected stockout</th><th scope="col">Status</th>
      </tr></thead><tbody>${plans.map(plan => {
        const { item, receipts, stockout, buffer } = plan;
        const inbound = receipts[0];
        return `<tr class="${item.sku === sku ? 'inventory-selected' : ''}">
          <td><button class="table-button" type="button" data-plan-sku="${item.sku}" aria-pressed="${item.sku === sku}">${item.name}</button>
            <small>${item.sku} · ${item.location}</small></td>
          <td class="num">${fmt(item.onHand)}</td><td class="num">${fmt(item.reserved)}</td><td class="num">${fmt(plan.opening)}</td>
          <td>${inbound ? fmt(inbound.units) + ' units · ' + dateLabel(inbound.day) : '—'}</td>
          <td>${dateOf(stockout)}${stockout ? `<small>${stockout.day ? 'In ' + stockout.day + ' days' : 'Today'}</small>` : ''}</td>
          <td><span class="tag ${stockout ? 'danger' : buffer ? 'warn' : ''}">${stockout ? 'Stockout risk' : buffer ? 'Below buffer' : 'Covered'}</span></td>
        </tr>`;
      }).join('')}</tbody></table></div>
    </section>`;
  }

  function chart(plan) {
    const lower = Math.min(0, ...plan.points.map(point => point.available));
    const upper = Math.max(1, plan.item.safety, ...plan.points.map(point => point.available));
    const scale = value => (value - lower) / (upper - lower) * 100;
    const height = value => Math.abs(value) / (upper - lower) * 100;
    const marks = [0, 7, 14, 21, horizon];
    return `<figure class="inventory-figure">
      <figcaption class="sr-only">Projected end-of-day available inventory for ${plan.item.name}.
        First stockout ${dateOf(plan.stockout)}. First below safety stock ${dateOf(plan.buffer)}.
        ${marks.map(day => `${dateLabel(day)} has ${fmt(plan.points[day].available)} projected units.`).join(' ')}</figcaption>
      <div class="inventory-chart" aria-hidden="true">
        <div class="inventory-axis"><span>${fmt(upper)}</span><span>${fmt(lower)}</span></div>
        <div class="inventory-plot" style="--stock-zero:${scale(0)}%;--stock-buffer:${scale(plan.item.safety)}%;--stock-days:${plan.points.length}">
          ${plan.points.map(point => `<div class="inventory-day" title="${dateLabel(point.day)} · ${fmt(point.available)} units">
            <i class="${point.available < 0 ? 'short' : point.available < plan.item.safety ? 'low' : ''}" style="--stock-height:${height(point.available)}%"></i></div>`).join('')}
        </div>
        <div class="inventory-dates">${marks.map(day => `<span style="--stock-mark:${day / horizon * 100}%">${dateLabel(day)}</span>`).join('')}</div>
      </div>
      <ul class="inventory-legend"><li class="available">Available</li><li class="buffer">Safety stock · ${fmt(plan.item.safety)} units</li><li class="shortage">Unfilled demand</li></ul>
    </figure>`;
  }

  function eventRows(plan) {
    return [...plan.receipts.map(receipt => ({ ...receipt, supply: true })), ...plan.item.commitments]
      .sort((a, b) => a.day - b.day)
      .map(event => `<li><span><strong>${event.reference}</strong><small>${event.supply ? event.status : 'Firm campaign demand'}</small></span>
        <span>${event.supply ? '+' : '−'}${fmt(event.units)} units · ${dateLabel(event.day)}</span></li>`).join('');
  }

  function replenishment(plan) {
    const proposal = plan.replenishment;
    const saved = drafts.get(plan.item.sku);
    const miss = proposal && plan.stockout && plan.stockout.day < proposal.arrivalDay;
    const nextReceipt = plan.receipts[0];
    return `<section class="panel inventory-replenishment" aria-labelledby="inventory-replenishment-heading">
      <div class="panel-head"><h2 id="inventory-replenishment-heading">Replenishment recommendation</h2></div>
      <div class="panel-inner">
        ${miss ? `<p class="inventory-alert"><strong>Expedite supply by ${dateOf(plan.stockout)}.</strong>
          A standard new order could arrive on ${dateLabel(proposal.arrivalDay)}. ${proposal.openingShortfall
            ? 'Up to ' + fmt(proposal.openingShortfall) + ' units of demand may go unfilled before then.'
            : 'Available stock reaches zero before then.'}
          ${nextReceipt?.day > plan.stockout.day ? 'Check whether ' + nextReceipt.reference + ' can be moved forward.' : ''}</p>` : ''}
        ${proposal?.quantity ? `<dl class="inventory-recommendation">
          <div><dt>Suggested purchase</dt><dd>${fmt(proposal.quantity)} units</dd></div>
          <div><dt>Order by</dt><dd>${proposal.orderDay ? dateLabel(proposal.orderDay) : 'Today'}</dd></div>
          <div><dt>Target receipt</dt><dd>${dateLabel(proposal.arrivalDay)}</dd></div></dl>
          <p class="sub">Covers the safety buffer for ${replenishmentWindow} days from receipt. Rounded to cases of ${plan.item.casePack}.</p>
          <button type="button" class="button primary" data-inventory-draft="save">${saved ? 'Replace purchase draft' : 'Save purchase draft'}</button>`
          : `<p class="sub">${proposal
            ? 'Open receipts cover the first seven days from the earliest new order arrival. Check the chart for later shortages.'
            : 'Projected inventory stays at or above safety stock over the next 30 days.'}</p>`}
        ${saved ? `<div class="inventory-draft"><strong>Saved draft · Buyer review</strong>
          <p class="sub">${fmt(saved.quantity)} units · Order ${dateLabel(saved.orderDay)} · Target receipt ${dateLabel(saved.arrivalDay)} · ${scenarios[saved.uplift]}</p>
          <p class="sub">${storageIssue ? 'Saved for this session.' : 'Saved in this browser.'} Drafts stay outside the inventory forecast until confirmed.</p>
          <button type="button" class="button inline" data-inventory-draft="remove">Remove draft</button></div>` : ''}
      </div>
    </section>`;
  }

  function render() {
    const plans = items.map(planFor);
    const plan = plans.find(candidate => candidate.item.sku === sku);
    const delay = settings.get(sku)?.receiptDelay ?? 0;
    const events = eventRows(plan);
    return `<div id="inventory-planning">
      ${overview(plans)}
      <div class="inventory-grid section-gap">
        <section class="panel inventory-forecast" aria-labelledby="inventory-forecast-heading">
          <div class="panel-head"><div><h2 id="inventory-forecast-heading" tabindex="-1">30-day inventory forecast</h2>
            <p class="sub">${plan.item.name} · ${plan.item.location}</p></div><span class="tag gray">Statistical demo</span></div>
          <div class="panel-inner">
            <form id="inventory-scenario" class="inventory-controls">
              <label for="inventory-uplift">Demand scenario<select name="uplift" id="inventory-uplift">
                ${Object.entries(scenarios).map(([value, label]) => option(value, label, uplift)).join('')}</select></label>
              <label for="inventory-lead">Supplier lead time (days)<input id="inventory-lead" name="lead" type="number" min="1" max="30" value="${plan.leadDays}" required></label>
              <label for="inventory-delay">Inbound delay (days)<input id="inventory-delay" name="delay" type="number" min="0" max="30" value="${delay}" required
                ${plan.receipts.length ? '' : ' disabled'}></label>
              <button type="submit" class="button primary">Run scenario</button>
            </form>
            <dl class="inventory-forecast-summary">
              <div><dt>Forecast demand</dt><dd>${decimal.format(plan.dailyDemand)} units/day</dd></div>
              <div><dt>First below safety stock</dt><dd>${dateOf(plan.buffer)}</dd></div>
              <div><dt>First stockout</dt><dd>${dateOf(plan.stockout)}</dd></div>
            </dl>
            ${chart(plan)}
            <details class="inventory-method"><summary>Forecast inputs</summary>
              <p class="sub">Average daily historical demand was ${decimal.format(plan.recentRate)} units in the last 7 days and ${decimal.format(plan.olderRate)} in the prior 7 days. The forecast weights those periods 65% and 35% before applying the demand scenario. Supplier lead time and inbound delays apply to this SKU.</p>
              <p class="sub">Reservations reduce opening stock. Opening stock plus receipts minus forecast and separately scheduled commitments gives projected availability. Negative balances indicate unfilled demand.</p>
            </details>
          </div>
        </section>
        <div class="inventory-side">
          ${replenishment(plan)}
          <section class="panel" aria-labelledby="inventory-inbound-heading"><div class="panel-head"><h2 id="inventory-inbound-heading">Inbound and committed demand</h2></div>
            <div class="panel-inner">${events ? `<ul class="inventory-events">${events}</ul>` : '<p class="sub">No open receipts or firm campaign commitments.</p>'}</div>
          </section>
        </div>
      </div>
    </div>`;
  }

  function bind(root, rerender, notify) {
    const form = root.querySelector('#inventory-scenario');
    form.addEventListener('submit', event => {
      event.preventDefault();
      const scenario = Number(form.elements.namedItem('uplift').value);
      const leadDays = form.elements.namedItem('lead').valueAsNumber;
      const delay = form.elements.namedItem('delay');
      const receiptDelay = delay.disabled ? 0 : delay.valueAsNumber;
      if (!Object.hasOwn(scenarios, scenario) || !Number.isInteger(leadDays) || leadDays < 1 || leadDays > 30
        || !Number.isInteger(receiptDelay) || receiptDelay < 0 || receiptDelay > 30) return;
      uplift = scenario;
      settings.set(sku, { leadDays, receiptDelay });
      rerender();
      root.querySelector('#inventory-forecast-heading').focus({ preventScroll: true });
      notify('Inventory forecast updated.');
    });
    for (const button of root.querySelectorAll('[data-plan-sku]')) {
      button.addEventListener('click', () => {
        if (!bySku.has(button.dataset.planSku)) return;
        sku = button.dataset.planSku;
        rerender();
        root.querySelector('#inventory-forecast-heading').focus();
      });
    }
    for (const button of root.querySelectorAll('[data-inventory-draft]')) {
      button.addEventListener('click', () => {
        const saving = button.dataset.inventoryDraft === 'save';
        const proposal = planFor(bySku.get(sku)).replenishment;
        if (saving && !proposal?.quantity) return;
        updateDraft(sku, saving
          ? { sku, quantity: proposal.quantity, orderDay: proposal.orderDay, arrivalDay: proposal.arrivalDay, uplift }
          : null);
        rerender();
        root.querySelector('[data-inventory-draft="save"]')?.focus({ preventScroll: true });
        notify(saving ? 'Purchase draft saved.' : 'Purchase draft removed.');
      });
    }
  }

  globalThis.InventoryPlanning = { render, bind };
})();
