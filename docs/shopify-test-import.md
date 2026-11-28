# Import Test Orders from a Shopify Development Store

The command-line exporter reads test orders from one Shopify development store through the Admin API. The MVP's Shopify import screen opens the resulting JSON. It shows paid order counts, fulfillment status, quantities by product, and merchandise subtotals. Use the fictional sample option to try it first.

## 1. Set up Shopify

- Select a development store in the [Shopify Dev Dashboard](https://dev.shopify.com/dashboard/), add a tea product, and create an order using test payments.
- Create an Admin API app in the same organization as the development store, assign `read_orders` for test orders and `read_inventory` for the optional inventory snapshot, and install it on that store. Approve the app's access.
- When the store and app belong to the same organization, obtain a token using the client credentials grant. An existing Admin API token for the target store also works. Store credentials in local environment variables or a secrets store.

[Development stores](https://shopify.dev/docs/apps/build/stores/development-stores) · [Create and install apps using the Dev Dashboard](https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard) · [Client credentials grant](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant)

## 2. Export the JSON file

Run from the repository root on a machine with Node.js 22 or later.

| Environment variable | Value |
| --- | --- |
| `SHOPIFY_DEV_STORE` | The development store's `.myshopify.com` hostname |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | An existing Admin API token for the store, if using token authentication |
| `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` | The app's client credentials, if the app and store are in the same organization |

```sh
node scripts/export-shopify-test-orders.mjs > ~/shopify-test-orders.json
```

The script checks that the target is a development store, then reads up to 1,000 test orders from the past 30 days in pages. It replaces order IDs and exports product names, quantities, subtotals, and statuses. Its access is read-only for orders, payments, refunds, and fulfillment. Keep credentials and the order export out of GitHub. [Shopify orders query](https://shopify.dev/docs/api/admin-graphql/2026-10/queries/orders)

## 3. Load the file into the MVP

Open [`mvp/index.html`](../mvp/index.html) in a browser. In the Shopify import view, use the order JSON picker to select the file. Selecting it again replaces the previous import. Reloading the page clears the imported results.

The merchandise subtotal includes paid, non-canceled orders. The dashboard handles refund statuses and amounts in different currencies separately. Cross-store comparisons use data from 36 fictional stores. Imports of real reviews, actual shipping costs, and cross-store benchmarks require separate validation.

## 4. Export SKU and location inventory for planning

With both scopes approved, export a Shopify inventory snapshot using the same development-store credentials.

```sh
node scripts/export-shopify-test-orders.mjs --inventory > ~/shopify-inventory-snapshot.json
```

Open [Fulfillment → Shopify snapshot](../mvp/index.html#fulfillment-shopify) and select the snapshot. A deterministic sample is available in the same view. The snapshot reports the source shop, its read time, and the count of test orders read. It includes tracked Shopify items and on-hand, available, committed, and incoming quantities by location. Shopify's available quantity is used directly. Only a dated inbound receipt can be applied to a stockout forecast.

The demand series counts current units from paid, uncanceled test orders for the last 14 complete UTC days. The stockout estimate uses the same weighted-demand model as Inventory planning, limited to a uniquely matched SKU with one active online fulfillment location and demand on at least two days. The snapshot still shows inventory for items with missing demand history, missing or duplicate SKUs, or multiple online locations. With `read_orders` and `read_inventory`, the exporter can read stock by location ID and assigns a consistent redacted label. Shopify also requires `read_locations` to read location names and verify whether a location fulfills online orders. The exporter requests these fields when the installed app has that scope. With unverified eligibility the snapshot shows quantities and withholds the stockout date. This is a one-time read for each export. Test transactions illustrate the workflow rather than measure live sales.

Keep credentials and generated snapshots off shared or web-served directories. Use a private local environment or secrets store for the exporter. The snapshot omits customer, address, token, and raw order ID fields.

[Shopify inventory levels](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/InventoryLevel) · [Shopify order line items](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/LineItem)
