import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const context = {};
runInNewContext(readFileSync(new URL('../mvp/inventory-forecast.js', import.meta.url), 'utf8'), context);
const { items, forecast, dateLabel, replenishmentWindow } = context.InventoryForecast;

test('subtracts reservations and distinguishes buffer breach from stockout', () => {
  const plan = forecast(items[0]);
  assert.equal(plan.opening, 80);
  assert.equal(dateLabel(plan.buffer.day), 'Dec 4');
  assert.equal(dateLabel(plan.stockout.day), 'Dec 6');
  assert.equal(plan.points[10].available, -26);
  assert.equal(plan.points[11].inbound, 144);
  assert.equal(plan.replenishment.openingShortfall, 26);
  assert.equal(plan.replenishment.quantity, 0);
});

test('demand uplift and a delayed receipt expose a larger replenishment need', () => {
  const plan = forecast(items[0], { uplift: 35, receiptDelay: 4 });
  assert.equal(dateLabel(plan.stockout.day), 'Dec 4');
  assert.equal(dateLabel(plan.receipts[0].day), 'Dec 13');
  assert.equal(plan.replenishment.quantity, 156);
  assert.equal(plan.replenishment.openingShortfall, 64);

  const faster = forecast(items[0], { uplift: 35, receiptDelay: 4, leadDays: 4 });
  assert.equal(faster.stockout.day, plan.stockout.day);
  assert.equal(faster.replenishment.arrivalDay, 4);
  assert.equal(faster.replenishment.openingShortfall, 0);
});

test('nets arrivals and firm group-buy demand on their scheduled dates', () => {
  const tasting = items.find(item => item.sku === 'TSU-TASTING-3');
  const plan = forecast(tasting);
  assert.equal(plan.points[6].inbound, 96);
  assert.equal(plan.points[7].committed, 72);
  assert.equal(plan.points[7].available, plan.points[6].available - plan.points[7].demand - 72);
  assert.equal(plan.points[8].committed, 0);
  assert.equal(plan.stockout, undefined);
});

test('sizes purchase proposals in whole cases and covers the target window', () => {
  const sencha = items.find(item => item.sku === 'TSU-SENCHA-80');
  const plan = forecast(sencha);
  assert.equal(plan.buffer.day, 30);
  assert.equal(plan.replenishment.orderDay, 24);
  assert.equal(plan.replenishment.quantity, 96);
  assert.equal(plan.replenishment.quantity % sencha.casePack, 0);
  const horizonDemand = Math.round((plan.replenishment.arrivalDay + replenishmentWindow - 1) * plan.dailyDemand);
  const closing = plan.opening + plan.receipts[0].units - horizonDemand + plan.replenishment.quantity;
  assert(closing >= sencha.safety && closing < sencha.safety + sencha.casePack);
  assert.equal(forecast(items[2]).replenishment, null);
});
