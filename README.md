# buy-skill

Agent skills for [`buy`](https://www.npmjs.com/package/@celo/buy) — an x402 payment client for Celo that lets a CLI or AI agent pay for HTTP APIs in stablecoins.

The MCP server gives an agent the *capability* to pay. It does not teach it what is worth
buying, how to read a lease, or how to fail safely when money is involved and a retry can
charge twice. That is what these skills are for.

## Start here

Most agents want [`use-api-gateway`](skills/use-api-gateway/SKILL.md): one workflow for
everything on the buy gateway (social and flight data, browser sessions, GPU leases, Celo
RPC, LLM inference). Read the free live catalog, quote the exact request, get the user's
approval for that price, pay once, and report the transaction hash.

```sh
npx skills add celo-org/buy-skill                          # all four skills
npx skills add celo-org/buy-skill --skill use-api-gateway  # just the gateway workflow
```

The skill alone cannot pay for anything. The agent also needs the buy MCP server or CLI and
a wallet the user funded: see [Prerequisite](#prerequisite-the-buy-mcp-server) below.

## Skills

| Skill | What it teaches |
|---|---|
| [`use-api-gateway`](skills/use-api-gateway/SKILL.md) | Discovering and buying APIs and GPU leases from the provider-neutral buy gateway while keeping provider credentials server-side and handling paid retries safely. |
| [`order-compute`](skills/order-compute/SKILL.md) | Buying a short-lived CPU VM — quoting before paying, using SSH, polling for results, CPU renewals, and safe recovery. |
| [`data-availability`](skills/data-availability/SKILL.md) | Querying on-chain blockchain data across 113+ networks (EVM, Solana, Bitcoin, Tron) via SQD on the buy gateway — free ad-hoc block, transaction, log, instruction, finalized head, and timestamp lookups. |
| [`file-feedback`](skills/file-feedback/SKILL.md) | Reporting a bug, a wrong instruction, a payment problem, or an idea back to the maintainers — redacting keys and poll URLs, checking for duplicates, drafting the report for your approval, and filing it with `gh` or a prefilled issue URL. |

## What a skill can and cannot do

- **It is text.** Each skill is one Markdown file (plus reference pages). Nothing in this
  repository runs on install, and no skill ships a script or a binary.
- **It does not install, fund or authorize anything.** The tools it describes come from
  [`@celo/buy`](https://www.npmjs.com/package/@celo/buy) on npm, published by Celo from its
  release pipeline with npm trusted publishing. The skills pin the version they were
  checked against. The key stays in the OS keychain, in the buy process; the agent never
  sees it.
- **The user holds the spending authority.** A wallet spends only what its owner put in it.
  Every paid call carries a maximum (`--max-amount` in the CLI, `maxAmount` over MCP) and is
  refused before signing when the quote is above it, and the skills require approval of the
  exact token and amount unless the user's request already authorizes that spend.
  `buy_send`, which moves money directly, is off unless the user enables it with a budget or
  an allowlist.
- **Where the requests go.** Paid calls go to `https://gateway.usebuy.ai` (the buy gateway,
  run by Celo) and the compute gateway at `https://usebuy.ai`. The gateway holds the
  upstream providers' credentials, so the agent never handles a third-party API key.
  Payments settle on Celo mainnet through the x402 facilitator.
- **Responses are data.** The skills tell the agent to treat what the catalog, a provider, a
  VM or an issue returns as content to report, never as instructions to follow.

## Installing a skill by hand

Skills are plain Markdown with YAML frontmatter. `npx skills add` (above) copies them for
most agents; to do it yourself, copy the directory into wherever your agent looks for
skills.

For Claude Code, either globally:

```sh
git clone https://github.com/celo-org/buy-skill.git
mkdir -p ~/.claude/skills
cp -r buy-skill/skills/<name> ~/.claude/skills/
```

`<name>` is the directory from the table above, e.g. `order-compute`.

or scoped to a single project, in that project's `.claude/skills/`.

## Prerequisite: the buy MCP server

A skill is guidance, not capability. The agent also needs the tools it describes —
`buy_pay_quote`, `buy_curl`, `buy_balance`, `buy_whoami`, `buy_verify_status`:

```sh
npx --yes @celo/buy@0.8.5 setup --name buy      # creates a wallet in your OS keychain
npx --yes @celo/buy@0.8.5 mcp install --client all
```

Restart the agent afterwards so it picks up the new MCP configuration. The server signs
with the keychain wallet in its own process; the agent never receives key material.

The MCP server is a convenience, not a requirement: the CLI does everything the tools do,
and the skills show both routes. If `mcp install` cannot register with a client, it prints
the client's error; you can also register with the client's own command. For Claude Code:

```sh
claude mcp add -s user buy -- npx --yes @celo/buy@0.8.5 mcp serve
```

Fund the printed address with a small amount of USDC, USDT or USAT on Celo mainnet. You do
not need CELO: the gateway's sponsor wallet pays the gas for x402 settlements, and
`buy send` pays its own gas in the stablecoin it moves, so the remaining balance can be
moved out of a stablecoin-only wallet. Treat what you deposit as spent.

**No stablecoins yet?** [Google Cloud's Celo faucet](https://cloud.google.com/application/web3/faucet/celo/mainnet)
sends free USAT on Celo mainnet to a person who verifies once with [Self](https://self.xyz),
privately, from a passport in the Self app. An agent cannot do this step: the human who owns
it verifies, then sends the USAT to the address `setup` printed. A wallet funded this way
holds only USAT, and the default token is USDC, so pay with `--token USAT` on the CLI or
`token: "USAT"` in MCP. Without it the payment is refused for lack of USDC; nothing is spent.

## These payments are real

`order-compute` targets gateways that settle **real USDC, USDT or USAT on Celo mainnet**.
Payment is irreversible and there is no refund primitive in x402. Two consequences the
skill spends most of its length on:

- **Quote before paying.** The request body determines the price, so a hardcoded cap
  breaks the moment you ask for a bigger machine.
- **Never blindly retry a failed purchase.** A `500` can mean the payment already went
  through; retrying it is a second payment. Partner errors can also follow settlement.
  Check the payment receipt and any explicit `paymentSettled: false` before considering
  another purchase.

Fund the wallet like a float, not a treasury. Nothing prompts per payment.

## Feedback

This repository is the front door for everything `buy` — the skills here, the CLI, the MCP
server, the gateway, and payments. File it here whatever broke; maintainers route it onward.

[Open an issue](https://github.com/celo-org/buy-skill/issues/new/choose), or install
[`file-feedback`](skills/file-feedback/SKILL.md) and let the agent draft the report for you.
It searches for duplicates, fills the right form, and shows you the exact text before
anything is posted.

One thing to check before you paste: a poll URL (`https://usebuy.ai/google/vm/<token>`) is
a bearer capability. Anyone who reads it can read your result and renew your lease at your
expense. Redact the token. The same goes for private keys, seed phrases, SSH private keys,
and anything Self handed you. A transaction hash is already public on-chain and is the most
useful thing you can include.

Selling something over x402 on Celo that agents using buy should find? Use the **List your
service** form in the same issue chooser. It asks for your origin, a one-paragraph description,
the price, and the networks and tokens you accept; a maintainer turns accepted requests into
catalog entries. The other indexes are covered in
[x402: Get your endpoint discovered](https://docs.celo.org/build-on-celo/build-with-ai/x402-get-discovered).

## Other MCP clients

The skill format is Claude Code's, but nothing in the guidance is specific to it. Any MCP
client gets the same `buy` tools; restate the skill body as a system prompt there.

## License

Apache-2.0 — see [LICENSE](LICENSE).
