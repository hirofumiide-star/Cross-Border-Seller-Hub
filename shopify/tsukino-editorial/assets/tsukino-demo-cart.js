(() => {
  'use strict';

  const orderPrefix = 'tsukino-uji-2026-12-demo:v1:';
  const orderIdPattern = /^[a-f0-9-]{36}$/;

  function recordedSets() {
    let count = 0;
    const storage = window.localStorage;
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith(orderPrefix)) continue;
      const quantity = Number(storage.getItem(key));
      if (Number.isSafeInteger(quantity) && quantity > 0) count += quantity;
    }
    return count;
  }

  function refreshProgress() {
    const progress = document.querySelector('[data-tsg-demo-progress]');
    if (!progress) return;

    let extraSets;
    try {
      extraSets = recordedSets();
    } catch {
      return;
    }

    const registered = Number(progress.dataset.registered) + extraSets;
    const target = Number(progress.dataset.target);
    const remaining = Math.max(target - registered, 0);
    const label = progress.dataset.progressLabel
      .replace('{registered}', String(registered))
      .replace('{target}', String(target));
    progress.querySelector('[data-tsg-progress-count]').textContent = label;
    progress.querySelector('[data-tsg-progress-remaining]').textContent = remaining > 0
      ? progress.dataset.remainingLabel.replace('{remaining}', String(remaining))
      : progress.dataset.goalMet;
    progress.querySelector('progress').value = Math.min(registered, target);
  }

  const newItem = document.querySelector('[data-tsg-new-demo-item]');
  if (newItem && typeof window.crypto.randomUUID === 'function') {
    newItem.form.addEventListener('submit', () => {
      newItem.value = window.crypto.randomUUID();
      newItem.disabled = false;
    });
  }

  refreshProgress();
  window.addEventListener('pageshow', refreshProgress);
  window.addEventListener('storage', event => {
    if (event.key === null || event.key.startsWith(orderPrefix)) refreshProgress();
  });

  const cart = document.querySelector('[data-tsg-demo-cart]');
  if (!cart) return;
  const success = cart.querySelector('[data-tsg-order-success]');
  const error = cart.querySelector('[data-tsg-demo-error]');
  const button = cart.querySelector('[data-tsg-confirm-demo]');
  const completedId = new URLSearchParams(window.location.search).get('demo_purchase');
  try {
    if (completedId && orderIdPattern.test(completedId) && window.localStorage.getItem(orderPrefix + completedId)) {
      success.hidden = false;
      const emptyCart = cart.querySelector('[data-tsg-empty-cart]');
      if (emptyCart) emptyCart.hidden = true;
    }
  } catch {
    // The native Shopify cart remains readable if browser storage is unavailable.
  }

  if (!button || typeof window.crypto.randomUUID !== 'function') return;
  const orderId = orderIdPattern.test(button.dataset.demoId) ? button.dataset.demoId : window.crypto.randomUUID();
  const orderKey = orderPrefix + orderId;
  button.hidden = false;

  button.addEventListener('click', async () => {
    button.disabled = true;
    error.hidden = true;
    const label = button.textContent;
    button.textContent = button.dataset.processing;

    async function completePurchase() {
      const storage = window.localStorage;
      if (storage.getItem(orderKey)) return;
      const quantity = Number(button.dataset.quantity);
      if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Invalid quantity');
      const response = await fetch(cart.dataset.cartChangeUrl + '.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: button.dataset.lineKey, quantity: 0 })
      });
      if (!response.ok) throw new Error('The Shopify cart changed');
      const updatedCart = await response.json();
      if (updatedCart.items.some(item => item.key === button.dataset.lineKey)) {
        throw new Error('The Shopify cart line was not removed');
      }
      storage.setItem(orderKey, String(quantity));
    }

    try {
      if (navigator.locks) await navigator.locks.request('tsukino-demo-cart', completePurchase);
      else await completePurchase();
      const nextPage = new URL(cart.dataset.cartUrl, window.location.origin);
      nextPage.searchParams.set('demo_purchase', orderId);
      window.location.replace(nextPage);
    } catch {
      error.hidden = false;
      button.disabled = false;
      button.textContent = label;
    }
  });
})();
