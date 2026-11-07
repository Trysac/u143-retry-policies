# Project record: retry-policies

## Objective

Provide composable retry policies for TypeScript: constant, exponential, full-jitter and decorrelated-jitter backoff, caps, deadlines, retry predicates and AbortSignal for developers needing exact, testable retry behavior.

## Scope

In scope:

- The public API documented in the README.

Out of scope:

- Circuit breakers.
- Retry-After header parsing.
- Per-attempt timeouts.
- Rate limiting.

## Timeline

| Date | Milestone |
|---|---|
| 2026 | Repository created from the factory utility template. |

## Effort metrics

| Metric | Value | Source |
|---|---|---|
| Tokens (input / output) | 406587 / 24276 | factory ledger |
| Hours (human) | pending measurement | time log |
| Cost (USD) | 0.0930 | factory ledger |

## Factory run u143 (measured from API usage)

| Phase | Model | Batch | Input | Output | Cache write | Cache read | Cost (USD) |
|---|---|---|---|---|---|---|---|
| generation | gemini-3.8-flash | yes | 4135 | 393 | 0 | 0 | 0.0023 |
| generation | gemini-3.8-flash | yes | 4135 | 10550 | 0 | 0 | 0.0213 |
| generation | gemini-3.8-flash | yes | 4169 | 9788 | 0 | 0 | 0.0199 |
| fix-1 | gemini-3.1-flash-lite | no | 34867 | 362 | 0 | 59002 | 0.0107 |
| fix-2 | gemini-3.1-flash-lite | no | 49695 | 1120 | 0 | 109409 | 0.0168 |
| fix-3 | gemini-3.1-flash-lite | no | 29244 | 759 | 0 | 67267 | 0.0101 |
| audit | gemini-3.1-flash-lite | no | 26372 | 105 | 0 | 6107 | 0.0069 |
| docs | gemini-3.1-flash-lite | no | 12185 | 1199 | 0 | 0 | 0.0048 |

Total: $0.0930. Prices: Anthropic list prices.
