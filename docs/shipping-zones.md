# Shipping zones and parcel rates

Use Shopify Markets for checkout currency, shipping profiles, service levels, and approved duty treatment. OPENLOGI publicly describes international carrier routing and commercial invoice preparation. Confirm lane, food eligibility, API/SKU fields, consolidation, hold, and tracking behavior for the account and warehouse used. [OPENLOGI overseas shipping](https://service.openlogi.com/openlogi_mag/how-to-use/) · [Shopify duties at checkout](https://help.shopify.com/en/manual/international/duties-and-import-taxes/charging-duties)

| Market | Checkout currency | Standard demo carrier | Express demo carrier | Rollout |
| --- | --- | --- | --- | --- |
| United States | USD | EMS | DHL Express | First sandbox lane |
| Taiwan | TWD | EMS | DHL Express | Verify carrier and food import requirements |
| Singapore | SGD | EMS | FedEx | Verify carrier and food import requirements |
| United Kingdom | GBP | EMS | DHL Express | Verify carrier, VAT handling and food import requirements |

Routing labels are placeholders. Release a DDP shipment only once checkout, warehouse integration, carrier service, and customs documentation agree on DDP. Use DAP where approved for the lane. Carrier availability and service terms can vary.

## Prototype rate table

The UI compares mocked warehouse freight for individual parcels versus consolidation. Values below are in JPY and exclude handling, duty, tax, brokerage, surcharges, and packaging cost. Set checkout prices separately in the relevant currencies.

| Market | Standard ≤500 g | Standard ≤1,000 g | Standard ≤2,000 g | Express ≤500 g | Express ≤1,000 g | Express ≤2,000 g |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| US | 2,450 | 3,150 | 4,250 | 3,950 | 4,800 | 6,300 |
| TW | 1,450 | 1,950 | 2,650 | 2,550 | 3,200 | 4,250 |
| SG | 1,650 | 2,100 | 2,900 | 2,850 | 3,500 | 4,650 |
| GB | 2,750 | 3,600 | 4,950 | 4,350 | 5,250 | 6,900 |

The model sums SKU gross unit weights, then adds **200 g once per parcel**. A parcel exceeding 2,000 g requires manual rate review. Replace mock rates with a versioned carrier quote based on zone, service, actual and dimensional chargeable weight, surcharges, and contract terms. Reconcile billed freight back to shipment and order lines. Estimate consolidation savings as the sum of estimated separate parcel rates less the combined rate.
