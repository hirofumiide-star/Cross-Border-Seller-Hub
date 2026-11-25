(() => {
  'use strict';

  const storageKey = 'seller-hub-broker-demo-v1';
  const stages = {
    preparation: '商品確認・委任待ち',
    queued: '通関業者の受領待ち',
    received: '書類確認中',
    information: '追加資料待ち',
    filed: '申告・食品報驗を提出済み',
    sampling: '抜き取り検査の結果待ち',
    held: '保留・要調整',
    cleared: '食品報驗・輸入通関完了',
    handedOff: '台湾の荷受け拠点へ引き渡し済み'
  };
  const roles = { hub: 'Seller Hub', broker: '通関業者' };
  const campaign = {
    id: 'TW-TEA-001',
    title: '宇治煎茶の台湾團購',
    sku: 'JP-UJI-SENCHA-80G',
    product: '煎茶 80 g',
    ingredient: '緑茶 100%',
    origin: '日本・京都府',
    manufacturer: '宇治 月野茶房（架空）',
    importer: '台北茶品有限公司（架空）',
    broker: '桃園通関サービス（架空）',
    organizerTotals: [{ id: 'DEMO-ORG-01', units: 55 }, { id: 'DEMO-ORG-02', units: 45 }],
    minimum: 80,
    unitValue: 250,
    cartons: 2,
    grossKg: 10
  };
  const actions = {
    check: { role: 'hub', from: ['preparation'], label: '商品・必要書類を確認', log: '輸入者と通関業者による商品・表示・書類の確認を記録' },
    authorize: { role: 'hub', from: ['preparation'], label: '輸入者の委任を確認', log: '台湾の輸入者による委任を確認（模擬）' },
    handoff: { role: 'hub', from: ['preparation'], to: 'queued', label: '通関案件を引き渡す', log: '担当通関業者の案件一覧に書類を共有（模擬）' },
    receive: { role: 'broker', from: ['queued'], to: 'received', label: '案件を受領する', log: '通関業者が案件を受領' },
    request: { role: 'broker', from: ['received', 'filed', 'sampling'], to: 'information', label: '追加資料を依頼する', note: true, log: '通関業者から追加資料の依頼' },
    reply: { role: 'hub', from: ['information'], label: '補足資料の共有を記録', note: true, log: 'Seller Hubが補足資料の共有を記録（模擬）' },
    file: { role: 'broker', from: ['received'], to: 'filed', label: '申告・食品報驗の提出を記録', log: '輸入申告と食品報驗の提出を記録（模擬）' },
    sample: { role: 'broker', from: ['filed'], to: 'sampling', label: '抜き取り検査を記録', log: '当局の抜き取り検査を記録（模擬）' },
    hold: { role: 'broker', from: ['filed', 'sampling'], to: 'held', label: '保留・問題を記録', note: true, log: '通関業者が保留理由を記録' },
    resume: { role: 'broker', from: ['held'], label: '保留の解消を記録', note: true, log: '通関業者が保留の解消を記録' },
    clear: { role: 'broker', from: ['filed', 'sampling'], to: 'cleared', label: '食品報驗・輸入通関の完了を記録', log: '食品報驗の適合と輸入通関の完了を記録（模擬）' },
    deliver: { role: 'hub', from: ['cleared'], to: 'handedOff', label: '荷受け拠点への引き渡しを記録', log: '台湾の荷受け拠点への引き渡しを記録（模擬）' }
  };
  const count = campaign.organizerTotals.reduce((total, group) => total + group.units, 0);
  const escape = value => String(value).replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

  let role = 'hub';
  let onExternalChange;
  function initial() {
    return { stage: 'preparation', checked: false, authorized: false, returnTo: null, events: [] };
  }

  function canApply(state, key, actor) {
    if (!Object.hasOwn(actions, key)) return false;
    const action = actions[key];
    if (actor !== action.role || !action.from.includes(state.stage)) return false;
    if (key === 'check') return !state.checked;
    if (key === 'authorize') return state.checked && !state.authorized;
    if (key === 'handoff') return state.checked && state.authorized && count >= campaign.minimum;
    return true;
  }

  function apply(state, event) {
    if (!event || !canApply(state, event.key, event.role)
      || typeof event.at !== 'string' || !Number.isFinite(Date.parse(event.at))
      || typeof event.note !== 'string' || event.note.length > 240) return state;
    const action = actions[event.key];
    if (action.note ? !event.note.trim() : event.note !== '') return state;
    const next = { ...state, events: [...state.events, event] };
    if (event.key === 'check') next.checked = true;
    if (event.key === 'authorize') next.authorized = true;
    if (event.key === 'request' || event.key === 'hold') next.returnTo = state.stage;
    if (event.key === 'reply' || event.key === 'resume') {
      next.stage = state.returnTo;
      next.returnTo = null;
    } else if (action.to) {
      next.stage = action.to;
    }
    return next;
  }

  let state = initial();
  try {
    const events = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(events)) state = events.reduce(apply, state);
  } catch {
    // Keep the demo usable when browser storage is unavailable.
  }

  window.addEventListener('storage', event => {
    if (event.key !== storageKey) return;
    try {
      const events = JSON.parse(event.newValue);
      if (Array.isArray(events)) state = events.reduce(apply, initial());
      else if (event.newValue === null) state = initial();
      onExternalChange?.();
    } catch {
      // Keep the previous valid state.
    }
  });

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state.events));
    } catch {
      // The current page can still be used.
    }
  }

  function packageData() {
    return {
      demo: true,
      shipment: campaign.id,
      destination: 'Taiwan',
      commercialInvoiceDraft: {
        sku: campaign.sku,
        description: 'Japanese sencha green tea, retail pack, 80 g',
        ingredients: '100% green tea',
        manufacturer: campaign.manufacturer,
        origin: campaign.origin,
        importer: campaign.importer,
        quantity: count,
        currency: 'TWD',
        illustrativeUnitValue: campaign.unitValue,
        illustrativeTotalValue: count * campaign.unitValue
      },
      packingListDraft: { cartons: campaign.cartons, netKg: count * 0.08, grossKg: campaign.grossKg },
      productLabelDraft: {
        language: 'zh-TW',
        productName: '日本煎茶',
        ingredients: '綠茶',
        netWeight: '80 g',
        countryOfOrigin: '日本',
        note: 'Illustrative copy only. Complete and verify the required label fields with the importer.'
      },
      campaignTotals: campaign.organizerTotals,
      documentChecklist: ['Product specification and final Traditional Chinese label', 'Importer authorization evidence', 'Supplier invoice for verification'],
      note: 'Fictional draft. Confirm the actual transaction value, local commodity code, documents and carton details with the importer and broker before any submission.'
    };
  }

  function download() {
    if (!state.checked || !state.authorized || state.stage === 'preparation') return;
    const blob = new Blob([JSON.stringify(packageData(), null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = campaign.id + '-demo-shipment.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const nextActions = () => Object.entries(actions).filter(([key]) => canApply(state, key, role));
  const date = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'short' });

  function render() {
    const visible = role === 'hub' || state.stage !== 'preparation';
    const roleControl = `<div class="filter-bar">
      <label for="broker-role">表示する担当者
        <select id="broker-role">
          <option value="hub" ${role === 'hub' ? 'selected' : ''}>Seller Hub</option>
          <option value="broker" ${role === 'broker' ? 'selected' : ''}>台湾の通関業者</option>
        </select>
      </label>
      <span class="sub">架空の1案件を同じブラウザーで操作。通知・申告は模擬です。</span>
    </div>`;
    if (!visible) return roleControl + `<section class="panel"><div class="panel-head"><h2>割り当てられた案件はありません</h2></div>
      <p class="panel-inner sub">Seller Hubで商品と委任を確認し、案件を引き渡すとここに表示されます。</p></section>`;

    const available = nextActions();
    const organizerCounts = campaign.organizerTotals.map(group => group.units + '点').join(' ＋ ');
    const needsNote = available.some(([, action]) => action.note);
    const handoffComplete = state.stage !== 'preparation';
    return roleControl + `<section class="panel broker-case" aria-labelledby="broker-case">
      <div class="panel-head"><div><h2 id="broker-case" tabindex="-1">${campaign.title}</h2><p class="sub">${campaign.id} · ${campaign.importer}</p></div>
        <span class="tag ${['held', 'information', 'sampling'].includes(state.stage) ? 'warn' : ''}" data-broker-stage="${state.stage}">${stages[state.stage]}</span>
      </div>
      <div class="panel-inner broker-details">
        <dl><div><dt>商品</dt><dd>${campaign.product} · ${campaign.sku}</dd></div>
          <div><dt>原材料・原産地</dt><dd>${campaign.ingredient} · ${campaign.origin}</dd></div>
          <div><dt>製造元</dt><dd>${campaign.manufacturer}</dd></div>
          <div><dt>確定数量</dt><dd>${count}点（成立条件 ${campaign.minimum}点）</dd></div>
          <div><dt>團購主別の確定数量</dt><dd>${organizerCounts}</dd></div></dl>
        <dl><div><dt>担当通関業者</dt><dd>${campaign.broker}</dd></div>
          <div><dt>商品・書類</dt><dd>${state.checked ? '確認済み' : '確認待ち'}</dd></div>
          <div><dt>輸入者の委任</dt><dd>${state.authorized ? '確認済み（模擬）' : '確認待ち'}</dd></div>
          <div><dt>発送書類</dt><dd>${handoffComplete ? '共有済み（模擬）' : '引き渡し前'}</dd></div></dl>
      </div>
    </section>
    <div class="broker-grid section-gap">
      <section class="panel"><div class="panel-head"><h2>この案件でできること</h2></div><div class="panel-inner">
        ${needsNote ? '<label class="broker-note" for="broker-note">追加資料・保留理由・回答のメモ<textarea id="broker-note" maxlength="240" rows="2" placeholder="例：繁体字ラベルの原材料表記を確認"></textarea></label>' : ''}
        <p class="broker-error sub" id="broker-error" role="alert"></p>
        <div class="row-actions broker-actions">${available.map(([key, action], i) =>
          `<button type="button" class="button ${i === 0 ? 'primary' : ''}" data-broker-action="${key}">${action.label}</button>`).join('')}
          ${handoffComplete ? '<button type="button" class="button" data-broker-action="download">出荷書類案（JSON）</button>' : ''}</div>
        ${available.length ? '' : '<p class="sub">担当者の更新待ち、またはこの工程は完了しています。</p>'}
        ${state.stage === 'handedOff' ? '<p class="sub">台湾国内の個別配送は荷受け拠点が手配する想定です。</p>' : ''}
      </div></section>
      <section class="panel"><div class="panel-head"><h2>案件の履歴</h2></div><div class="panel-inner">
        ${state.events.length ? `<ol class="broker-events">${[...state.events].reverse().map(event =>
          `<li><strong>${actions[event.key].log}</strong><span>${roles[event.role]} · ${date.format(Date.parse(event.at))}</span>
            ${event.note ? `<p>${escape(event.note)}</p>` : ''}</li>`).join('')}</ol>` : '<p class="sub">更新はまだありません。</p>'}
      </div></section>
    </div>
    ${role === 'hub' ? '<div class="row-actions section-gap"><button class="button" type="button" data-broker-action="reset">このデモ案件を初期化</button></div>' : ''}`;
  }

  function bind(root, rerender, notify) {
    onExternalChange = () => {
      if (root.querySelector('#broker-role')) rerender();
    };
    root.querySelector('#broker-role').addEventListener('change', event => {
      if (!Object.hasOwn(roles, event.target.value)) return;
      role = event.target.value;
      rerender();
      document.getElementById('broker-role')?.focus();
    });

    for (const button of root.querySelectorAll('[data-broker-action]')) {
      button.addEventListener('click', () => {
        const key = button.dataset.brokerAction;
        if (key === 'download') return download();
        if (key === 'reset' && role === 'hub') {
          if (!window.confirm('このブラウザーの通関デモ履歴を初期化しますか？')) return;
          state = initial();
          persist();
        } else {
          if (!canApply(state, key, role)) return;
          const memo = root.querySelector('#broker-note');
          const note = actions[key].note ? memo.value.trim() : '';
          if (actions[key].note && !note) {
            root.querySelector('#broker-error').textContent = '内容を入力してください。';
            memo.focus();
            return;
          }
          state = apply(state, { key, role, note, at: new Date().toISOString() });
          persist();
        }
        rerender();
        document.getElementById('broker-case')?.focus();
        notify(key === 'reset' ? 'デモを初期化しました。' : '案件を更新しました。');
      });
    }
  }

  globalThis.BrokerDemo = { render, bind };
})();
