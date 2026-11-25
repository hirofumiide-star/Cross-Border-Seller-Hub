import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DemoError } from '../scripts/lib/demo-common.mjs';
import { createOpenlogiClient } from '../scripts/lib/openlogi-demo.mjs';
import { createShopifyClient } from '../scripts/lib/shopify-demo.mjs';
import { planOrder, verifySkus, processShipment, shipmentReport } from '../scripts/lib/fulfillment-demo.mjs';
import { parseOptions, runFixture, runLive } from '../scripts/run-fulfillment-demo.mjs';

const source = JSON.parse(await readFile(new URL('../fixtures/fulfillment-order.json', import.meta.url), 'utf8'));
const freshSource = () => structuredClone(source);
const json = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
const nextPage = (nodes, hasNextPage = false, endCursor = null) => ({ nodes, pageInfo: { hasNextPage, endCursor } });
const failure = code => error => error instanceof DemoError && error.code === code;

async function temporary(action) {
  const directory = await mkdtemp(join(tmpdir(), 'fulfillment-test-'));
  try { return await action(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

function warehouse(plan, options = {}) {
  let stored = null;
  let posts = 0;
  return {
    account: 'DEMO01',
    get posts() { return posts; },
    get stored() { return stored; },
    async getItem(code) { return { code, id: 'DEMO01-I000001', ...options.item }; },
    async getShipment() { return stored; },
    async createShipment(request) {
      posts++;
      if (options.store !== false) stored = { ...structuredClone(request), id: 'DEMO01-S000001', status: 'suspended', suspend: true };
      if (options.timeout) throw new DemoError('provider-error');
      return stored;
    }
  };
}

test('fixture traverses the shipment workflow without claiming API access or leaking a recipient', async () => {
  const result = await runFixture();
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.report.connection, { shopify: 'fixture', openlogi: 'fixture' });
  assert.equal(result.report.orders[0].reference, '#DEMO-1001');
  assert.equal(result.report.orders[0].status, 'shipped');
  assert.equal(result.report.orders[0].shippingCharged, '870');
  assert.equal(result.report.orders[0].shipment.actualShippingCost, null);
  assert.equal(result.report.orders[0].shopifyWriteback, 'not-requested');
  const serialized = JSON.stringify(result.report);
  for (const field of ['shippingAddress', 'recipient', 'firstName', 'phone', 'Authorization', 'テスト町', '100-0001']) {
    assert.equal(serialized.includes(field), false, field);
  }
});

test('order gate rejects non-test, cancellation, partial payment, missing SKU and third-party allocation', () => {
  for (const mutate of [
    value => { value.order.test = false; },
    value => { value.order.cancelledAt = '2026-11-26T00:00:00Z'; },
    value => { value.order.displayFinancialStatus = 'PARTIALLY_PAID'; },
    value => { value.order.displayFulfillmentStatus = 'PARTIALLY_FULFILLED'; },
    value => { value.lines[0].sku = ''; },
    value => { value.fulfillmentOrders[0].assignedLocation.location.isFulfillmentService = true; },
    value => { value.fulfillmentOrders[0].requestStatus = 'SUBMITTED'; },
    value => { value.fulfillmentOrders[0].lines[0].remainingQuantity = 2; },
    value => { value.order.shippingAddress.countryCodeV2 = 'TW'; },
    value => { value.order.shippingAddress.address1 = '長'.repeat(33); }
  ]) {
    const value = freshSource();
    mutate(value);
    assert.throws(() => planOrder(value), failure('order-ineligible'));
  }
});

test('no quantity is silently omitted if only part of the fulfillment orders is visible', () => {
  const value = freshSource();
  value.lines.push({ ...value.lines[0], id: 'gid://shopify/LineItem/900006', sku: 'TSU-MATCHA-30' });
  assert.throws(() => planOrder(value), failure('order-ineligible'));
});

test('SKU match is exact and hidden or enclosure-only products are rejected', async () => {
  const plan = planOrder(freshSource());
  for (const item of [{ code: 'OTHER' }, { hidden: true }, { bundled_item: true }, { id: 'OTHER-I000001' }]) {
    await assert.rejects(verifySkus(plan, warehouse(plan, { item })), failure('sku-unmapped'));
  }
});

test('dry-run performs no provider mutation and returns planned', async () => temporary(async directory => {
  const plan = planOrder(freshSource());
  const client = warehouse(plan);
  const result = await processShipment(plan, client, { stateDirectory: directory });
  assert.equal(result.status, 'planned');
  assert.equal(client.posts, 0);
  assert.deepEqual(await readdir(directory), []);
}));

test('a submitted suspended request is idempotent across reruns', async () => temporary(async directory => {
  const plan = planOrder(freshSource());
  const client = warehouse(plan);
  const options = { submit: true, stateDirectory: directory, revalidate: async () => plan };
  const first = await processShipment(plan, client, options);
  const second = await processShipment(plan, client, options);
  assert.equal(client.posts, 1);
  assert.equal(first.status, 'submitted');
  assert.equal(first.shipment.status, 'suspended');
  assert.deepEqual(second, first);
  assert.equal(client.stored.shipping_email, null);
  assert.equal(client.stored.apply_rule, false);
  assert.equal(client.stored.backorder_if_unavailable, true);
  assert.equal(client.stored.cash_on_delivery, false);
  const journal = await readFile(join(directory, plan.identifier + '.json'), 'utf8');
  assert.equal(journal.includes('recipient'), false);
  assert.equal(journal.includes('テスト'), false);
}));

test('a lost POST response is recovered through the same identifier, without a second POST', async () => temporary(async directory => {
  const plan = planOrder(freshSource());
  const client = warehouse(plan, { timeout: true });
  const options = { submit: true, stateDirectory: directory, revalidate: async () => plan };
  assert.equal((await processShipment(plan, client, options)).status, 'submitted');
  assert.equal(client.posts, 1);
}));

test('an ambiguous request remains blocked on later 404 reads', async () => temporary(async directory => {
  const plan = planOrder(freshSource());
  const client = warehouse(plan, { timeout: true, store: false });
  const options = { submit: true, stateDirectory: directory, revalidate: async () => plan };
  await assert.rejects(processShipment(plan, client, options), failure('submission-uncertain'));
  await assert.rejects(processShipment(plan, client, options), failure('submission-uncertain'));
  assert.equal(client.posts, 1);
}));

test('confirmation GET failure after successful POST can never be classified as a rejected POST', async () => temporary(async directory => {
  const plan = planOrder(freshSource());
  const client = warehouse(plan);
  let reads = 0;
  client.getShipment = async () => {
    reads++;
    if (reads === 2 || reads === 3) throw new DemoError('provider-error', 401);
    return null;
  };
  const options = { submit: true, stateDirectory: directory, revalidate: async () => plan };
  await assert.rejects(processShipment(plan, client, options), failure('submission-uncertain'));
  await assert.rejects(processShipment(plan, client, options), failure('submission-uncertain'));
  assert.equal(client.posts, 1);
  assert.equal(JSON.parse(await readFile(join(directory, plan.identifier + '.json'), 'utf8')).phase, 'uncertain');
}));

test('order edits and fulfillment relocation block a request before POST', async () => temporary(async directory => {
  const original = planOrder(freshSource());
  const moved = freshSource();
  moved.fulfillmentOrders[0].assignedLocation.location.id = 'gid://shopify/Location/999999';
  const client = warehouse(original);
  await assert.rejects(processShipment(original, client, {
    submit: true, stateDirectory: directory, revalidate: async () => planOrder(moved)
  }), failure('shipment-mismatch'));
  assert.equal(client.posts, 0);
}));

test('new request must confirm that warehouse work remains suspended', async () => temporary(async directory => {
  const plan = planOrder(freshSource());
  const client = warehouse(plan);
  client.createShipment = async request => ({ ...request, id: 'DEMO01-S000001', status: 'working', suspend: false });
  await assert.rejects(processShipment(plan, client, { submit: true, stateDirectory: directory, revalidate: async () => plan }), failure('provider-error'));
  assert.equal(JSON.parse(await readFile(join(directory, plan.identifier + '.json'), 'utf8')).phase, 'uncertain');
}));

test('a recovered lost response cannot hide that the warehouse hold is missing', async () => temporary(async directory => {
  const plan = planOrder(freshSource());
  const client = warehouse(plan);
  const create = client.createShipment;
  client.createShipment = async request => {
    await create(request);
    client.stored.suspend = false;
    client.stored.status = 'working';
    throw new DemoError('provider-error');
  };
  await assert.rejects(processShipment(plan, client, { submit: true, stateDirectory: directory, revalidate: async () => plan }), failure('provider-error'));
  assert.equal(client.posts, 1);
  assert.equal(JSON.parse(await readFile(join(directory, plan.identifier + '.json'), 'utf8')).phase, 'uncertain');
}));

test('a local journal prevents a changed order from being silently resubmitted', async () => temporary(async directory => {
  const plan = planOrder(freshSource());
  const client = warehouse(plan);
  await processShipment(plan, client, { submit: true, stateDirectory: directory, revalidate: async () => plan });
  const updated = freshSource();
  updated.order.shippingAddress.address1 = '別の架空住所2-2-2';
  const next = planOrder(updated);
  await assert.rejects(processShipment(next, client, { submit: true, stateDirectory: directory, revalidate: async () => next }), failure('shipment-mismatch'));
  assert.equal(client.posts, 1);
}));

test('all tracking numbers are preserved and unsafe links are omitted', () => {
  const plan = planOrder(freshSource());
  const result = shipmentReport(plan, { ...structuredClone(plan.request), id: 'DEMO01-S000001',
    status: 'shipped', shipped_at: '2026-11-26T00:02:00Z', tracking_codes: ['DEMO-1', 'DEMO-2'], url: 'javascript:alert(1)' });
  assert.deepEqual(result.shipment.trackingNumbers, ['DEMO-1', 'DEMO-2']);
  assert.equal(result.shipment.trackingNumber, 'DEMO-1');
  assert.equal(result.shipment.trackingUrl, null);
  assert.equal(result.shipment.actualShippingCost, null);
});

test('OPENLOGI client fixes the demo host, rejects redirects and never echoes provider secrets', async () => {
  const requests = [];
  const client = createOpenlogiClient({ OPENLOGI_DEMO_ACCOUNT: 'DEMO01', OPENLOGI_DEMO_TOKEN: 'test-token' }, async (url, options) => {
    requests.push({ url, options });
    return new Response('provider-secret-body', { status: 503 });
  });
  await assert.rejects(client.check(), error => error.httpStatus === 503 && !error.message.includes('secret'));
  assert.equal(new URL(requests[0].url).origin, 'https://api-demo.openlogi.com');
  assert.equal(requests[0].options.redirect, 'error');
  assert.equal(requests[0].options.headers['X-Api-Version'], '1.6');
  await assert.rejects(async () => client.createShipment({ identifier: 'cbsh-' + 'a'.repeat(32), suspend: false }), failure('shipment-mismatch'));
  assert.equal(requests.length, 1);
});

test('Shopify rejects a production store before reading any order', async () => {
  let calls = 0;
  await assert.rejects(createShopifyClient({ SHOPIFY_DEV_STORE: source.store, SHOPIFY_ADMIN_ACCESS_TOKEN: 'test-token' }, async () => {
    calls++;
    return json({ data: { shop: { myshopifyDomain: source.store, plan: { partnerDevelopment: false } } } });
  }), failure('order-ineligible'));
  assert.equal(calls, 1);
});

test('Shopify reader follows line and assignment pagination and preserves fulfillment IDs', async () => {
  const input = freshSource();
  const secondLine = { ...input.lines[0], id: 'gid://shopify/LineItem/900006', sku: 'TSU-MATCHA-30' };
  const secondAssignmentLine = { ...input.fulfillmentOrders[0].lines[0], id: 'gid://shopify/FulfillmentOrderLineItem/900007',
    sku: 'TSU-MATCHA-30', lineItem: { id: secondLine.id } };
  const fetchImpl = async (_url, options) => {
    const { query, variables } = JSON.parse(options.body);
    if (query.includes('query FulfillmentDemoShop')) return json({ data: { shop: { myshopifyDomain: source.store, plan: { partnerDevelopment: true } } } });
    if (query.includes('query FulfillmentDemoOrder')) return json({ data: { order: input.order } });
    if (query.includes('query FulfillmentDemoLines')) return json({ data: { order: { ...input.order,
      lineItems: variables.after ? nextPage([secondLine]) : nextPage(input.lines, true, 'lines-next') } } });
    if (query.includes('query FulfillmentDemoAssignments')) {
      const assignment = { ...input.fulfillmentOrders[0], lines: undefined,
        lineItems: nextPage(input.fulfillmentOrders[0].lines, true, 'assignment-next') };
      return json({ data: { order: { ...input.order, fulfillmentOrders: nextPage([assignment]) } } });
    }
    if (query.includes('query FulfillmentDemoAssignmentLines')) return json({ data: { fulfillmentOrder: {
      ...input.fulfillmentOrders[0], lineItems: nextPage([secondAssignmentLine]) } } });
    throw new Error('Unexpected test query');
  };
  const client = await createShopifyClient({ SHOPIFY_DEV_STORE: source.store, SHOPIFY_ADMIN_ACCESS_TOKEN: 'test-token' }, fetchImpl);
  const plan = planOrder(await client.readOrder('900001'));
  assert.equal(plan.assignments.length, 2);
  assert.equal(plan.request.items.length, 2);
});

test('missing credentials produce an honest disconnected report with no network requests', async () => {
  const result = await runLive({ mode: 'openlogi-demo', orderId: '900001' }, {}, () => { throw new Error('Must not fetch'); });
  assert.equal(result.exitCode, 2);
  assert.deepEqual(result.report.connection, { shopify: 'not-configured', openlogi: 'not-configured' });
  assert.deepEqual(result.report.orders, []);
  assert.throws(() => parseOptions(['--mode', 'fixture', '--submit-demo']), failure('invalid-options'));
});
