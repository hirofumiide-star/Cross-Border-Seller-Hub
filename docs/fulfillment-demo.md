# ShopifyとOPENLOGIの物流連携を検証する

この手順は、開発ストアのテスト注文1件をOPENLOGIのデモ環境に渡し、その時点の出荷依頼情報をMVPで確認するためのものです。台湾團購の国際一括輸送・現地個別配送は[役割分担](operating-model.md)に沿って別途検証します。

## 現在の到達点

2026年11月26日に確認した状態です。

| 対象 | 確認できていること | 残っていること |
| --- | --- | --- |
| Shopify開発ストア | [宇治 月野茶房](https://uji-tsukino-sabo-demo.myshopify.com/)を作成。4商品、繁体字中国語（台湾）と日本語、JPY、テスト決済を設定 | Admin API用アプリの認証・読み取り接続。SEO専用欄の翻訳は未適用 |
| テスト注文 | [#1001](https://admin.shopify.com/store/uji-tsukino-sabo-demo/orders/19055954755837)で煎茶1点、商品1,980円＋顧客送料870円のテスト決済を確認 | この注文をAPIから読み、デモ物流へ渡す実行 |
| OPENLOGI | API v1.6のデモ接続先・商品・出荷依頼の仕様を確認 | デモアカウント、APIトークン、必要な商品登録、接続検証 |
| 実装 | 下記CLIと「物流連携」画面で、架空データによる処理とAPI結果の読み込みを検証する | 実際のAPI成功を示すレポートは未取得 |

この作業環境にはShopify／OPENLOGIのAPI認証情報が設定されていません。Shopify管理画面へのブラウザアクセスは確認できました。OPENLOGIのデモToken管理画面は、2026年11月26日の確認で「ただいま、メンテナンス中です」と表示し、HTTP 503を返したため、デモ登録・トークン発行・実API接続は未実施です。

ローカル検証は `node --test tests/*.test.mjs` の27件が成功しました。注文からレポート表示までの架空データ、SKU照合、受注内容の変更、通信結果が不明な場合の重複防止、資格情報・顧客情報を結果へ含めないことを確認しています。この結果は実APIの接続成功を意味しません。

### ストア表示の繁体字中国語化

2026年11月26日（JST）、Shopify Translate & Adaptで繁体字中国語（台湾、`zh-TW`）を適用し、公開・実画面の確認を完了しました。ドメインの既定言語は`zh-TW`、ストアのprimary localeは`ja`のままです。日本語の元コンテンツを保持し、[繁体字中国語のストア](https://uji-tsukino-sabo-demo.myshopify.com/)と[日本語のストア](https://uji-tsukino-sabo-demo.myshopify.com/ja)を切り替えられます。

4商品のタイトル・説明・商品タイプ、メインメニュー3リンク、Home pageコレクション名「精選茶品」、Contactページ名「聯絡我們」、ヒーロー・サブ見出し・CTA・注目コレクションの説明・告知文を保存しました。ヒーロー見出しの最終文言は「宇治茶香，點綴日常。」、スライドショーのアクセシビリティ文言は「宇治月野茶房品牌介紹」です。

実画面では4商品名、煎茶の詳細、カート、チェックアウト、お問い合わせフォーム、Shopifyの自動プライバシーポリシー、日本語と繁体字の切替を確認しました。チェックアウトで注文の入力・送信は行っていません。翻訳の記録は[storefront-zh-TW.json](../config/storefront-zh-TW.json)にあります。SEO専用欄の説明文は準備済み・未適用です。デモのパスワード保護、JPY価格、日本国内配送は維持しています。

## 1. まず外部接続なしで一連の処理を試す

Node.js 22以降でリポジトリのルートから実行します。

```sh
node scripts/run-fulfillment-demo.mjs --mode fixture --output .runtime/fulfillment-report.json
```

`fixture`は架空の注文・物流応答を使います。APIへの接続はしません。サンプルの追跡番号や出荷済み表示は実際の配送実績ではありません。

[`mvp/index.html`](../mvp/index.html)を開いて「物流連携」を選び、生成されたJSONを読み込みます。画面内のサンプルボタンでも確認できます。36店舗の販売分析の数値には混ぜません。

## 2. 認証を準備する

```sh
cp .env.example .env
chmod 600 .env
```

`.env`をローカルで編集します。認証情報をGitHubやチャットへ貼り付ける必要はありません。

| 環境変数 | 設定する内容 |
| --- | --- |
| `SHOPIFY_DEV_STORE` | `uji-tsukino-sabo-demo.myshopify.com` |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | 対象開発ストアにインストール済みのアプリの管理APIトークン |
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` | 管理APIトークンの代わりに同一組織のアプリのクライアント認証を使う場合 |
| `OPENLOGI_DEMO_ACCOUNT` | OPENLOGIデモ環境のアカウントコード |
| `OPENLOGI_DEMO_TOKEN` | 同じデモアカウントで発行したAPIトークン |

Shopifyアプリの読み取りスコープは `read_orders`、`read_merchant_managed_fulfillment_orders`、`read_locations`。対象は開発ストアの支払い済み・未キャンセルのテスト注文です。OPENLOGIは[デモToken管理画面](https://app-demo.openlogi.com/portal/tokens)で権限を持つ親ユーザーから発行します。アカウントが未提供の場合は提供元による準備が必要です。

参考: [Shopify同一組織アプリの認証](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant) · [Shopify FulfillmentOrder](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/FulfillmentOrder) · [OPENLOGI API](https://api.openlogi.com/doc/api.html)

## 3. 商品を照合し、出荷予定を確認する

OPENLOGIデモ環境に、次の通常SKUを用意します。飲み比べセットは完成品の独立SKUとして扱い、単品3袋からなる仮想セットは作成しません。

| SKU | 商品 | JPY価格 |
| --- | --- | ---: |
| `TSU-SENCHA-80` | 宇治 煎茶 80g | 1980 |
| `TSU-MATCHA-30` | 宇治 抹茶 30g | 2800 |
| `TSU-HOJICHA-60` | 宇治 ほうじ茶 60g | 1680 |
| `TSU-TASTING-3` | 宇治のお茶 飲み比べセット | 3800 |

[商品カタログ](../config/tea-demo-catalog.json)を使う確認・登録コマンドも用意しています。

```sh
node --env-file=.env scripts/register-openlogi-demo-items.mjs
node --env-file=.env scripts/register-openlogi-demo-items.mjs --apply
```

1行目は登録状況の読み取りのみ。2行目は未登録SKUだけをデモ環境に登録します。既存商品を上書きせず、名称・価格・セット構成が異なる場合は確認対象として表示します。商品を登録しても倉庫の在庫は増えません。

読み取りと照合を行い、出荷依頼はまだ作成しないコマンドです。

```sh
node --env-file=.env scripts/run-fulfillment-demo.mjs --mode openlogi-demo --order-id 19055954755837 --output .runtime/fulfillment-report.json
```

初期対応は日本国内宛てです。海外向けの通関情報や配送可否を仮定して送ることはありません。SKU、対象数量、フルフィルメントの割当先、住所などが条件を満たさない注文は、その理由をレポートに残します。

## 4. デモ環境へ保留した出荷依頼を作成する

デモアカウントの利用条件を確認した後に、明示的に `--submit-demo` を付けて実行します。

```sh
node --env-file=.env scripts/run-fulfillment-demo.mjs --mode openlogi-demo --order-id 19055954755837 --submit-demo --output .runtime/fulfillment-report.json
```

接続先は `https://api-demo.openlogi.com/api` に固定しています。作成時は `suspend:true` で保留し、`backorder_if_unavailable:true` で在庫不足時は予約として扱います。ルール適用と発送メールは無効です。公開APIの出荷保留は倉庫作業の開始を止めますが、在庫がある場合は引当が起こる仕様です。[OPENLOGI出荷保留](https://help.openlogi.com/faq/show/213)

同じストア・注文には同じ識別番号を使います。処理結果が不明な通信エラーの後も、同じ依頼を再取得して照合します。新しい識別番号で重複依頼を作る操作は行いません。ローカルの実行記録は `.runtime/fulfillment/` に保存します。

支払い設定が必要という応答（HTTP 402）が返った場合は、その場で止まります。請求情報の追加やサービス契約はこのCLIの対象外です。

## 5. 出荷結果を取り込む

同じ注文IDでもう一度、`--submit-demo` を付けずに実行すると、既存の出荷依頼を照合して、その時点の状態をレポートへ出力します。JSONをMVPの「物流連携」で再選択すると表示が更新されます。

保留依頼の作成成功と発送完了は別の状態です。公開APIにはデモ在庫を増やす操作や出荷済みに強制変更する操作は確認できません。デモ倉庫の進行方法が提供元から確認できるまでは、追跡番号が未取得でも正常です。

この段階ではShopifyへの発送済み書き戻しを実装していません。倉庫側の出荷実績と追跡情報を確認した後に、対象のFulfillmentOrderの明細数量と照合する処理を追加します。フルフィルメントを手動で完了扱いにして、物流APIの成功と見なすことはしません。

## 表示の読み方

- `fixture`: 外部サービスと通信していない架空サンプル。
- `openlogi-demo`: デモAPIを使う実行。各サービスの認証が確認できたかは別項目で表示する。
- 接続確認時刻: JSON生成時点の状態。常時接続・自動同期を示す表示ではない。
- 顧客送料: Shopifyで購入者へ請求した金額。
- 実際の物流費: この実装では未取得。顧客送料を代入して採算を計算しない。

レポートにはトークン、氏名、住所、電話番号、メールアドレスを含めません。認証と宛先情報はCLI内で扱い、ブラウザの画面へ認証情報を渡しません。

## 公式アプリの公開状況

2026年11月26日の確認では、OPENLOGI公式サイトはShopify連携を案内していますが、[Shopify App Store](https://apps.shopify.com/openlogi?locale=ja)は「現在提供されていません」と表示しました。新規導入方法・開発ストア・デモ環境対応は確認が必要です。このCLIは公式アプリを経由しません。将来公式アプリを併用する場合も、同じ注文の出荷指示を担当する経路は一つにします。

参考: [OPENLOGIのShopify連携](https://service.openlogi.com/shopify_logistics/) · [API仕様](https://api.openlogi.com/doc/api.html) · [API変更履歴](https://api.openlogi.com/doc/CHANGELOG.html)
