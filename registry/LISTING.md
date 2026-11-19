# Writing a catalog entry

This is the brief for adding one service to the buy catalog. It is written so a coding agent
can follow it: give it this file, the seller's API docs and the URL of the paid route.

The result is one new file, `registry/providers/<org>/<name>/PAY.md`, in one pull request.
Nothing else in the repository changes.

## Before writing anything

1. Quote the paid route without paying. It has to answer `402` with a Celo mainnet offer in
   USDC, USDT or USAT:

   ```sh
   npx --yes @celo/buy quote https://your-origin.example/your-route
   ```

   `buy quote` prints each offer and whether buy can pay it. Fix what it flags first. A route
   that only answers to POST is quoted with `-X POST`, and has to return the 402 to a POST
   with no body.
2. Never pay during this work. `buy quote` signs nothing. Do not run `buy curl`.
3. Do not put a key, a token, a wallet private key or a private URL in the file or the pull
   request. An entry holds a public URL, a price and a description.

## The path

`registry/providers/<org>/<name>/PAY.md`

- `<org>` is the seller: a company or project name. `<name>` is the service.
- Both are lowercase letters, digits and hyphens, up to 40 characters.
- `buy`, `cencori`, `chainstack` and `celo` are reserved.

## The file

Keep the frontmatter in this shape: one `key: value` per line, and lists inline.

```markdown
---
name: <org>/<name>
title: <What it is, in a few words> (x402)
description: <Under 500 characters, for an agent deciding whether to call it: what comes back, what one call costs, and when to use it.>
category: <one lowercase word, such as finance, social, data, payments, health>
stage: experimental
aliases: [<lowercase>, <search>, <terms>]
service_url: https://your-origin.example/your-route
payment:
  schemes: [exact]
  networks: [celo]
  assets: [USDC, USDT, USAT]
---

# <What it is>

> Experimental listing: an early-stage third-party seller. buy has not reviewed it; confirm with the user before paying.

Sold directly by <operator>, not through the buy gateway: the payment goes to the seller's
wallet. Terms and support: <URL>. Contact: <how a buyer reaches you>.

| route | what comes back | price | input |
|---|---|---|---|
| `GET /your-route` | <one line> | <amount and token> | <parameters> |

Data from: <your own data, or each upstream source and that its terms allow reselling it>.

## Buying it

<The exact request an agent should quote: URL, method, and an example body or query.>

## Failures

<What a failed paid call looks like, and what the buyer should do.>
```

Rules the check enforces:

- `name` equals the path, `<org>/<name>`.
- `stage: experimental` on a new entry, and the `> Experimental listing:` line in the body.
- `service_url` is the main paid route: a public `https://` URL on the default port.
- Add `service_method: POST` under `service_url` only when that route answers the 402 to POST
  and not to GET. Leave it out otherwise.
- `payment.assets` lists only the tokens the 402 really offers, out of `USDC`, `USDT` and
  `USAT`. A wallet funded with one token cannot pay a route that does not offer it.
- The file is under 16 KB.

Write the body for an agent that has never seen the service. Say what each route returns, what
it costs, and what input it needs, with one example request. If a route moves real money,
handles personal data, or gives health, legal or financial information, say plainly what the
agent must confirm with its user before paying.

## The pull request

Title: `list <org>/<name>`. In the description, answer these, since a maintainer reviews them:

- **Operator:** who runs the service, and a contact.
- **Terms and support:** the URL of the page that says where a buyer goes when a paid call
  fails or needs a refund.
- **Where the data comes from:** your own, or each upstream source with a link to its terms,
  and whether those terms allow reselling.
- **Facilitator:** the Celo facilitator (`https://api.x402.celo.org`) or which one you use.
- **ERC-8004 agent id on Celo**, if you have one.

The `registry check` job then quotes the entry and reports in its summary. Passing it does not
list the service: a maintainer reviews and merges, and the entry reaches agents at the
gateway's next deploy.
