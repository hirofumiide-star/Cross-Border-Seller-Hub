export const STORE_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.myshopify\.com$/;
export const ACCOUNT_PATTERN = /^[A-Z0-9]{2,20}$/;

const messages = {
  'missing-credentials': '必要なデモ認証情報が設定されていません。',
  'order-ineligible': '対象は、日本向け・入金済み・未発送の開発ストアのテスト注文に限ります。注文と出荷割当を確認してください。',
  'sku-unmapped': '注文のSKUがOPENLOGIデモの商品と一致しません。商品登録を確認してください。',
  'shipment-mismatch': '既存の出荷依頼、または保存した依頼と今回の注文内容が一致しません。自動再送を中止しました。',
  'submission-uncertain': '出荷依頼の受付結果を確定できません。識別番号で照合し、自動再送を止めています。',
  'provider-error': 'プロバイダーの応答を検証できませんでした。接続先・権限・利用条件を確認してください。',
  'journal-error': '実行記録を安全に読み書きできません。重複実行や記録ファイルを確認してください。',
  'invalid-options': '引数が不正です。--help を確認してください。'
};

export class DemoError extends Error {
  constructor(code, httpStatus = null) {
    super(messages[code] || messages['provider-error']);
    this.name = 'DemoError';
    this.code = Object.hasOwn(messages, code) ? code : 'provider-error';
    this.httpStatus = httpStatus;
  }
}

// Never echo provider bodies, request URLs, headers, or native exception messages.
export async function requestJson(fetchImpl, url, options = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      ...options, redirect: 'error', signal: AbortSignal.timeout(15_000)
    });
  } catch {
    throw new DemoError('provider-error');
  }
  if (!response.ok) throw new DemoError('provider-error', response.status);
  let result;
  try {
    const text = await response.text();
    if (text.length > 5_000_000) throw new Error();
    result = JSON.parse(text);
  } catch {
    throw new DemoError('provider-error');
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new DemoError('provider-error');
  return result;
}

export function cleanText(value, max = 100) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
}
