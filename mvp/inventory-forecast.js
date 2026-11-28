(() => {
  'use strict';

  const asOf = '2026-11-28';
  const horizon = 30;
  const replenishmentWindow = 7;
  const items = [
    {
      sku: 'TSU-MATCHA-30', name: 'Uji Matcha · 30 g', location: 'Taipei receiving hub',
      onHand: 108, reserved: 28, safety: 24, leadDays: 11, casePack: 12,
      history: [8, 9, 10, 10, 9, 11, 9, 10, 11, 12, 11, 13, 10, 12],
      receipts: [{ reference: 'PO-2408', day: 11, units: 144, status: 'In transit' }], commitments: []
    },
    {
      sku: 'TSU-SENCHA-80', name: 'Uji Sencha · 80 g', location: 'Kansai warehouse',
      onHand: 310, reserved: 56, safety: 36, leadDays: 6, casePack: 12,
      history: [10, 12, 11, 10, 14, 13, 10, 13, 14, 12, 15, 11, 13, 13],
      receipts: [{ reference: 'PO-2412', day: 12, units: 144, status: 'Confirmed' }], commitments: []
    },
    {
      sku: 'TSU-HOJICHA-60', name: 'Uji Hojicha · 60 g', location: 'Taipei receiving hub',
      onHand: 296, reserved: 28, safety: 25, leadDays: 8, casePack: 12,
      history: [6, 6, 5, 7, 5, 6, 6, 6, 7, 7, 6, 8, 7, 7],
      receipts: [], commitments: []
    },
    {
      sku: 'TSU-TASTING-3', name: 'Uji Tea Tasting Set', location: 'Kansai warehouse',
      onHand: 142, reserved: 32, safety: 24, leadDays: 7, casePack: 12,
      history: [3, 4, 3, 4, 3, 5, 4, 4, 5, 4, 5, 4, 5, 5],
      receipts: [{ reference: 'PO-2410', day: 6, units: 96, status: 'Confirmed' }],
      commitments: [{ reference: 'Taipei group-buy allocation', day: 7, units: 72 }]
    }
  ];
  const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const epoch = Date.parse(asOf + 'T00:00:00Z');
  const dateLabel = day => dateFormat.format(epoch + day * 86400000);
  const average = values => values.reduce((total, value) => total + value, 0) / values.length;
  const unitsOn = (records, day) => records.reduce((sum, record) => sum + (record.day === day ? record.units : 0), 0);

  function demandEstimate(history) {
    const olderRate = average(history.slice(0, 7));
    const recentRate = average(history.slice(-7));
    return { olderRate, recentRate, baseline: olderRate * 0.35 + recentRate * 0.65 };
  }

  function forecast(item, { uplift = 0, receiptDelay = 0, leadDays = item.leadDays } = {}) {
    const { olderRate, recentRate, baseline } = demandEstimate(item.history);
    const dailyDemand = baseline * (1 + uplift / 100);
    const receipts = item.receipts.map(receipt => ({ ...receipt, day: receipt.day + receiptDelay }));
    const opening = item.onHand - item.reserved;
    const projected = [{ day: 0, available: opening, inbound: 0, demand: 0, committed: 0 }];
    let available = opening;
    for (let day = 1; day <= horizon + replenishmentWindow - 1; day++) {
      const inbound = unitsOn(receipts, day);
      const demand = Math.round(day * dailyDemand) - Math.round((day - 1) * dailyDemand);
      const committed = unitsOn(item.commitments, day);
      available += inbound - demand - committed;
      projected.push({ day, available, inbound, demand, committed });
    }

    const points = projected.slice(0, horizon + 1);
    const buffer = points.find(point => point.available < item.safety);
    const stockout = points.find(point => point.available <= 0);
    let replenishment = null;
    if (buffer) {
      const orderDay = Math.max(0, buffer.day - leadDays);
      const arrivalDay = orderDay + leadDays;
      const coverage = projected.slice(arrivalDay, arrivalDay + replenishmentWindow);
      const lowest = Math.min(...coverage.map(point => point.available));
      const quantity = Math.max(0, Math.ceil((item.safety - lowest) / item.casePack) * item.casePack);
      const beforeArrival = projected.slice(0, arrivalDay);
      const openingShortfall = Math.max(0, -Math.min(...beforeArrival.map(point => point.available)));
      replenishment = { orderDay, arrivalDay, quantity, openingShortfall };
    }

    return { item, opening, dailyDemand, olderRate, recentRate, receipts, points, buffer, stockout, leadDays, replenishment };
  }

  globalThis.InventoryForecast = { asOf, horizon, replenishmentWindow, items, dateLabel, demandEstimate, forecast };
})();
