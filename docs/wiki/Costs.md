# Costs

Model discovery can include optional pricing in `RouterModel.costs`. Prices are represented by the reusable `RouterCost` object:

```ts
import type { RouterCost, RouterModelCosts, RouterModel } from "@productivehub/router";

const inputRate: RouterCost = { currency: "USD", amount: 250 };

// Hypothetical example rates, not prices for an actual provider.
const costs: RouterModelCosts = {
  inputPerMillionTokens: inputRate,
  outputPerMillionTokens: { currency: "USD", amount: 1000 },
  cachedInputPerMillionTokens: { currency: "USD", amount: 25 },
  cacheWritePerMillionTokens: { currency: "USD", amount: 300 },
  perRequest: { currency: "USD", amount: 0 },
};

const model: RouterModel = {
  id: "example-model",
  costs,
  raw: { id: "example-model" },
};
```

## Currency and amount

`currency` is an ISO 4217 currency code. `amount` is defined as a non-negative integer in that currency's smallest denomination. For USD, `amount: 250` represents 250 cents, or USD 2.50. Amounts are not major-unit floating-point prices.

The TypeScript contract uses `string` and `number`; it does not perform runtime validation or currency conversion. Provider integrations must supply valid currency codes and amounts in the stated units.

## Rate fields

| Field | Billing basis |
| --- | --- |
| `inputPerMillionTokens` | 1,000,000 input tokens |
| `outputPerMillionTokens` | 1,000,000 output tokens |
| `cachedInputPerMillionTokens` | 1,000,000 cached input/read tokens |
| `cacheWritePerMillionTokens` | 1,000,000 cache-write tokens |
| `perRequest` | A separate fee for one request |

Each field is an optional `RouterCost`; each object includes its own currency. Omit unknown rates, or omit `costs` entirely if no rates are available. An explicit `amount: 0` means free for that billing category.

Built-in adapters currently omit costs because their model-list mappings do not receive these rates. The router does not maintain a hardcoded price catalog or fetch pricing separately. Custom providers can populate costs when their upstream response or integration supplies known rates.

This contract describes model rates. It does not calculate or report the actual charge for a completion. Prices that depend on context size, service tier, cache lifetime, or other conditions should retain those details in `model.raw`; this flat rate object does not describe pricing tiers.
