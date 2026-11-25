import { ACCOUNT_PATTERN, DemoError, requestJson } from './demo-common.mjs';

export const OPENLOGI_DEMO_BASE = 'https://api-demo.openlogi.com/api';
export const OPENLOGI_API_VERSION = '1.6';

// There is intentionally no configurable API host and no production mode.
export function createOpenlogiClient(env, fetchImpl = fetch) {
  const account = env.OPENLOGI_DEMO_ACCOUNT?.trim();
  const token = env.OPENLOGI_DEMO_TOKEN?.trim();
  if (!ACCOUNT_PATTERN.test(account ?? '') || !token) throw new DemoError('missing-credentials');
  const headers = {
    Authorization: 'Bearer ' + token,
    'X-Api-Version': OPENLOGI_API_VERSION,
    'Content-Type': 'application/json'
  };
  const get = async path => {
    try { return await requestJson(fetchImpl, OPENLOGI_DEMO_BASE + path, { method: 'GET', headers }); }
    catch (error) { if (error.httpStatus === 404) return null; throw error; }
  };
  const post = (path, payload) => requestJson(fetchImpl, OPENLOGI_DEMO_BASE + path,
    { method: 'POST', headers, body: JSON.stringify(payload) });
  return {
    account,
    async check() {
      const result = await get('/items?limit=1');
      if (!Array.isArray(result?.items)) throw new DemoError('provider-error');
      return true;
    },
    getItem(code) {
      if (typeof code !== 'string' || !/^[!-~]{1,30}$/.test(code)) throw new DemoError('sku-unmapped');
      return get('/items/' + encodeURIComponent(account) + '/' + encodeURIComponent(code) + '?stock=1');
    },
    getShipment(identifier) {
      if (!/^cbsh-[a-f0-9]{32}$/.test(identifier)) throw new DemoError('shipment-mismatch');
      return get('/shipments/' + encodeURIComponent(account) + '/' + encodeURIComponent(identifier));
    },
    createShipment(payload) {
      if (!/^cbsh-[a-f0-9]{32}$/.test(payload?.identifier ?? '') || payload?.suspend !== true
        || payload?.backorder_if_unavailable !== true || payload?.shipping_email !== null
        || payload?.apply_rule !== false || payload?.international !== false || payload?.cash_on_delivery !== false) {
        throw new DemoError('shipment-mismatch');
      }
      return post('/shipments', payload);
    },
    createItem(payload) {
      if (typeof payload?.code !== 'string' || !/^[!-~]{1,30}$/.test(payload.code)) throw new DemoError('sku-unmapped');
      return post('/items', payload);
    }
  };
}
