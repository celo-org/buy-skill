---
name: ar-data-agent/argentina
title: Argentine FX, inflation, holidays and CUIT/CBU checks (x402)
description: Argentine data for agents, 0.01 per call. Live USD/ARS quotes (oficial, blue, MEP, CCL, cripto, tarjeta, mayorista), INDEC inflation with an amount adjuster, national holidays and business-day math, and CUIT/CUIL and CBU/CVU validation. Use when a task needs Argentine exchange rates, inflation, holidays or a tax id or bank account check.
category: finance
stage: experimental
aliases: [argentina, ars, dolar, dolar-blue, mep, ccl, inflacion, indec, cpi, feriados, cuit, cbu, cvu]
service_url: https://landingen24h.com/celo/ar/dolar
payment:
  schemes: [exact]
  networks: [celo]
  assets: [USDC, USDT, USAT]
---

# Argentine FX, inflation, holidays and CUIT/CBU checks

> Experimental listing: an early-stage third-party seller. buy has not reviewed it; confirm with the user before paying.

Sold directly by AR Data Agent, not through the buy gateway: the payment goes to the
seller's wallet. Contact: landingen24h@mail.grokbot.com. Machine-readable route list:
`https://landingen24h.com/celo/`.

| route | what it returns | price | query |
|---|---|---|---|
| `GET /celo/ar/dolar` | USD/ARS buy and sell quotes per market | 0.01 | `casa`: `all`, `oficial`, `blue`, `mep`, `ccl`, `cripto`, `tarjeta` or `mayorista` |
| `GET /celo/ar/inflacion` | INDEC CPI, monthly and year on year, cumulative between months | 0.01 | `from`, `to` (`YYYY-MM`), `amount` to adjust, all optional |
| `GET /celo/ar/feriados` | national holidays, business-day math | 0.01 | `year` (`YYYY`), `date` (`YYYY-MM-DD`), `add_business_days` (1 to 60, needs `date`) |
| `GET /celo/ar/cuit` | CUIT/CUIL check digit and entity type | 0.01 | `cuit`, required: 11 digits, dashes optional |
| `GET /celo/ar/cbu` | CBU/CVU check digits and bank | 0.01 | `cbu`, required: 22 digits |

Prices are in USDC, USD₮ or USA₮ on Celo. The 402 also offers wARS (Argentine peso
token), which buy does not pay with; buy picks one of the three dollar tokens.

## Buying it

Quote the exact URL, query string included. `/cuit` and `/cbu` answer `400
cuit_required` (or `cbu_required`) with nothing charged until the identifier is in the
query, so quote them with it.

```text
buy_pay_quote
  url:    https://landingen24h.com/celo/ar/dolar?casa=blue
  method: GET
```

Then `buy_curl` with the same url and `maxAmount` from the quote. From the CLI:

```sh
buy quote 'https://landingen24h.com/celo/ar/dolar?casa=blue'
buy curl --max-amount 0.01 'https://landingen24h.com/celo/ar/dolar?casa=blue'
```

A CUIT identifies a person or a company, and a CBU a bank account. Send only identifiers
the user gave you for this check.

## What comes back

`/dolar`: `currency_pair`, `quotes` (one per market with `compra`, `venta`, `spread` and
`updated_at`) and the `source`. Quotes are ARS per 1 USD. `/cuit`: `valid`, `formatted`,
`entity_type` and the expected check digit. `/cbu`: `valid`, `type` (CBU or CVU), the bank
name and whether each block's check digit passes. A validation result says the number is
well formed; it does not say the account or taxpayer exists.

## Failures

A response with a payment receipt header was paid for, whatever its status. Never retry a
timeout automatically: run `buy receipts --resolve` first.
