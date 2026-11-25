import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createOpenlogiClient } from './lib/openlogi-demo.mjs';
import { DemoError, ACCOUNT_PATTERN } from './lib/demo-common.mjs';

const catalogUrl = new URL('../config/tea-demo-catalog.json', import.meta.url);

function validateCatalog(catalog) {
  if (catalog?.schemaVersion !== 1 || catalog.purpose !== 'openlogi-demo-domestic-items'
    || catalog.currency !== 'JPY' || !Array.isArray(catalog.items) || catalog.items.length !== 4) {
    throw new DemoError('invalid-options');
  }
  const codes = new Set();
  for (const item of catalog.items) {
    if (!item || Object.keys(item).some(key => !['code', 'name', 'price'].includes(key))
      || !/^TSU-[A-Z0-9-]{1,24}$/.test(item.code ?? '') || codes.has(item.code)
      || typeof item.name !== 'string' || !item.name || item.name.length > 255
      || /[\u0000-\u001f\u007f]/.test(item.name)
      || !Number.isSafeInteger(item.price) || item.price < 0) {
      throw new DemoError('invalid-options');
    }
    codes.add(item.code);
  }
  return catalog;
}

function inspectItem(item, expected, account) {
  if (!item || item.code !== expected.code || !ACCOUNT_PATTERN.test(account)
    || typeof item.id !== 'string' || !item.id.startsWith(account + '-I')
    || !/^[A-Z0-9]+-I\d+$/.test(item.id)) throw new DemoError('sku-unmapped');
  const ordinaryItem = !Array.isArray(item.child_items) || item.child_items.length === 0;
  return {
    id: item.id,
    matchesCatalog: item.name === expected.name && Number(item.price) === expected.price && ordinaryItem,
    ordinaryItem
  };
}

// Product creation is opt-in. Existing products are inspected, never overwritten.
// A lost POST response is reconciled by the same code; it is never retried here.
export async function registerDemoCatalog({ client, catalog, apply = false }) {
  validateCatalog(catalog);
  await client.check();
  const results = [];
  for (const expected of catalog.items) {
    let current = await client.getItem(expected.code);
    if (current) {
      const checked = inspectItem(current, expected, client.account);
      results.push({ code: expected.code, status: checked.matchesCatalog ? 'exists' : 'needs-review', ...checked });
      continue;
    }
    if (!apply) {
      results.push({ code: expected.code, status: 'missing', id: null, matchesCatalog: false });
      continue;
    }
    try {
      current = await client.createItem({ ...expected });
    } catch (error) {
      // Account, permission, validation and payment failures must not be retried.
      if ([400, 401, 402, 403, 422, 429].includes(error.httpStatus)) throw error;
      current = await client.getItem(expected.code);
      if (!current) throw new DemoError('submission-uncertain');
    }
    const checked = inspectItem(current, expected, client.account);
    results.push({ code: expected.code, status: checked.matchesCatalog ? 'created-or-reconciled' : 'needs-review', ...checked });
  }
  return {
    schemaVersion: 1, source: 'seller-hub-demo-catalog-check', mode: 'openlogi-demo',
    generatedAt: new Date().toISOString(), operation: apply ? 'register-missing' : 'inspect-only',
    items: results,
    inventoryCreated: false,
    shipmentCreated: false
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('OPENLOGIデモ環境の4商品を確認します。既定は読み取りのみ。\n'
      + 'node --env-file=.env scripts/register-openlogi-demo-items.mjs [--apply]\n'
      + '--apply は未登録SKUだけを作成します。既存商品・在庫・出荷依頼は変更しません。');
    return;
  }
  if (args.some(arg => arg !== '--apply') || args.length > 1) throw new DemoError('invalid-options');
  const catalog = JSON.parse(await readFile(catalogUrl, 'utf8'));
  const report = await registerDemoCatalog({ client: createOpenlogiClient(process.env), catalog, apply: args.includes('--apply') });
  console.log(JSON.stringify(report, null, 2));
  if (report.items.some(item => ['missing', 'needs-review'].includes(item.status))) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const safe = error instanceof DemoError ? error : new DemoError('provider-error');
    console.error(safe.message + (safe.httpStatus ? ' HTTP ' + safe.httpStatus : ''));
    process.exitCode = 1;
  });
}
