(() => {
  'use strict';

  const DAY = 86400000;
  const asOf = Date.parse('2026-11-25T00:00:00Z');
  const dateAt = daysAgo => new Date(asOf - daysAgo * DAY).toISOString().slice(0, 10);
  const markets = {
    TW: { name: 'Taiwan', freight: 62, weight: 52 },
    HK: { name: 'Hong Kong', freight: 92, weight: 19 },
    SG: { name: 'Singapore', freight: 118, weight: 15 },
    JP: { name: 'Japan', freight: 42, weight: 14 }
  };
  const channels = {
    DIRECT: 'Online store', GROUP: 'Taiwan group buy', SOCIAL: 'Social referral', SEARCH: 'Search', AI: 'AI search referral'
  };
  const categories = {
    sencha: { name: 'Sencha', size: '80 g', base: 420, cost: 156, description: 'Everyday green tea with a fresh aroma and a clean, sweet finish.' },
    matcha: { name: 'Matcha', size: '30 g', base: 590, cost: 246, description: 'Finely ground green tea for whisking or making matcha lattes.' },
    hojicha: { name: 'Hojicha', size: '60 g', base: 360, cost: 128, description: 'Roasted tea leaves with a toasty aroma and a light finish.' },
    bundle: { name: 'Tea tasting set', size: '3 varieties', base: 790, cost: 328, description: 'Small packs of sencha, matcha, and hojicha to taste side by side.' }
  };
  const regionGroups = [
    ['Uji, Kyoto', ['Uji Tsukino Tea House', 'Yamashizuku Tea Shop', 'Uji Yuzuha Tea Garden']],
    ['Yame, Fukuoka', ['Yame Aomine Tea', 'Hakuro Tea House', 'Yame Nonoha Tea']],
    ['Shizuoka', ['Kiriniwa Tea', 'Shizuoka Asatsuyu Tea House', 'Makino Oka Tea Shop']],
    ['Kagoshima', ['Minamikaze Tea Garden', 'Satsuma Midorikura Tea', 'Satsuma Hareha Tea House']],
    ['Sayama, Saitama', ['Sayama Haoto Tea Garden', 'Iruma Mugino Tea House', 'Sayama Tsukioka Tea Shop']],
    ['Ise, Mie', ['Ise Yoiha Tea Shop', 'Kiyono Tea House', 'Ise Asamori Tea']],
    ['Ureshino, Saga', ['Ureshino Kazemachi Tea Shop', 'Ureshino Ameka Tea', 'Ureshino Kasuminiwa Tea']],
    ['Higashisonogi, Nagasaki', ['Sonogi Kaiun Tea House', 'Nagasaki Nowatari Tea Shop', 'Namima Tea Garden']],
    ['Miyazaki', ['Hyuga Tsuyumori Tea House', 'Miyazaki Kozue Tea', 'Hyuga Kazetani Tea Shop']],
    ['Shimane', ['Izumo Haori Tea', 'Iwami Mizuniwa Tea', 'Izumo Kawaoto Tea House']],
    ['Nara', ['Tsukigase Hoshitani Tea House', 'Yamato Hazuki Tea', 'Nara Aoniwa Tea Shop']],
    ['Kumamoto', ['Higo Kumono Tea Shop', 'Kumamoto Hakage Tea House', 'Aso Shinryoku Tea Garden']]
  ];
  const themes = {
    brewing: { name: 'Brewing instructions in Traditional Chinese', action: 'Include a brewing card in Traditional Chinese', zh: '想知道冷泡的比例和時間，希望有繁體中文說明。', en: 'I would like cold-brew ratios and steeping times, with instructions in Traditional Chinese.', metric: 'Brewing inquiries per delivered order' },
    gift: { name: 'Gift packaging', action: 'Offer gift packaging as an option', zh: '茶很適合送禮，如果能選禮盒包裝會更好。', en: 'This tea would make a good gift. I wish there were a gift-box option.', metric: 'Gift-packaging selection rate and profit after packaging costs' },
    freight: { name: 'Shipping cost and delivery time', action: 'Show the delivered price and estimated arrival on product pages', zh: '結帳前想先知道運費和大約幾天會到。', en: 'Before checkout, I want to know the shipping cost and when the order might arrive.', metric: 'Shipping inquiry rate and profit per order' },
    flavor: { name: 'Aroma and flavor', action: 'Add an aroma and flavor comparison to product pages', zh: '焙茶香氣很明顯，想看看不同茶的風味比較。', en: 'The hojicha has a distinct aroma. I would like to compare the flavors of different teas.', metric: 'Product page-to-purchase conversion' },
    value: { name: 'Price and pack size', action: 'Test a smaller pack under the same promotional conditions', zh: '想先買小份試喝，再決定要不要買大包裝。', en: 'I would like to try a small pack before deciding whether to buy a larger one.', metric: 'Small-pack purchase rate and profit per set' }
  };
  const statusLabels = { paid: 'Paid', delivered: 'Delivered', refunded: 'Refunded', cancelled: 'Canceled' };

  function makeRandom(seed) {
    return () => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function pickMarket(random) {
    let point = random() * 100;
    return Object.keys(markets).find(code => (point -= markets[code].weight) < 0);
  }

  const stores = regionGroups.flatMap(([region, names], groupIndex) => names.map((name, position) => {
    const number = groupIndex * 3 + position + 1;
    const id = 'tea-' + String(number).padStart(2, '0');
    const variation = (number % 7 - 3) * 10;
    const productTypes = number % 4 === 0 ? ['sencha', 'hojicha', 'bundle'] : Object.keys(categories);
    return {
      id, number, name, region,
      products: productTypes.map(type => ({
        id: id + '-' + type, type,
        name: categories[type].name, size: categories[type].size,
        description: categories[type].description,
        price: categories[type].base + variation, cost: categories[type].cost + Math.floor(variation / 3)
      }))
    };
  }));

  function createExports(store) {
    const random = makeRandom(701 + store.number * 697);
    const orders = [], shipments = [], reviews = [];
    const count = 170 + (store.number * 9) % 94;
    const themeKeys = ['brewing', 'flavor', 'brewing', 'gift', 'freight', 'brewing', 'value', 'flavor', 'gift'];

    for (let i = 0; i < count; i++) {
      const daysAgo = Math.floor(random() * 90);
      const date = dateAt(daysAgo);
      const market = pickMarket(random);
      const roll = random();
      const status = roll < 0.04 ? 'refunded' : roll < 0.065 ? 'cancelled' : daysAgo < 3 ? 'paid' : 'delivered';
      const channelRoll = random();
      const channel = market === 'TW' && channelRoll < .35 ? 'GROUP'
        : channelRoll < .51 ? 'DIRECT' : channelRoll < .72 ? 'SOCIAL' : channelRoll < .96 ? 'SEARCH' : 'AI';
      const first = store.products[Math.floor(random() * store.products.length)];
      const lines = [{ productId: first.id, type: first.type, quantity: random() < .24 ? 2 : 1, unitPrice: first.price, unitCost: first.cost }];
      if (random() < .37) {
        const others = store.products.filter(product => product.id !== first.id);
        const second = others[Math.floor(random() * others.length)];
        lines.push({ productId: second.id, type: second.type, quantity: 1, unitPrice: second.price, unitCost: second.cost });
      }
      const id = store.id + '-o' + String(i + 1).padStart(3, '0');
      orders.push({ id, storeId: store.id, date, market, channel, status, lines });
      if (status === 'delivered' || status === 'refunded') {
        const items = lines.reduce((sum, line) => sum + line.quantity, 0);
        shipments.push({ orderId: id, freight: markets[market].freight + items * 13 + Math.floor(random() * 35) });
      }
      if (status === 'delivered' && random() < .27) {
        const topic = themeKeys[Math.floor(random() * themeKeys.length)];
        reviews.push({ orderId: id, topic });
      }
    }
    return { storeId: store.id, orders, shipments, reviews };
  }

  const exports = stores.map(createExports);

  function summarize(sources, filters) {
    const included = stores.filter(store => filters.store === 'all' || filters.store === store.id);
    const allowed = new Set(included.map(store => store.id));
    const start = dateAt(filters.days - 1);
    const end = dateAt(0);
    const records = [];
    const storeStats = new Map(included.map(store => [store.id, { store, sales: 0, count: 0 }]));
    const marketStats = Object.fromEntries(Object.keys(markets).map(code => [code, { sales: 0 }]));
    const daily = new Map(Array.from({ length: filters.days }, (_, i) => [dateAt(filters.days - i - 1), 0]));
    const reviewCounts = Object.fromEntries(Object.keys(themes).map(topic => [topic, 0]));
    const pairs = new Map();
    const channelStats = Object.fromEntries(Object.keys(channels).map(code => [code, { count: 0 }]));
    let sales = 0, orders = 0, freight = 0, deliveredSales = 0, deliveredBalance = 0, reviews = 0, testOrders = 0, groupOrders = 0;

    for (const source of sources) {
      if (!allowed.has(source.storeId)) continue;
      const store = storeStats.get(source.storeId);
      const shipmentByOrder = new Map(source.shipments.map(item => [item.orderId, item]));
      const reviewByOrder = new Map(source.reviews.map(item => [item.orderId, item]));
      for (const order of source.orders) {
        if (order.date < start || order.date > end || (filters.market !== 'all' && order.market !== filters.market)) continue;
        const sourceShipment = shipmentByOrder.get(order.id);
        const sourceReview = reviewByOrder.get(order.id);
        const value = order.lines.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
        const cost = order.lines.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
        records.push({ order, value, cost, shipment: sourceShipment, review: sourceReview });
        if (order.status !== 'paid' && order.status !== 'delivered') continue;
        sales += value;
        orders++;
        if (order.test) testOrders++;
        if (order.channel === 'GROUP') groupOrders++;
        daily.set(order.date, daily.get(order.date) + value);
        store.sales += value;
        store.count++;
        marketStats[order.market].sales += value;
        channelStats[order.channel].count++;
        if (order.status === 'delivered') {
          if (sourceShipment) {
            freight += sourceShipment.freight;
            deliveredSales += value;
            deliveredBalance += value - cost - sourceShipment.freight;
          }
        }
        if (sourceReview && order.status === 'delivered') {
          reviews++;
          reviewCounts[sourceReview.topic]++;
        }
        const types = [...new Set(order.lines.map(item => item.type))].sort();
        for (let i = 0; i < types.length; i++) {
          for (let j = i + 1; j < types.length; j++) {
            const key = [types[i], types[j]].join('|');
            pairs.set(key, (pairs.get(key) || 0) + 1);
          }
        }
      }
    }

    const storeList = [...storeStats.values()].sort((a, b) => b.sales - a.sales || a.store.number - b.store.number);
    const themeList = Object.entries(reviewCounts).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
    const pairList = [...pairs].map(([key, count]) => {
      const types = key.split('|');
      const eligible = records.filter(({ order }) => {
        if (order.status !== 'delivered' && order.status !== 'paid') return false;
        const catalog = storeStats.get(order.storeId).store.products;
        return types.every(type => catalog.some(product => product.type === type));
      }).length;
      return { key, types, count, eligible };
    }).sort((a, b) => b.count - a.count);
    records.sort((a, b) => b.order.date.localeCompare(a.order.date) || Number(Boolean(b.order.test)) - Number(Boolean(a.order.test)) || b.order.id.localeCompare(a.order.id));

    return {
      start, end, storeList, marketStats, daily, themeList, pairList, channelStats, records,
      sales, orders, freight, deliveredSales, deliveredBalance, reviews, testOrders, groupOrders,
      freightRate: deliveredSales ? freight / deliveredSales : null
    };
  }

  globalThis.TeaMarket = { stores, markets, channels, categories, themes, statusLabels, exports, dateAt, summarize };
})();
