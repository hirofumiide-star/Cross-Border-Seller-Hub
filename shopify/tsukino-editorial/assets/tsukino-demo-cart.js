(() => {
  'use strict';

  const duration = 10 * 60 * 1000;
  const prefix = 'tsukino-friend-group:v2:';
  const intentKey = prefix + 'incoming';
  const recentKey = prefix + 'recent';
  const idPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
  const params = new URLSearchParams(location.search);
  const home = document.querySelector('[data-tsg-friend-home]');
  const cart = document.querySelector('[data-tsg-demo-cart]');
  const status = (home ?? cart)?.querySelector('[data-tsg-friend-status]');
  if (!status) return;

  const groupSize = Number(status.dataset.groupSize);

  function parseGroup(token) {
    const [version, id, time, extra] = (token || '').split('.');
    if (version !== 'v2' || extra !== undefined || !idPattern.test(id) || !/^\d{13}$/.test(time)) return null;
    const expires = Number(time);
    if (expires > Date.now() + duration + 60 * 1000) return null;
    return { id, token, expires };
  }

  function readStored(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function validReceipts(group, receipts) {
    const ordered = [...receipts].filter(([id, time]) =>
      idPattern.test(id) && id !== group.id && Number.isSafeInteger(time) &&
      time >= group.expires - duration && time < group.expires && time <= Date.now()
    ).sort(([idA, timeA], [idB, timeB]) => timeA - timeB || idA.localeCompare(idB));
    const unique = new Map();
    for (const [id, time] of ordered) {
      if (unique.has(id)) continue;
      unique.set(id, time);
      if (unique.size === groupSize - 1) break;
    }
    return unique;
  }

  function readReceipts(group) {
    try {
      return validReceipts(group, JSON.parse(readStored(prefix + 'group:' + group.token) || '[]'));
    } catch {
      return new Map();
    }
  }

  function mergeReceipts(group, additions) {
    const existing = readReceipts(group);
    for (const [id, time] of validReceipts(group, additions)) {
      if (!existing.has(id) || time < existing.get(id)) existing.set(id, time);
    }
    const receipts = validReceipts(group, existing);
    localStorage.setItem(prefix + 'group:' + group.token, JSON.stringify([...receipts]));
    return receipts;
  }

  function groupUrl(key, value, receipts) {
    const url = new URL(cart?.dataset.shopRoot || location.pathname, location.origin);
    url.searchParams.set(key, value);
    if (receipts?.size) {
      url.searchParams.set('demo_receipts', [...receipts].map(([id, time]) => id + '.' + time).join(','));
    }
    return url.href;
  }

  function participantId(group) {
    try {
      return sessionStorage.getItem(prefix + 'participant:' + group.token);
    } catch {
      return null;
    }
  }

  let recentGroup = parseGroup(readStored(recentKey));
  const inviteParameter = params.get('demo_invite');
  const invite = parseGroup(inviteParameter);
  const receipt = parseGroup(params.get('demo_group'));
  const result = parseGroup(params.get('demo_result'));
  const sampleExpired = params.get('demo_example') === 'expired';
  const incoming = invite || result;
  const encodedReceipts = params.get('demo_receipts') || '';
  if (incoming && encodedReceipts && encodedReceipts.length <= 1500) {
    try {
      mergeReceipts(incoming, encodedReceipts.split(',').map(entry => {
        const [id, time, extra] = entry.split('.');
        return [id, extra === undefined ? Number(time) : NaN];
      }));
    } catch {
      // The corresponding local group can still be read with storage disabled.
    }
  }
  const hint = home?.querySelector('[data-tsg-friend-hint]');
  const join = home?.querySelector('[data-tsg-friend-join]');
  const checkout = cart?.querySelector('[data-tsg-confirm-demo]');
  const share = status.querySelector('[data-group-share]');
  const field = share.querySelector('input');
  const copyFeedback = status.querySelector('[data-copy-status]');
  const timeoutLabel = status.querySelector('[data-group-timer]');
  const tryLink = status.querySelector('[data-group-try]');
  const exampleLink = status.querySelector('[data-group-expired-example]');
  const error = cart?.querySelector('[data-tsg-demo-error]');

  let cartInvite = null;
  try {
    if (checkout) cartInvite = parseGroup(sessionStorage.getItem(intentKey));
  } catch {
    // Reading the native cart does not require browser storage.
  }

  function updateGroup() {
    const participantInvite = invite || cartInvite;
    const group = participantInvite || receipt || result || (home && !sampleExpired ? recentGroup : null);
    const receipts = group ? readReceipts(group) : new Map();
    const count = Math.min(groupSize, 1 + receipts.size);
    const completed = count === groupSize;
    const expired = sampleExpired || (group && Date.now() >= group.expires && !completed);
    const participant = group ? participantId(group) : null;
    const alreadyJoined = Boolean(participant && (participant === group.id || receipts.has(participant)));
    status.hidden = !group && !sampleExpired;
    if (hint) hint.hidden = !status.hidden;
    if (join && inviteParameter && !invite) {
      join.textContent = status.dataset.unavailable;
      if (join.tagName === 'BUTTON') join.disabled = true;
      else join.setAttribute('aria-disabled', 'true');
    }
    if (status.hidden) return;

    const state = sampleExpired || expired ? 'expired' : completed ? 'formed' :
      participantInvite && !alreadyJoined ? 'invited' : participant && participant !== group.id ? 'joined' : 'started';
    for (const copy of status.querySelectorAll('[data-group-copy]')) {
      copy.hidden = copy.dataset.groupCopy !== state;
    }
    status.querySelector('[data-group-progress]').textContent = status.dataset.progressTemplate
      .replace('{count}', String(sampleExpired ? 1 : count)).replace('{target}', String(groupSize));

    timeoutLabel.hidden = state === 'formed' || state === 'expired';
    if (!timeoutLabel.hidden) {
      const seconds = Math.max(0, Math.ceil((group.expires - Date.now()) / 1000));
      const time = [Math.floor(seconds / 60), seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
      timeoutLabel.querySelector('time').textContent = time;
    }

    share.hidden = state === 'invited' || state === 'expired';
    if (!share.hidden) {
      const isResult = state !== 'started';
      const url = groupUrl(isResult ? 'demo_result' : 'demo_invite', group.token, receipts);
      if (field.value !== url) {
        field.value = url;
        copyFeedback.hidden = true;
      }
      const message = isResult ? status.querySelector('[data-group-copy="' + state + '"] strong').textContent : status.dataset.inviteMessage;
      status.querySelector('[data-group-invite-label]').hidden = isResult;
      status.querySelector('[data-group-result-label]').hidden = !isResult;
      tryLink.hidden = isResult;
      tryLink.href = url;
      status.querySelector('[data-group-line]').href = 'https://social-plugins.line.me/lineit/share?' +
        new URLSearchParams({ url, text: message });
      status.querySelector('[data-group-whatsapp]').href = 'https://wa.me/?' +
        new URLSearchParams({ text: message + ' ' + url });
    }

    exampleLink.hidden = state !== 'started';
    if (!exampleLink.hidden) exampleLink.href = groupUrl('demo_example', 'expired');
    if (cart && receipt) {
      const emptyCart = cart.querySelector('[data-tsg-empty-cart]');
      if (emptyCart) emptyCart.hidden = true;
    }
    if (join && invite) {
      const open = state === 'invited';
      join.textContent = open ? status.dataset.joinLabel : alreadyJoined ? status.dataset.alreadyJoined : status.dataset.unavailable;
      if (join.tagName === 'BUTTON') join.disabled = !open;
      else join.setAttribute('aria-disabled', String(!open));
    }
    if (checkout && cartInvite && (state !== 'invited')) checkout.disabled = true;
  }

  status.querySelector('[data-copy-link]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(field.value);
      copyFeedback.hidden = false;
    } catch {
      field.focus();
      field.select();
    }
  });

  if (join) {
    join.addEventListener('click', event => {
      if (inviteParameter && (!invite || participantId(invite) || readReceipts(invite).size >= groupSize - 1 || Date.now() >= invite.expires)) {
        event.preventDefault();
        return;
      }
      try {
        if (invite) sessionStorage.setItem(intentKey, invite.token);
        else sessionStorage.removeItem(intentKey);
      } catch {
        if (invite) event.preventDefault();
      }
    });
  }

  const newItem = document.querySelector('[data-tsg-new-demo-item]');
  if (newItem && typeof crypto.randomUUID === 'function') {
    newItem.form.addEventListener('submit', () => {
      newItem.value = crypto.randomUUID();
      newItem.disabled = false;
    });
  }

  if (checkout && typeof crypto.randomUUID === 'function') {
    const lineId = idPattern.test(checkout.dataset.demoId) ? checkout.dataset.demoId : crypto.randomUUID();
    const receiptKey = prefix + 'receipt:' + lineId;
    checkout.hidden = false;
    checkout.addEventListener('click', async () => {
      checkout.disabled = true;
      error.hidden = true;
      const label = checkout.textContent;
      checkout.textContent = checkout.dataset.processing;

      async function completePurchase() {
        const existing = parseGroup(localStorage.getItem(receiptKey));
        if (existing) return existing;

        const now = Date.now();
        if (cartInvite && (participantId(cartInvite) || readReceipts(cartInvite).size >= groupSize - 1 || now >= cartInvite.expires)) {
          throw new Error('Invitation closed');
        }
        const group = cartInvite || parseGroup('v2.' + crypto.randomUUID() + '.' + (now + duration));
        const response = await fetch(cart.dataset.cartChangeUrl + '.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: checkout.dataset.lineKey, quantity: 0 })
        });
        if (!response.ok || (await response.json()).items.some(item => item.key === checkout.dataset.lineKey)) {
          throw new Error('The Shopify cart changed');
        }
        if (cartInvite) mergeReceipts(group, [[lineId, now]]);
        sessionStorage.setItem(prefix + 'participant:' + group.token, cartInvite ? lineId : group.id);
        localStorage.setItem(receiptKey, group.token);
        localStorage.setItem(recentKey, group.token);
        sessionStorage.removeItem(intentKey);
        return group;
      }

      try {
        const group = navigator.locks
          ? await navigator.locks.request('tsukino-demo-cart', completePurchase)
          : await completePurchase();
        const nextPage = new URL(cart.dataset.cartUrl, location.origin);
        nextPage.searchParams.set('demo_group', group.token);
        location.replace(nextPage);
      } catch {
        error.hidden = false;
        checkout.disabled = false;
        checkout.textContent = label;
        updateGroup();
      }
    });
  }

  updateGroup();
  window.addEventListener('pageshow', updateGroup);
  window.addEventListener('storage', event => {
    if (event.key === recentKey) recentGroup = parseGroup(readStored(recentKey));
    if (event.key === null || event.key.startsWith(prefix)) updateGroup();
  });
  window.setInterval(() => {
    if (!timeoutLabel.hidden && !status.hidden) updateGroup();
  }, 1000);
})();
