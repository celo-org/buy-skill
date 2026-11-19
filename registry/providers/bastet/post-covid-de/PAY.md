---
name: bastet/post-covid-de
title: Post-COVID and ME/CFS under German disability law, written evaluation (x402)
description: A written, non-binding evaluation of how Post-COVID or ME/CFS is assessed under German disability law (GdB, MdE, disability pension), with numbered references to German legal and medical sources. 4.99 per evaluation, 0.99 for the same wallet within 55 minutes. The free rule-based Part 1 comes first. Not legal or medical advice. Only on the explicit order of the affected person, with anonymized input.
category: health
stage: experimental
aliases: [post-covid, long-covid, me-cfs, germany, disability, gdb, mde, erwerbsminderungsrente, schwerbehinderung, social-law]
service_url: https://www.bastet-covid.org/api/x402/consult
service_method: POST
payment:
  schemes: [exact]
  networks: [celo]
  assets: [USDC, USDT, USAT]
---

# Post-COVID and ME/CFS under German disability law

> Experimental listing: an early-stage third-party seller. buy has not reviewed it; confirm with the user before paying.

Sold directly by BASTET (operator: Dr. Florian Hugenberg, imprint
`https://doc.bastet-covid.org/impressum`), not through the buy gateway: the payment goes to
the seller's wallet. Full service description, price, questions and consent text, free:
`GET https://www.bastet-covid.org/api/x402/consult`.

| route | what comes back | price | input |
|---|---|---|---|
| `POST /api/x402/tier1` | free, rule-based evaluation: CCC/IOM criteria, a GdB range, MdE and pension category, open points, references | free | JSON body with `answers` to the 21 questions and `lang` |
| `POST /api/x402/consult` | one written evaluation structured by GdB, MdE and pension, with numbered references | 4.99, or 0.99 for the same wallet within 55 minutes | JSON body, below |

```json
{ "question": "<anonymized case description>", "tier1Answers": { }, "lang": "en", "consent": true }
```

`question` is up to 25,000 characters. `tier1Answers` and `lang` are optional. A body without
`question` or `consent: true` is rejected with `400` before any payment.

## Health data: only on the person's own order

- Pay only when the affected person explicitly asks for the paid evaluation and has
  confirmed the price.
- Send anonymized information only: no names, insurance numbers, addresses or file numbers.
- `consent: true` means the person agrees that the request text goes to the seller's AI
  provider, Anthropic, to write the answer. Ask before setting it.
- The answer is orientation, not a diagnosis or legal advice. Say so when you pass it on.

Per the seller's privacy policy (`https://doc.bastet-covid.org/datenschutz#english-bots-x402`),
the request text is not stored. The seller keeps the paying wallet for 55 minutes, for the
lower returning price, and rate-limit counters for 60 seconds.

## Buying it

Run Part 1 first, for free, and pass its `tier1Answers` to Part 2.

```text
buy_pay_quote
  url:    https://www.bastet-covid.org/api/x402/consult
  method: POST
  body:   {"question":"...","lang":"en","consent":true}
```

Then `buy_curl` with the same request and `maxAmount` from the quote. From the CLI:

```sh
buy quote -X POST -H 'content-type: application/json' -d '<body>' https://www.bastet-covid.org/api/x402/consult
buy curl --max-amount 4.99 -X POST -H 'content-type: application/json' -d '<body>' https://www.bastet-covid.org/api/x402/consult
```

## Failures

A response with a payment receipt header was paid for, whatever its status. Never retry a
timeout automatically: run `buy receipts --resolve` first.
