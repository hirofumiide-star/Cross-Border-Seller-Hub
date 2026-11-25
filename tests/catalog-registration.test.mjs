import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerDemoCatalog } from '../scripts/register-openlogi-demo-items.mjs';
import { DemoError } from '../scripts/lib/demo-common.mjs';

const catalog = JSON.parse(await readFile(new URL('../config/tea-demo-catalog.json', import.meta.url), 'utf8'));
function fakeClient() {
  const values = new Map();
  let writes = 0;
  const client = {
    account: 'TS001',
    async check() { return true; },
    async getItem(code) { return values.get(code) ?? null; },
    async createItem(item) {
      writes++;
      const created = { ...item, id: 'TS001-I' + String(writes).padStart(6, '0'), child_items: [] };
      values.set(item.code, created);
      return created;
    }
  };
  return { client, values, writes: () => writes };
}

test('catalog inspect makes no writes; rerun after registration creates no duplicate products', async () => {
  const f = fakeClient();
  const inspect = await registerDemoCatalog({ client: f.client, catalog });
  assert.equal(f.writes(), 0);
  assert.ok(inspect.items.every(item => item.status === 'missing'));
  const first = await registerDemoCatalog({ client: f.client, catalog, apply: true });
  assert.equal(f.writes(), 4);
  assert.ok(first.items.every(item => item.matchesCatalog));
  assert.equal(first.inventoryCreated, false);
  const second = await registerDemoCatalog({ client: f.client, catalog, apply: true });
  assert.equal(f.writes(), 4);
  assert.ok(second.items.every(item => item.status === 'exists'));
});

test('lost create response is reconciled by code without a second POST', async () => {
  const f = fakeClient();
  const create = f.client.createItem;
  f.client.createItem = async payload => { await create(payload); throw new DemoError('provider-error'); };
  const result = await registerDemoCatalog({ client: f.client, catalog, apply: true });
  assert.equal(f.writes(), 4);
  assert.ok(result.items.every(item => item.matchesCatalog));
});

test('ambiguous create without retrievable product stops instead of trying again', async () => {
  const f = fakeClient();
  let attempts = 0;
  f.client.createItem = async () => { attempts++; throw new DemoError('provider-error'); };
  await assert.rejects(registerDemoCatalog({ client: f.client, catalog, apply: true }), { code: 'submission-uncertain' });
  assert.equal(attempts, 1);
});

test('payment-required failure does not proceed to the next product', async () => {
  const f = fakeClient();
  let attempts = 0;
  f.client.createItem = async () => { attempts++; throw new DemoError('provider-error', 402); };
  await assert.rejects(registerDemoCatalog({ client: f.client, catalog, apply: true }), { httpStatus: 402 });
  assert.equal(attempts, 1);
});

test('existing virtual bundle is flagged for review and not silently overwritten', async () => {
  const f = fakeClient();
  await registerDemoCatalog({ client: f.client, catalog, apply: true });
  f.values.get('TSU-TASTING-3').child_items = [{ code: 'TSU-SENCHA-80', quantity: 1 }];
  const result = await registerDemoCatalog({ client: f.client, catalog, apply: true });
  assert.equal(result.items.at(-1).status, 'needs-review');
  assert.equal(f.writes(), 4);
});
