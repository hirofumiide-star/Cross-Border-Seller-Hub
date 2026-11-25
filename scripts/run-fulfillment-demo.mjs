import { readFile, mkdir, writeFile, rename, mkdtemp, rm } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DemoError, STORE_PATTERN } from './lib/demo-common.mjs';
import { createShopifyClient } from './lib/shopify-demo.mjs';
import { createOpenlogiClient } from './lib/openlogi-demo.mjs';
import { planOrder, verifySkus, processShipment, makeReport } from './lib/fulfillment-demo.mjs';

const help = `Seller Hub fulfillment demo (Node.js 22+)

  node scripts/run-fulfillment-demo.mjs --mode fixture --output .runtime/fulfillment-report.json
  node scripts/run-fulfillment-demo.mjs --mode openlogi-demo --order-id 19055954755837 --output .runtime/fulfillment-report.json
  node scripts/run-fulfillment-demo.mjs --mode openlogi-demo --order-id 19055954755837 --submit-demo --output .runtime/fulfillment-report.json

--mode fixture        Local fictional lifecycle; no network or external changes (default).
--mode openlogi-demo  Read one Shopify dev-store test order and reconcile the OPENLOGI demo.
--submit-demo         Create one suspended demo request if it does not already exist.
--state-dir PATH      Durable retry journal; default .runtime/fulfillment. Keep between runs.
--output PATH         Write a redacted JSON report. Without this flag, print JSON to stdout.

Environment: SHOPIFY_DEV_STORE, SHOPIFY_ADMIN_ACCESS_TOKEN (or SHOPIFY_CLIENT_ID +
SHOPIFY_CLIENT_SECRET), OPENLOGI_DEMO_TOKEN, OPENLOGI_DEMO_ACCOUNT.
No production shipment endpoint, warehouse release, customer email, or Shopify writeback.
`;

export function parseOptions(argv) {
  const options = { mode: 'fixture', submit: false, stateDirectory: '.runtime/fulfillment' };
  const seen = new Set();
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (seen.has(key)) throw new DemoError('invalid-options');
    seen.add(key);
    if (key === '--help') { options.help = true; continue; }
    if (key === '--submit-demo') { options.submit = true; continue; }
    const property = { '--mode': 'mode', '--order-id': 'orderId', '--output': 'output', '--state-dir': 'stateDirectory' }[key];
    const value = argv[++index];
    if (!property || !value || value.startsWith('--')) throw new DemoError('invalid-options');
    options[property] = value;
  }
  if (!['fixture', 'openlogi-demo'].includes(options.mode) || options.mode === 'fixture' && (options.submit || options.orderId)) {
    throw new DemoError('invalid-options');
  }
  return options;
}

export async function runFixture() {
  const fixture = JSON.parse(await readFile(new URL('../fixtures/fulfillment-order.json', import.meta.url), 'utf8'));
  const plan = planOrder(fixture);
  let stored = null;
  const client = {
    account: 'DEMO01',
    async getItem(code) { return { id: 'DEMO01-I000001', code }; },
    async getShipment() { return stored; },
    async createShipment(request) {
      // Explicitly fictional warehouse progression; never used in the API mode.
      stored = { ...structuredClone(request), id: 'DEMO01-S000001', status: 'shipped', suspend: false,
        shipped_at: '2026-11-26T00:01:00.000Z', tracking_codes: ['DEMO-TRACK-0001'],
        url: 'https://example.com/demo-tracking/DEMO-TRACK-0001', delivery_service: 'DEMO-CARRIER' };
      return { ...structuredClone(request), id: stored.id, status: 'suspended', suspend: true };
    }
  };
  const directory = await mkdtemp(join(tmpdir(), 'seller-hub-fixture-'));
  try {
    await verifySkus(plan, client);
    const order = await processShipment(plan, client, { submit: true, stateDirectory: directory,
      revalidate: async () => planOrder(structuredClone(fixture)) });
    return { report: makeReport({ mode: 'fixture', store: fixture.store,
      connection: { shopify: 'fixture', openlogi: 'fixture' }, orders: [order] }), exitCode: 0, error: null };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function runLive(options, env, fetchImpl = fetch) {
  const store = STORE_PATTERN.test(env.SHOPIFY_DEV_STORE?.trim().toLowerCase() ?? '')
    ? env.SHOPIFY_DEV_STORE.trim().toLowerCase() : 'unconfigured.myshopify.com';
  const connection = { shopify: 'not-configured', openlogi: 'not-configured' };
  let plan = null;
  let stage = 'shopify';
  try {
    const shopify = await createShopifyClient(env, fetchImpl);
    connection.shopify = 'verified';
    if (!options.orderId) throw new DemoError('invalid-options');
    plan = planOrder(await shopify.readOrder(options.orderId));
    stage = 'openlogi';
    const openlogi = createOpenlogiClient(env, fetchImpl);
    await openlogi.check();
    connection.openlogi = 'verified';
    await verifySkus(plan, openlogi);
    const order = await processShipment(plan, openlogi, {
      submit: options.submit, stateDirectory: options.stateDirectory,
      revalidate: async () => planOrder(await shopify.readOrder(options.orderId))
    });
    return { report: makeReport({ mode: 'openlogi-demo', store, connection, orders: [order] }), exitCode: 0, error: null };
  } catch (caught) {
    const error = caught instanceof DemoError ? caught : new DemoError('provider-error');
    if (connection[stage] !== 'verified' && error.code !== 'missing-credentials') connection[stage] = 'failed';
    const blockReason = ['missing-credentials', 'order-ineligible', 'sku-unmapped', 'shipment-mismatch',
      'submission-uncertain', 'provider-error'].includes(error.code) ? error.code : 'provider-error';
    const orders = plan ? [{ ...plan.report, status: 'blocked', blockReason }] : [];
    return { report: makeReport({ mode: 'openlogi-demo', store, connection, orders }),
      exitCode: error.code === 'missing-credentials' ? 2 : 1, error };
  }
}

async function writeReport(path, report) {
  const destination = resolve(path);
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = destination + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  await rename(temporary, destination);
}

async function main() {
  try {
    const options = parseOptions(process.argv.slice(2));
    if (options.help) { console.log(help); return; }
    const result = options.mode === 'fixture' ? await runFixture() : await runLive(options, process.env);
    if (options.output) await writeReport(options.output, result.report);
    else console.log(JSON.stringify(result.report, null, 2));
    if (result.error) console.error(result.error.code + ': ' + result.error.message);
    else console.error(options.mode === 'fixture' ? '架空の物流フローを検証しました。実APIへの接続は行っていません。'
      : options.submit ? 'OPENLOGIデモ依頼の作成・照合結果を出力しました。倉庫作業は自動開始しません。'
        : '読み取り・照合結果を出力しました。出荷依頼の新規作成は行っていません。');
    process.exitCode = result.exitCode;
  } catch (caught) {
    const error = caught instanceof DemoError ? caught : new DemoError('provider-error');
    console.error(error.code + ': ' + error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
