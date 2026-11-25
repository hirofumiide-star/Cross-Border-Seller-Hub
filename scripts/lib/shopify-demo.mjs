import { DemoError, STORE_PATTERN, requestJson } from './demo-common.mjs';

export const SHOPIFY_API_VERSION = '2026-10';
const orderFields = `id name test updatedAt cancelledAt displayFinancialStatus displayFulfillmentStatus
  currentSubtotalPriceSet { shopMoney { amount currencyCode } }
  currentShippingPriceSet { shopMoney { amount currencyCode } }
  shippingAddress { firstName lastName countryCodeV2 zip province provinceCode city address1 address2 phone }`;
const lineFields = 'id sku title currentQuantity unfulfilledQuantity requiresShipping';
const fulfillmentLineFields = 'id sku productTitle remainingQuantity requiresShipping lineItem { id }';
const orderQuery = `query FulfillmentDemoOrder($id: ID!) { order(id: $id) { ${orderFields} } }`;
const linesQuery = `query FulfillmentDemoLines($id: ID!, $after: String) {
  order(id: $id) { id test updatedAt lineItems(first: 100, after: $after) {
    pageInfo { hasNextPage endCursor } nodes { ${lineFields} }
  } }
}`;
const fulfillmentQuery = `query FulfillmentDemoAssignments($id: ID!, $after: String) {
  order(id: $id) { id test updatedAt fulfillmentOrders(first: 25, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { id status requestStatus assignedLocation { location { id isFulfillmentService } }
      lineItems(first: 100) { pageInfo { hasNextPage endCursor } nodes { ${fulfillmentLineFields} } }
    }
  } }
}`;
const fulfillmentLinesQuery = `query FulfillmentDemoAssignmentLines($id: ID!, $after: String) {
  fulfillmentOrder(id: $id) { id status requestStatus
    lineItems(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { ${fulfillmentLineFields} } }
  }
}`;

export function orderGid(value) {
  if (typeof value === 'string' && /^\d{1,30}$/.test(value)) return 'gid://shopify/Order/' + value;
  if (typeof value === 'string' && /^gid:\/\/shopify\/Order\/\d{1,30}$/.test(value)) return value;
  throw new DemoError('invalid-options');
}

function sameOrder(part, order) {
  if (part?.id !== order.id || part?.test !== true || part?.updatedAt !== order.updatedAt) {
    throw new DemoError('order-ineligible');
  }
}

function pageRows(page, rows, cursors, maximum) {
  if (!Array.isArray(page?.nodes) || typeof page.pageInfo?.hasNextPage !== 'boolean'
    || rows.length + page.nodes.length > maximum) throw new DemoError('provider-error');
  const seen = new Set(rows.map(row => row.id));
  for (const row of page.nodes) {
    if (typeof row?.id !== 'string' || seen.has(row.id)) throw new DemoError('provider-error');
    seen.add(row.id);
    rows.push(row);
  }
  if (!page.pageInfo.hasNextPage) return null;
  const cursor = page.pageInfo.endCursor;
  if (typeof cursor !== 'string' || !cursor || cursors.has(cursor)) throw new DemoError('provider-error');
  cursors.add(cursor);
  return cursor;
}

export async function createShopifyClient(env, fetchImpl = fetch) {
  const store = env.SHOPIFY_DEV_STORE?.trim().toLowerCase();
  if (!STORE_PATTERN.test(store ?? '')) throw new DemoError('missing-credentials');
  let token = env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim();
  if (!token) {
    const id = env.SHOPIFY_CLIENT_ID?.trim();
    const secret = env.SHOPIFY_CLIENT_SECRET?.trim();
    if (!id || !secret) throw new DemoError('missing-credentials');
    const result = await requestJson(fetchImpl, 'https://' + store + '/admin/oauth/access_token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret })
    });
    token = result.access_token;
    if (typeof token !== 'string' || !token) throw new DemoError('provider-error');
  }
  const graphql = async (query, variables = {}) => {
    const result = await requestJson(fetchImpl, 'https://' + store + '/admin/api/' + SHOPIFY_API_VERSION + '/graphql.json', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables })
    });
    if (result.errors?.length || !result.data) throw new DemoError('provider-error');
    return result.data;
  };
  const access = await graphql('query FulfillmentDemoShop { shop { myshopifyDomain plan { partnerDevelopment } } }');
  if (access.shop?.myshopifyDomain !== store || access.shop?.plan?.partnerDevelopment !== true) {
    throw new DemoError('order-ineligible');
  }
  return {
    store,
    async readOrder(value) {
      const id = orderGid(value);
      const { order } = await graphql(orderQuery, { id });
      if (order?.id !== id || order?.test !== true || order.cancelledAt
        || order.displayFinancialStatus !== 'PAID' || order.displayFulfillmentStatus !== 'UNFULFILLED') {
        throw new DemoError('order-ineligible');
      }
      const lines = [];
      const lineCursors = new Set();
      let after = null;
      do {
        const page = await graphql(linesQuery, { id, after });
        sameOrder(page.order, order);
        after = pageRows(page.order.lineItems, lines, lineCursors, 300);
      } while (after);

      const fulfillmentOrders = [];
      const fulfillmentCursors = new Set();
      after = null;
      do {
        const page = await graphql(fulfillmentQuery, { id, after });
        sameOrder(page.order, order);
        after = pageRows(page.order.fulfillmentOrders, fulfillmentOrders, fulfillmentCursors, 100);
      } while (after);
      for (const assignment of fulfillmentOrders) {
        const lines = [];
        const cursors = new Set();
        let cursor = pageRows(assignment.lineItems, lines, cursors, 300);
        while (cursor) {
          const page = await graphql(fulfillmentLinesQuery, { id: assignment.id, after: cursor });
          const current = page.fulfillmentOrder;
          if (current?.id !== assignment.id || current.status !== assignment.status
            || current.requestStatus !== assignment.requestStatus) throw new DemoError('order-ineligible');
          cursor = pageRows(current.lineItems, lines, cursors, 300);
        }
        assignment.lines = lines;
        delete assignment.lineItems;
      }
      const latest = await graphql(orderQuery, { id });
      sameOrder(latest.order, order);
      if (latest.order.cancelledAt || latest.order.displayFinancialStatus !== 'PAID'
        || latest.order.displayFulfillmentStatus !== 'UNFULFILLED') throw new DemoError('order-ineligible');
      return { store, order, lines, fulfillmentOrders };
    }
  };
}
