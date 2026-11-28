(() => {
  'use strict';

  const { sources, teaCode, escape, hsCode, cccCode, documents, preview } = BrokerDocuments;
  const storageKey = 'seller-hub-broker-demo-v1';
  const importedHs = '090220';
  const stages = {
    preparation: 'Awaiting product review and authorization',
    queued: 'Awaiting broker acceptance',
    received: 'Document review in progress',
    information: 'Awaiting supporting documents',
    filed: 'Customs and TFDA filings recorded',
    sampling: 'Awaiting sampling results',
    held: 'On hold',
    cleared: 'TFDA and customs clearance recorded',
    handedOff: 'Handed off to Taiwan receiving hub',
    completed: 'Delivered to Taiwan buyers'
  };
  const roles = { hub: 'Seller Hub', broker: 'Taiwan customs broker' };
  const campaign = {
    id: 'TW-TEA-001',
    destination: 'TW',
    productKey: 'sencha',
    title: 'Uji sencha · Taiwan group buy',
    sku: 'JP-UJI-SENCHA-80G',
    product: 'Sencha · 80 g per pack',
    ingredient: '100% green tea',
    origin: 'Kyoto, Japan',
    manufacturer: 'Tsukino Tea House (demo)',
    importer: 'Taipei Tea Products Co. (demo), Taipei, Taiwan',
    broker: 'Taoyuan Customs Services (demo)',
    exporter: 'Tsukino Tea House (demo), Uji, Kyoto, Japan',
    brand: 'Tsukino Tea House (demo)',
    productChinese: '日本煎茶（未發酵綠茶，80 g／包）',
    descriptionEnglish: 'Japanese sencha, unfermented green tea, retail pack, 80 g',
    invoiceNumber: 'DEMO-INV-TW-001',
    invoiceDate: '2026-11-28',
    tradeTerms: 'FCA Kansai International Airport, Japan (Incoterms® 2020)',
    route: 'Osaka Kansai (KIX) → Taiwan Taoyuan (TPE)',
    cartons: [
      { id: 'C01', organizer: 'DEMO-ORG-01', units: 55, grossGrams: 5500 },
      { id: 'C02', organizer: 'DEMO-ORG-02', units: 45, grossGrams: 4500 }
    ],
    minimum: 80,
    packGrams: 80,
    currency: 'TWD',
    unitValue: 250
  };
  const actions = {
    check: { role: 'hub', from: ['preparation'], label: 'Record product and document review', log: 'Product specifications, labeling, and documents reviewed' },
    authorize: { role: 'hub', from: ['preparation'], label: 'Confirm importer authorization', log: 'Taiwan importer authorization confirmed (demo)' },
    handoff: { role: 'hub', from: ['preparation'], to: 'queued', label: 'Hand off case to broker', log: 'Case and documents shared with the assigned broker (demo)' },
    receive: { role: 'broker', from: ['queued'], to: 'received', label: 'Accept assigned case', log: 'Broker accepted the case' },
    classify: { role: 'broker', from: ['received'], note: true, log: 'Broker reviewed and revised the classification' },
    request: { role: 'broker', from: ['received', 'filed', 'sampling'], to: 'information', label: 'Request supporting documents', note: true, log: 'Broker requested supporting documents' },
    reply: { role: 'hub', from: ['information'], label: 'Record supporting documents shared', note: true, log: 'Seller Hub shared supporting documents (demo)' },
    file: { role: 'broker', from: ['received'], to: 'filed', label: 'Record customs and TFDA filings', log: 'Import declaration and TFDA food inspection filing recorded (demo)' },
    sample: { role: 'broker', from: ['filed'], to: 'sampling', label: 'Record inspection sampling', log: 'Authority sampling recorded (demo)' },
    hold: { role: 'broker', from: ['filed', 'sampling'], to: 'held', label: 'Record a hold or issue', note: true, log: 'Broker recorded the reason for the hold' },
    resume: { role: 'broker', from: ['held'], label: 'Record hold resolution', note: true, log: 'Broker recorded the hold resolution' },
    clear: { role: 'broker', from: ['filed', 'sampling'], to: 'cleared', label: 'Record TFDA and customs clearance', log: 'TFDA acceptance and customs release recorded (demo)' },
    deliver: { role: 'hub', from: ['cleared'], to: 'handedOff', label: 'Record receiving hub handoff', log: 'Taiwan receiving hub handoff recorded (demo)' },
    complete: { role: 'hub', from: ['handedOff'], to: 'completed', label: 'Confirm delivery to all buyers', log: 'Local deliveries confirmed and group-buy fulfillment completed (demo)' }
  };
  const count = campaign.cartons.reduce((total, carton) => total + carton.units, 0);
  const shipment = {
    ...campaign,
    quantity: count,
    netGrams: count * campaign.packGrams,
    grossGrams: campaign.cartons.reduce((total, carton) => total + carton.grossGrams, 0),
    merchandiseTotal: count * campaign.unitValue
  };
  const sourceDocuments = { invoiceTotal: 25000, packedUnits: 100 };

  let role = 'hub';
  let onExternalChange;
  function initial() {
    return { stage: 'preparation', checked: false, authorized: false, returnTo: null, classification: null, events: [] };
  }

  function canApply(state, key, actor) {
    if (!Object.hasOwn(actions, key)) return false;
    const action = actions[key];
    if (actor !== action.role || !action.from.includes(state.stage)) return false;
    if (key === 'check') return !state.checked;
    if (key === 'authorize') return state.checked && !state.authorized;
    if (key === 'handoff') return state.checked && state.authorized && count >= campaign.minimum;
    return true;
  }

  const validCodes = (hs, ccc) => typeof hs === 'string' && typeof ccc === 'string'
    && /^\d{6}$/.test(hs) && /^\d{11}$/.test(ccc) && ccc.startsWith(hs);

  function apply(state, event) {
    if (!event || !canApply(state, event.key, event.role)
      || typeof event.at !== 'string' || !Number.isFinite(Date.parse(event.at))
      || typeof event.note !== 'string' || event.note.length > 240) return state;
    const action = actions[event.key];
    if (action.note ? !event.note.trim() : event.note !== '') return state;
    if (event.key === 'classify') {
      if (!validCodes(event.hs, event.ccc)) return state;
      const prior = state.classification;
      const classification = { hs: event.hs, ccc: event.ccc, revision: (prior?.revision || 0) + 1 };
      const logged = { ...event, change: (prior ? hsCode(prior.hs) + ' / ' + cccCode(prior.ccc) : hsCode(importedHs) + ' / Missing')
        + ' → ' + hsCode(classification.hs) + ' / ' + cccCode(classification.ccc) };
      return { ...state, classification, events: [...state.events, logged] };
    }
    const next = { ...state, events: [...state.events, event] };
    if (event.key === 'check') next.checked = true;
    if (event.key === 'authorize') next.authorized = true;
    if (event.key === 'request' || event.key === 'hold') next.returnTo = state.stage;
    if (event.key === 'reply' || event.key === 'resume') {
      next.stage = state.returnTo;
      next.returnTo = null;
    } else if (action.to) {
      next.stage = action.to;
    }
    return next;
  }

  let state = initial();
  try {
    const events = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(events)) state = events.reduce(apply, state);
  } catch {
    // Keep the demo usable when browser storage is unavailable.
  }

  window.addEventListener('storage', event => {
    if (event.key !== storageKey) return;
    try {
      const events = JSON.parse(event.newValue);
      if (Array.isArray(events)) state = events.reduce(apply, initial());
      else if (event.newValue === null) state = initial();
      onExternalChange?.();
    } catch {
      // Keep the previous valid state.
    }
  });

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state.events));
    } catch {
      // The current page can still be used.
    }
  }

  function packageData() {
    return {
      demo: true,
      shipment: campaign.id,
      destination: 'Taiwan',
      commercialInvoiceDraft: {
        sku: campaign.sku,
        reference: shipment.invoiceNumber,
        description: shipment.descriptionEnglish,
        ingredients: '100% green tea',
        exporter: shipment.exporter,
        manufacturer: campaign.manufacturer,
        origin: campaign.origin,
        importer: campaign.importer,
        quantity: count,
        currency: shipment.currency,
        tradeTerms: shipment.tradeTerms,
        illustrativeUnitValue: campaign.unitValue,
        illustrativeTotalValue: shipment.merchandiseTotal
      },
      classification: state.classification,
      packingListDraft: {
        cartons: shipment.cartons.length,
        netKg: shipment.netGrams / 1000,
        grossKg: shipment.grossGrams / 1000,
        items: shipment.cartons.map(carton => ({
          carton: carton.id, sku: campaign.sku, quantity: carton.units,
          netKg: carton.units * shipment.packGrams / 1000, grossKg: carton.grossGrams / 1000
        }))
      },
      productLabelDraft: {
        language: 'zh-TW',
        productName: '日本煎茶',
        ingredients: '綠茶',
        netWeight: '80 g',
        countryOfOrigin: '日本',
        note: 'Illustrative copy only. Complete and verify the required label fields with the importer.'
      },
      campaignTotals: shipment.cartons.map(carton => ({ id: carton.organizer, units: carton.units })),
      documentChecklist: ['Carrier air waybill', 'Product specification and Traditional Chinese label', 'Importer authorization evidence', 'Exporter invoice and warehouse packing data', 'Import declaration and TFDA inspection application'],
      note: 'Fictional draft. Confirm the actual transaction value, local commodity code, documents and carton details with the importer and broker before any submission.'
    };
  }

  function download() {
    if (!state.checked || !state.authorized || state.stage === 'preparation') return;
    const blob = new Blob([JSON.stringify(packageData(), null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = campaign.id + '-demo-shipment.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const nextActions = () => Object.entries(actions).filter(([key]) => key !== 'classify' && canApply(state, key, role));
  const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short' });

  function reviewPanel() {
    return BrokerReview.render(shipment, {
      ...sourceDocuments,
      hs: state.classification?.hs || importedHs,
      local: state.classification?.ccc,
      packGrams: shipment.packGrams,
      quantity: shipment.quantity,
      unitValue: shipment.unitValue,
      currency: shipment.currency,
      version: state.classification ? 'Saved revision ' + state.classification.revision : 'Imported draft'
    }, canApply(state, 'classify', role));
  }

  function classificationPanel() {
    const saved = state.classification;
    const editable = canApply(state, 'classify', role);
    return `<section class="panel broker-classification" aria-labelledby="broker-classification">
      <div class="panel-head"><div><h2 id="broker-classification" tabindex="-1">Commodity classification</h2>
        <p class="sub">Verify the import codes against ingredients, processing, and immediate packaging.</p></div>
        <span class="tag ${saved ? '' : 'warn'}">${saved ? 'Reviewed · Revision ' + saved.revision : 'Review pending'}</span></div>
      <div class="panel-inner">
        <div class="broker-code-summary"><span>Imported HS code <strong>${hsCode(importedHs)}</strong><small>Imported bulk-tea code in the demo record</small></span>
          <span>Saved HS code <strong>${saved ? hsCode(saved.hs) : '—'}</strong></span>
          <span>Saved Taiwan CCC <strong>${saved ? cccCode(saved.ccc) : '—'}</strong></span></div>
        ${editable ? `<form class="broker-code-form" id="broker-code-form">
          <div class="broker-code-inputs">
            <label for="broker-hs">HS code (6 digits)<input id="broker-hs" name="hs" maxlength="16" required value="${hsCode(saved?.hs || importedHs)}" spellcheck="false" autocomplete="off"></label>
            <label for="broker-ccc">Taiwan CCC code (11 digits)<input id="broker-ccc" name="ccc" maxlength="24" required value="${saved ? cccCode(saved.ccc) : ''}" placeholder="${cccCode(teaCode.ccc)}" spellcheck="false" autocomplete="off"></label>
          </div>
          <label class="broker-note" for="broker-classification-note">Reason for review or correction<textarea id="broker-classification-note" name="reason" maxlength="240" rows="2" required placeholder="Example: Supplier confirms unfermented sencha in 80 g retail packs"></textarea></label>
          <p class="broker-error sub" id="broker-code-error" role="alert"></p>
          <div class="row-actions broker-actions"><button class="button primary" type="submit">Approve and save classification</button>
            <button class="button" type="button" id="broker-sample-code">Copy sencha reference codes</button></div>
        </form>` : `<p class="sub">${['preparation', 'queued', 'received', 'information'].includes(state.stage)
          ? 'The assigned broker can edit the codes after accepting the case.'
          : 'Check the customs amendment procedure for corrections after filing.'}</p>`}
        <p class="sub broker-links"><a href="${sources.tariff}" target="_blank" rel="noopener">Taiwan Customs code lookup</a>
          <a href="${sources.foodCodes}" target="_blank" rel="noopener">TFDA F01/F02 commodity list</a></p>
      </div>
    </section>`;
  }

  function documentPanel() {
    const saved = state.classification;
    return `<section class="panel" aria-labelledby="broker-documents">
      <div class="panel-head"><div><h2 id="broker-documents">Customs documents</h2>
        <p class="sub">${saved ? 'Drafts use saved classification revision ' + saved.revision + '.' : 'Save a classification to generate drafts from the case data.'}</p></div></div>
      <ul class="broker-doc-list">${Object.entries(documents).map(([key, doc]) => `<li><div><strong>${doc.title}</strong>
        <p class="sub">${doc.description}</p></div><button type="button" class="button" data-broker-document="${key}"
        aria-label="Preview ${doc.title}"${saved ? '' : ' disabled'}>Preview draft</button></li>`).join('')}</ul>
      <details class="broker-external"><summary>Documents to request and verify</summary>
        <ul class="sub"><li>Match the <strong>carrier-issued air waybill (AWB)</strong> to the shipment.</li>
          <li>Request the original invoice, packing records, specification, labels and lot details from the <strong>exporter and warehouse</strong>.</li>
          <li>Verify the <strong>importer’s authorization</strong> and collect any applicable permits or certificates.</li>
          <li>Have the <strong>Taiwan broker</strong> review the import declaration and food inspection filing data.</li></ul>
        <p class="sub broker-links"><a href="${sources.cargo}" target="_blank" rel="noopener">Taiwan Customs document requirements</a>
          <a href="${sources.foodInspection}" target="_blank" rel="noopener">TFDA food inspection rules</a>
          <a href="${sources.amendment}" target="_blank" rel="noopener">Taiwan Customs amendment procedure</a></p>
      </details>
    </section>`;
  }

  function render() {
    const visible = role === 'hub' || state.stage !== 'preparation';
    const roleControl = `<div class="filter-bar">
      <label for="broker-role">Viewing as
        <select id="broker-role">
          <option value="hub" ${role === 'hub' ? 'selected' : ''}>Seller Hub</option>
          <option value="broker" ${role === 'broker' ? 'selected' : ''}>Taiwan customs broker</option>
        </select>
      </label>
      <span class="sub">Demo case · Saved in this browser</span>
      ${['preparation', 'queued'].includes(state.stage) ? '<button type="button" class="button primary" data-broker-action="start-review">Start document review as broker</button>' : ''}
    </div>`;
    if (!visible) return roleControl + `<section class="panel"><div class="panel-head"><h2>No assigned case</h2></div>
      <p class="panel-inner sub">The case appears here after Seller Hub completes and hands off the preparation.</p></section>`;

    const available = nextActions();
    const organizerCounts = campaign.cartons.map(carton => carton.units + ' packs').join(' + ');
    const needsNote = available.some(([, action]) => action.note);
    const filingBlocked = !state.classification && available.some(([key]) => key === 'file');
    const handoffComplete = state.stage !== 'preparation';
    return roleControl + `<div data-broker-review>${reviewPanel()}</div>
    <section class="panel broker-case section-gap" aria-labelledby="broker-case">
      <div class="panel-head"><div><h2 id="broker-case" tabindex="-1">${campaign.title}</h2><p class="sub">${campaign.id} · ${campaign.importer}</p></div>
        <span class="tag ${['held', 'information', 'sampling'].includes(state.stage) ? 'warn' : ''}" data-broker-stage="${state.stage}">${stages[state.stage]}</span>
      </div>
      <div class="panel-inner broker-details">
        <dl><div><dt>Product</dt><dd>${campaign.product} · ${campaign.sku}</dd></div>
          <div><dt>Ingredients and origin</dt><dd>${campaign.ingredient} · ${campaign.origin}</dd></div>
          <div><dt>Manufacturer</dt><dd>${campaign.manufacturer}</dd></div>
          <div><dt>Confirmed quantity</dt><dd>${count} packs · ${campaign.minimum} pack minimum</dd></div>
          <div><dt>Quantity by organizer</dt><dd>${organizerCounts}</dd></div></dl>
        <dl><div><dt>Assigned broker</dt><dd>${campaign.broker}</dd></div>
          <div><dt>Product and documents</dt><dd>${state.checked ? 'Confirmed' : 'Pending review'}</dd></div>
          <div><dt>Importer authorization</dt><dd>${state.authorized ? 'Confirmed (demo)' : 'Pending review'}</dd></div>
          <div><dt>Shipment documents</dt><dd>${handoffComplete ? 'Shared (demo)' : 'Pending handoff'}</dd></div></dl>
      </div>
    </section>
    <div class="broker-workspace section-gap">${classificationPanel()}${documentPanel()}</div>
    <div class="broker-grid section-gap">
      <section class="panel"><div class="panel-head"><h2>Case actions</h2></div><div class="panel-inner">
        ${needsNote ? '<label class="broker-note" for="broker-note">Supporting document, hold, or response note<textarea id="broker-note" maxlength="240" rows="2" placeholder="Example: Verify the ingredients on the Traditional Chinese label"></textarea></label>' : ''}
        <p class="broker-error sub" id="broker-error" role="alert"></p>
        <div class="row-actions broker-actions">${available.map(([key, action], i) =>
          `<button type="button" class="button ${i === 0 ? 'primary' : ''}" data-broker-action="${key}"${key === 'file' && filingBlocked ? ' disabled' : ''}>${action.label}</button>`).join('')}
          ${handoffComplete ? '<button type="button" class="button" data-broker-action="download">Download shipment data (JSON)</button>' : ''}</div>
        ${filingBlocked ? '<p class="sub">Approve and save the classification before recording the filing.</p>' : ''}
        ${available.length ? '' : '<p class="sub">No action for this role at this stage.</p>'}
        ${state.stage === 'handedOff' ? '<p class="sub">The Taiwan partner arranges local deliveries. Confirm delivery to the buyers to complete the case.</p>' : ''}
      </div></section>
      <section class="panel"><div class="panel-head"><h2>Case history</h2></div><div class="panel-inner">
        ${state.events.length ? `<ol class="broker-events">${[...state.events].reverse().map(event =>
          `<li><strong>${actions[event.key].log}</strong><span>${roles[event.role]} · ${date.format(Date.parse(event.at))}</span>
            ${event.key === 'classify' ? `<p class="broker-code-change">${escape(event.change)}</p>` : ''}
            ${event.note ? `<p>${escape(event.note)}</p>` : ''}</li>`).join('')}</ol>` : '<p class="sub">No case updates yet.</p>'}
      </div></section>
    </div>
    ${role === 'hub' ? '<div class="row-actions section-gap"><button class="button" type="button" data-broker-action="reset">Reset demo case</button></div>' : ''}`;
  }

  function bind(root, rerender, notify, openDialog) {
    onExternalChange = () => {
      if (root.querySelector('#broker-role')) rerender();
    };
    root.querySelector('#broker-role').addEventListener('change', event => {
      if (!Object.hasOwn(roles, event.target.value)) return;
      role = event.target.value;
      rerender();
      document.getElementById('broker-role')?.focus();
    });

    const form = root.querySelector('#broker-code-form');
    function copyCandidate() {
      if (!form || !canApply(state, 'classify', role)) return;
      form.elements.namedItem('hs').value = hsCode(teaCode.hs);
      form.elements.namedItem('ccc').value = cccCode(teaCode.ccc);
      form.elements.namedItem('reason').focus();
    }
    const review = root.querySelector('[data-broker-review]');
    review?.addEventListener('submit', event => {
      event.preventDefault();
      BrokerReview.select(event.target.elements.namedItem('destination').value, event.target.elements.namedItem('product').value);
      review.innerHTML = reviewPanel();
      review.querySelector('#broker-review-heading').focus();
      notify('Document review updated.');
    });
    review?.addEventListener('click', event => {
      if (event.target.closest('[data-broker-use-reference]')) copyCandidate();
    });
    if (form) {
      const hs = form.elements.namedItem('hs');
      const ccc = form.elements.namedItem('ccc');
      const reason = form.elements.namedItem('reason');
      root.querySelector('#broker-sample-code').addEventListener('click', copyCandidate);
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (!canApply(state, 'classify', role)) return;
        const normalizedHs = hs.value.replace(/[.\s-]/g, '');
        const normalizedCcc = ccc.value.replace(/[.\s-]/g, '');
        const note = reason.value.trim();
        if (!validCodes(normalizedHs, normalizedCcc) || !note) {
          root.querySelector('#broker-code-error').textContent = 'Enter a six-digit HS and an 11-digit Taiwan CCC with the same first six digits. Add the reason for the review.';
          (note ? hs : reason).focus();
          return;
        }
        state = apply(state, { key: 'classify', role, note, hs: normalizedHs, ccc: normalizedCcc, at: new Date().toISOString() });
        persist();
        rerender();
        document.getElementById('broker-classification')?.focus();
        notify('Classification saved. The document review and drafts use this revision.');
      });
    }

    for (const button of root.querySelectorAll('[data-broker-document]')) {
      button.addEventListener('click', () => {
        const key = button.dataset.brokerDocument;
        if (!state.classification || !Object.hasOwn(documents, key)) return;
        openDialog(documents[key].title, preview(key, shipment, state.classification), 'Close');
        document.querySelector('#dialog [data-broker-print]').addEventListener('click', () => window.print());
      });
    }

    for (const button of root.querySelectorAll('[data-broker-action]')) {
      button.addEventListener('click', () => {
        const key = button.dataset.brokerAction;
        if (key === 'download') return download();
        if (key === 'start-review') {
          for (const action of ['check', 'authorize', 'handoff', 'receive']) {
            state = apply(state, { key: action, role: actions[action].role, note: '', at: new Date().toISOString() });
          }
          role = 'broker';
          persist();
          rerender();
          document.getElementById('broker-review-heading')?.focus();
          notify('Demo case accepted. Review the findings and confirm the classification.');
          return;
        }
        if (key === 'reset' && role === 'hub') {
          if (!window.confirm('Reset the customs demo history in this browser?')) return;
          state = initial();
          persist();
        } else {
          if (!canApply(state, key, role) || (key === 'file' && !state.classification)) return;
          const memo = root.querySelector('#broker-note');
          const note = actions[key].note ? memo.value.trim() : '';
          if (actions[key].note && !note) {
            root.querySelector('#broker-error').textContent = 'Enter a note to continue.';
            memo.focus();
            return;
          }
          state = apply(state, { key, role, note, at: new Date().toISOString() });
          persist();
        }
        rerender();
        document.getElementById('broker-case')?.focus();
        notify(key === 'reset' ? 'Demo case reset.' : 'Case updated.');
      });
    }
  }

  globalThis.BrokerDemo = { render, bind };
})();
