import { createHash } from 'node:crypto';

const version = '2026-10';
const day = 86_400_000;
const maxOrders = 1000;
const storePattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.myshopify\.com$/;
const moneyPattern = /^\d{1,12}(?:\.\d{1,6})?$/;

const scopeQuery = `query SellerHubDevStore {
  shop { myshopifyDomain plan { partnerDevelopment } }
}`;

const ordersQuery = `query SellerHubTestOrders($search: String!, $after: String) {
  orders(first: 30, query: $search, after: $after, sortKey: CREATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id test createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus
      currentSubtotalPriceSet { shopMoney { amount currencyCode } }
      lineItems(first: 12) {
        pageInfo { hasNextPage endCursor }
        nodes { title currentQuantity }
      }
    }
  }
}`;

const moreLinesQuery = `query SellerHubMoreTestOrderLines($id: ID!, $after: String!) {
  order(id: $id) {
    id test
    lineItems(first: 50, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { title currentQuantity }
    }
  }
}`;

async function requestJson(url, headers, body, label) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(15_000)
    });
  } catch {
    throw new Error(label + ' に接続できませんでした。接続先とネットワークを確認してください。');
  }
  if (!response.ok) throw new Error(label + ' が HTTP ' + response.status + ' を返しました。');
  try {
    return await response.json();
  } catch {
    throw new Error(label + ' から有効なJSONを受信できませんでした。');
  }
}

async function accessToken(env, host) {
  if (env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim()) return env.SHOPIFY_ADMIN_ACCESS_TOKEN.trim();
  const id = env.SHOPIFY_CLIENT_ID?.trim();
  const secret = env.SHOPIFY_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new Error('管理APIトークン、または同一組織アプリのクライアントIDとシークレットを環境変数で指定してください。');
  const form = new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret });
  const result = await requestJson('https://' + host + '/admin/oauth/access_token',
    { 'Content-Type': 'application/x-www-form-urlencoded' }, form, 'Shopify認証');
  if (typeof result?.access_token !== 'string' || !result.access_token) {
    throw new Error('トークンを取得できませんでした。アプリの組織とインストール先を確認してください。');
  }
  return result.access_token;
}

function nextPage(connection, after) {
  if (!connection.pageInfo?.hasNextPage) return null;
  const cursor = connection.pageInfo.endCursor;
  if (typeof cursor !== 'string' || !cursor || cursor === after) {
    throw new Error('Shopifyのページ情報が不正でした。');
  }
  return cursor;
}

async function exportOrders(env) {
  const host = env.SHOPIFY_DEV_STORE?.trim().toLowerCase();
  if (!host || !storePattern.test(host)) throw new Error('SHOPIFY_DEV_STOREに開発ストアの .myshopify.com ホスト名を指定してください。');
  const token = await accessToken(env, host);
  const graphql = async (query, variables = {}) => {
    const result = await requestJson('https://' + host + '/admin/api/' + version + '/graphql.json',
      { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      JSON.stringify({ query, variables }), 'Shopify Admin API');
    if (result?.errors?.length || !result?.data) {
      throw new Error('Shopify Admin APIがクエリを拒否しました。read_ordersとアプリの承認状態を確認してください。');
    }
    return result.data;
  };

  const access = await graphql(scopeQuery);
  if (access.shop?.myshopifyDomain?.toLowerCase() !== host || access.shop?.plan?.partnerDevelopment !== true) {
    throw new Error('開発ストアを確認できません。注文の読み取りを中止しました。');
  }

  const current = new Date();
  const fromTime = new Date(current.getTime() - 30 * day);
  const search = 'test:true AND created_at:>=' + fromTime.toISOString();
  const orders = [];
  const seen = new Set();
  let after = null;
  do {
    const { orders: connection } = await graphql(ordersQuery, { search, after });
    if (!Array.isArray(connection?.nodes)) throw new Error('注文一覧を受信できませんでした。');
    for (const order of connection.nodes) {
      if (order.test !== true || !/^gid:\/\/shopify\/Order\/\d+$/.test(order.id) || seen.has(order.id)) continue;
      if (orders.length >= maxOrders) throw new Error('テスト注文が1,000件を超えました。出力の上限に達しました。');
      const created = new Date(order.createdAt);
      if (!(created >= fromTime && created <= current)) continue;
      const amount = order.currentSubtotalPriceSet?.shopMoney?.amount;
      const currency = order.currentSubtotalPriceSet?.shopMoney?.currencyCode;
      if (typeof amount !== 'string' || !moneyPattern.test(amount) || !/^[A-Z]{3}$/.test(currency ?? '')) {
        throw new Error('注文の商品小計または通貨コードが不正でした。');
      }
      seen.add(order.id);
      let linePage = order.lineItems;
      const lines = [];
      let lineAfter = null;
      do {
        if (!Array.isArray(linePage?.nodes)) throw new Error('注文明細を受信できませんでした。');
        for (const item of linePage.nodes) {
          if (!Number.isInteger(item.currentQuantity) || item.currentQuantity <= 0) continue;
          if (lines.length >= 300) throw new Error('処理可能な商品明細数の上限を超えました。');
          const title = typeof item.title === 'string' ? item.title.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 100) : '';
          lines.push({ title: title || '商品名なし', quantity: item.currentQuantity });
        }
        lineAfter = nextPage(linePage, lineAfter);
        if (lineAfter) {
          const page = await graphql(moreLinesQuery, { id: order.id, after: lineAfter });
          if (page.order?.test !== true || page.order.id !== order.id) throw new Error('注文情報が変更されました。もう一度実行してください。');
          linePage = page.order.lineItems;
        }
      } while (lineAfter);

      orders.push({
        id: 'SHOP-' + createHash('sha256').update(host + '|' + order.id).digest('hex').slice(0, 14),
        date: created.toISOString().slice(0, 10), test: true, cancelled: Boolean(order.cancelledAt),
        payment: order.displayFinancialStatus || 'UNKNOWN',
        fulfillment: order.displayFulfillmentStatus || 'UNKNOWN',
        currency, subtotal: amount, lines
      });
    }
    after = nextPage(connection, after);
  } while (after);

  return { schemaVersion: 1, source: 'shopify-dev-test-orders', store: host,
    exportedAt: current.toISOString(), from: fromTime.toISOString().slice(0, 10), orders };
}

try {
  const result = await exportOrders(process.env);
  console.log(JSON.stringify(result, null, 2));
  console.error('Shopify開発ストアからテスト注文 ' + result.orders.length + ' 件を出力しました。');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
