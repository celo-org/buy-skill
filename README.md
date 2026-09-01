# buy-skill

Agent skills for [`buy`](https://www.npmjs.com/package/@celo/buy) — an x402 payment client for Celo that lets a CLI or AI agent pay for HTTP APIs in stablecoins.

The MCP server gives an agent the *capability* to pay. It does not teach it what is worth
buying, how to read a lease, or how to fail safely when money is involved and a retry can
charge twice. That is what these skills are for.

## Skills

| Skill | What it teaches |
|---|---|
| [`order-compute`](skills/order-compute/SKILL.md) | Buying a short-lived GCP VM through the public gateway — quoting before paying, running a script or opening an SSH session, polling for results, renewing a lease, and which failures are safe to retry. |

## Installing a skill

Skills are plain Markdown with YAML frontmatter. Copy the directory into wherever your
agent looks for skills.

For Claude Code, either globally:

```sh
git clone https://github.com/celo-org/buy-skill.git
mkdir -p ~/.claude/skills
cp -r buy-skill/skills/order-compute ~/.claude/skills/
```

or scoped to a single project, in that project's `.claude/skills/`.

## Prerequisite: the buy MCP server

A skill is guidance, not capability. The agent also needs the tools it describes —
`buy_pay_quote`, `buy_curl`, `buy_balance`, `buy_whoami`, `buy_verify_status`:

```sh
npx --yes @celo/buy@0.5.0 setup --name buy      # creates a wallet in your OS keychain
npx --yes @celo/buy@0.5.0 mcp install --client all
```

Restart the agent afterwards so it picks up the new MCP configuration. The server signs
with the keychain wallet in its own process; the agent never receives key material.

Fund the printed address with a small amount of USDC or USDT on Celo mainnet. You do not
need CELO — the gateway's sponsor wallet pays the gas.

## These payments are real

`order-compute` targets a gateway that settles **real USDC or USDT on Celo mainnet**.
Payment is irreversible and there is no refund primitive in x402. Two consequences the
skill spends most of its length on:

- **Quote before paying.** The request body determines the price, so a hardcoded cap
  breaks the moment you ask for a bigger machine.
- **Never blindly retry a failed purchase.** A `500` can mean the payment already went
  through; retrying it is a second payment. Only the `4xx` and `503` refusals happen
  before settlement.

Fund the wallet like a float, not a treasury. Nothing prompts per payment.

## Other MCP clients

The skill format is Claude Code's, but nothing in the guidance is specific to it. Any MCP
client gets the same `buy` tools; restate the skill body as a system prompt there.

## License

Apache-2.0 — see [LICENSE](LICENSE).
