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
      title: '商業インボイス案',
      heading: 'Commercial Invoice',
      description: '輸出者・輸入者、品名、数量、単価、取引条件を記載。輸出者の原本と照合します。',
      reference: (shipment) => shipment.invoiceNumber,
      render(shipment, code) {
        return fields([
          ['Invoice date', shipment.invoiceDate], ['Currency', shipment.currency],
          ['Seller / exporter', shipment.exporter], ['Buyer / importer', shipment.importerEnglish],
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
      title: 'パッキングリスト案',
      heading: 'Packing List',
      description: '箱番号ごとの品目、数量、正味重量、梱包込み重量。倉庫の梱包実績と照合します。',
      reference: (shipment) => shipment.id + '-PL',
      render(shipment) {
        return fields([
          ['Exporter', shipment.exporter], ['Consignee', shipment.importerEnglish],
          ['Invoice reference', shipment.invoiceNumber], ['Route', shipment.route]
        ]) + table(['Carton', 'SKU', 'Packs', 'Net kg', 'Gross kg'],
          [...shipment.cartons.map(carton => [carton.id, shipment.sku, carton.units, kg(carton.units * shipment.packGrams), kg(carton.grossGrams)]),
            ['Total (' + shipment.cartons.length + ' cartons)', '—', shipment.quantity, kg(shipment.netGrams), kg(shipment.grossGrams)]]);
      }
    },
    declaration: {
      title: '輸入申告の転記シート',
      heading: '進口報單｜申報資料準備表',
      description: '台湾のCCCコード、申告品名、数量・価格、運送書類の照合に使います。',
      reference: (shipment) => shipment.id + '-DECL',
      render(shipment, code) {
        return fields([
          ['進口人', shipment.importer], ['出口人', shipment.exporter],
          ['商業發票號碼', shipment.invoiceNumber], ['交易條件', shipment.tradeTerms],
          ['起運地／目的地', shipment.route], ['空運提單（AWB）', '待核對承運人簽發的提單'],
          ['商品金額', shipment.currency + ' ' + amount(shipment.merchandiseTotal)],
          ['運費／保險及完稅價格', '依實際費用及申報條件核對']
        ]) + table(['中文貨名', '原產國', 'HS', '臺灣 CCC', '數量', '淨重 kg'], [
          [shipment.productChinese, '日本', hsCode(code.hs), cccCode(code.ccc), shipment.quantity + ' 包', kg(shipment.netGrams)]
        ]);
      }
    },
    food: {
      title: '食品報驗の品目資料案',
      heading: '輸入食品查驗｜產品資料草稿',
      description: '品名・原材料・ブランド・製造者・原産国を整理。報驗申請書、輸入申告の写し等と照合します。',
      reference: (shipment) => shipment.id + '-FOOD',
      render(shipment, code) {
        return fields([
          ['進口人', shipment.importer], ['申報品名', shipment.productChinese],
          ['品牌', shipment.brand], ['製造商', shipment.manufacturer],
          ['原料成分', '綠茶 100%'], ['原產國', '日本'],
          ['包裝規格', shipment.packGrams + ' g／包'], ['數量／淨重', shipment.quantity + ' 包／' + kg(shipment.netGrams) + ' kg'],
          ['臺灣 CCC', cccCode(code.ccc)], ['輸入規定', code.ccc === teaCode.ccc ? teaCode.importRule + '（範例）' : '依所填 CCC 查詢'],
          ['批號／有效日期', '依生產商批次資料與標示確認'],
          ['進口報單號碼', '以實際申報資料補填']
        ]) + '<p class="broker-print-note" lang="ja">申請時は報驗申請書・輸入申告の写しと照合し、指定・追加資料を案件ごとに確認します。</p>';
      }
    }
  };

  function preview(key, shipment, classification) {
    const doc = documents[key];
    const lang = key === 'invoice' || key === 'packing' ? 'en' : 'zh-Hant';
    return '<article class="broker-document" lang="' + lang + '"><header class="broker-print-head"><div><p class="broker-watermark">DEMO · DRAFT · 送信不可</p><h3>' +
      escape(doc.heading) + '</h3></div><div class="broker-print-ref">' + escape(doc.reference(shipment)) +
      '<br>Revision ' + classification.revision + '</div></header>' + doc.render(shipment, classification) + '</article>' +
      '<div class="broker-print-actions row-actions"><button class="button primary" type="button" data-broker-print>印刷・PDF保存</button></div>';
  }

  globalThis.BrokerDocuments = { sources, teaCode, escape, hsCode, cccCode, documents, preview };
})();
