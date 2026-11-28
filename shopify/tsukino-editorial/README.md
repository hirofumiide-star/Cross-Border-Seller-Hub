# Tsukino Tea House editorial Shopify design

The homepage leads with the Taiwan group buy. The storefront comparison and product detail sections apply the shopping interactions from the design references in an original visual style.

| Shopping interaction | Implementation |
| --- | --- |
| Choose by how you drink it | Filter teas for a first cup, latte, whisked matcha, teapot, or after a meal. The three cards also show use tags. |
| Compare prices and ratings | Display the packaged price and price per kilogram for a known net weight and a consistent product price. Display Shopify's standard product rating and count when a review app publishes them. The HTML preview labels its sample rating. |
| See craft and preparation at a glance | Use the three expandable home-page brewing guides. On product templates, add a photograph, tasting notes, growing region, tea garden, cultivar, elevation, harvest, and brewing measurements where verified. Empty attributes are hidden. |
| Choose one-time purchase or a recurring plan | Use the opt-in product selector for an available single-variant product with a real recurring selling plan. It passes only the selected Shopify selling plan ID and shows its price. When known net weight and grams per cup are supplied, the cups-per-day control estimates how many days a package lasts. Buyers choose among actual plan intervals. |

## Preview

Download the design branch ZIP, extract it, and open [preview.html](preview.html). The preview opens in Traditional Chinese with English and Japanese language choices. Try a use filter, expand a brewing guide, and select **Preview the product page** to exercise the plan selector and cups-per-day estimator. Prices for ordinary single packs use the demo catalog as a fixture. Subscription prices, intervals, and the review example are illustrative. The preview cannot submit an order. Product links open the Shopify development storefront and may require its password.

## Stage the design in Shopify

1. Duplicate the Rise theme. Add the two files in `sections/` and the CSS, JavaScript, and hero image in `assets/` to the corresponding folders in the duplicate.
2. Add **Tsukino group buy** to the home template. Move it to the top and hide the superseded homepage hero and featured collection. The section uses the four existing product handles by default. The theme editor supports changing the products and hero image.
3. Add **Tsukino tea details** to a product template. Map fields to verified product metafields through dynamic sources where supported, or use separate templates for different tea details. The home price comparison reads `custom.net_weight_g` when present. The three original pack sizes are fallback values only for their existing handles. A changing variant price or missing weight suppresses the comparison.
4. Keep the theme's native buy buttons when using ordinary checkout or an existing subscription app block. To use the custom selector, first create eligible recurring plans through a Shopify subscription app. Enable the selector on the appropriate single-variant product template. Verify a test order and keep a single visible purchase form when configuring that template. Use the native subscription app block for multi-variant products. The custom selector does not set up plans or automatically change the buyer's selected interval.
5. Keep the group-buy campaign in preparation until the Taiwan retail partner confirms prices, deadline with time zone, threshold, delivery estimate, refund terms, and signup URL. The section only opens when all these values are set. Use the Shopify theme editor to edit and translate the values. The retail partner handles Taiwan campaign sign-up and payment.
6. Verify the duplicate on mobile and desktop in the shop's enabled languages. Enable English in Shopify if it should be available on the storefront. The copy is already present in the section.

The hero photograph is an illustrative still life. Use catalog photos and verified producer information for product claims.

[Shopify section architecture](https://shopify.dev/docs/storefronts/themes/architecture/sections) · [Shopify subscriptions and purchase options](https://shopify.dev/docs/storefronts/themes/pricing-payments/subscriptions) · [Shopify rating metafields](https://shopify.dev/docs/apps/build/metafields/list-of-standard-definitions)
