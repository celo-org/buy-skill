---
name: streamlivr/creator-data
title: African creator, content and music data from Streamlivr (x402)
description: Public creator and brand profiles, published posts with engagement, and music metadata (ISRC, artwork, preview clip) from Streamlivr, with cursor pagination. One cent in USDC per creator credited, one cent minimum, two dollars maximum per request; the 402 quotes the exact request. Use for influencer and talent discovery, content search and profile enrichment, especially for African creators.
category: social
stage: experimental
aliases: [creators, influencers, talent, music, isrc, afrobeats, social-data, content, profiles, africa]
service_url: https://api.streamlivr.com/api/v1/agent/listings
payment:
  schemes: [exact]
  networks: [celo]
  assets: [USDC]
---

# Creator, content and music data from Streamlivr

> Experimental listing: an early-stage third-party seller. buy has not reviewed it; confirm with the user before paying.

Sold by [Streamlivr](https://streamlivr.com) directly, not through the buy gateway: the
payment goes to Streamlivr's wallet. Support: support@streamlivr.com.

| route | what it returns | price |
|---|---|---|
| `GET /api/v1/agent/listings` | creator and brand profiles | 0.01 USDC per creator credited |
| `GET /api/v1/agent/posts` | published posts with engagement counts | 0.01 USDC per creator credited |
| `GET /api/v1/agent/catalog` | tracks: title, artist, ISRC, artwork, preview | 0.01 USDC per creator credited |
| `GET /api/v1/agent/creator/<id>` | one profile with content counts | 0.01 USDC |
| `GET /api/v1/agent/ping` | liveness and settlement network | 0.01 USDC |

Every route has a 0.01 minimum and a 2.00 maximum. All payments are in USDC on Celo.

## Query parameters

`listings`, `posts` and `catalog` take `q` (free text over names, titles, bios, hashtags
and countries), `limit` (1 to 200, default 10) and the `nextCursor` from the previous page.
`listings` also takes `verified`, `minFollowers` and `sort` (`followers` or `newest`);
`posts` takes `sort` (`newest` or `views`). `creator/<id>` takes an id from any of the other
responses, and is the cheapest buy when the agent already knows the profile it needs.

## Buying it

The price depends on how many creators the request credits, so quote the exact URL,
query string included, and pay that. The same route with a different `q` or `limit` is a
different price.

```text
buy_pay_quote
  url:    https://api.streamlivr.com/api/v1/agent/listings?q=lagos&limit=5
  method: GET
```

Then `buy_curl` with the same url and `maxAmount` from the quote. From the CLI:

```sh
buy quote 'https://api.streamlivr.com/api/v1/agent/listings?q=lagos&limit=5'
buy curl --max-amount <quoted amount> 'https://api.streamlivr.com/api/v1/agent/listings?q=lagos&limit=5'
```

Ask for what you need with `limit`. A request with no parameters uses the default limit of
10 and is quoted at 0.10 USDC.

## What comes back

A list (`creators`, `posts` or `tracks`) and a `page` block with `total`, `returned`,
`hasMore` and `nextCursor`. Each further page is a new quote and a new payment. Catalog
rows name the recording's owner and attribution; use those credits as given.

## Failures

A response with a payment receipt header was paid for, whatever its status. Never retry a
timeout automatically: run `buy receipts --resolve` first.
