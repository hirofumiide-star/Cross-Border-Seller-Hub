import { createHash } from 'node:crypto';
import { DemoError, STORE_PATTERN, cleanText } from './demo-common.mjs';
import { withShipmentJournal } from './fulfillment-journal.mjs';

const money = /^\d{1,12}(?:\.\d{1,6})?$/;
const skuPattern = /^[!-~]{1,30}$/;
const prefectures = '北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県'.split(' ');
const hash = value => createHash('sha256').update(value).digest('hex');
const scalar = value => typeof value === 'string' ? value.trim() : '';
const addressWidth = value => [...value].reduce((width, character) => {
  const point = character.codePointAt(0);
  return width + (point <= 0x7f || point >= 0xff61 && point <= 0xffdc ? 1 : 2);
}, 0);

function recipientFor(address) {
  if (address?.countryCodeV2 !== 'JP') throw new DemoError('order-ineligible');
  const code = scalar(address.provinceCode).replace(/^JP-/, '');
  const prefecture = /^\d{2}$/.test(code) ? prefectures[Number(code) - 1] : address.province;
  const recipient = {
    postcode: scalar(address.zip).replace(/-/g, ''),
    prefecture,
    name: [scalar(address.lastName), scalar(address.firstName)].filter(Boolean).join(' '),
    address1: [scalar(address.city), scalar(address.address1)].filter(Boolean).join(' '),
    address2: scalar(address.address2) || null,
    phone: scalar(address.phone).replace(/[\s-]/g, '') || null
  };
  if (!/^\d{7}$/.test(recipient.postcode) || recipient.postcode.endsWith('0000')
    || !prefectures.includes(prefecture) || !recipient.name || [...recipient.name].length > 15
    || !address.city || !address.address1 || addressWidth(recipient.address1) > 64
    || addressWidth(recipient.address2 || '') > 64
    || addressWidth(recipient.address1 + (recipient.address2 || '')) > 64
    || recipient.phone && !/^0\d{9,12}$/.test(recipient.phone)
    || Object.values(recipient).some(value => typeof value === 'string' && /[\u0000-\u001f\u007f]/.test(value))) {
    throw new DemoError('order-ineligible');
  }
  return recipient;
}

export function planOrder({ store, order, lines, fulfillmentOrders }) {
  if (!STORE_PATTERN.test(store ?? '') || !/^gid:\/\/shopify\/Order\/\d{1,30}$/.test(order?.id ?? '')
    || !/^#[A-Za-z0-9-]{1,40}$/.test(order?.name ?? '') || order.test !== true || order.cancelledAt
    || order.displayFinancialStatus !== 'PAID' || order.displayFulfillmentStatus !== 'UNFULFILLED'
    || !Array.isArray(lines) || !lines.length || lines.length > 300
    || !Array.isArray(fulfillmentOrders) || !fulfillmentOrders.length || fulfillmentOrders.length > 100) {
    throw new DemoError('order-ineligible');
  }
  const merchandise = order.currentSubtotalPriceSet?.shopMoney;
  const chargedShipping = order.currentShippingPriceSet?.shopMoney;
  if (!money.test(merchandise?.amount ?? '') || !/^[A-Z]{3}$/.test(merchandise?.currencyCode ?? '')
    || !money.test(chargedShipping?.amount ?? '') || chargedShipping.currencyCode !== merchandise.currencyCode) {
    throw new DemoError('order-ineligible');
  }
  const expected = new Map();
  const bySku = new Map();
  for (const line of lines) {
    if (line.currentQuantity === 0 && line.unfulfilledQuantity === 0) continue;
    if (!/^gid:\/\/shopify\/LineItem\/\d+$/.test(line.id ?? '') || expected.has(line.id)
      || !skuPattern.test(line.sku ?? '') || line.requiresShipping !== true
      || !Number.isSafeInteger(line.currentQuantity) || line.currentQuantity < 1 || line.currentQuantity > 10_000
      || line.currentQuantity !== line.unfulfilledQuantity) throw new DemoError('order-ineligible');
    expected.set(line.id, { sku: line.sku, quantity: line.currentQuantity });
    const existing = bySku.get(line.sku);
    const quantity = (existing?.quantity || 0) + line.currentQuantity;
    if (quantity > 10_000) throw new DemoError('order-ineligible');
    bySku.set(line.sku, { sku: line.sku, title: cleanText(line.title) || '商品名なし', quantity });
  }
  const assigned = new Map();
  const locations = new Set();
  const assignmentLineIds = new Set();
  const assignments = [];
  for (const assignment of fulfillmentOrders) {
    if (!Array.isArray(assignment.lines)) throw new DemoError('order-ineligible');
    const relevant = assignment.lines.filter(line => line.remainingQuantity > 0);
    if (!relevant.length) continue;
    const location = assignment.assignedLocation?.location;
    if (assignment.status !== 'OPEN' || assignment.requestStatus !== 'UNSUBMITTED'
      || !/^gid:\/\/shopify\/FulfillmentOrder\/\d+$/.test(assignment.id ?? '')
      || location?.isFulfillmentService !== false || !/^gid:\/\/shopify\/Location\/\d+$/.test(location.id ?? '')) {
      throw new DemoError('order-ineligible');
    }
    locations.add(location.id);
    for (const line of relevant) {
      const expectedLine = expected.get(line.lineItem?.id);
      if (!expectedLine || !/^gid:\/\/shopify\/FulfillmentOrderLineItem\/\d+$/.test(line.id ?? '')
        || assignmentLineIds.has(line.id) || line.requiresShipping !== true || line.sku !== expectedLine.sku
        || !Number.isSafeInteger(line.remainingQuantity) || line.remainingQuantity < 1) {
        throw new DemoError('order-ineligible');
      }
      assignmentLineIds.add(line.id);
      assigned.set(line.lineItem.id, (assigned.get(line.lineItem.id) || 0) + line.remainingQuantity);
      assignments.push({ fulfillmentOrderId: assignment.id, locationId: location.id, lineId: line.id, quantity: line.remainingQuantity });
    }
  }
  if (!expected.size || locations.size !== 1 || expected.size !== assigned.size
    || [...expected].some(([id, line]) => assigned.get(id) !== line.quantity)) throw new DemoError('order-ineligible');

  const identity = hash(store + '|' + order.id);
  const identifier = 'cbsh-' + identity.slice(0, 32);
  const request = {
    identifier, order_no: identifier,
    recipient: recipientFor(order.shippingAddress),
    items: [...bySku.values()].sort((a, b) => a.sku.localeCompare(b.sku)).map(line => ({ code: line.sku, quantity: line.quantity })),
    suspend: true, backorder_if_unavailable: true, shipping_email: null, apply_rule: false, international: false,
    cash_on_delivery: false
  };
  return {
    store, sourceOrderId: order.id, identifier, request, assignments,
    payloadHash: hash(JSON.stringify(request)),
    report: {
      id: 'SHOP-' + identity.slice(0, 14), reference: order.name, test: true,
      currency: merchandise.currencyCode, subtotal: merchandise.amount, shippingCharged: chargedShipping.amount,
      status: 'planned', lines: [...bySku.values()],
      shipment: { id: null, identifier, status: 'not-submitted', trackingNumber: null,
        trackingNumbers: [], trackingUrl: null, carrier: null, actualShippingCost: null },
      shopifyWriteback: 'not-requested', blockReason: null
    }
  };
}

export function assertShipmentMatches(plan, shipment) {
  if (!shipment || shipment.identifier !== plan.identifier || !/^[A-Z0-9]+-S\d+$/.test(shipment.id ?? '')
    || !Array.isArray(shipment.items) || !shipment.recipient) throw new DemoError('shipment-mismatch');
  const items = shipment.items.map(item => ({ code: item.code, quantity: item.quantity }))
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
  if (JSON.stringify(items) !== JSON.stringify(plan.request.items)) throw new DemoError('shipment-mismatch');
  for (const key of ['postcode', 'prefecture', 'name', 'address1', 'address2', 'phone']) {
    const normal = value => key === 'postcode' || key === 'phone'
      ? scalar(value).replace(/[\s-]/g, '') : scalar(value);
    if (normal(shipment.recipient[key]) !== normal(plan.request.recipient[key])) throw new DemoError('shipment-mismatch');
  }
  return shipment;
}

export function shipmentReport(plan, shipment) {
  assertShipmentMatches(plan, shipment);
  const sent = shipment.status === 'shipped';
  if (sent && (!shipment.shipped_at || !Number.isFinite(Date.parse(shipment.shipped_at)))) throw new DemoError('provider-error');
  const rawTracking = Array.isArray(shipment.tracking_codes) ? shipment.tracking_codes
    : shipment.tracking_code ? [shipment.tracking_code] : [];
  if (rawTracking.length > 100 || rawTracking.some(code => typeof code !== 'string' || !/^[A-Za-z0-9-]{1,100}$/.test(code))) {
    throw new DemoError('provider-error');
  }
  const trackingNumbers = sent ? [...new Set(rawTracking)] : [];
  let trackingUrl = null;
  if (sent && typeof shipment.url === 'string' && shipment.url.length <= 1000) {
    try {
      const url = new URL(shipment.url);
      if (url.protocol === 'https:' && !url.username && !url.password) trackingUrl = url.href;
    } catch { /* Unsupported tracking links remain absent. */ }
  }
  let status = 'unknown';
  if (sent) status = 'shipped';
  else if (shipment.suspend === true || shipment.status === 'suspended') status = 'suspended';
  else if (['waiting', 'backordered', 'allocating'].includes(shipment.status)) status = 'pending';
  else if (['working', 'picking', 'picked', 'packed'].includes(shipment.status)) status = 'working';
  return { ...plan.report, status: sent ? 'shipped' : 'submitted', shipment: {
    ...plan.report.shipment, id: shipment.id, status, trackingNumbers,
    trackingNumber: trackingNumbers[0] || null, trackingUrl,
    carrier: typeof shipment.delivery_service === 'string' && /^[A-Z0-9-]{1,80}$/.test(shipment.delivery_service)
      ? shipment.delivery_service : null
  } };
}

export async function verifySkus(plan, client) {
  for (const line of plan.request.items) {
    const item = await client.getItem(line.code);
    if (!item || item.code !== line.code || typeof item.id !== 'string'
      || !item.id.startsWith(client.account + '-I') || item.hidden === true || item.bundled_item === true) {
      throw new DemoError('sku-unmapped');
    }
  }
}

export async function processShipment(plan, client, { submit = false, stateDirectory = '.runtime/fulfillment', revalidate } = {}) {
  const inspect = async () => {
    const existing = await client.getShipment(plan.identifier);
    return existing ? shipmentReport(plan, existing) : null;
  };
  return withShipmentJournal(stateDirectory, plan.identifier, async ({ current, save }) => {
    if (current && current.payloadHash !== plan.payloadHash) throw new DemoError('shipment-mismatch');
    const existing = await inspect();
    if (existing) {
      if (submit) await save({ payloadHash: plan.payloadHash, phase: 'submitted', shipmentId: existing.shipment.id });
      return existing;
    }
    if (current && current.phase !== 'rejected') throw new DemoError('submission-uncertain');
    if (!submit) return plan.report;
    // Re-read the order and all assignments immediately before a new request.
    if (typeof revalidate !== 'function') throw new DemoError('order-ineligible');
    const fresh = await revalidate();
    if (fresh.payloadHash !== plan.payloadHash || JSON.stringify(fresh.assignments) !== JSON.stringify(plan.assignments)) {
      throw new DemoError('shipment-mismatch');
    }
    await save({ payloadHash: plan.payloadHash, phase: 'submitting' });
    let postResponded = false;
    let holdNotConfirmed = false;
    try {
      const created = await client.createShipment(plan.request);
      postResponded = true;
      if (created?.suspend !== true) {
        holdNotConfirmed = true;
        throw new DemoError('provider-error');
      }
      // POST responses can omit final tracking data; always re-read using the immutable identifier.
      const confirmed = await client.getShipment(plan.identifier);
      if (confirmed && confirmed.status !== 'shipped' && confirmed.suspend !== true) {
        holdNotConfirmed = true;
        throw new DemoError('provider-error');
      }
      const result = shipmentReport(plan, confirmed || created);
      await save({ payloadHash: plan.payloadHash, phase: 'submitted', shipmentId: result.shipment.id });
      return result;
    } catch (error) {
      let recovered = null;
      try { recovered = await inspect(); } catch { /* Never retry the POST on ambiguous outcomes. */ }
      if (recovered && !['suspended', 'shipped'].includes(recovered.shipment.status)) holdNotConfirmed = true;
      if (recovered && !holdNotConfirmed) {
        await save({ payloadHash: plan.payloadHash, phase: 'submitted', shipmentId: recovered.shipment.id });
        return recovered;
      }
      const definitelyRejected = !postResponded && [400, 401, 402, 403, 422, 429].includes(error.httpStatus);
      await save({ payloadHash: plan.payloadHash, phase: definitelyRejected ? 'rejected' : 'uncertain' });
      if (holdNotConfirmed) throw new DemoError('provider-error');
      throw definitelyRejected ? new DemoError('provider-error', error.httpStatus) : new DemoError('submission-uncertain');
    }
  });
}

export function makeReport({ mode, store, connection, orders = [], generatedAt = new Date().toISOString() }) {
  return { schemaVersion: 1, source: 'seller-hub-fulfillment-demo', mode, generatedAt, store, connection, orders };
}
