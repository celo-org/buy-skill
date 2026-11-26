---
name: shipbastion/security-audit
title: Web security, email DNS, EVM token risk & Celo gas auditor (x402)
description: Read-only live security, DNS, DeFi, and gas telemetry for developers and agents. Runs live HTTPS/TLS/CSP/secret scans, SPF/DKIM/DMARC audits, EVM token security checks, stablecoin depeg & yield screening, and live Celo/EVM gas estimates. 0.01 to 0.04 per call in USDT, USDC or USAT on Celo.
category: security
stage: experimental
aliases: [security, appsec, vibeshield, dns, spf, dmarc, token-risk, defi, gas, audit]
service_url: https://api.shipbastion.com/v1/celo/web-security
payment:
  schemes: [exact]
  networks: [celo]
  assets: [USDT, USDC, USAT]
---

# ShipBastion Web Security, Email DNS, EVM Token Risk & Gas Auditor

> Experimental listing: an early-stage third-party seller. buy has not reviewed it; confirm with the user before paying.

Sold directly by OmniForge Studio (ShipBastion), not through the buy gateway: the payment goes to the seller's wallet (`0x4Ac77B91D00E4E7707868FfAbeF8a544637FE6b0`). Terms and support: https://api.shipbastion.com/terms. Contact: agentarenastudio@proton.me.

| route | what comes back | price | input |
|---|---|---|---|
| `GET /v1/celo/web-security` | Live HTTPS/TLS, CSP, HSTS, CORS, cookie, and exposed client-secret audit (0-100 score, grade, findings) | 0.04 USDT, USDC or USAT | `url` query parameter (public `https://` URL) |
| `GET /v1/celo/email-dns` | Live SPF, DKIM, DMARC, MX, CAA, and RDAP DNS security posture audit | 0.02 USDT, USDC or USAT | `domain` query parameter (e.g. `stripe.com`) |
| `GET /v1/celo/token-security` | Read-only EVM token contract security, proxy/owner permissions, honeypot & tax check | 0.02 USDT, USDC or USAT | `address` (0x contract) and optional `chain` (`base`, `ethereum`, `arbitrum`, `optimism`, `polygon`, `bsc`, `xlayer`) |
| `GET /v1/celo/defi-risk` | Live basis-point stablecoin depeg monitor and TVL/APY risk-filtered DeFi yield pool screening | 0.02 USDT, USDC or USAT | optional `chain` and `minTvlUsd` query parameters |
| `GET /v1/celo/gas-estimator` | Live EIP-1559 gas oracle and USD transfer cost estimate with live block numbers | 0.01 USDT, USDC or USAT | optional `chain` (`celo`, `ethereum`, `base`, `arbitrum`, `optimism`, `polygon`, `xlayer`; default `celo`) and `gasLimit` |

All routes perform strictly read-only public HTTPS, DNS/RDAP, or public EVM JSON-RPC inspections and never request private keys or execute transactions. Outputs are automated informational diagnostics, not a formal human security audit or financial advice; confirm the target URL, domain, or contract address with the user before paying.

Data from: direct live HTTPS/TLS/DNS/RDAP probes and public EVM JSON-RPC reads (including `forno.celo.org`) computed directly by the seller's server, plus public DeFi/market reference feeds (DeFiLlama, GoPlus, and OKX public market ticker) queried under public read-only terms.

## Buying it

Quote the exact request first (signs nothing and pays nothing):

```text
buy_pay_quote
  url:    https://api.shipbastion.com/v1/celo/web-security?url=https://stripe.com
  method: GET
```

From the CLI:

```sh
buy quote 'https://api.shipbastion.com/v1/celo/web-security?url=https://stripe.com'
buy curl --max-amount 0.04 'https://api.shipbastion.com/v1/celo/web-security?url=https://stripe.com'

buy quote 'https://api.shipbastion.com/v1/celo/gas-estimator?chain=celo'
buy curl --max-amount 0.01 'https://api.shipbastion.com/v1/celo/gas-estimator?chain=celo'
```

## Failures

Input validation and SSRF checks execute before payment verification and on-chain settlement, so malformed or private-network URLs return HTTP `400` with `{"ok":false,"settled":false}` and zero charge. A response carrying a payment receipt header (`PAYMENT-RESPONSE`) was paid for regardless of HTTP status. Never retry a timed-out paid call blindly: run `buy receipts --resolve` first. For any confirmed paid 5xx error, email `agentarenastudio@proton.me` with your Celo settlement transaction hash and timestamp for verification and resolution.
