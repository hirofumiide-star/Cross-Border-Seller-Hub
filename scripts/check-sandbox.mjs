const OPENLOGI_ITEMS = 'https://api-demo.openlogi.com/api/items?limit=1';
const SHOPIFY_STORE_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.myshopify\.com$/;

async function readJson(url, options) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    throw new Error('Connection failed, timed out, or attempted a redirect.');
  }

  if (!response.ok) throw new Error('Unexpected HTTP status ' + response.status + '.');
  try {
    return await response.json();
  } catch {
    throw new Error('Expected a JSON API response.');
  }
}

async function checkShopify({ SHOPIFY_DEV_STORE, SHOPIFY_ADMIN_ACCESS_TOKEN }) {
  const shop = SHOPIFY_DEV_STORE?.trim().toLowerCase();
  if (!shop || !SHOPIFY_STORE_PATTERN.test(shop) || !SHOPIFY_ADMIN_ACCESS_TOKEN?.trim()) {
    throw new Error('Set the dev store .myshopify.com hostname and an Admin API access token.');
  }
  const result = await readJson('https://' + shop + '/admin/api/2026-10/graphql.json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_ACCESS_TOKEN.trim()
    },
    body: JSON.stringify({ query: 'query SandboxStoreCheck { shop { myshopifyDomain } }' })
  });

  if (result?.errors?.length || result?.data?.shop?.myshopifyDomain?.toLowerCase() !== shop) {
    throw new Error('Shopify did not confirm the requested store. Check the store and app installation.');
  }

  return 'Authenticated; store hostname confirmed.';
}

async function checkOpenlogi({ OPENLOGI_DEMO_TOKEN }) {
  const result = await readJson(OPENLOGI_ITEMS, {
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + OPENLOGI_DEMO_TOKEN.trim(),
      'X-Api-Version': '1.6'
    }
  });

  if (!Array.isArray(result?.items)) {
    throw new Error('Expected an item-list response from the OPENLOGI demo API.');
  }

  return 'Authenticated; demo item endpoint reachable.';
}

const env = process.env;
const checks = [];
if (env.SHOPIFY_DEV_STORE || env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
  checks.push(['Shopify', () => checkShopify(env)]);
}
if (env.OPENLOGI_DEMO_TOKEN?.trim()) {
  checks.push(['OPENLOGI demo', () => checkOpenlogi(env)]);
}

if (!checks.length) {
  console.error('Set SHOPIFY_DEV_STORE and SHOPIFY_ADMIN_ACCESS_TOKEN, or OPENLOGI_DEMO_TOKEN.');
  process.exitCode = 2;
} else {
  for (const [name, check] of checks) {
    try {
      console.log(name + ' | ' + await check());
    } catch (error) {
      console.error(name + ' | ' + error.message);
      process.exitCode = 1;
    }
  }
}
