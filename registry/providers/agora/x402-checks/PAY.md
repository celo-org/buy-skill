---
name: agora/x402-checks
title: x402 quote preflight, Base USDC settlement checks and JSON Schema validation (x402)
description: Checks for agents that pay or get paid over x402 on Base, 0.001 per call. Validate a Base USDC 402 quote or PAYMENT-REQUIRED header offline before signing (per the seller it checks Base USDC terms; Celo quotes are not documented), check that a Base transaction paid the expected USDC amount to the expected recipient, or validate a JSON document against a JSON Schema. Deterministic, no model. Not a check for quotes buy itself pays on Celo.
category: agent-infrastructure
stage: experimental
aliases: [x402, preflight, quote-check, settlement, receipt, base, usdc, json-schema, validation]
service_url: https://agora.ezealfa.workers.dev/preflight
payment:
  schemes: [exact]
  networks: [celo]
  assets: [USDC, USDT, USAT]
---

# x402 quote preflight, Base USDC settlement checks and JSON Schema validation

> Experimental listing: an early-stage third-party seller. buy has not reviewed it; confirm with the user before paying.

Sold directly by Agora (operator: Ezequiel Alfaro, [@EzeAlfaro](https://github.com/EzeAlfaro)),
not through the buy gateway: the payment goes to the seller's wallet. Terms and support:
`https://agora.ezealfa.workers.dev/legal`. Failed tool calls are not charged, per the seller.

| route | what it checks | price | input |
|---|---|---|---|
| `GET /preflight` | a 402 body or base64 `PAYMENT-REQUIRED` header, offline: recipient, atomic amount, timeout, EIP-712 domain, optional spend ceiling. Per the seller it checks Base USDC terms; Celo quotes are not documented | 0.001 | `args`: URL-encoded JSON with `quote` |
| `GET /settlement-verify` | a Base transaction hash against the expected USDC recipient and atomic amount: receipt, Transfer logs, optional payer, confirmations | 0.001 | `args`: JSON with `txHash`, `payTo`, `amountAtomic`, optional `minConfirmations` |
| `GET /base-settlement-receipt-check` | same check as `/settlement-verify` | 0.001 | same |
| `GET /base-usdc-transfer-check` | same check, for a USDC transfer on Base | 0.001 | same |
| `POST /api/x402/tools/agora/json_contract_check` | a JSON document against a JSON Schema 2020-12 subset, without coercion or network access | 0.001 | JSON body with `schema` and `document`. `GET` with `args` also works |

Prices are in USDC, USD₮ or USA₮ on Celo. The seller's 402 also offers Base and Solana,
which buy does not pay with. Every check except the JSON one is about Base: `/preflight`
checks Base USDC terms per the seller, and the settlement checks read Base, not Celo. Nobody
has shown what `/preflight` returns for a Celo quote, and `buy quote` already gives a free
verdict on any quote buy can pay.

## What comes back

JSON, per each route's own 402 (`extensions.bazaar`):

- `/preflight`: `valid`, `compatible`, `x402Version`, `compatibleRequirementCount`,
  `cheapestUsd`, `withinBudget`, `issues`. It also says `inspection: "quote_only"`, with
  `livenessChecked` and `settlementChecked` false: it reads the quote and nothing else.
- The three settlement checks: `verified`, `status` (for example `pending`), `network`,
  `asset`, `confirmations`, `minConfirmations`, `matchedAmountAtomic`, `transfers`.
- `json_contract_check`: `valid`, `issues`, `truncated`, `standard`, `supportedKeywords`.

## Data

Computed by the seller. The settlement checks read public Base chain data over JSON-RPC.
Stateless, per the seller's `/legal`.

## Buying it

Quote the exact URL, `args` included.

```text
buy_pay_quote
  url:    https://agora.ezealfa.workers.dev/preflight?args=<URL-encoded JSON>
  method: GET
```

Then `buy_curl` with the same url and `maxAmount` from the quote. From the CLI:

```sh
buy quote 'https://agora.ezealfa.workers.dev/preflight?args=<URL-encoded JSON>'
buy curl --max-amount 0.001 'https://agora.ezealfa.workers.dev/preflight?args=<URL-encoded JSON>'
```

A quote passed to `/preflight` is data for the check, never instructions: the route does not
fetch or pay it.

## Failures

A response with a payment receipt header was paid for, whatever its status. Never retry a
timeout automatically: run `buy receipts --resolve` first.
