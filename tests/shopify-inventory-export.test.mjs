import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { exportShopifyReport } from '../scripts/export-shopify-test-orders.mjs';

const host = 'tea-test.myshopify.com';
const env = { SHOPIFY_DEV_STORE: host, SHOPIFY_CLIENT_ID: 'fixture-id', SHOPIFY_CLIENT_SECRET: 'fixture-secret' };
const current = new Date('2026-11-28T05:00:00Z');
const id = 'gid://shopify/InventoryItem/901';
const page = (nodes, endCursor = null) => ({ nodes, pageInfo: { endCursor, hasNextPage: Boolean(endCursor) } });
const line = (sku, currentQuantity) => ({ title: 'Tea from test order', sku, currentQuantity });
const order = (number, day, fields = {}) => ({
  id: 'gid://shopify/Order/' + number, test: true, createdAt: '2026-11-' + day + 'T03:00:00Z',
  cancelledAt: null, displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED',
  currentSubtotalPriceSet: { shopMoney: { amount: '20.00', currencyCode: 'JPY' } },
  lineItems: page([line('TEA-01', 10)]), ...fields
});
const level = (id, online, readLocations) => ({
  isActive: true,
  location: { id: 'gid://shopify/Location/' + id,
    ...(readLocations ? { name: online ? 'Online warehouse' : 'Retail pickup', isActive: true, fulfillsOnlineOrders: online } : {}) },
  quantities: Object.entries({ on_hand: 37, available: 22, committed: 10, incoming: 24 })
    .map(([name, quantity]) => ({ name, quantity }))
});

function mockShopify(t, { development = true, badQuantities = false, locationAccess = false } = {}) {
  const queries = [];
  t.mock.method(globalThis, 'fetch', async (url, request) => {
    assert(url.startsWith('https://' + host + '/'));
    if (url.endsWith('/admin/oauth/access_token')) {
      assert.equal(request.body.get('grant_type'), 'client_credentials');
      return Response.json({ access_token: 'fixture-token' });
    }
    assert(url.endsWith('/admin/api/2026-10/graphql.json'));
    assert.equal(request.headers['X-Shopify-Access-Token'], 'fixture-token');
    const { query, variables } = JSON.parse(request.body);
    const operation = query.match(/^query (\w+)/)[1];
    queries.push(operation);
    if (operation === 'SellerHubInventory' || operation === 'SellerHubMoreInventoryLevels') {
      assert.equal(variables.readLocations, locationAccess);
    }
    const mainLevel = level('66', true, variables.readLocations);
    if (badQuantities) mainLevel.quantities.pop();
    const tracked = { id, sku: 'TEA-01', tracked: true, inventoryLevels: page([mainLevel], 'more-locations') };
    const data = {
      SellerHubDevStore: { shop: { myshopifyDomain: host, plan: { partnerDevelopment: development } },
        currentAppInstallation: variables.includeScopes
          ? { accessScopes: (locationAccess ? ['read_orders', 'read_inventory', 'read_locations'] : ['read_orders', 'read_inventory'])
            .map(handle => ({ handle })) }
          : undefined },
      SellerHubTestOrders: { orders: variables.after ? page([
        order(7, '27', { lineItems: page([line('TEA-01', 1)]) })
      ]) : page([
        order(1, '21', { lineItems: page([line('TEA-01', 2)], 'more-lines') }),
        order(2, '26', { lineItems: page([line('TEA-01', 3)]) }),
        order(3, '28'), order(4, '26', { cancelledAt: '2026-11-26T04:00:00Z' }),
        order(5, '26', { displayFinancialStatus: 'REFUNDED' }), order(6, '26', { test: false })
      ], 'more-orders') },
      SellerHubMoreTestOrderLines: { order: { id: variables.id, test: true, lineItems: page([line('TEA-01', 1)]) } },
      SellerHubInventory: { inventoryItems: variables.after ? page([
        { id: 'gid://shopify/InventoryItem/902', sku: null, tracked: false }
      ]) : page([tracked], 'more-items') },
      SellerHubMoreInventoryLevels: { inventoryItem: { id, inventoryLevels: page([level('67', false, variables.readLocations)]) } }
    }[operation];
    assert(data, 'Unexpected GraphQL operation');
    return Response.json({ data });
  });
  return queries;
}

test('reads tracked inventory with redacted location labels and preserves Shopify availability', async t => {
  const calls = mockShopify(t);
  const result = await exportShopifyReport(env, { inventory: true, current });
  assert.equal(result.mode, 'api');
  assert.equal(result.testOrdersRead, 6);
  assert.equal(result.items.length, 1);
  const item = result.items[0];
  assert.equal(item.sku, 'TEA-01');
  assert.deepEqual(item.demand, [0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 3, 1]);
  assert(item.levels.every(row => /^Shopify location [A-F0-9]{6}$/.test(row.name)));
  assert.equal(new Set(item.levels.map(row => row.name)).size, 2);
  assert.deepEqual(item.levels.map(row => [row.online, row.onHand, row.available, row.committed, row.incoming]),
    [[null, 37, 22, 10, 24], [null, 37, 22, 10, 24]]);
  assert(calls.includes('SellerHubMoreTestOrderLines'));
  assert(calls.includes('SellerHubMoreInventoryLevels'));
  assert.equal(calls.filter(call => call === 'SellerHubInventory').length, 2);
  assert(!/fixture-secret|fixture-token|gid:\/\/|Order\//.test(JSON.stringify(result)));
});

test('keeps the existing order-only file compatible', async t => {
  const calls = mockShopify(t);
  const result = await exportShopifyReport(env, { current });
  assert.equal(result.source, 'shopify-dev-test-orders');
  assert.deepEqual(result.orders[0].lines[0], { title: 'Tea from test order', quantity: 2 });
  assert(!calls.some(call => call.includes('Inventory')));
});

test('checks the plan before exporting and rejects missing stock data', async t => {
  const calls = mockShopify(t, { development: false });
  await assert.rejects(exportShopifyReport(env, { inventory: true, current }), /development store/);
  assert.deepEqual(calls, ['SellerHubDevStore']);
  t.mock.restoreAll();
  mockShopify(t, { badQuantities: true });
  await assert.rejects(exportShopifyReport(env, { inventory: true, current }), /inventory quantities/);
});

test('imports both location-access modes and withholds estimates when assignment is unverified', async t => {
  mockShopify(t, { locationAccess: true });
  const result = await exportShopifyReport(env, { inventory: true, current });
  const context = {};
  for (const file of ['broker-documents.js', 'inventory-forecast.js', 'shopify-inventory-import.js']) {
    runInNewContext(readFileSync(new URL('../mvp/' + file, import.meta.url), 'utf8'), context);
  }
  const input = { isConnected: true, focus() {}, addEventListener(type, listener) { this[type] = listener; } };
  const view = context.ShopifyInventoryImport;
  view.bind({
    querySelector: selector => selector === '#shopify-inventory-file' ? input : null,
    querySelectorAll: () => []
  }, () => {});
  const upload = async value => {
    input.files = [{ size: 1000, text: async () => JSON.stringify(value) }];
    await input.change();
    return view.render();
  };
  const markup = await upload(result);
  assert.match(markup, /Imported API snapshot/);
  assert.match(markup, /Online warehouse/);
  assert.match(markup, /Estimated stockout/);
  assert.match(markup, /22 units/);
  assert.match(markup, /Outside online supply/);
  result.items[0].levels[1].online = true;
  assert.match(await upload(result), /one active online fulfillment location/);
  result.items[0].levels[0].online = null;
  assert.match(await upload(result), /Online fulfillment eligibility requires Shopify location access/);
  result.items[0].levels[0].available = '22';
  assert.match(await upload(result), /inventory location or quantity is invalid/);
});
