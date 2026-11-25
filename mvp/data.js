(() => {
  'use strict';

  const DAY = 86400000;
  const asOf = Date.parse('2026-11-25T00:00:00Z');
  const dateAt = daysAgo => new Date(asOf - daysAgo * DAY).toISOString().slice(0, 10);
  const markets = {
    TW: { name: '台湾', freight: 62, weight: 52 },
    HK: { name: '香港', freight: 92, weight: 19 },
    SG: { name: 'シンガポール', freight: 118, weight: 15 },
    JP: { name: '日本', freight: 42, weight: 14 }
  };
  const channels = {
    DIRECT: 'オンラインショップ', GROUP: '台湾團購', SOCIAL: 'SNS紹介', SEARCH: '検索', AI: 'AI検索の参照元'
  };
  const categories = {
    sencha: { name: '煎茶', size: '80 g', base: 420, cost: 156, description: '爽やかな香りと、すっきりとした甘み。急須で楽しむ毎日のお茶です。' },
    matcha: { name: '抹茶', size: '30 g', base: 590, cost: 246, description: 'きめ細かな茶の粉末。お点前や抹茶ラテにも楽しめます。' },
    hojicha: { name: 'ほうじ茶', size: '60 g', base: 360, cost: 128, description: '茶葉を焙じた香ばしさと、軽やかな後味が特徴です。' },
    bundle: { name: 'お茶の飲み比べセット', size: '3 種', base: 790, cost: 328, description: '煎茶・抹茶・ほうじ茶の少量セット。香りと味わいの違いを楽しめます。' }
  };
  const regionGroups = [
    ['京都・宇治', ['宇治 月野茶房', '山雫茶舗', '宇治 柚葉園']],
    ['福岡・八女', ['八女 青峰製茶', '白露茶房', '八女 野の葉']],
    ['静岡', ['霧庭製茶', '静岡 朝露茶寮', '牧の丘茶舗']],
    ['鹿児島', ['南風茶園', '薩摩 緑蔵', '薩摩 晴葉茶房']],
    ['埼玉・狭山', ['狭山 葉音園', '入間 麦乃茶房', '狭山 月丘茶舗']],
    ['三重・伊勢', ['伊勢 宵葉茶舗', '清野茶寮', '伊勢 朝森製茶']],
    ['佐賀・嬉野', ['嬉野 風待ち茶舗', '嬉野 雨花製茶', '嬉野 霞庭']],
    ['長崎・東彼杵', ['彼杵 海雲茶房', '長崎 野渡茶舗', '波間茶園']],
    ['宮崎', ['日向 露森茶房', '宮崎 梢製茶', '日向 風谷茶舗']],
    ['島根', ['出雲 葉織製茶', '石見 水庭', '出雲 川音茶寮']],
    ['奈良', ['月ヶ瀬 星谷茶房', '大和 葉月製茶', '奈良 青庭茶舗']],
    ['熊本', ['肥後 雲野茶舗', '熊本 葉影茶房', '阿蘇 深緑園']]
  ];
  const themes = {
    brewing: { name: '繁体字の淹れ方', action: '繁体字の淹れ方カードを同梱する', zh: '想知道冷泡的比例和時間，希望有繁體中文說明。', ja: '水出しの割合と時間を知りたい。繁体字の説明がほしい。', metric: '配送完了件数に対する淹れ方問い合わせ率' },
    gift: { name: 'ギフト包装', action: 'ギフト包装を選べるようにする', zh: '茶很適合送禮，如果能選禮盒包裝會更好。', ja: '贈り物に向いているので、ギフト箱を選べるとうれしい。', metric: 'ギフト包装の選択率と包装費控除後の利益' },
    freight: { name: '送料・配送日数', action: '配送込みの価格と到着目安を商品ページに表示する', zh: '結帳前想先知道運費和大約幾天會到。', ja: '決済前に送料とおおよその到着日を知りたい。', metric: '送料に関する問い合わせ率と注文当たり利益' },
    flavor: { name: '香り・味の評価', action: '香りと味わいの比較を商品ページに追加する', zh: '焙茶香氣很明顯，想看看不同茶的風味比較。', ja: 'ほうじ茶の香りが強く、ほかのお茶との味の比較も見たい。', metric: '商品ページ閲覧から購入に進んだ割合' },
    value: { name: '価格・内容量', action: '同じ販促条件で少量サイズの選択肢を試す', zh: '想先買小份試喝，再決定要不要買大包裝。', ja: 'まず少量で試してから大きなサイズを買いたい。', metric: '少量サイズの購入率とセット当たり利益' }
  };
  const statusLabels = { paid: '入金済み', delivered: '配送完了', refunded: '返金済み', cancelled: 'キャンセル' };

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
