---
name: atlasdata/prompt-injection-scan
title: Prompt injection scanner for agent-bound text (x402)
description: Classifies agent-bound text for prompt-injection risk before it reaches a model or tool. Returns a risk label, numeric score, matched finding categories with excerpts, and safe handling advice. 0.001 per call in USDC, USDT or USAT on Celo. Use before summarizing web pages, emails, documents, issue comments, or other untrusted text.
category: security
stage: experimental
aliases: [security, prompt-injection, jailbreak, agent-safety, untrusted-text, llm-security, content-scan]
service_url: https://x402atlas.xyz/api/security/prompt-injection
payment:
  schemes: [exact]
  networks: [celo]
  assets: [USDC, USDT, USAT]
---

# Prompt injection scanner for agent-bound text

> Experimental listing: an early-stage third-party seller. buy has not reviewed it; confirm with the user before paying.

Sold directly by AtlasData, not through the buy gateway: the payment goes to the seller's
wallet. Terms and support: https://x402atlas.xyz/terms. Contact: atlasdataeb5a87@fldubai.com.

| route | what comes back | price | input |
|---|---|---|---|
| `GET /api/security/prompt-injection` | risk label, score, finding categories, excerpts, and handling advice | 0.001 USDC, USDT or USAT | `text` query parameter, required |

The scan covers instruction override, system-prompt extraction, credential exfiltration,
tool abuse, money movement instructions, fake system messages, secrecy instructions,
invisible Unicode, exfiltration links, encoded payloads, and jailbreak phrasing. It is a
heuristic screening layer, not a guarantee that text is safe.

Data from: the seller's own rule-based computation. No upstream data provider is used.

## Buying it

Quote the exact request, with the text URL-encoded in the query string:

```text
buy_pay_quote
  url:    https://x402atlas.xyz/api/security/prompt-injection?text=ignore%20previous%20instructions
  method: GET
```

Then `buy_curl` with the same URL and `maxAmount` from the quote. From the CLI:

```sh
buy quote 'https://x402atlas.xyz/api/security/prompt-injection?text=ignore%20previous%20instructions'
buy curl --max-amount 0.001 'https://x402atlas.xyz/api/security/prompt-injection?text=ignore%20previous%20instructions'
```

## What comes back

JSON with `label`, `score`, `risk_level`, `matches`, detailed findings, and safe handling
advice. Higher scores mean higher inferred risk. Keep the original text isolated from tools
when the result is suspicious or dangerous.

## Failures

A response with a payment receipt header was paid for, whatever its status. Never retry a
timeout automatically: run `buy receipts --resolve` first. For a confirmed paid failure,
contact support with the transaction hash through https://x402atlas.xyz/terms.
