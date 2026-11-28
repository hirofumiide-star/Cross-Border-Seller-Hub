# Tsukino Tea House Shopify group buy

The homepage opens with one Taiwan group buy for an Uji tea tasting set. It shows the organizer, group price, Taiwan-time deadline, registered sets, minimum quantity, remaining sets, and pickup method. Visitors can join on the organizer’s signup page or share the campaign through LINE. Below the offer are the organizer’s recommendation, the three-tea comparison, and the steps from signup to pickup.

The first pilot assumes one organizer, one set, and one pickup method. Registration happens before payment. At the deadline, the organizer confirms whether the group can go ahead and sends payment instructions when it can. The producer sends one shipment to the organizer in Taiwan after the campaign is confirmed and the orders are ready to fulfill. The organizer handles local pickup or delivery.

| Shopping interaction | Implementation |
| --- | --- |
| Choose by how you drink it | Filter teas for a first cup, latte, whisked matcha, teapot, or after a meal. The three cards also show use tags. |
| Compare prices and ratings | Display the packaged price and price per kilogram for a known net weight and a consistent product price. Display Shopify's standard product rating and count when a review app publishes them. The HTML preview labels its sample rating. |
| See craft and preparation at a glance | Use the three expandable home-page brewing guides. On product templates, add a photograph, tasting notes, growing region, tea garden, cultivar, elevation, harvest, and brewing measurements where verified. Empty attributes are hidden. |
| Choose one-time purchase or a recurring plan | Use the opt-in product selector for an available single-variant product with a real recurring selling plan. It passes only the selected Shopify selling plan ID and shows its price. When known net weight and grams per cup are supplied, the cups-per-day control estimates how many days a package lasts. Buyers choose among actual plan intervals. |

## Preview

Download the [design branch ZIP](https://github.com/hirofumiide-star/Cross-Border-Seller-Hub/archive/refs/heads/design/tsukino-taiwan-group-buy.zip), extract it, and open [preview.html](preview.html). The preview opens in Traditional Chinese and offers English and Japanese. The sample campaign shows NT$980, 18 of 30 sets registered, and in-person pickup in Taipei. The signup and LINE controls open sample explanations. They collect no information, submit no payment, and send no messages. The product-page preview retains the sample subscription and rating from the editorial design.

## Stage the design in Shopify

1. Duplicate the current theme. Add the two files in `sections/` and the CSS, JavaScript, and hero image in `assets/` to the corresponding folders in the duplicate.
2. Add **Tsukino group buy** to the home template and move it to the top. Hide the superseded homepage hero and featured collection. Set the section’s hero photo and three tea products if the defaults do not match the catalog.
3. Turn on **Show the sample campaign (no signups)** in the theme editor for the draft preview. Verify the two campaign controls and the comparison on a phone. Keep the sample off for the customer campaign.
4. For a real campaign, set the organizer’s name and recommendation, price, pickup method and area, minimum sets, current registered sets, signup URL, and payment and shortfall terms. Use an ISO 8601 deadline with a Taiwan offset, such as `2026-12-06T22:00:00+08:00`. The storefront starts in preparation. A valid enabled campaign displays signup and sharing until the deadline and shows it as closed afterward. The organizer’s signup service also needs to enforce the deadline.
5. Use **Optional public campaign landing page for LINE** for an organizer-specific URL or a tagged public campaign URL. By default, the LINE button shares the storefront page at the campaign section. Use a URL that Taiwan buyers can open. The partner owns registration, payment, and tracking from the signup link.
6. Update **Sets registered** from the organizer’s actual registrations. Count sets rather than participants. Progress is manually maintained, and a full bar means the minimum quantity was reached. The organizer confirms the outcome and payment after the deadline.
7. Add **Tsukino tea details** to the product template as needed. Map verified product facts through dynamic sources where supported. Keep the native buy buttons or a compatible subscription app block for ordinary individual purchases. To use the custom selector, first configure recurring plans for an eligible single-variant product and leave only one visible purchase form.

The hero photo is illustrative. Use verified catalog and producer information for product claims.

[Shopify section architecture](https://shopify.dev/docs/storefronts/themes/architecture/sections) · [LINE share buttons](https://developers.line.biz/en/docs/line-social-plugins/install-guide/using-line-share-buttons/) · [Shopify subscription options](https://shopify.dev/docs/storefronts/themes/pricing-payments/subscriptions)
