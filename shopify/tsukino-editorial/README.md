# Tsukino Tea House Shopify group buy

The first merchant segment is Japanese agricultural cooperatives. This pilot design uses the 14 Uji tea product names on the [JA Zen-Noh Kyoto category page on JA Town](https://www.ja-town.com/shop/c/c4305_sgn/). It is an independent storefront demo for a Taiwan group buy.

The homepage leads with the three-variety tea bag set containing Uji gyokuro, Uji sencha, and tencha. It shows the organizer, sample campaign price, Taiwan-time deadline, number of sets registered, and pickup method. The organizer's signup and the LINE and WhatsApp share buttons sit directly beneath the progress bar. The pilot covers one group, one featured set, and one pickup method.

## Catalog and images

- Search the 14 listings by product name in Traditional Chinese, English, or Japanese. Filter by matcha, loose tea, tea bags, assortments, or bottled tea.
- Japanese names come from the linked category. English and Traditional Chinese names are storefront translations. The catalog does not import JA Town prices, descriptions, packaging photos, stock, or reviews. The campaign price of NT$980 is a sample, and the other teas are browse-only.
- The seven generated photos cover the campaign hero, matcha, loose green tea, tea bags, gift sets, bancha, and bottled tea. Closely related pack sizes share an illustration. Visible captions identify images as AI-generated. Product records in the optional draft CSV have names and local handles and do not import media or pricing.

The photography brief was restrained Japanese tea editorial still life on pale stone or linen, soft daylight, realistic tea textures, and generic packaging without branding or printed text. Subjects were three cups and their tea bags, green matcha powder with a bamboo scoop, loose gyokuro or sencha leaves, mesh tea bags, a plain gift box, roasted Kyoto bancha, and an unlabelled bottle of green tea.

## Preview

Download the [design branch ZIP](https://github.com/hirofumiide-star/Cross-Border-Seller-Hub/archive/refs/heads/design/tsukino-taiwan-group-buy.zip), extract it, and open [preview.html](preview.html). It opens in Traditional Chinese and offers English and Japanese. The demo buttons show what signup and sharing on LINE or WhatsApp would do.

## Storefront languages

The deployed demo layout is available in `layout/theme.liquid`. Its Shopify localization form uses the languages published on the current storefront domain. Publish English, Traditional Chinese, and Japanese under Shopify's **Settings → Languages** and assign them to that domain. The homepage's campaign and catalog are already translated in Liquid. Set localized homepage titles and descriptions in Translate & Adapt. If staging the campaign inside a different theme, use that theme's native language picker.

## Stage the design in Shopify

1. Duplicate the current theme. Copy the group-buy section, the catalog snippet, the CSS and JS, and the seven `tsukino-ja-*.jpg` images into the corresponding theme directories.
2. Add **Tsukino group buy** to the home template and move it to the top. Hide the superseded homepage hero and featured collection.
3. Turn on **Show the sample campaign (no signups)** for the draft preview. For an operating campaign, set its real organizer, price, order threshold, registered-set count, deadline, signup URL, and payment and fulfillment terms in the editor. The organizer's signup tool should enforce the same deadline.
4. Use the [draft product CSV](ja-uji-tea-shopify-drafts.csv) for separate product administration if needed. Import as new draft products. The storefront's browse-only cards and campaign do not depend on this import. Leave the products unpublished until the seller confirms their Taiwan assortment and commercial terms.

The organizer confirms the outcome and notifies participants after the deadline. The producer prepares one shipment from Japan to the Taiwan organizer. Local pickup or delivery is coordinated by the Taiwan organizer.

[Shopify product CSV documentation](https://help.shopify.com/en/manual/products/import-export/using-csv) · [LINE sharing documentation](https://developers.line.biz/en/docs/line-social-plugins/install-guide/using-line-share-buttons/) · [WhatsApp sharing documentation](https://faq.whatsapp.com/5913398998672934/)
