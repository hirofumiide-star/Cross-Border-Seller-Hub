# Cross-Border Seller Hub

**Bring standout Japanese products to overseas customers.**

We build Shopify storefronts for Japanese tea and regional food producers and connect them with consumers through group-buy campaigns in Taiwan. We prepare product information for food imports and coordinate customs and delivery with Taiwanese importers, brokers, and carriers. After delivery, we share sales results and customer feedback with producers so they can improve their products.

The first pilot takes **Japanese tea to Taiwan**. It tests paid website development, a fee for running group buys, and a recurring service for improving sales.

| Document | What it covers |
| --- | --- |
| [Business plan](docs/business-plan.md) | Target customers, three revenue streams, Taiwan group-buy operations, unit economics, and the 90-day pilot |
| [Broker portal MVP and operating-model review](docs/broker-portal-mvp.md) | Importer mandate, document handoff, broker actions, and prerequisites for a live Taiwan pilot |
| [Operating model and partner roles](docs/operating-model.md) | Recruitment and ordering, consolidated international shipping, individual delivery in Taiwan, and payments |
| [Website development and subsidies](docs/website-service-and-subsidies.md) | Package pricing, program eligibility, and work before and after a grant award |
| [Market feedback MVP](docs/market-feedback-mvp.md) | Traditional Chinese customer feedback, co-purchases, pricing tests, referral tracking, and success measures |

## Japanese tea multi-store analytics MVP

The [English-language Seller Hub dashboard](mvp/index.html) matches orders, shipments, and reviews across 36 fictional Shopify-style stores. **Preview Shopify group buy** and the `#store` URL open the [10-buyer Uji Tsukino Tea House theme preview](https://admin.shopify.com/store/rgjmwn-ks/themes/191201902671/editor) for users with access to its Shopify admin. The test-order and inventory API workflow uses the separate development store described below.

Download the source and open `mvp/index.html` in a browser, or run `python3 -m http.server 8000` at the repository root and open `http://localhost:8000/mvp/`.

1. In **Sales analytics**, switch the market, period, and store to compare sales, delivery costs, and Taiwan group-buy orders.
2. Use **Open Shopify demo store** to see the products and try Shopify test checkout if you have access to the password-protected development store.
3. In **Shopify import**, follow the [read-only import guide](docs/shopify-test-import.md) to review orders exported from the development store. Use the fictional sample option to explore this screen without store access. Shopify orders are reviewed separately from the fictional analytics.
4. In **Data sources**, inspect fictional orders, shipping charges, and reviews and export the selected range as CSV. In **AI insights**, review the supporting evidence and record a next action.

The demo uses a fixed seed to generate 7,696 fictional orders. The initial 30-day view contains 2,462 valid orders. Net merchandise sales exclude canceled and refunded orders. Freight ratios and the amount remaining after product and shipping costs use completed orders with recorded freight costs. Rules recalculate the metrics and suggestions when inputs change. Previously saved mock orders remain available in demo analytics, and saved actions remain in local storage.

### Taiwan broker portal MVP

Open [the English broker portal](mvp/index.html#broker) to review a draft against destination and product reference data. The AI-assisted review uses demo rules to show mismatched codes, unreconciled document totals, and evidence to request. Start document review as the Taiwanese broker to apply a code candidate to the editable case. Correct the HS and Taiwan CCC codes with a recorded reason, then generate draft commercial invoices, packing lists, import declaration worksheets, and TFDA product information sheets. Preview the drafts and print them to PDF. Switch roles to test the importer mandate, handoff, document requests, simulated filing and sampling, receiving hub handoff, and final delivery to Taiwan buyers. See the [document sources, workflow, and operating-model review](docs/broker-portal-mvp.md).

## Shopify storefront and fulfillment verification

[The Uji Tsukino Tea House Shopify dev store](https://uji-tsukino-sabo-demo.myshopify.com/) contains four Japanese tea products and a test checkout. Test order #1001 was completed on November 26, 2026 (JST). Traditional Chinese (`zh-TW`) is now the domain's default display language, with [Japanese available at `/ja`](https://uji-tsukino-sabo-demo.myshopify.com/ja). Product copy, the homepage, navigation and contact page have been translated. The cart, checkout, privacy policy and language switch were verified in the live storefront. The dev store remains password protected; the store owner can also use the admin preview.

Open [Inventory planning](mvp/index.html#fulfillment) to explore four sample SKUs at a Kansai warehouse and a Taipei receiving hub. Select a SKU and change the demand scenario, supplier lead time, or expected inbound delay. The 30-day outlook shows projected availability, the first safety-stock breach and stockout, the open receipts and committed orders driving those dates, and an order-by date and whole-case replenishment suggestion. Save a purchase draft for buyer review in the browser.

The demand estimate weights the most recent seven sample days at 65% and the preceding seven at 35%. The projection starts with on-hand stock less reservations, adds receipts on their expected arrival dates, and subtracts forecast demand and incremental firm campaign quantities. Lead time controls when a new purchase can arrive. The replenishment proposal tops up the lowest projected availability during the seven days from receipt, with a separate exception for a stockout before that receipt. Draft purchases stay out of projected supply until confirmed. The demo uses sample inputs, a statistical forecast, and browser-local drafts. Planning references: [Dynamics 365 safety stock](https://learn.microsoft.com/en-us/dynamics365/supply-chain/master-planning/safety-stock-replenishment) · [Oracle projected inventory exceptions](https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26a/fausp/configure-measure-based-exceptions-for-constrained-supply-plans.html).

[Shopify snapshot](mvp/index.html#fulfillment-shopify) imports SKU-by-location availability and demand history exported from a single development store by the read-only Shopify Admin API command. If there is sufficient history and one verified online fulfillment location, it estimates the 30-day stockout date using Shopify's available stock. Location IDs and quantities can be read with the two baseline scopes. `read_locations` is needed to verify eligibility and show names. See the [export and authorization guide](docs/shopify-test-import.md#4-export-sku-and-location-inventory-for-planning).

[Shipment reports](mvp/index.html#fulfillment-reports) imports the CLI's redacted test-order and shipment-request reports. It distinguishes fixture data from OPENLOGI demo API results and separates customer-paid shipping from actual freight costs.

```sh
node scripts/run-fulfillment-demo.mjs --mode fixture --output .runtime/fulfillment-report.json
```

The code supports an offline fixture, Shopify dev-store order reads, suspended OPENLOGI demo shipment requests and reconciliation by request identifier. All 27 local tests pass. On November 26, 2026 (JST), the OPENLOGI demo token portal displayed its HTTP 503 maintenance page, so credentialed provider calls remain unverified. Warehouse release and fulfillment write-back to Shopify are not implemented. See the [fulfillment runbook and verification status](docs/fulfillment-demo.md).

## D2C fulfillment sandbox

The existing Shopify × OPENLOGI demo illustrates parcel-level order consolidation and a U.S. test scenario. The Taiwan business pilot uses campaign-level demand aggregation with a local importer and seller.

### Try the prototype

Open [prototype/index.html](prototype/index.html) in a browser. It runs using embedded sample data and has no build step. If you prefer a local server, run this at the repository root and visit `http://localhost:8000/prototype/`.

```sh
python3 -m http.server 8000
```

1. In **Fulfillment**, open shipment **SH-101**. Orders **#1048** and **#1049** share a seller, customer, destination address, shipping service, duty treatment, and currency. The first order opens a 12-hour consolidation window. A later order for the same Seattle buyer appears in a separate parcel.
2. Open **Invoice preview** and check the English item descriptions, origin, tariff references, quantities, weights, and declared totals. Advance the demo clock to close the hold, then simulate dispatch. A single simulated tracking number is assigned to the parcel and its Shopify orders.
3. Open **SH-104** to see a regional condiment held for customs review. Use **SKU registry** to inspect the sample product records.
4. In **Benchmarks**, compare mock AOV, conversion, 60-day repeat rate, and freight-to-GMV ratios by market. Singapore demonstrates cohort suppression. The Japanese seller digest uses illustrative bundle, review, and freight findings.

The browser stores simulated dispatch and clock progress locally when storage is available. **Reset demo** restores the starting state. The prototype does not contact Shopify, OPENLOGI, customs, carriers, or an LLM. Its addresses, carrier estimates, tracking numbers, and merchant data are fictional.

### Proposed sandbox architecture

```mermaid
flowchart TD
    S["Shopify storefront and Markets"] -->|"Order webhooks"| H["Seller Hub and SKU registry"]
    H -->|"Approved shipment request"| O["OPENLOGI fulfillment"]
    O -->|"Dispatch and tracking"| H
    H -->|"Fulfillment and tracking update"| S
    H --> A["Aggregated benchmark and VOC pipeline"]
    S -->|"Review app and storefront analytics"| A
    A --> P["Seller dashboard and Japanese weekly digest"]
```

- **Storefront** — Local currencies, bundles, checkout contact details, and lane-specific DDP or DAP.
- **Seller Hub** — Validate SKU and customs metadata, use the earliest eligible order to start a 12-hour hold, consolidate matching orders within a seller, and calculate a route and parcel weight.
- **Fulfillment** — Verify OPENLOGI warehouse eligibility for food, lot and expiry controls, FEFO (first-expired, first-out), tracking, and invoice/waybill workflows for each carrier and service.
- **Analytics** — Compare anonymized category cohorts by market and period. Generate Japanese digests on co-purchases, multilingual review themes, and freight costs. Test pricing recommendations against seller margins.

#### Production integration rules

- Verify Shopify HTTPS webhook signatures on the raw body, deduplicate by shop and event ID, persist events before processing, and reconcile order edits, cancellations, and fulfillment changes. Pin a supported Admin GraphQL version. Use a single writer for warehouse requests to avoid native connector and middleware double dispatch. [Shopify webhook verification](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)
- Normalize structured addresses conservatively and match the customer ID, seller, complete address (including unit), fulfillment location, service, duty treatment, and currency. Keep orders with missing or ambiguous data separate pending review. Start a new group after 12 hours from the oldest order, rather than sliding the window. Revalidate paid state, stock, customs, and destination before dispatch.
- Persist one immutable external reference per warehouse shipment and reconcile that reference after ambiguous responses. After dispatch, update the Shopify fulfillment orders and line quantities belonging to that parcel with the shared tracking number. Treat partial failures and retries per order.
- Calculate declared value from validated line values after discounts, in the declared currency. Confirm chargeable weight, actual carrier fees, and the label's DDP/DAP setting before release. [Shopify customs and DDP guidance](https://help.shopify.com/en/manual/international/duties-and-import-taxes/additional-tasks)

### Sandbox metrics

The benchmark screen uses fictional cohorts. Any production use of cross-seller comparisons or AI training requires a review of permitted data sources and purposes. See the [market feedback specification](docs/market-feedback-mvp.md#data-and-decision-making).

| Metric | Proposed definition |
| --- | --- |
| Average order value (AOV) | Net merchandise sales divided by paid orders in the period |
| Conversion rate | Purchasing sessions divided by eligible storefront sessions, from storefront analytics |
| 60-day repeat rate | Share of first-time buyers ordering again within 60 days, using fully observed cohorts |
| Freight-to-GMV | Outbound carrier freight divided by net merchandise sales, in a shared reporting currency |

### Fast-track sandbox validation

Use the [sandbox setup and read-only access check](docs/sandbox-setup.md) to confirm both test environments first.

- [ ] **Shopify** — Create a dev store and use a supported test payment gateway. Configure the U.S. market, require a checkout shipping phone number, create consistent SKUs, and test a virtual bundle if the store and apps are eligible. Configure additional countries only after lane review. [Shopify dev stores](https://shopify.dev/docs/apps/build/stores/development-stores)
- [ ] **OPENLOGI** — Confirm access to a test environment and whether the Shopify app supports the dev store. Verify no-charge simulation, food warehouse acceptance, virtual stock, tracking callbacks, and whether external consolidation is supported. Mirror SKU IDs, English customs descriptions, origin, and tariff references. Keep carrier routing and dispatch in test mode.
- [ ] **End-to-end** — Place two paid test orders for the same Seattle destination within 12 hours. Verify only one warehouse request, the combined commercial invoice, tracking on both Shopify orders, and a separate parcel for orders outside the hold. Replay a webhook and repeat the test for an order cancellation and a missing phone number.
- [ ] **AI pilot** — Ingest approved aggregate orders, redacted reviews from the chosen review app, and reconciled freight costs. Generate a Japanese weekly digest with co-purchased SKUs, VOC themes, and freight-to-GMV alerts. Validate findings against underlying aggregate counts before release.

The 1–2 day target applies to prototype validation once test access and fees are confirmed. See [SKU and FDA checklist](docs/hs-codes-tea-food.md) and [shipping zones and rate assumptions](docs/shipping-zones.md).
