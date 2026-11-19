# The buy catalog registry

Each file under `providers/` is one service an agent using buy can find and pay:
`providers/<org>/<name>/PAY.md`. `buy skills search`, `buy skills show` and the MCP tool
`buy_discover` read these entries, and the gateway serves them at
`https://usebuy.ai/registry.json`.

These are services sold directly by their own operators. An agent quotes and pays the seller's
endpoint over x402 on Celo, and the payment goes to the seller's address. The services the buy
gateway sells itself (compute, RPC, inference and the rest of its catalog) are not listed here,
and the org names `buy`, `cencori`, `chainstack` and `celo` are reserved for them.

## List your service

You need a route that answers x402 on Celo mainnet, priced in USDC, USDT or USAT. Check it the
way buy will, for free:

```sh
npx --yes @celo/buy quote https://your-origin.example/your-route
```

Then pick one:

1. **Open a pull request** that adds one file, `providers/<org>/<name>/PAY.md`.
   [LISTING.md](LISTING.md) has the format, and it is written so you can hand it to a coding
   agent together with your API docs.
2. **Use the form.** If you would rather not open a pull request, file a
   [List your service](https://github.com/celo-org/buy-skill/issues/new?template=list-your-service.yml)
   request and a maintainer writes the file from it.

Your API keys stay on your server either way. An entry holds your URL, your price and a
description, never a credential. Do not put a key, a token or a private URL in a `PAY.md` or
in a pull request.

## What the check does

Every pull request that touches this directory runs the `registry check` job. For each entry
it adds or changes, the job:

- reads the file with the parser the buy CLI uses, and checks the path, the `name` and the
  fields in [LISTING.md](LISTING.md);
- sends **one unpaid request** to `service_url`, as an agent's quote would, and reads the 402;
- fails unless the 402 offers every token the entry claims, on Celo mainnet, in a form buy can
  pay.

It signs nothing and pays nothing. The job summary says what it found, in the check's own
words.

## What a maintainer looks at

Passing the check does not list a service. A maintainer reviews each entry before merging:

- the description is written for an agent deciding whether to call the route, and says what
  comes back;
- the operator is named, with a terms and support page that says where a buyer goes when a
  paid call fails;
- the pull request says where the data comes from, and that it is the seller's own or that
  the source's terms allow reselling it;
- the routes, prices and tokens in the body match what the endpoint answers.

Services that move money, or that give health, legal or financial advice, get a closer look
and can take longer.

## After the merge

- The gateway picks this directory up at a pinned commit. Your entry reaches agents at the
  gateway's next deploy, not at the merge.
- A new listing is `stage: experimental`. Agents see `[experimental]` next to it and are told
  to confirm with their user before paying.
- The tag comes off once at least 3 buyers that your own team did not fund have paid you,
  counted from onchain payments to your address.

To change a price, a route or a description, or to take your service down, open a pull request
that edits or removes your file.
