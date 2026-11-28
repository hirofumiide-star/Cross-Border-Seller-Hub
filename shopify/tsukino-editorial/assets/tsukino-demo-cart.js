(() => {
  'use strict';

  const duration = 10 * 60 * 1000;
  const prefix = 'tsukino-friend-group:v1:';
  const intentKey = prefix + 'incoming';
  const recentKey = prefix + 'recent';
  const idPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
  const params = new URLSearchParams(location.search);
  const home = document.querySelector('[data-tsg-friend-home]');
  const cart = document.querySelector('[data-tsg-demo-cart]');
  const status = (home ?? cart)?.querySelector('[data-tsg-friend-status]');
  if (!status) return;

  function parseGroup(token) {
    const [id, time, extra] = (token || '').split('.');
    if (extra !== undefined || !idPattern.test(id) || !/^\d{13}$/.test(time)) return null;
    const expires = Number(time);
    if (expires > Date.now() + duration + 60 * 1000) return null;
    return { token, expires };
  }

  function readStored(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function completedAt(group) {
    const value = Number(readStored(prefix + 'group:' + group.token));
    return value > group.expires - duration && value < group.expires ? value : 0;
  }

  function groupUrl(key, value) {
    const url = new URL(cart?.dataset.shopRoot || location.pathname, location.origin);
    url.searchParams.set(key, value);
    return url.href;
  }

  function recordResult() {
    const [token, time, extra] = (params.get('demo_result') || '').split('~');
    const group = parseGroup(token);
    const timestamp = Number(time);
    if (extra !== undefined || !group || !Number.isSafeInteger(timestamp) || timestamp > Date.now() ||
        timestamp <= group.expires - duration || timestamp >= group.expires) return null;
    try {
      localStorage.setItem(prefix + 'group:' + group.token, String(timestamp));
      recentGroup = group;
    } catch {
      return null;
    }
    return group;
  }

  let recentGroup = parseGroup(readStored(recentKey));
  const invite = parseGroup(params.get('demo_invite'));
  const receipt = parseGroup(params.get('demo_group'));
  const sampleExpired = params.get('demo_example') === 'expired';
  const result = recordResult();
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
    const completed = group ? completedAt(group) : 0;
    const expired = sampleExpired || (group && Date.now() >= group.expires && !completed);
    status.hidden = !group && !sampleExpired;
    if (hint) hint.hidden = !status.hidden;
    if (status.hidden) return;

    const state = completed ? 'formed' : expired ? 'expired' : participantInvite ? 'invited' : 'started';
    for (const copy of status.querySelectorAll('[data-group-copy]')) {
      copy.hidden = copy.dataset.groupCopy !== state;
    }
    const count = state === 'formed' ? 2 : 1;
    status.querySelector('[data-group-progress]').textContent = status.dataset.progressTemplate.replace('{count}', String(count));

    timeoutLabel.hidden = state !== 'started' && state !== 'invited';
    if (!timeoutLabel.hidden) {
      const seconds = Math.max(0, Math.ceil((group.expires - Date.now()) / 1000));
      const time = [Math.floor(seconds / 60), seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
      timeoutLabel.querySelector('time').textContent = time;
    }

    share.hidden = state !== 'started' && state !== 'formed';
    if (!share.hidden) {
      const isResult = state === 'formed';
      const url = isResult ? groupUrl('demo_result', group.token + '~' + completed) : groupUrl('demo_invite', group.token);
      if (field.value !== url) {
        field.value = url;
        copyFeedback.hidden = true;
      }
      const message = isResult ? status.querySelector('[data-group-copy="formed"] strong').textContent : status.dataset.inviteMessage;
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
      join.textContent = open ? status.dataset.joinLabel : status.dataset.unavailable;
      if (join.tagName === 'BUTTON') join.disabled = !open;
      else join.setAttribute('aria-disabled', String(!open));
    }
    if (checkout && cartInvite && (state === 'formed' || state === 'expired')) checkout.disabled = true;
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
      if (invite && (completedAt(invite) || Date.now() >= invite.expires)) {
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
        if (cartInvite && (completedAt(cartInvite) || now >= cartInvite.expires)) {
          throw new Error('Invitation closed');
        }
        const group = cartInvite || parseGroup(crypto.randomUUID() + '.' + (now + duration));
        const response = await fetch(cart.dataset.cartChangeUrl + '.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: checkout.dataset.lineKey, quantity: 0 })
        });
        if (!response.ok || (await response.json()).items.some(item => item.key === checkout.dataset.lineKey)) {
          throw new Error('The Shopify cart changed');
        }
        if (cartInvite) localStorage.setItem(prefix + 'group:' + group.token, String(now));
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
