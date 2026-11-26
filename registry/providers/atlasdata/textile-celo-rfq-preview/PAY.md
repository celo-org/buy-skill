---
name: atlasdata/textile-celo-rfq-preview
title: Celo stablecoin corridor RFQ preview (x402)
description: Returns machine-readable indicative Textile FX RFQ preview data for stablecoin corridors on Celo mainnet. Converts agent-friendly token symbols and decimal amounts to atomic RFQ inputs, then returns normalized rate, fee, taker payment, available sell liquidity, corridor metadata, and upstream status. 0.005 per call in USDC, USDT or USAT on Celo. Use for corridor discovery, sizing checks, and pre-trade analytics. Preview data is indicative, not a firm executable quote.
category: data
stage: experimental
aliases: [fx, stablecoin, corridor, celo, rfq, quote, textile, payments, remittance, currency]
service_url: https://x402atlas.xyz/api/fx/textile-quote
payment:
  schemes: [exact]
  networks: [celo]
  assets: [USDC, USDT, USAT]
---

# Celo stablecoin corridor RFQ preview

> Experimental listing: an early-stage third-party seller. buy has not reviewed it; confirm with the user before paying.

Sold directly by AtlasData, not through the buy gateway: the payment goes to the seller's
wallet. Terms and support: https://x402atlas.xyz/terms. Contact: atlasdataeb5a87@fldubai.com.

| route | what comes back | price | input |
|---|---|---|---|
| `GET /api/fx/textile-quote` | indicative RFQ status, sell and buy amounts, fee, taker payment, rate, available sell liquidity, token metadata, and upstream status | 0.005 USDC, USDT or USAT | `sell_token`, `buy_token`, and either decimal `amount` or atomic `sell_amount` / `buy_amount` query parameters |

Supported Celo token symbols include USDC, USDT, USAT, CELO, WETH, cNGN, wARS, wBRL,
wCOP, wMXN, COPM, IDRX, VGBP, VCHF, and G$. The service validates symbols, converts decimal
amounts to atomic units using the correct token decimals, calls the upstream Textile FX v2
preview endpoint, and normalizes the result for agents.

Data from: the public Textile FX v2 RFQ preview API, clearly attributed in the response as
`Textile FX RFQ preview`. AtlasData adds the x402 payment boundary, agent-friendly symbol and
decimal conversion, validation, normalization, metadata, and error handling. The response is
an indicative preview only. It is not a firm executable quote and does not itself move money.

## Buying it

Quote the exact request, with query parameters URL-encoded:

```text
buy_pay_quote
  url:    https://x402atlas.xyz/api/fx/textile-quote?sell_token=USDC&buy_token=USDT&amount=1
  method: GET
```

Then `buy_curl` with the same URL and `maxAmount` from the quote. From the CLI:

```sh
buy quote 'https://x402atlas.xyz/api/fx/textile-quote?sell_token=USDC&buy_token=USDT&amount=1'
buy curl --max-amount 0.005 'https://x402atlas.xyz/api/fx/textile-quote?sell_token=USDC&buy_token=USDT&amount=1'
```

## What comes back

JSON with `status`, `sellAmount`, `buyAmount`, `feeAmount`, `takerPays`, `rateRay`,
`availableSellAmount`, decimal-normalized copies of amount fields, token addresses and decimals,
`corridor`, `upstreamStatus`, and source attribution. `no_quote` means the upstream preview did
not have usable indicative liquidity for that request.

## Failures

A response with a payment receipt header was paid for, whatever its status. Never retry a
timeout automatically: run `buy receipts --resolve` first. For a confirmed paid failure,
contact support with the transaction hash through https://x402atlas.xyz/terms.
