---
name: txguard/web3-security-oracle
title: EVM, Celo and Solana token risk, calldata and EIP-712 security checks (x402)
description: Pre-transaction security checks for agents, 0.01 USD per call on Celo. Live Base, Celo and Solana token honeypot, proxy, mint/freeze authority and DEX liquidity scan (/api/v1/scan-token-risk), raw EVM calldata decoder and approval/MEV risk audit (/api/v1/audit-calldata), EIP-712 typed-data signature audit (/api/v1/audit-eip712), and 8-chain wallet checksum/curve validation (/api/v1/validate-address).
category: finance
stage: experimental
aliases: [security, rug-check, honeypot, token-scan, calldata, eip-712, permit2, address-validation, celo, base, solana, defi]
service_url: https://x402-web3-fin-gateway.vercel.app/api/v1/scan-token-risk
payment:
  schemes: [exact]
  networks: [celo]
  assets: [USDC, USDT]
---

# EVM, Celo and Solana token risk, calldata and EIP-712 security checks

> Experimental listing: an early-stage third-party seller. buy has not reviewed it; confirm with the user before paying.

Sold directly by Shulang Chen ([@2848823170](https://github.com/2848823170)), not through
the buy gateway: the payment goes to the seller's wallet. Terms and support:
`https://x402-web3-fin-gateway.vercel.app/terms`. Contact: `chenshulang0223@gmail.com`.
Machine-readable route list and OpenAPI spec, free:
`https://x402-web3-fin-gateway.vercel.app/api/catalog`.

| route | what comes back | price | input |
|---|---|---|---|
| `GET` or `POST /api/v1/scan-token-risk` | live token honeypot, proxy, mint/freeze authority and DEX reserve scan | 0.01 USDC or USD₮ | `tokenAddress` (`0x...` or Solana Base58), optional `chain` (`auto`, `celo`, `base` or `solana`) |
| `GET` or `POST /api/v1/validate-address` | checksum, curve and network check across EVM, Celo, Solana, Bitcoin, Tron, TON, XRPL, Cosmos and Stacks | 0.01 USDC or USD₮ | `address`, optional `chain` and `expectedNetwork` |
| `GET` or `POST /api/v1/audit-calldata` | decoded EVM selector, recursive Multicall/Safe inner calls, unlimited approval and zero-minOut flags | 0.01 USDC or USD₮ | `data` (`0x...`), optional `to`, `value`, `chainId` and `sender` |
| `POST /api/v1/audit-eip712` | EIP-712 Permit, Permit2 and Seaport typed-data domain, spender and expiry risk audit | 0.01 USDC or USD₮ | JSON body with `typedData` (`domain`, `types`, `primaryType`, `message`) |

All routes accept **USDC** and **USD₮ (`USDT`)** on Celo (and USDC on Base). Every paid
route validates its arguments before calling the facilitator's `/settle`: a missing or
malformed parameter answers `400` with `settled: false` and nothing is charged. Free fixed
sample outputs are at `GET /api/v1/<route>/sample`.

Data from: our own open-source static and cryptographic analysis engine
([`2848823170/x402-web3-fin-gateway`](https://github.com/2848823170/x402-web3-fin-gateway),
MIT) plus public permissionless JSON-RPC state on Celo (`42220`), Base (`8453`) and Solana
mainnet. Request bodies are evaluated in memory and not stored.

## Automated risk signals, not financial advice

Outputs are technical bytecode, liquidity and calldata signals for software and agent
workflows, not investment or legal advice. A low risk score does not guarantee a token is
safe to buy: confirm the price and any downstream trade or approval with the user first.

## Buying it

Quote the exact route you plan to call. Both `GET` query parameters and `POST` JSON bodies
are accepted on `scan-token-risk`, `validate-address` and `audit-calldata`.

```text
buy_pay_quote
  url:    https://x402-web3-fin-gateway.vercel.app/api/v1/scan-token-risk?tokenAddress=0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A&chain=celo
  method: GET
```

Then `buy_curl` with the same URL and `maxAmount` from the quote (pass `token: "USDT"` or
`--token USDT` to pay in USD₮ instead of USDC). From the CLI:

```sh
buy quote 'https://x402-web3-fin-gateway.vercel.app/api/v1/scan-token-risk?tokenAddress=0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A&chain=celo'
buy curl --max-amount 0.01 'https://x402-web3-fin-gateway.vercel.app/api/v1/scan-token-risk?tokenAddress=0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A&chain=celo'
```

Or with `POST` JSON:

```sh
buy curl --max-amount 0.01 -X POST -H 'content-type: application/json' \
  -d '{"to":"0xcebA9300f2b948710d2653dD7B07f33A8B32118C","data":"0x095ea7b30000000000000000000000001111111254eeb25477b68fb85ed929f73a960582ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","chainId":42220}' \
  'https://x402-web3-fin-gateway.vercel.app/api/v1/audit-calldata'
```

## What comes back

`scan-token-risk`: `summary` (`chain`, `tokenAddress`, `symbol`, `safeToTrade`,
`recommendation`, `riskLevel`, `riskScore`, `findingCount`, `latencyMs`), `scan` (`token`
metadata, `bytecodeFlags`, `liquidity` pool reserves and live `transfer()` simulation, or
Solana `holderConcentration`, plus `findings`), and `payment` (`transaction`, `network`,
`asset`, `amountAtomic`). `audit-calldata` and `audit-eip712` return `summary` and `audit`
with decoded parameters and severity-ranked findings; `validate-address` returns `summary`
and `analysis` with the canonical normalized address.

## Failures

A response with a payment receipt header (`PAYMENT-RESPONSE` or `X-PAYMENT-RESPONSE`) was
paid for, whatever its status. Never retry a timeout or `5xx` automatically: run
`buy receipts --resolve` first, and contact `chenshulang0223@gmail.com` with the settlement
transaction hash if a paid call failed to deliver its response.
