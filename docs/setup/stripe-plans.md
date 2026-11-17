# Harbor's own plans in Stripe

Harbor's Stripe account (`acct_1SYYCKPyuUdZfszd`), **live mode**. These are what people pay Harbor; they are not the
businesses' own Stripe accounts. Set up 2026-11-16 to match useharbor.io/pricing. Nothing in Harbor charges them yet:
checkout for Harbor accounts is still to build (it waits on Stripe's identity verification).

| Plan (pricing page) | Stripe product | Monthly price |
|---|---|---|
| Starter, $19/mo, up to 2 brands | Harbor Starter `prod_VdxEp3qeRJJdWO` | `price_1UcfKFPyuUdZfszd8xT21iPV` |
| Builder, $49/mo, up to 6 brands | Harbor Builder `prod_VdxFqzhEMlJG9Y` | `price_1UcfKjPyuUdZfszdrMDD2Zc2` |
| Agency, $149/mo, up to 25 brands | Harbor Agency `prod_TVZoyNMMhvE9DR` | `price_1UcfLNPyuUdZfszde9mAmz6j` |

All USD, billed monthly, tax category "General - Electronically Supplied Services" (`txcd_10000000`).

## Older products in the same account (left as they were)

- **Harbor Agency** also has its older prices: $199/month (still the product's default) and $1,990/year.
- **Harbor Team** ($899 and $1,490/month, annual versions), **Harbor Operator** ($149/month "Operator", $299/month
  "Solo", annual versions) and **Deep Scan Analysis** ($7.99): from earlier pricing. None has subscribers.
