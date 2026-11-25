# Sandbox setup and access checks

Use a Shopify Dev store for storefront, checkout and test orders, and OPENLOGI's demo environment for warehouse API verification. Keep credentials in a local secret store or a restricted environment file excluded from version control. Use fictional customer data throughout.

## Current implementation

The Shopify development store `uji-tsukino-sabo-demo.myshopify.com` and its first paid test checkout are available. The new [one-order fulfillment demo](fulfillment-demo.md) implements a fixture run and a separate demo-API path with suspended shipment creation and read-back. It does not implement Shopify fulfillment writeback or simulate warehouse inventory through an undocumented API. Provider credentials and live API verification are still pending.

Use `node scripts/run-fulfillment-demo.mjs --mode fixture --output .runtime/fulfillment-report.json` to exercise the local path. Open the MVP's **物流連携** view to inspect the generated report. The commands below for the original sandbox access checker remain read-only.

## Shopify Dev store

1. Sign in to [Shopify Dev Dashboard](https://dev.shopify.com/dashboard/). Use an existing Partner organization if available.
2. Select **Stores → Create store → Dev**. Use a name such as **Cross-Border Seller Hub Test** and set the location to Japan. Start with the Basic dev store profile and no generated products. The store name determines the `.myshopify.com` hostname.
3. Create an organization-owned test app and install it on this dev store for the Admin API access check. For an app and store owned by the same organization, follow Shopify's client credentials grant to obtain a temporary Admin API access token.
4. Use the supported test gateway. Create Uji matcha and sencha with the [prototype SKU references](hs-codes-tea-food.md), then place two paid US test checkouts for the same customer and address. Keep the fulfillment step simulated until the OPENLOGI demo route is verified.

References: [Dev stores](https://shopify.dev/docs/apps/build/stores/development-stores) · [Client credentials grant](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant) · [Admin GraphQL 2026-10](https://shopify.dev/docs/api/admin-graphql/2026-10/queries/shop)

## OPENLOGI demo

1. Open [demo token management](https://app-demo.openlogi.com/portal/tokens). A demo portal account with token management permissions is required. If access or demo-account registration is unavailable, ask [OPENLOGI support](https://page.openlogi.com/contact) for demo account provisioning.
2. Issue a demo token once access is available. Use API v1.6 with `https://api-demo.openlogi.com/api`.
3. Check the official Shopify app's current availability and whether it supports the OPENLOGI demo environment before installing or connecting it. On 2026-11-26 its Shopify App Store listing displayed that it was not currently available, while OPENLOGI's site continued to describe Shopify integration. The new CLI uses the demo API directly; it does not require this app. Keep a single writer for shipment requests.
4. Confirm US food-lane and dispatch simulation support independently from token access. A successful item read verifies account access only.

References: [OPENLOGI API v1.6](https://api.openlogi.com/doc/api.html) · [Official Shopify app](https://apps.shopify.com/openlogi?locale=ja)

## Read-only access check

Run from the repository root with Node.js 22 or later. Set either provider's variables to check that provider, or both to check both. Use the canonical store hostname as returned by Shopify, without a protocol or path.

| Variable | Value |
| --- | --- |
| `SHOPIFY_DEV_STORE` | Dev store `.myshopify.com` hostname |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Installed test app's Admin API access token |
| `OPENLOGI_DEMO_TOKEN` | OPENLOGI demo access token |

```sh
node scripts/check-sandbox.mjs
```

The script uses a Shopify GraphQL query and an OPENLOGI GET for one item. It prints only an access result and uses exit code 1 if any requested check fails, or 2 when no credentials were supplied. The Shopify query confirms the domain and authentication. Confirm the store is a **Dev** store in the dashboard. The OPENLOGI check is fixed to the demo host.

Once access is verified, run the [end-to-end acceptance cases in the README](../README.md#fast-track-sandbox-validation).
