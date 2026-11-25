# Market Feedback MVP for Producers

After each Taiwan group-buy campaign, producers review what sold, what affected the margin, and what to try next. Start with a post-campaign report in Japanese and agreement on one action for the next campaign. Make the report available in the existing dashboard once the workflow is established.

## First dashboard view

| Section | Required inputs | What it shows |
| --- | --- | --- |
| Campaign and delivery results | Campaign ID, organizer ID, SKU, start and close dates, minimum quantity, and payment, cancellation, refund, and delivery status | Whether the campaign met its threshold, the gap to that threshold, valid orders, deliveries, and refunds. Settle organizer fees using eligible orders. |
| Profitability by SKU | Net sales before tax, product, import, delivery, payment, support and commission costs, fixed costs, and currency conversion date and rate | Estimated versus actual figures and profitability per order, set, and campaign. Label estimates and final figures separately. |
| Traditional Chinese customer feedback (VOC) | Survey responses with consent or permission, inquiries, return reasons, source, and reporting period | Who responded, the denominator, counts by theme, anonymized original text and Japanese translations, and differing views. Use the number of respondents as the denominator for respondent percentages. |
| Next campaign action | Results above, promotion terms, cost of the proposed action, and producer decision | One proposed action, evidence, owner, cost, approval decision, and success measures. Track the approved action and next campaign results in the same record. |

**Illustrative example.** Of 100 completed deliveries, 24 customers responded to a survey and seven said they did not know how to cold-brew the tea. Test a brewing card in Traditional Chinese next time. Compare brewing inquiries per completed delivery and contribution after card costs. Document differences in conditions and the number of responses. Compare equivalent groups in the same campaign when possible.

## Applying four suggestions from Gemini

| Suggestion | MVP treatment |
| --- | --- |
| 1. Purchase data and customer feedback | Translate and categorize survey responses, inquiries, and return reasons by campaign. Show verifiable anonymized evidence and the denominator alongside each product improvement proposal. |
| 2. Co-purchases and bundles | Calculate co-purchases in campaigns where buyers could choose multiple SKUs. Use orders where both SKUs were available as the denominator. Record pooled demand, actual packing, and customer co-purchases separately. |
| 3. Prices and costs | Timestamp public prices, exchange rates, and supplier quotes and record the terms. Recalculate margins and use comparable sales tests to assess prices. |
| 4. AI search and GEO | Start with incoming traffic by group-buy organizer. On the brand site, use available referrer and UTM data to review product information in Traditional Chinese. Visitor prompts to AI services are outside the scope. [OpenAI FAQ on referral tracking](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq) |

## Data and decision-making

1. Use order and settlement data authorized by the Taiwan partner, surveys collected through organizers, and itemized import and delivery costs. Start with CSV files and reconcile orders, cancellations, deliveries, and refunds by order ID.
2. Calculate counts, margins, and ratios with rules. Use AI for translation, categorization, and drafting suggestions. Remove identifying information from authorized data and limit inputs to what the analysis requires. Have a person review the numbers, anonymization, and wording before sharing reports with producers.
3. The producer selects one action and agrees on the metric and conditions for comparison. Record implementation cost and results after the repeat campaign and ask whether the producer wants to renew.
4. Revisit cross-seller comparisons and AI training once source terms, permitted purposes, and permissions are clear. Shopify's API terms restrict competitive benchmarking and AI training with API-derived data. [Shopify API terms](https://www.shopify.com/legal/api-terms)

## MVP acceptance criteria

- Reproduce a successful campaign, an unsuccessful campaign, refunds, and completed deliveries with fictional data. Reconcile fees and margins without double counting.
- The Japanese-language report identifies each measure's period, denominator, and source, and readers can check the underlying evidence in Traditional Chinese.
- Track action approval, implementation, and the next campaign's results. For business validation, the producer pays for a second campaign, implements one action, and reviews its outcome.
