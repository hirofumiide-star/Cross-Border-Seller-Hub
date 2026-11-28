(() => {
  'use strict';

  function filters(root) {
    const buttons = [...root.querySelectorAll('[data-tea-filter]')];
    const cards = [...root.querySelectorAll('[data-tea-uses]')];
    if (!buttons.length || !cards.length) return;
    root.querySelector('[data-tea-filters]').hidden = false;
    for (const button of buttons) {
      button.addEventListener('click', () => {
        const filter = button.dataset.teaFilter;
        for (const card of cards) {
          card.hidden = filter !== 'all' && !card.dataset.teaUses.split(' ').includes(filter);
        }
        for (const control of buttons) control.setAttribute('aria-pressed', String(control === button));
        const count = cards.filter(card => !card.hidden).length;
        root.querySelector('[data-tea-filter-status]').textContent = root.dataset.resultLabel.replace('{count}', String(count));
      });
    }
  }

  function purchase(root) {
    const radios = [...root.querySelectorAll('[data-purchase-mode]')];
    const plans = root.querySelector('[data-selling-plan]');
    const delivery = root.querySelector('[data-delivery-options]');
    const price = root.querySelector('[data-purchase-price]');
    const cupInput = root.querySelector('[data-cups]');
    const cadence = root.querySelector('[data-cadence-estimate]');

    function updatePurchase() {
      const chosen = radios.find(input => input.checked);
      const subscribed = chosen?.value === 'subscription';
      plans.disabled = !subscribed;
      delivery.hidden = !subscribed;
      price.textContent = subscribed ? plans.selectedOptions[0]?.dataset.price ?? '' : root.dataset.singlePrice;
    }

    function updateCadence() {
      if (!cupInput || !cadence) return;
      const grams = Number(root.dataset.grams);
      const perCup = Number(root.dataset.perCup);
      const cups = Number(cupInput.value);
      cadence.textContent = grams > 0 && perCup > 0 && cups > 0
        ? cadence.dataset.template.replace('{days}', String(Math.max(1, Math.ceil(grams / (perCup * cups)))))
        : '';
    }

    for (const input of radios) input.addEventListener('change', updatePurchase);
    plans.addEventListener('change', updatePurchase);
    cupInput?.addEventListener('change', updateCadence);
    updatePurchase();
    updateCadence();
    root.hidden = false;
  }

  function expireCampaigns(container) {
    for (const campaign of container.querySelectorAll('[data-tsg-close-at]')) {
      const deadline = Number(campaign.dataset.tsgCloseAt) * 1000;
      if (Date.now() < deadline) continue;
      campaign.querySelector('[data-campaign-status]').textContent = campaign.dataset.closedLabel;
      for (const element of campaign.querySelectorAll('[data-campaign-open-only]')) element.hidden = true;
    }
  }

  function init(container) {
    expireCampaigns(container);
    for (const root of container.querySelectorAll('[data-tsg-filter]')) {
      if (root.hasAttribute('data-tsg-ready')) continue;
      root.setAttribute('data-tsg-ready', '');
      filters(root);
    }
    for (const root of container.querySelectorAll('[data-tsg-purchase]')) {
      if (root.hasAttribute('data-tsg-ready')) continue;
      root.setAttribute('data-tsg-ready', '');
      purchase(root);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init(document), { once: true });
  } else init(document);
  window.addEventListener('pageshow', () => expireCampaigns(document));
  document.addEventListener('shopify:section:load', event => init(event.target));
})();
