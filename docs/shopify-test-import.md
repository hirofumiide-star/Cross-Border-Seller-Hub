# Shopify開発ストアのテスト注文を取り込む

MVPの「Shopify取込」は、開発ストア1店のテスト注文を実際のShopify Admin APIから読み取り、入金済み件数、フルフィルメント状況、商品別数量、商品小計を確認する画面です。先に「架空サンプルを読み込む」で操作を試せます。

## 1. Shopify側の準備

- [Shopify Dev Dashboard](https://dev.shopify.com/dashboard/)で開発ストアを選択し、販売確認用のお茶の商品を登録します。テスト決済で注文を作成します。
- 開発ストアと同じ組織に管理API用アプリを作成し、読み取りスコープ `read_orders` を付けて当該開発ストアにインストールします。アプリのアクセス承認が必要です。
- 同じ組織のストアとアプリなら、クライアント認証でトークンを取得できます。手持ちの対象ストア用の管理APIトークンも利用できます。資格情報はローカルの環境変数やシークレットストアで管理します。

[開発ストア](https://shopify.dev/docs/apps/build/stores/development-stores) · [Dev Dashboardのアプリ作成とインストール](https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard) · [クライアント認証](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant)

## 2. JSONを作成する

Node.js 22以降が入った端末で、リポジトリのルートから実行します。

| 環境変数 | 値 |
| --- | --- |
| `SHOPIFY_DEV_STORE` | 該当開発ストアの `.myshopify.com` ホスト名 |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | 既存の管理APIトークンを使用するときの値 |
| `SHOPIFY_CLIENT_ID` と `SHOPIFY_CLIENT_SECRET` | 同一組織アプリのクライアント認証を使うときの値 |

```sh
node scripts/export-shopify-test-orders.mjs > ~/shopify-test-orders.json
```

スクリプトは指定ストアの開発属性を確認してから、直近30日間・最大1,000件のテスト注文をページ単位で取得します。注文IDを置き換え、商品名・数量・小計・ステータスだけを出力します。注文の作成、決済、返金、出荷には操作を加えません。出力ファイルはローカルで管理し、資格情報や注文ファイルをGitHubに登録しないでください。 [Shopify ordersクエリ](https://shopify.dev/docs/api/admin-graphql/2026-10/queries/orders)

## 3. MVPで開く

[`mvp/index.html`](../mvp/index.html) をブラウザーで開き、「Shopify取込」の「注文JSON」で作成したファイルを選択します。同じファイルを再選択したときは置き換えになります。ページを再読み込みすると、取り込み結果はクリアされます。

商品小計はキャンセルされていない入金済み注文のみを集計し、返金状態や通貨の異なる金額は別に扱います。架空36店のクロスストア比較はデモデータで動作します。レビュー・実送料・横断ベンチマークの実データ取り込みは別途検証します。
