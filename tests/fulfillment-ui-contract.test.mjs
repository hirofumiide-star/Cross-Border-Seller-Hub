import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { runFixture, runLive } from '../scripts/run-fulfillment-demo.mjs';

const uiSource = await readFile(new URL('../mvp/fulfillment-import.js', import.meta.url), 'utf8');

function importer() {
  const context = vm.createContext({ Intl, URL });
  vm.runInContext(uiSource, context);
  let change;
  const input = {
    isConnected: true,
    files: [],
    addEventListener(type, listener) { if (type === 'change') change = listener; },
    focus() {}
  };
  const container = {
    querySelector(selector) { return selector === '#fulfillment-file' ? input : null; },
    querySelectorAll() { return []; }
  };
  const api = context.FulfillmentDemoImport;
  api.bind(container, () => {});
  return {
    async load(report) {
      const text = typeof report === 'string' ? report : JSON.stringify(report);
      input.files = [{ size: Buffer.byteLength(text), text: async () => text }];
      await change();
      return api.render();
    }
  };
}

test('actual CLI fixture report imports with explicit sample labels and unknown freight', async () => {
  const { report } = await runFixture();
  const html = await importer().load(report);
  assert.match(html, /架空のサンプル結果/);
  assert.match(html, /#DEMO-1001/);
  assert.match(html, /DEMO-TRACK-0001/);
  assert.match(html, /実績配送費<\/dt><dd>未取得/);
  assert.doesNotMatch(html, /形式と一致しません/);
});

test('missing-credentials report imports as unconfigured and never reads the network', async () => {
  const result = await runLive({ orderId: '19055954755837', submit: false },
    { SHOPIFY_DEV_STORE: 'uji-tsukino-sabo-demo.myshopify.com' },
    () => { throw new Error('Network must not be called without credentials'); });
  assert.equal(result.exitCode, 2);
  const html = await importer().load(result.report);
  assert.match(html, /接続未設定/);
  assert.match(html, /注文の実行結果はまだありません/);
  assert.doesNotMatch(html, /生成時にAPI応答を確認/);
});

test('customer fields and forged freight totals are rejected and clear the old successful report', async () => {
  const { report } = await runFixture();
  const view = importer();
  await view.load(report);
  const privateReport = structuredClone(report);
  privateReport.orders[0].shippingAddress = { address1: 'Private address' };
  const privateHtml = await view.load(privateReport);
  assert.match(privateHtml, /注文・商品・金額の形式に問題/);
  assert.doesNotMatch(privateHtml, /DEMO-TRACK-0001|Private address/);
  const pricedReport = structuredClone(report);
  pricedReport.orders[0].shipment.actualShippingCost = report.orders[0].shippingCharged;
  const priceHtml = await view.load(pricedReport);
  assert.match(priceHtml, /出荷状況・追跡情報の形式が不正/);
});

test('product labels are escaped and multiple parcels remain visible', async () => {
  const { report } = await runFixture();
  report.orders[0].lines[0].title = '<img src=x onerror=alert(1)>';
  report.orders[0].shipment.trackingNumbers.push('DEMO-TRACK-0002');
  const html = await importer().load(report);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /DEMO-TRACK-0001/);
  assert.match(html, /DEMO-TRACK-0002/);
});
