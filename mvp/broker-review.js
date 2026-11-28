(() => {
  'use strict';

  const { sources, teaCode, escape, hsCode, cccCode } = BrokerDocuments;
  const tariff = { title: 'Taiwan FDA commodity list', url: sources.foodCodes };
  const referenceData = {
    TW: {
      name: 'Taiwan', localName: 'Taiwan CCC', foodTitle: 'TFDA food inspection (F01)',
      foodReference: 'Inspection application, product information sheet, and a copy of the import declaration.',
      foodSource: { title: 'Taiwan FDA · Article 4', url: sources.foodInspection },
      products: {
        sencha: { hs: teaCode.hs, local: teaCode.ccc, source: tariff },
        black: { hs: '090230', local: '09023090004', source: tariff }
      }
    },
    US: {
      name: 'United States', localName: 'U.S. HTS reporting number', foodTitle: 'U.S. FDA Prior Notice',
      foodReference: 'Obtain Prior Notice confirmation for the commercial food shipment.',
      foodSource: { title: 'U.S. FDA · Prior Notice', url: 'https://www.fda.gov/industry/fda-import-process/prior-notice-imported-foods' },
      products: {
        sencha: { hs: '090210', source: { title: 'USITC tariff schedule', url: 'https://hts.usitc.gov/search?query=0902.10' } },
        black: { hs: '090230', source: { title: 'USITC tariff schedule', url: 'https://hts.usitc.gov/search?query=0902.30' } }
      }
    }
  };
  const products = {
    sencha: { name: 'Sencha green tea', profile: 'Unfermented green tea', packGrams: 80 },
    black: { name: 'Loose-leaf black tea', profile: 'Fully fermented black tea', packGrams: 60 }
  };
  const exampleDrafts = {
    TW: { black: { hs: '090210', local: '09021000007', currency: 'TWD', unitValue: 250, invoiceTotal: 25000, packedUnits: 100 } },
    US: {
      sencha: { hs: '090210', currency: 'USD', unitValue: 8, invoiceTotal: 800, packedUnits: 100 },
      black: { hs: '090230', currency: 'USD', unitValue: 9, invoiceTotal: 900, packedUnits: 98 }
    }
  };
  let selection = { destination: 'TW', product: 'sencha' };
  const status = { match: 'Match', mismatch: 'Mismatch', review: 'Needs review' };
  const number = new Intl.NumberFormat('en-US');

  function compare(title, recorded, reference, current, expected, source, matchNote, nextStep) {
    const result = current === expected ? 'match' : current ? 'mismatch' : 'review';
    return { title, recorded, reference, result, source, detail: result === 'match' ? matchNote : nextStep };
  }

  function assess(shipment, draft, destination, product) {
    const market = referenceData[destination];
    const item = products[product];
    const reference = market.products[product];
    const isCase = destination === shipment.destination && product === shipment.productKey;
    // Compare the broker's saved values to reference data. Other lanes use independent sample records.
    const imported = isCase ? draft : { quantity: 100, packGrams: item.packGrams, ...exampleDrafts[destination][product] };
    const amount = imported.quantity * imported.unitValue;
    const amountsMatch = imported.invoiceTotal === amount && imported.packedUnits === imported.quantity;
    const codeChecks = [
      compare('HS classification', imported.hs ? hsCode(imported.hs) : 'No HS code',
        hsCode(reference.hs) + ' · ' + item.profile, imported.hs, reference.hs, reference.source,
        'The recorded HS code matches this product profile.',
        'Confirm the product specification and review this candidate code with the broker.')
    ];
    if (reference.local) {
      codeChecks.push(compare(market.localName, imported.local ? cccCode(imported.local) : 'No code on file',
        cccCode(reference.local), imported.local, reference.local, reference.source,
        'The recorded national code matches this reference.',
        'Add or correct the 11-digit CCC after the broker checks the reference.'))
    } else {
      codeChecks.push({
        title: market.localName, recorded: 'No reporting number on file', reference: 'Check the current U.S. HTS subheading and statistical suffix.',
        result: 'review', source: reference.source, detail: 'Confirm the full national code from the product specification before filing.'
      });
    }
    return {
      isCase, market, item,
      findings: [...codeChecks, {
        title: 'Immediate package size', recorded: number.format(imported.packGrams) + ' g per retail pack',
        reference: 'Up to 3 kg per immediate package for this reference.',
        result: imported.packGrams <= 3000 && imported.packGrams > 0 ? 'match' : 'mismatch',
        source: reference.source, detail: 'Use the immediate package weight from the supplier specification.'
      }, {
        title: 'Invoice and packing reconciliation',
        recorded: imported.currency + ' ' + number.format(imported.invoiceTotal) + ' on invoice · ' + imported.packedUnits + ' packs on packing list',
        reference: imported.currency + ' ' + number.format(amount) + ' calculated · ' + imported.quantity + ' packs declared',
        result: amountsMatch ? 'match' : 'mismatch',
        detail: amountsMatch ? 'The sample totals agree. Confirm against the signed invoice and warehouse records.' :
          'Reconcile the warehouse count and invoice before preparing the filing.'
      }, {
        title: market.foodTitle,
        recorded: isCase ? 'Product data available · formal evidence pending' : 'No filing evidence in the reference scenario',
        reference: market.foodReference,
        result: 'review', source: market.foodSource, detail: 'Ask the importer or broker for the filing evidence.'
      }]
    };
  }

  function options(data, value) {
    return Object.entries(data).map(([key, item]) =>
      '<option value="' + key + '"' + (key === value ? ' selected' : '') + '>' + escape(item.name) + '</option>').join('');
  }

  function render(shipment, draft, canEdit) {
    const { destination, product } = selection;
    const { isCase, market, item, findings } = assess(shipment, draft, destination, product);
    const summary = Object.entries({ match: 'matched', mismatch: 'mismatch', review: 'to review' }).map(([key, label]) => {
      const count = findings.filter(finding => finding.result === key).length;
      return '<li class="review-status ' + key + '"><strong>' + count + '</strong> ' + label +
        (key === 'mismatch' && count !== 1 ? 'es' : '') + '</li>';
    }).join('');
    const firstIssue = findings.findIndex(finding => finding.result === 'mismatch');
    return `<section class="panel broker-review section-gap" aria-labelledby="broker-review-heading">
      <div class="panel-head"><div><h2 id="broker-review-heading" tabindex="-1">AI-assisted document review</h2>
        <p class="sub">Cross-check the draft against country and product reference data before the broker approves it.</p></div>
        <span class="tag gray">Rule-based demo</span></div>
      <form class="broker-review-controls" id="broker-review-form">
        <label for="review-country">Destination country<select name="destination" id="review-country">${options(referenceData, destination)}</select></label>
        <label for="review-product">Product<select name="product" id="review-product">${options(products, product)}</select></label>
        <button class="button primary" type="submit">Run review</button>
      </form>
      <div class="broker-review-summary">
        <div><strong>${market.name} · ${item.name}</strong>
          <p class="sub">${isCase ? 'Case ' + shipment.id + ' · ' + draft.version : 'Reference scenario · Separate sample data'}</p></div>
        <ul aria-label="Review findings by status">${summary}</ul>
      </div>
      <div class="broker-findings">${findings.map((result, i) => `<details class="broker-finding"${i === firstIssue ? ' open' : ''}>
        <summary><span>${result.title}</span><span class="review-status ${result.result}">${status[result.result]}</span></summary>
        <div class="broker-finding-body">
          <dl><div><dt>Draft data</dt><dd>${escape(result.recorded)}</dd></div><div><dt>Reference or expected value</dt><dd>${escape(result.reference)}</dd></div></dl>
          <p class="sub">${escape(result.detail)}</p>
          <div class="broker-finding-links">
            ${result.source ? `<a href="${result.source.url}" target="_blank" rel="noopener">${result.source.title} ↗</a>` : ''}
            ${isCase && canEdit && i < 2 && result.result !== 'match' ? '<button type="button" class="button" data-broker-use-reference>Copy candidate to editor</button>' : ''}
          </div>
        </div>
      </details>`).join('')}</div>
    </section>`;
  }

  function select(destination, product) {
    if (Object.hasOwn(referenceData, destination) && Object.hasOwn(products, product)) selection = { destination, product };
  }

  globalThis.BrokerReview = { render, select };
})();
