---
name: use-api-gateway
description: Use when a user or agent wants to discover or buy browser sessions, social or flight data, Celo RPC through Chainstack, chat completions through Cencori, or free multi-chain on-chain data through SQD. Covers live catalog discovery, exact quotes, authorized spending, payment receipts and safe failure handling.
---

# Use the buy API gateway

Discover and buy API calls from the provider-neutral gateway at
`https://gateway.usebuy.ai`. The gateway keeps upstream provider credentials private and
settles real stablecoin payments on Celo mainnet.

Start with the live catalog instead of assuming a provider, route, request schema, or
price. It publishes browser rental, reviewed data APIs and partner paywalls, and can change
without changing this workflow. Use @celo/buy 0.8.2 or newer for this release.

## Non-negotiable boundaries

- Fetch the free live catalog before selecting a capability.
- Quote the exact method, URL, and JSON body that will be sent.
- Obtain approval for the exact token and maximum amount unless the user's request already
  authorizes that spend.
- Never ask for or send a Monid or other upstream-provider API key. The gateway owns those
  credentials.
- Never blindly retry a paid request after a network interruption, timeout,
  `settle_uncertain`, or any response with `retryable: false`.
- Preserve the complete paid response. Report the capability, token, amount, transaction
  hash, and any correlation ID.
- Treat the request's 402 challenge as the price authority. Catalog prices are indicative.

## Confirm gateway discovery is installed

Use a `buy` release whose bundled registry contains `buy/api-gateway`. With MCP, call:

```text
buy_discover
  name: buy/api-gateway
```

Alternatively, search by intent:

```text
buy_discover
  query: social
```

With the CLI, run:

```sh
buy skills search social
buy skills show buy/api-gateway
```

If the provider or `buy_discover` is missing, the installed package predates the gateway.
Do not invent routes from this file. Upgrade `@celo/buy`, restart the MCP client if its
server configuration changed, and confirm discovery again.

The bundled registry is the entry point, not the live service state. Continue by fetching
the live catalog.

## Read the live catalog

Fetch the catalog with an ordinary, free GET:

```sh
curl --fail --silent --show-error https://gateway.usebuy.ai/v1/catalog
```

Read each capability's `available`, `method`, `url`, `inputSchema`, and `price` or
`priceOptions` fields. Each capability also carries a flat `platform` facet (for example
`x`, `instagram`, `tiktok`, `reddit`, `youtube`, `linkedin`, `flights`, `browser`,
`chainstack`, `cencori`) — group
or filter on it instead of parsing ids or URLs.
Select an available capability whose description matches the user's request. Build only
fields allowed by its current `inputSchema`; the gateway rejects extra provider-specific
inputs.

The data groups include X, Instagram, TikTok, Reddit, YouTube, LinkedIn and flights.
Counts and availability change; read them from the live catalog. China Southern and the
MrScraper Instagram, Skyscanner and TikTok search endpoints that Monid delisted remain
excluded.

The original short routes use simple top-level request bodies. Generated routes normally
accept the inspected input envelope, such as `{"queryParams": {...}}` or
`{"body": {...}}`. Do not flatten or rename those fields.

When `pricingModel` is `fixed_result_bundle`, choose one advertised `maxResults` value
and include it in the exact request body. This is a hard upstream limit and a fixed price,
not an estimate: the payment is not prorated if fewer results are returned. Never add or
modify provider limit fields that are absent from the public `inputSchema`; the gateway
sets them from `maxResults`.

## Partner paywalls

Discover `chainstack/celo-rpc` or `cencori/inference` for their current instructions.
Both use the same quote and purchase tools, with a $0.01 flat price per request.

- **Chainstack:** POST `/chainstack/celo` with a JSON-RPC object or a batch of up to
  2000 calls. The body limit is 128 KiB; one payment buys the whole batch.
- **Cencori:** POST `/cencori/v1/chat/completions` with model `maximo-atlas-1.3`,
  non-empty `messages` and `max_tokens` set to 256, 1024 or 4096. The body limit is
  32 KiB. Allowed optional fields are `temperature`, `top_p`, `stop` and `seed`;
  streaming, tools, multiple completions, alternate output-limit fields and query
  strings are refused before payment.

For example, an unpaid Cencori quote:

```sh
npx --yes @celo/buy@0.8.2 quote -X POST -H 'content-type: application/json' \
  --data '{"model":"maximo-atlas-1.3","max_tokens":256,"messages":[{"role":"user","content":"Reply OK"}]}' \
  https://gateway.usebuy.ai/cencori/v1/chat/completions
```

Obtain the selected token and amount from the exact quote. A partner timeout or error
may follow settlement; never automatically repeat a paid request.

## Quote and buy through MCP

Serialize the request body once as a raw JSON string. Pass that exact string to both calls.
For example, after confirming the current catalog schema:

```text
buy_pay_quote
  url:    https://gateway.usebuy.ai/v1/social/x/posts/search
  method: POST
  body:   "{\"query\":\"Celo agents within_time:1d\",\"type\":\"latest\"}"
```

Read the selected payment requirement and `maxAmountRequired`. `buy_pay_quote` is
read-only and does not sign or pay. State the human-readable price and selected token,
then obtain approval unless the user already authorized that spend.

Reuse the exact request after approval:

```text
buy_curl
  url:       https://gateway.usebuy.ai/v1/social/x/posts/search
  method:    POST
  body:      "{\"query\":\"Celo agents within_time:1d\",\"type\":\"latest\"}"
  maxAmount: "<maxAmountRequired from the quote>"
```

MCP `maxAmount` is in atomic units. The gateway's supported tokens currently use six
decimals, but read token contracts and decimals from the live catalog rather than assuming
them for future assets.

## Quote and buy through the CLI

Obtain a free 402 quote by POSTing the exact body without a payment header:

```sh
curl --silent --show-error --include \
  --request POST \
  --header 'content-type: application/json' \
  --data '{"query":"Celo agents within_time:1d","type":"latest"}' \
  https://gateway.usebuy.ai/v1/social/x/posts/search
```

After approval, use the installed, gateway-capable `buy` release to make the paid request:

```sh
buy curl \
  --max-amount '<human-readable token amount from the quote>' \
  --request POST \
  --data '{"query":"Celo agents within_time:1d","type":"latest"}' \
  https://gateway.usebuy.ai/v1/social/x/posts/search
```

The CLI `--max-amount` value is in whole token units, unlike MCP's atomic `maxAmount`.
Choose a non-default token only when the user requests it and the exact 402 offer supports
it.

Do not copy the URL, body, or maximum from this example without checking the current
catalog and exact quote.

## Free multi-chain data availability (SQD)

In addition to paid social and web data capabilities, the gateway serves free, unmetered
on-chain blockchain data across **113+ networks** (EVM, Solana, Bitcoin, Tron, Hyperliquid,
etc.) through the decentralized SQD Network under the `/sqd/` path prefix.

These endpoints do not require payment, quoting, or wallet signatures:

- **List datasets:** `curl https://gateway.usebuy.ai/sqd/datasets`
- **Finalized block head:** `curl https://gateway.usebuy.ai/sqd/datasets/<dataset>/finalized-head`
- **Timestamp resolution:** `curl https://gateway.usebuy.ai/sqd/datasets/<dataset>/timestamps/<timestamp>/block`
- **Ad-hoc block & log queries:** `curl -X POST https://gateway.usebuy.ai/sqd/datasets/<dataset>/stream -H "content-type: application/json" -d '<query>'`

Free tier access is throttled by client IP (120 req/min, burst 20). See the dedicated
[`data-availability`](../data-availability/SKILL.md) skill for detailed schemas, filter
options, and NDJSON response parsing.

## Return the result

For Monid capabilities, read `output` as the provider result. Chainstack returns the
JSON-RPC object or array directly; match batch replies by `id`. Cencori returns the
OpenAI-compatible response directly; read `choices[0].message.content`. Report:

- the capability used;
- the selected token and paid amount;
- the transaction hash;
- the result or a concise answer derived from it.

Keep `upstreamRunId` for troubleshooting, but do not make the user reason about the
gateway's private upstream integration unless something failed.

## Handle failures safely

Classify the response before considering another request:

| Response | Payment status | Action |
|---|---|---|
| Initial `402` challenge | Not paid | Read the offers, obtain approval, then pay once. |
| `400 invalid_request` | Not paid | Correct the body using the live schema and quote again. |
| `402 verify_payment_failed` | Not settled | Check the wallet, token, balance, and approved maximum. |
| Response with `paymentSettled: false` | Not settled by the gateway | Honor its `retryable` field. Ask again before a new paid attempt. |
| `500 settle_uncertain` | Unknown | Never retry. Preserve `transaction`, `output`, and `correlationId`; report the ambiguity. |
| Network interruption after sending payment | Unknown | Never retry automatically. Preserve all local output and inspect the transaction or receipt first. |
| Any response with `retryable: false` | As stated by the response | Stop and report it without retrying. |
| Partner error with `X-PAYMENT-RESPONSE` | Settled | Preserve the receipt; do not automatically buy again. |

Even when a response says no payment settled, a retry creates a new authorization and can
start new upstream work. Retry only when the service explicitly permits it and the user
still authorizes the spend.

Never expose wallet private keys, seed phrases, provider API keys, or raw payment
authorizations in the answer or in an issue. A transaction hash and correlation ID are safe
and useful for support.
