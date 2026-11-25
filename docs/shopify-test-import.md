# Import Test Orders from a Shopify Development Store

The MVP's Shopify import screen reads test orders from one development store through the Shopify Admin API. It shows paid order counts, fulfillment status, quantities by product, and merchandise subtotals. Use the fictional sample option to try it first.

## 1. Set up Shopify

- Select a development store in the [Shopify Dev Dashboard](https://dev.shopify.com/dashboard/), add a tea product, and create an order using test payments.
- Create an Admin API app in the same organization as the development store, assign the `read_orders` scope, and install it on that store. Approve the app's access.
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
