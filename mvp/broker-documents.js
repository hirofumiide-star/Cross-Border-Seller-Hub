(() => {
  'use strict';

  const sources = {
    cargo: 'https://web.customs.gov.tw/taipei/singlehtml/140?cntId=cus2_51153_140',
    tariff: 'https://portal.sw.nat.gov.tw/APGQ/XGC411',
    foodCodes: 'https://www.fda.gov.tw/tc/includes/GetFile.ashx?id=f638258815796454372',
    foodInspection: 'https://www.fda.gov.tw/eng/lawContent.aspx?cid=5094&id=3068',
    amendment: 'https://web.customs.gov.tw/singlehtml/40?cntId=450b2b9654b34f2eac353c434e373daf'
  };
  const teaCode = { hs: '090210', ccc: '09021000007', importRule: 'F01' };

  const escape = value => String(value).replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const groupDigits = (value, lengths) => {
    let offset = 0;
    return lengths.map(length => {
      const part = value.slice(offset, offset + length);
      offset += length;
      return part;
    }).join('.');
  };
  const hsCode = value => groupDigits(value, [4, 2]);
  const cccCode = value => groupDigits(value.slice(0, 10), [4, 2, 2, 2]) + '-' + value.slice(10);
  const amount = value => new Intl.NumberFormat('en', { minimumFractionDigits: 2 }).format(value);
  const kg = grams => (grams / 1000).toFixed(2);

  const fields = rows => '<dl class="broker-print-fields">' + rows.map(([label, value]) =>
    '<div><dt>' + escape(label) + '</dt><dd>' + escape(value) + '</dd></div>').join('') + '</dl>';
  const table = (columns, rows) => '<div class="table-scroll"><table><thead><tr>' + columns.map(label =>
    '<th scope="col">' + escape(label) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(row =>
    '<tr>' + row.map(value => '<td>' + escape(value) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';

  const documents = {
    invoice: {
      title: 'Commercial invoice',
      heading: 'Commercial Invoice',
      description: 'Verify the parties, items, prices, and trade terms against the exporter’s original invoice.',
      reference: (shipment) => shipment.invoiceNumber,
      render(shipment, code) {
        return fields([
          ['Invoice date', shipment.invoiceDate], ['Currency', shipment.currency],
          ['Seller / exporter', shipment.exporter], ['Buyer / importer', shipment.importer],
          ['Delivery terms', shipment.tradeTerms], ['Route', shipment.route]
        ]) + table(['SKU and description', 'Origin', 'HS code', 'Quantity', 'Unit price', 'Line total'], [
          [shipment.sku + ' · ' + shipment.descriptionEnglish, 'Japan', hsCode(code.hs),
            shipment.quantity + ' packs', amount(shipment.unitValue), amount(shipment.merchandiseTotal)]
        ]) + fields([
          ['Merchandise total', shipment.currency + ' ' + amount(shipment.merchandiseTotal)],
          ['Shipment reference', shipment.id]
        ]) + '<p class="broker-print-note">Reconcile prices and trade terms against the exporter’s actual commercial invoice.</p>';
      }
    },
    packing: {
      title: 'Packing list',
      heading: 'Packing List',
      description: 'Reconcile carton marks, item counts, and net and gross weights with warehouse records.',
      reference: (shipment) => shipment.id + '-PL',
      render(shipment) {
        return fields([
          ['Exporter', shipment.exporter], ['Consignee', shipment.importer],
          ['Invoice reference', shipment.invoiceNumber], ['Route', shipment.route]
        ]) + table(['Carton', 'SKU', 'Packs', 'Net kg', 'Gross kg'],
          [...shipment.cartons.map(carton => [carton.id, shipment.sku, carton.units, kg(carton.units * shipment.packGrams), kg(carton.grossGrams)]),
            ['Total (' + shipment.cartons.length + ' cartons)', '—', shipment.quantity, kg(shipment.netGrams), kg(shipment.grossGrams)]]);
      }
    },
    declaration: {
      title: 'Import declaration worksheet',
      heading: 'Taiwan Import Declaration Worksheet',
      description: 'Review the local CCC code, goods description, value, and carrier reference.',
      reference: (shipment) => shipment.id + '-DECL',
      render(shipment, code) {
        return fields([
          ['Importer', shipment.importer], ['Exporter', shipment.exporter],
          ['Commercial invoice reference', shipment.invoiceNumber], ['Trade terms', shipment.tradeTerms],
          ['Route', shipment.route], ['Air waybill (AWB)', 'Reconcile with the carrier-issued air waybill'],
          ['Merchandise value', shipment.currency + ' ' + amount(shipment.merchandiseTotal)],
          ['Freight, insurance, and customs value', 'Verify charges and valuation based on the transaction']
        ]) + table(['Goods description (Traditional Chinese)', 'Origin', 'HS', 'Taiwan CCC', 'Quantity', 'Net kg'], [
          [shipment.productChinese, 'Japan', hsCode(code.hs), cccCode(code.ccc), shipment.quantity + ' packs', kg(shipment.netGrams)]
        ]);
      }
    },
    food: {
      title: 'TFDA product information sheet',
      heading: 'TFDA Food Inspection Product Information',
      description: 'Check the ingredients, brand, producer, and origin against the inspection application.',
      reference: (shipment) => shipment.id + '-FOOD',
      render(shipment, code) {
        return fields([
          ['Importer', shipment.importer], ['Declared goods (Traditional Chinese)', shipment.productChinese],
          ['Brand', shipment.brand], ['Manufacturer', shipment.manufacturer],
          ['Ingredients', shipment.ingredient], ['Origin', 'Japan'],
          ['Pack size', shipment.packGrams + ' g per pack'], ['Quantity and net weight', shipment.quantity + ' packs / ' + kg(shipment.netGrams) + ' kg'],
          ['Taiwan CCC', cccCode(code.ccc)], ['Import regulation', code.ccc === teaCode.ccc ? teaCode.importRule + ' (reference)' : 'Confirm against the saved CCC'],
          ['Lot number and expiry', 'Verify against producer lot records and labels'],
          ['Import declaration number', 'Enter the filed reference']
        ]) + '<p class="broker-print-note">Reconcile with the inspection application and a copy of the import declaration. Confirm any additional evidence requested for the shipment.</p>';
      }
    }
  };

  function preview(key, shipment, classification) {
    const doc = documents[key];
    return '<article class="broker-document" lang="en"><header class="broker-print-head"><div><p class="broker-watermark">DEMO DRAFT · FOR REVIEW ONLY</p><h3>' +
      escape(doc.heading) + '</h3></div><div class="broker-print-ref">' + escape(doc.reference(shipment)) +
      '<br>Revision ' + classification.revision + '</div></header>' + doc.render(shipment, classification) + '</article>' +
      '<div class="broker-print-actions row-actions"><button class="button primary" type="button" data-broker-print>Print / Save as PDF</button></div>';
  }

  globalThis.BrokerDocuments = { sources, teaCode, escape, hsCode, cccCode, documents, preview };
})();
