---
name: naira-rates/usd-ngn
title: Live USD/NGN rates, official and street (x402)
description: Live US dollar to Nigerian naira rates. The official rate, the street rate from crypto P2P markets (Quidax and Luno USD₮/NGN), the spread between them and a one-line summary, plus conversion of an amount at either rate. Cached 60 seconds. Use for a current, real-world naira price for payments, invoices, remittances or pricing in Nigeria.
category: finance
stage: experimental
aliases: [fx, exchange-rate, naira, ngn, usd-ngn, nigeria, parallel-market, black-market-rate, currency, convert]
service_url: https://naira-rate-api.onrender.com/v1/rates
payment:
  schemes: [exact]
  networks: [celo]
  assets: [USAT]
---

# Live USD/NGN rates

> Experimental listing: an early-stage third-party seller. buy has not reviewed it; confirm with the user before paying.

Sold directly by its operator, not through the buy gateway: the payment goes to the
seller's wallet. Contact: [@Emzy123](https://github.com/Emzy123) on GitHub.

| route | price | input |
|---|---|---|
| `GET /v1/rates` | 0.01 USA₮ | none |
| `GET /v1/convert` | 0.003 USA₮ | `amount` (> 0), `from` (`USD` or `NGN`), `basis` (`official` or `street`, default `official`) |

Both routes accept **USA₮ only**. A wallet that holds USDC or USD₮ cannot pay them; pay
with `token: "USAT"` (MCP) or `--token USAT` (CLI).

## Buying it

```text
buy_pay_quote
  url:    https://naira-rate-api.onrender.com/v1/convert?amount=100&from=USD&basis=street
  method: GET
```

Then `buy_curl` with the same url, `token: "USAT"` and `maxAmount` from the quote. From the
CLI:

```sh
buy quote --token USAT 'https://naira-rate-api.onrender.com/v1/rates'
buy curl --token USAT --max-amount 0.01 'https://naira-rate-api.onrender.com/v1/rates'
```

The service runs on an instance that sleeps when idle, so the first request after a quiet
period can take 20 seconds or more. Allow for it: a slow first quote is not an outage.

## What comes back

`/v1/rates`: `pair`, `official` (`source`, `mid`), `street` (one entry per market with
`bid`, `ask`, `mid`), `streetMid`, `spreadPct` and `summary`. `/v1/convert`: `amount`,
`from`, `to`, `basis`, the `rate` used and the `result`. Rates are cached for 60 seconds, so
two calls a few seconds apart return the same numbers.

## Failures

A response with a payment receipt header was paid for, whatever its status. Never retry a
timeout automatically: run `buy receipts --resolve` first.
