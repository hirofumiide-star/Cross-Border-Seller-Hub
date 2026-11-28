(() => {
  'use strict';

  const { sources, teaCode, escape, hsCode, cccCode, documents, preview } = BrokerDocuments;
  const storageKey = 'seller-hub-broker-demo-v1';
  const importedHs = '090220';
  const stages = {
    preparation: '商品確認・委任待ち',
    queued: '通関業者の受領待ち',
    received: '書類確認中',
    information: '追加資料待ち',
    filed: '申告・食品報驗を提出済み',
    sampling: '抜き取り検査の結果待ち',
    held: '保留・要調整',
    cleared: '食品報驗・輸入通関完了',
    handedOff: '台湾の荷受け拠点へ引き渡し済み',
    completed: '台湾の購入者への配達完了'
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
    exporter: 'Tsukino Tea House (demo), Uji, Kyoto, Japan',
    importerEnglish: 'Taipei Tea Products Co. (demo), Taipei, Taiwan',
    brand: '月野茶房（架空）',
    productChinese: '日本煎茶（未發酵綠茶，80 g／包）',
    descriptionEnglish: 'Japanese sencha, unfermented green tea, retail pack, 80 g',
    invoiceNumber: 'DEMO-INV-TW-001',
    invoiceDate: '2026-11-28',
    tradeTerms: 'FCA Kansai International Airport, Japan (Incoterms® 2020)',
    route: 'Osaka Kansai (KIX) → Taiwan Taoyuan (TPE)',
    cartons: [
      { id: 'C01', organizer: 'DEMO-ORG-01', units: 55, grossGrams: 5500 },
      { id: 'C02', organizer: 'DEMO-ORG-02', units: 45, grossGrams: 4500 }
    ],
    minimum: 80,
    packGrams: 80,
    currency: 'TWD',
    unitValue: 250
  };
  const actions = {
    check: { role: 'hub', from: ['preparation'], label: '商品・必要書類を確認', log: '輸入者と通関業者による商品・表示・書類の確認を記録' },
    authorize: { role: 'hub', from: ['preparation'], label: '輸入者の委任を確認', log: '台湾の輸入者による委任を確認（模擬）' },
    handoff: { role: 'hub', from: ['preparation'], to: 'queued', label: '通関案件を引き渡す', log: '担当通関業者の案件一覧に書類を共有（模擬）' },
    receive: { role: 'broker', from: ['queued'], to: 'received', label: '案件を受領する', log: '通関業者が案件を受領' },
    classify: { role: 'broker', from: ['received'], note: true, log: '品目分類を確認・修正' },
    request: { role: 'broker', from: ['received', 'filed', 'sampling'], to: 'information', label: '追加資料を依頼する', note: true, log: '通関業者から追加資料の依頼' },
    reply: { role: 'hub', from: ['information'], label: '補足資料の共有を記録', note: true, log: 'Seller Hubが補足資料の共有を記録（模擬）' },
    file: { role: 'broker', from: ['received'], to: 'filed', label: '申告・食品報驗の提出を記録', log: '輸入申告と食品報驗の提出を記録（模擬）' },
    sample: { role: 'broker', from: ['filed'], to: 'sampling', label: '抜き取り検査を記録', log: '当局の抜き取り検査を記録（模擬）' },
    hold: { role: 'broker', from: ['filed', 'sampling'], to: 'held', label: '保留・問題を記録', note: true, log: '通関業者が保留理由を記録' },
    resume: { role: 'broker', from: ['held'], label: '保留の解消を記録', note: true, log: '通関業者が保留の解消を記録' },
    clear: { role: 'broker', from: ['filed', 'sampling'], to: 'cleared', label: '食品報驗・輸入通関の完了を記録', log: '食品報驗の適合と輸入通関の完了を記録（模擬）' },
    deliver: { role: 'hub', from: ['cleared'], to: 'handedOff', label: '荷受け拠点への引き渡しを記録', log: '台湾の荷受け拠点への引き渡しを記録（模擬）' },
    complete: { role: 'hub', from: ['handedOff'], to: 'completed', label: '全購入者への配達完了を記録', log: '台湾国内配送の配達結果を確認し、團購の配送サービスを完了（模擬）' }
  };
  const count = campaign.cartons.reduce((total, carton) => total + carton.units, 0);
  const shipment = {
    ...campaign,
    quantity: count,
    netGrams: count * campaign.packGrams,
    grossGrams: campaign.cartons.reduce((total, carton) => total + carton.grossGrams, 0),
    merchandiseTotal: count * campaign.unitValue
  };

  let role = 'hub';
  let onExternalChange;
  function initial() {
    return { stage: 'preparation', checked: false, authorized: false, returnTo: null, classification: null, events: [] };
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

  const validCodes = (hs, ccc) => typeof hs === 'string' && typeof ccc === 'string'
    && /^\d{6}$/.test(hs) && /^\d{11}$/.test(ccc) && ccc.startsWith(hs);

  function apply(state, event) {
    if (!event || !canApply(state, event.key, event.role)
      || typeof event.at !== 'string' || !Number.isFinite(Date.parse(event.at))
      || typeof event.note !== 'string' || event.note.length > 240) return state;
    const action = actions[event.key];
    if (action.note ? !event.note.trim() : event.note !== '') return state;
    if (event.key === 'classify') {
      if (!validCodes(event.hs, event.ccc)) return state;
      const prior = state.classification;
      const classification = { hs: event.hs, ccc: event.ccc, revision: (prior?.revision || 0) + 1 };
      const logged = { ...event, change: (prior ? hsCode(prior.hs) + ' / ' + cccCode(prior.ccc) : hsCode(importedHs) + ' / 未入力')
        + ' → ' + hsCode(classification.hs) + ' / ' + cccCode(classification.ccc) };
      return { ...state, classification, events: [...state.events, logged] };
    }
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
        reference: shipment.invoiceNumber,
        description: shipment.descriptionEnglish,
        ingredients: '100% green tea',
        exporter: shipment.exporter,
        manufacturer: campaign.manufacturer,
        origin: campaign.origin,
        importer: campaign.importer,
        quantity: count,
        currency: shipment.currency,
        tradeTerms: shipment.tradeTerms,
        illustrativeUnitValue: campaign.unitValue,
        illustrativeTotalValue: shipment.merchandiseTotal
      },
      classification: state.classification,
      packingListDraft: {
        cartons: shipment.cartons.length,
        netKg: shipment.netGrams / 1000,
        grossKg: shipment.grossGrams / 1000,
        items: shipment.cartons.map(carton => ({
          carton: carton.id, sku: campaign.sku, quantity: carton.units,
          netKg: carton.units * shipment.packGrams / 1000, grossKg: carton.grossGrams / 1000
        }))
      },
      productLabelDraft: {
        language: 'zh-TW',
        productName: '日本煎茶',
        ingredients: '綠茶',
        netWeight: '80 g',
        countryOfOrigin: '日本',
        note: 'Illustrative copy only. Complete and verify the required label fields with the importer.'
      },
      campaignTotals: shipment.cartons.map(carton => ({ id: carton.organizer, units: carton.units })),
      documentChecklist: ['Carrier air waybill', 'Product specification and Traditional Chinese label', 'Importer authorization evidence', 'Exporter invoice and warehouse packing data', 'Import declaration and TFDA inspection application'],
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

  const nextActions = () => Object.entries(actions).filter(([key]) => key !== 'classify' && canApply(state, key, role));
  const date = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'short' });

  function classificationPanel() {
    const saved = state.classification;
    const editable = canApply(state, 'classify', role);
    return `<section class="panel broker-classification" aria-labelledby="broker-classification">
      <div class="panel-head"><div><h2 id="broker-classification" tabindex="-1">品目分類</h2>
        <p class="sub">輸入申告に使うコードを、原材料・製法・小売包装の仕様と照合します。</p></div>
        <span class="tag ${saved ? '' : 'warn'}">${saved ? '確認済み · 第' + saved.revision + '版' : '要照合'}</span></div>
      <div class="panel-inner">
        <div class="broker-code-summary"><span>取込時のHS <strong>${hsCode(importedHs)}</strong><small>バルク用の候補が入った模擬例</small></span>
          <span>保存済みHS <strong>${saved ? hsCode(saved.hs) : '—'}</strong></span>
          <span>保存済み台湾CCC <strong>${saved ? cccCode(saved.ccc) : '—'}</strong></span></div>
        ${editable ? `<form class="broker-code-form" id="broker-code-form">
          <div class="broker-code-inputs">
            <label for="broker-hs">HSコード（6桁）<input id="broker-hs" name="hs" maxlength="16" required value="${hsCode(saved?.hs || importedHs)}" spellcheck="false" autocomplete="off"></label>
            <label for="broker-ccc">台湾CCCコード（11桁）<input id="broker-ccc" name="ccc" maxlength="24" required value="${saved ? cccCode(saved.ccc) : ''}" placeholder="${cccCode(teaCode.ccc)}" spellcheck="false" autocomplete="off"></label>
          </div>
          <label class="broker-note" for="broker-classification-note">照合・修正理由<textarea id="broker-classification-note" name="reason" maxlength="240" rows="2" required placeholder="例：仕様書で未発酵の煎茶・小売袋80 g入りと確認"></textarea></label>
          <p class="broker-error sub" id="broker-code-error" role="alert"></p>
          <div class="row-actions broker-actions"><button class="button primary" type="submit">分類を確認して保存</button>
            <button class="button" type="button" id="broker-sample-code">煎茶の記入例を入れる</button></div>
        </form>` : `<p class="sub">${['preparation', 'queued', 'received', 'information'].includes(state.stage)
          ? '担当の通関業者が受領後、書類確認中に分類を入力できます。'
          : '提出後に分類を変更する場合は、通関業者が税関の更正手続を確認します。'}</p>`}
        <p class="sub broker-links"><a href="${sources.tariff}" target="_blank" rel="noopener">台湾税関の品目コード検索</a>
          <a href="${sources.foodCodes}" target="_blank" rel="noopener">TFDAのF01・F02品目表</a></p>
      </div>
    </section>`;
  }

  function documentPanel() {
    const saved = state.classification;
    return `<section class="panel" aria-labelledby="broker-documents">
      <div class="panel-head"><div><h2 id="broker-documents">通関書類</h2>
        <p class="sub">${saved ? '保存した分類の第' + saved.revision + '版で書類案を生成します。' : '分類を保存すると、案件データから書類案を生成できます。'}</p></div></div>
      <ul class="broker-doc-list">${Object.entries(documents).map(([key, doc]) => `<li><div><strong>${doc.title}</strong>
        <p class="sub">${doc.description}</p></div><button type="button" class="button" data-broker-document="${key}"
        aria-label="${doc.title}を生成・プレビュー"${saved ? '' : ' disabled'}>生成・プレビュー</button></li>`).join('')}</ul>
      <details class="broker-external"><summary>別途取り寄せ・確認する資料</summary>
        <ul class="sub"><li><strong>運送会社</strong>から空運提單（AWB）を受領し、貨物情報と照合。</li>
          <li><strong>輸出者・倉庫</strong>から取引インボイス原本、梱包実績、仕様書、表示ラベル・ロット情報を受領。</li>
          <li><strong>台湾の輸入者</strong>の委任を確認し、必要に応じて許可・証明書を取り寄せ。</li>
          <li><strong>台湾の通関業者</strong>が輸入申告と食品報驗の提出用データを確認。</li></ul>
        <p class="sub broker-links"><a href="${sources.cargo}" target="_blank" rel="noopener">台湾税関の提出書類</a>
          <a href="${sources.foodInspection}" target="_blank" rel="noopener">TFDAの食品報驗規則</a>
          <a href="${sources.amendment}" target="_blank" rel="noopener">台湾税関の申告訂正手続</a></p>
      </details>
    </section>`;
  }

  function render() {
    const visible = role === 'hub' || state.stage !== 'preparation';
    const roleControl = `<div class="filter-bar">
      <label for="broker-role">表示する担当者
        <select id="broker-role">
          <option value="hub" ${role === 'hub' ? 'selected' : ''}>Seller Hub</option>
          <option value="broker" ${role === 'broker' ? 'selected' : ''}>台湾の通関業者</option>
        </select>
      </label>
      <span class="sub">架空案件 · ブラウザー内で保存</span>
      ${['preparation', 'queued'].includes(state.stage) ? '<button type="button" class="button primary" data-broker-action="start-review">通関業者として書類確認を始める</button>' : ''}
    </div>`;
    if (!visible) return roleControl + `<section class="panel"><div class="panel-head"><h2>割り当てられた案件はありません</h2></div>
      <p class="panel-inner sub">Seller Hubで商品と委任を確認し、案件を引き渡すとここに表示されます。</p></section>`;

    const available = nextActions();
    const organizerCounts = campaign.cartons.map(carton => carton.units + '点').join(' ＋ ');
    const needsNote = available.some(([, action]) => action.note);
    const filingBlocked = !state.classification && available.some(([key]) => key === 'file');
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
    <div class="broker-workspace section-gap">${classificationPanel()}${documentPanel()}</div>
    <div class="broker-grid section-gap">
      <section class="panel"><div class="panel-head"><h2>この案件でできること</h2></div><div class="panel-inner">
        ${needsNote ? '<label class="broker-note" for="broker-note">追加資料・保留理由・回答のメモ<textarea id="broker-note" maxlength="240" rows="2" placeholder="例：繁体字ラベルの原材料表記を確認"></textarea></label>' : ''}
        <p class="broker-error sub" id="broker-error" role="alert"></p>
        <div class="row-actions broker-actions">${available.map(([key, action], i) =>
          `<button type="button" class="button ${i === 0 ? 'primary' : ''}" data-broker-action="${key}"${key === 'file' && filingBlocked ? ' disabled' : ''}>${action.label}</button>`).join('')}
          ${handoffComplete ? '<button type="button" class="button" data-broker-action="download">出荷書類案（JSON）</button>' : ''}</div>
        ${filingBlocked ? '<p class="sub">提出を記録する前に、品目分類を確認して保存してください。</p>' : ''}
        ${available.length ? '' : '<p class="sub">担当者の更新待ち、またはこの工程は完了しています。</p>'}
        ${state.stage === 'handedOff' ? '<p class="sub">台湾の販売パートナーが個別配送を手配します。購入者への配達を確認してから完了を記録します。</p>' : ''}
      </div></section>
      <section class="panel"><div class="panel-head"><h2>案件の履歴</h2></div><div class="panel-inner">
        ${state.events.length ? `<ol class="broker-events">${[...state.events].reverse().map(event =>
          `<li><strong>${actions[event.key].log}</strong><span>${roles[event.role]} · ${date.format(Date.parse(event.at))}</span>
            ${event.key === 'classify' ? `<p class="broker-code-change">${escape(event.change)}</p>` : ''}
            ${event.note ? `<p>${escape(event.note)}</p>` : ''}</li>`).join('')}</ol>` : '<p class="sub">更新はまだありません。</p>'}
      </div></section>
    </div>
    ${role === 'hub' ? '<div class="row-actions section-gap"><button class="button" type="button" data-broker-action="reset">このデモ案件を初期化</button></div>' : ''}`;
  }

  function bind(root, rerender, notify, openDialog) {
    onExternalChange = () => {
      if (root.querySelector('#broker-role')) rerender();
    };
    root.querySelector('#broker-role').addEventListener('change', event => {
      if (!Object.hasOwn(roles, event.target.value)) return;
      role = event.target.value;
      rerender();
      document.getElementById('broker-role')?.focus();
    });

    const form = root.querySelector('#broker-code-form');
    if (form) {
      const hs = form.elements.namedItem('hs');
      const ccc = form.elements.namedItem('ccc');
      const reason = form.elements.namedItem('reason');
      root.querySelector('#broker-sample-code').addEventListener('click', () => {
        hs.value = hsCode(teaCode.hs);
        ccc.value = cccCode(teaCode.ccc);
        if (!reason.value.trim()) reason.value = '商品仕様書とTFDAの品目表を照合。未発酵の緑茶で、直接包装は80 g。';
        hs.focus();
      });
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (!canApply(state, 'classify', role)) return;
        const normalizedHs = hs.value.replace(/[.\s-]/g, '');
        const normalizedCcc = ccc.value.replace(/[.\s-]/g, '');
        const note = reason.value.trim();
        if (!validCodes(normalizedHs, normalizedCcc) || !note) {
          root.querySelector('#broker-code-error').textContent = 'HSは6桁、台湾CCCは11桁です。CCCの先頭6桁をHSと揃え、理由を記入してください。';
          (note ? hs : reason).focus();
          return;
        }
        state = apply(state, { key: 'classify', role, note, hs: normalizedHs, ccc: normalizedCcc, at: new Date().toISOString() });
        persist();
        rerender();
        document.getElementById('broker-classification')?.focus();
        notify('分類を保存しました。最新の書類案を生成できます。');
      });
    }

    for (const button of root.querySelectorAll('[data-broker-document]')) {
      button.addEventListener('click', () => {
        const key = button.dataset.brokerDocument;
        if (!state.classification || !Object.hasOwn(documents, key)) return;
        openDialog(documents[key].title, preview(key, shipment, state.classification));
        document.querySelector('#dialog [data-broker-print]').addEventListener('click', () => window.print());
      });
    }

    for (const button of root.querySelectorAll('[data-broker-action]')) {
      button.addEventListener('click', () => {
        const key = button.dataset.brokerAction;
        if (key === 'download') return download();
        if (key === 'start-review') {
          for (const action of ['check', 'authorize', 'handoff', 'receive']) {
            state = apply(state, { key: action, role: actions[action].role, note: '', at: new Date().toISOString() });
          }
          role = 'broker';
          persist();
          rerender();
          document.getElementById('broker-classification')?.focus();
          notify('模擬案件を受領しました。品目分類を確認してください。');
          return;
        }
        if (key === 'reset' && role === 'hub') {
          if (!window.confirm('このブラウザーの通関デモ履歴を初期化しますか？')) return;
          state = initial();
          persist();
        } else {
          if (!canApply(state, key, role) || (key === 'file' && !state.classification)) return;
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
