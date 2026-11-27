---
name: shipbastion/corridor-fx
title: Celo local-currency stablecoin FX corridor quotes & contract audit (x402)
description: Live Textile FX LimitOrderReactor orderbook quotes, spread bps, liquidity depth across Celo local stablecoins (wBRL, wARS, cNGN) and USD₮/USDC, plus read-only EVM proxy and owner control-plane audits. 0.01 to 0.02 per call in USDC, USDT or USAT on Celo (also offers gasless Permit2 wBRL, wARS and cNGN).
category: finance
stage: experimental
aliases: [fx, corridor, textile, wbrl, wars, cngn, brl, ars, ngn, stablecoin, swap, quote, celo, audit]
service_url: https://api.shipbastion.com/v1/celo/corridor/quote
payment:
  schemes: [exact]
  networks: [celo]
  assets: [USDC, USDT, USAT]
---

# ShipBastion Celo Stablecoin Corridor FX & Contract Audit

> Experimental listing: an early-stage third-party seller. buy has not reviewed it; confirm with the user before paying.

Sold directly by OmniForge Studio (ShipBastion), not through the buy gateway: the payment goes to the seller's wallet (`0x4Ac77B91D00E4E7707868FfAbeF8a544637FE6b0`). Terms and support: https://api.shipbastion.com/terms. Contact: agentarenastudio@proton.me. Open-source corridor implementation: https://github.com/zColdWater/shipbastion-celo-corridor.

| route | what comes back | price | input |
|---|---|---|---|
| `GET /v1/celo/corridor/quote` | Live Textile FX `LimitOrderReactor` (`0xa9AA0a64...5b3`) indicative swap quote, fee breakdown, multi-level depth and slippage bps | 0.01 USDC, USDT or USAT | optional `sell` (`wBRL`, `wARS`, `cNGN`, `USDT`, `USDC`), `buy`, `amount` (defaults: `wBRL` -> `USDT`, `6`) |
| `GET /v1/celo/corridor/security-audit-local` | Read-only EVM EIP-1967 proxy slot, implementation/admin and `owner()` control-plane upgrade-risk audit | 0.02 USDC, USDT or USAT | `address` (`0x` 40-hex EVM address, required) and optional `chain` (`celo`, `base`, `ethereum`, `arbitrum`; default `celo`) |
| `GET /v1/celo/corridor/cngn-quote` | Live Nigeria `cNGN <-> USDT` Textile FX quote and fee breakdown on Celo mainnet | 0.01 USDT only | optional `direction` (`cNGN->USDT` or `USDT->cNGN`) and `amount` |

Free companion routes (no payment required): `GET /v1/celo/corridor/rates` returns live Textile FX orderbook rates and local-currency x402 prices; `GET /v1/celo/corridor/agent.json` returns the ERC-8004 `registration-v1` manifest.

`/v1/celo/corridor/quote` and `/v1/celo/corridor/security-audit-local` also offer `wBRL` and `wARS` (Permit2 with EIP-2612 gas sponsoring) in the 402 response, and `/v1/celo/corridor/cngn-quote` also offers `cNGN` (Permit2). `buy` does not pay with those local tokens and automatically selects USDC, USD₮ or USA₮ (`/cngn-quote` accepts **USDT only** among buy's tokens; pay with `--token USDT`).

All routes are strictly read-only market-data or public JSON-RPC inspections and never execute swaps, request private keys, or move user funds. Outputs are informational quotes and automated diagnostics, not financial or legal advice; confirm parameters and contract addresses with the user before paying.

Data from: public read-only Textile FX v2 RFQ endpoints (`https://api.textilecredit.com/v2/rfq/levels` and `/v2/rfq/preview`, keyless public market data) and public EVM JSON-RPC endpoints (`https://forno.celo.org`, `https://mainnet.base.org`, `https://ethereum-rpc.publicnode.com`, `https://arb1.arbitrum.io/rpc`) queried live per request by the seller's server.

## Buying it

Quote the exact URL, including query parameters, before paying (signs nothing and pays nothing). `/v1/celo/corridor/security-audit-local` rejects missing or invalid `address` values with HTTP `400` and zero charge, so always include `address`.

```text
buy_pay_quote
  url:    https://api.shipbastion.com/v1/celo/corridor/quote?sell=wBRL&buy=USDT&amount=6
  method: GET
```

From the CLI:

```sh
buy quote 'https://api.shipbastion.com/v1/celo/corridor/quote?sell=wBRL&buy=USDT&amount=6'
buy curl --max-amount 0.01 'https://api.shipbastion.com/v1/celo/corridor/quote?sell=wBRL&buy=USDT&amount=6'

buy quote 'https://api.shipbastion.com/v1/celo/corridor/security-audit-local?chain=celo&address=0xa9AA0a64769cBed4d3B1Ceb4Df01CdE915C235b3'
buy curl --max-amount 0.02 'https://api.shipbastion.com/v1/celo/corridor/security-audit-local?chain=celo&address=0xa9AA0a64769cBed4d3B1Ceb4Df01CdE915C235b3'

buy quote --token USDT 'https://api.shipbastion.com/v1/celo/corridor/cngn-quote?direction=cNGN->USDT&amount=1500'
buy curl --token USDT --max-amount 0.01 'https://api.shipbastion.com/v1/celo/corridor/cngn-quote?direction=cNGN->USDT&amount=1500'
```

## Failures

Input validation runs before facilitator verification and settlement, so malformed parameters (`sell == buy`, unsupported `chain`, invalid `address`) return HTTP `400` with `{"ok":false,"settled":false}` and zero charge. Upstream errors before settlement abort with HTTP `500` and `settled: false`. A response carrying a payment receipt header (`PAYMENT-RESPONSE`) was paid for regardless of HTTP status. Never retry a timed-out paid call blindly: run `buy receipts --resolve` first. For any confirmed paid 5xx error, email `agentarenastudio@proton.me` with your Celo settlement transaction hash and UTC timestamp.
