# Tea and regional food customs registry

The prototype uses Japan as origin for the sample SKUs and records the HS6 classification separately from the destination tariff code. Confirm origin by SKU and source documentation before production.

| Sample SKU | English goods description | HS6 reference | Production check |
| --- | --- | --- | --- |
| `JP-UJI-MATCHA-40G` | Matcha green tea powder, 40 g | 0902.10 candidate | Confirm pure tea powder, retail packing and destination tariff suffix. |
| `JP-SENCHA-80G` | Unfermented sencha green tea leaves, 80 g | 0902.10 candidate | Confirm ingredients, retail packing and destination tariff suffix. |
| `JP-HOJICHA-60G` | Roasted green tea leaves, 60 g | 0902.10 candidate | Confirm processing, ingredients, retail packing and destination tariff suffix. |
| `JP-YUZU-KOSHO-50G` | Yuzu chili condiment, 50 g | Pending | Confirm formulation, labeling, product classification and lane eligibility. Hold for review in the demo. |

HS6 0902.10 covers unfermented green tea in immediate packages of up to 3 kg. Tariff suffixes differ by destination and product characteristics. Classify blends and preparations from their ingredients and processing. Use current destination schedules and broker review before shipping. [USITC tariff search](https://hts.usitc.gov/search?query=0902.10)

## Required SKU data

Store the SKU, English customs description, ingredients/allergens, country of origin, retail package size, gross unit weight, declared currency/value source, and destination-specific classification, status, and evidence. Record the approver, effective date, and source for each release decision. Store FDA-related references and manufacturer data as separate fields.

## U.S. lane checklist

- [ ] Confirm product eligibility, relevant facility registration and U.S. agent requirements, and who serves as importer of record and FSVP importer where applicable.
- [ ] Review the English label, applicable nutrition and ingredient disclosures, allergens, net contents, and origin marking. Check animal-derived ingredients and mixed botanical products separately before enabling the SKU.
- [ ] Assign responsibility for FDA Prior Notice, confirm applicability and filing timing for the shipment mode, and record the confirmation reference when required. Confirm current mode-specific requirements and enforcement dates directly with FDA.
- [ ] Validate the commercial invoice and carrier waybill against approved SKU data, quantities, order values, consignee contact details, and duty terms.
- [ ] Require SKU approval and any shipment-level documentation before the warehouse release. Use mock documentation in sandbox runs.

Official references: [FDA importing food](https://www.fda.gov/importing-food-products-united-states), [FDA Prior Notice](https://www.fda.gov/industry/fda-import-process/prior-notice-imported-foods), [JETRO U.S. tea export guide](https://www.jetro.go.jp/world/n_america/us/foods/exportguide/greentea.html).
