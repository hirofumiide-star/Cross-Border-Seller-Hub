# Tsukino Tea House editorial Shopify design

The homepage presents the Taiwan group buy before product browsing. The optional product section adds tasting notes and verified tea details to a Shopify product template. English, Traditional Chinese, and Japanese section copy follows the storefront language.

## Preview

Download the draft branch as a ZIP, extract it, and open [preview.html](preview.html). The standalone preview uses the project's sample tea photography. The Shopify section reads product images from the existing Shopify catalog. The preview's language buttons switch section copy locally. Product links go to the development storefront and may require its password.

## Install in Shopify

1. Duplicate the Rise theme. In its code editor, add the two files under `sections/` and the CSS and hero image under `assets/` to the corresponding folders.
2. Add **Tsukino group buy** to the homepage in the theme editor. Move it to the top, then hide the superseded homepage hero and featured collection in the duplicate. The section uses the four existing product handles by default. Choose products or change the hero photograph in the section settings if needed.
3. On a product template where it is useful, add **Tsukino tea details** beneath Shopify's product information. If different products need different facts on a shared template, connect settings to each product's metafields where the editor supports dynamic sources, or use separate templates. Enter only verified growing region, harvest, and preparation information. Empty fields do not display.
4. Keep the campaign in preparation until the Taiwan retail partner confirms pricing, the time-zoned deadline, the minimum, delivery timing, and refund terms. To open the campaign, enter those terms and the partner's signup URL in the theme editor and enable **Open Taiwan group buy**. If the checkbox is enabled but a required field is missing, the section stays in preparation. Signup progress is optional and must be kept up to date by the merchant.
5. Preview on mobile and desktop in the store's published languages. English content is available in the Liquid section when English is enabled in Shopify. Set campaign values and translations for each storefront language before opening the campaign.

Use Shopify's native product form for ordinary purchases. If subscription selling plans are added later, add the subscription app's purchase options above the buy buttons on the eligible product template. The Taiwan group-buy signup belongs on the Taiwan retail partner's site.

The hero photograph is an illustrative, generated still life. Use catalog photos for the product itself. No claims about farms, harvests, or grades are supplied by default.

[Shopify theme duplication](https://help.shopify.com/en/manual/online-store/themes/managing-themes/duplicating-themes) · [Shopify sections](https://shopify.dev/docs/storefronts/themes/architecture/sections)
