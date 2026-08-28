---
name: order-compute
description: Buy a short-lived GCP VM through the public buy gateway when a user or agent needs isolated Linux compute for a command, script, build, or demo, or an interactive SSH session on a real machine. Use for requests to rent, order, buy, or provision disposable compute. Do not use when a local sandbox already fits.
---

# Order compute with buy

Buy a real, short-lived Debian VM that runs one script as root and returns its output. The
public hackathon gateway is:

```text
https://buy.celo-testnet.org/gcloud/vm
```

Despite the temporary hostname, it settles real USDC or USDT on Celo mainnet. Payment is
irreversible. Use a local sandbox instead when it can do the work safely.

## Non-negotiable boundaries

- Quote before paying. The request body determines the price.
- Obtain the user's approval for the exact token and maximum amount unless their request
  already authorizes that spend.
- Never use `--sandbox`; this gateway is on Celo mainnet.
- Never retry `500 provision_failed` or `500 settle_uncertain`. Payment succeeded or may
  have succeeded, so a retry can charge twice.
- Report the paid amount, token, transaction hash, instance, expiry, and poll URL.
- Preserve the paid response. The poll URL is a capability and `buy receipts` does not yet
  retain it for streamed CLI calls.
- SSH is a second purchase route, not a flag on `/gcloud/vm`. It is enabled on the public
  deployment. Quote and buy `/gcloud/ssh` for it, and tell the user an interactive session
  bills egress to the operator, so they should close it when done.

## What is available

Before choosing a machine type or calculating a payment, query the live catalog. With the
CLI, issue a free `GET` request to:

```text
https://buy.celo-testnet.org/gcloud/catalog
```

`GET /gcloud/catalog` is free and side-effect free. Use its `machineTypes` entries for
the currently supported VM types, guaranteed vCPU share, guest CPU count, memory, disk,
exact lease price, and whether Self attestation is required. Use its `network`, `region`,
`tokens`, `leaseSeconds`, and `maxTotalLeaseSeconds` fields for the current service
configuration. Treat the catalog as the live source for choosing a type and price; still
quote the exact purchase body before paying, because the 402 challenge is authoritative
for that request.

Two purchase routes sell the same machines at the same price. They differ only in what
they hand back:

| Route | Body | You get |
|---|---|---|
| `POST /gcloud/vm` | `{"script":"…","machineType":"…"}` | the script's stdout, via the poll URL |
| `POST /gcloud/ssh` | `{"sshKey":"ssh-ed25519 …","machineType":"…"}` | an external IP and an `ssh` command |

`script` is required on `/gcloud/vm` and limited to 4 KiB. `sshKey` is required on
`/gcloud/ssh`. `machineType` is optional on both and defaults to `e2-micro`.

| Type | vCPU share | `nproc` | RAM | 1h quote | Attestation |
|---|---:|---:|---:|---:|---|
| `e2-micro` | 0.25 | 2 | 1 GiB | 0.016753 USDC or USDT | not required |
| `e2-small` | 0.5 | 2 | 2 GiB | 0.033506 USDC or USDT | not required |
| `e2-medium` | 1 | 2 | 4 GiB | 0.067011 USDC or USDT | not required |
| `e2-standard-2` | 2 | 2 | 8 GiB | 0.134023 USDC or USDT | **required** |
| `e2-standard-4` | 4 | 4 | 16 GiB | 0.268046 USDC or USDT | **required** |
| `e2-standard-8` | 8 | 8 | 32 GiB | 0.536091 USDC or USDT | **required** |

**The shared-core types report `nproc=2`, while standard types report their full CPU
count.** For shared-core machines, E2 exposes two logical CPUs while guaranteeing only
the vCPU share above; the share is what the workload actually gets sustained, and the
core count is what the guest sees. A script that reads `nproc` to size a thread pool will
over-subscribe an `e2-micro` by 8x.

Every VM gets a **10 GB pd-standard** boot disk and a plain `debian-12` image. Nothing is
preinstalled beyond that image: **Docker is not installed**, and neither is any language
toolchain. A script or session that needs one must install it, over HTTPS, within the
lease. The `buy` login may appear in a `docker` group — GCE's guest agent adds SSH users
to a standard group list — but that grants nothing, because there is no Docker daemon.

**Those prices are indicative, not a contract.** Ask the gateway before spending: an
unpaid request returns the current figure for the exact body you intend to send, and
costs nothing. Use `buy_pay_quote` from an MCP client, or an unpaid POST from the CLI.
The quote is what the gateway will charge; anything written here can age.

These are standard on-demand VMs, never Spot. They run in `us-west1`, start with a
one-hour lease, and may be renewed up to 24 hours total from creation.

**Egress is restricted.** A leased VM can reach DNS (53), HTTP (80), HTTPS (443) and NTP
(123), and nothing else — outbound SSH, SMTP and arbitrary TCP are denied. `apt`, `curl`,
`git` over HTTPS and package registries work; anything else will hang rather than refuse.
Inbound, only port 22 is open, and only on `/gcloud/ssh` purchases, which are the only
ones given an external IP.

Choose the smallest machine that fits:

- `e2-micro`: shell utilities, network probes, and small scripts.
- `e2-small`: light builds or jobs that need 2 GiB RAM.
- `e2-medium`: heavier builds that fit in one core and 4 GiB.
- `e2-standard-2`, `e2-standard-4`, and `e2-standard-8`: larger builds with 8, 16, and
  32 GiB RAM respectively; these require a Self attestation.

The public service admits at most 200 live or provisioning VMs and $25/hour of aggregate
catalogued compute. Per-human counters are not active during the hackathon: they key on a
verified nullifier, and the endpoint is not pinned, so only the aggregate caps bind.

## Prepare the user's wallet

The public package requires Node.js 20 or newer and does not require repository access.
Use the pinned release:

```sh
npx --yes @celo/buy@0.4.1 setup --name hackathon
```

Creating a wallet writes a private key to the user's OS keychain. Do it only with their
knowledge. Have the user fund the printed address with a small amount of USDC or USDT on
Celo mainnet. The wallet does not need CELO because the gateway sponsor pays gas.

Set a daily spend cap before the first purchase. An agent buying on someone's behalf
should have a ceiling that does not depend on the agent behaving:

```sh
npx --yes @celo/buy@0.4.1 account cap hackathon 1.00
```

**The amount is in USDC, not atomic units.** `1.00` means one dollar per day. A figure of
1000 or more is refused unless `--force` is passed, because a large round number is far
more likely a units mistake than an intent — and a cap only fails dangerously in one
direction. `account list` shows the cap, `--clear` removes it.

Check the balance before quoting. The command differs by client, which is worth
knowing before a purchase fails on funds:

- **MCP agents**: `buy_balance` (and `buy_whoami` for the address and network)
- **CLI**: `buy whoami`, which prints the address and every token balance. There is
  no `buy balance` subcommand.

For agent clients, install the local MCP server:

```sh
npx --yes @celo/buy@0.4.1 mcp install --client all
```

Restart the client after its MCP configuration changes. The MCP server uses the same
keychain wallet; it does not expose the private key to the agent.

## Obtain the Self attestation

**Only `e2-standard-2`, `e2-standard-4`, and `e2-standard-8` require one.**
`e2-micro`, `e2-small`, and `e2-medium` are buyable with no proof at all, on both routes —
the gateway requires an attestation only above a spend threshold, so
someone without a compatible identity document can still use the service. Check before
sending a user through verification: if the 402 challenge carries no
`extra.selfRequirements`, none is needed.

Where one IS required, these are the live requirements, as served by the gateway today:

| Setting | Value |
|---|---|
| scope | `buy.celo` |
| endpoint type | `https` (production Self hub, Celo mainnet) |
| hosted receiver | `https://buy.celo-testnet.org/self/api/verify` |
| minimum age | 18 |
| OFAC screening | enabled |
| mock passports | **rejected** — the gateway runs `BUY_SELF_MOCK_PASSPORT=0` |
| endpoint pinned | no, so per-human caps are inactive |

A mock passport registers on Self's **staging** hub while this gateway verifies against
the **mainnet** hub, so a mock proof fails with `InvalidRoot: Onchain root does not exist`
— surfaced to the user only as "proof could not be verified". The user needs a real
passport. Do not suggest `verify mock`: gateways that re-verify, including this one,
refuse it.

Those scope, age, and OFAC values are CLI defaults. The user must run:

```sh
npx --yes @celo/buy@0.4.1 verify hosted \
  --endpoint https://buy.celo-testnet.org/self/api/verify
```

This step needs only the Self mobile app with the user's REAL passport, then scan the
displayed QR code. Mock passports are rejected by this deployment: they register on
Self's staging hub, and the gateway verifies against the mainnet hub, so a mock proof
fails with `InvalidRoot: Onchain root does not exist`. No tunnel and no
`cloudflared` — the gateway hosts the Self receiver, so nothing listens on the user's
machine. This gateway hosts a receiver but does not **pin** one, so its 402 carries no
`endpoint` field and there is nothing to copy out of a failed `buy curl` — use the URL
above. Against a gateway that does pin, the 402's `extra.selfRequirements.endpoint` is
authoritative and overrides it.

Only the user can complete this proof. If it is missing or stale, stop and ask them to
run the command again. Retrying a purchase does not create or refresh an attestation.

## Quote, approve, then buy through MCP

Pass `body` as a raw JSON string, not as an object. Quote with the exact body that will be
used for the purchase:

```text
buy_pay_quote
  url:    https://buy.celo-testnet.org/gcloud/vm
  method: POST
  body:   "{\"script\":\"uname -a; nproc\",\"machineType\":\"e2-micro\"}"
```

Read the selected token requirement and its `maxAmountRequired`. `buy_pay_quote` never
signs or pays. If the user has not already approved that spend, state the human-readable
amount and token and wait for approval.

Then reuse the same URL, method, and body:

```text
buy_curl
  url:       https://buy.celo-testnet.org/gcloud/vm
  method:    POST
  body:      "{\"script\":\"uname -a; nproc\",\"machineType\":\"e2-micro\"}"
  maxAmount: "<maxAmountRequired from the quote>"
```

`maxAmount` is in atomic token units; USDC and USDT both use six decimals. Omit any
`sandbox` field. The default token is USDC; honor an explicit request for USDT.

## Buy through the CLI

An unpaid ordinary `curl` POST returns the 402 quote. The buy CLI performs the paid retry:

```bash
(
  umask 077
  set -o pipefail
  response_file=$(mktemp ./buy-vm.XXXXXX) || exit
  npx --yes @celo/buy@0.4.1 --verbose curl --max-amount 0.02 \
    -X POST \
    --data '{"script":"uname -a; nproc","machineType":"e2-micro"}' \
    https://buy.celo-testnet.org/gcloud/vm | tee "$response_file"
  response_status=$?
  printf 'Private response saved to %s\n' "$response_file" >&2
  exit "$response_status"
)
```

Set `--max-amount` from the current quote rather than copying the example. Add
`--token USDT` only when the user chose USDT. Keep the generated response file private: it
contains the poll URL used to read the result. Delete it after the lease and retained-result
window end.

## Collect the result

A successful purchase returns a transaction hash, instance name, expiry, and a signed
`poll` URL. Poll that exact URL with an ordinary free GET; do not reconstruct it from the
transaction hash.

Wait about 15 seconds between polls. Interpret the response as follows:

- missing or null `scriptStatus`: the VM is still starting or running (script route).
- `scriptStatus: "not_requested"`: this is an SSH lease; no script was submitted.
- `scriptStatus: "done"`: return `result` to the user.
- `scriptStatus: "failed:<code>"`: return the captured result and exit code.
- `vmStatus: "DELETED"`: the lease ended; a retained result may still be present.

The VM has outbound DNS, HTTP, HTTPS, and NTP, but no GCP service account or cloud
credentials. Output is bounded, so send large artifacts to storage chosen by the user
rather than printing them.

## Buy an SSH session instead

`POST /gcloud/ssh` sells the same machine with an external IP and the caller's public key
injected, instead of running a script. Quote it exactly like the script route. With the CLI, use:

```sh
npx --yes @celo/buy@0.4.1 --verbose curl --max-amount 0.07 \
  -X POST \
  --data '{"sshKey":"ssh-ed25519 AAAA… user@host","machineType":"e2-micro"}' \
  https://buy.celo-testnet.org/gcloud/ssh
```

With MCP, use:

```text
buy_pay_quote
  url:    https://buy.celo-testnet.org/gcloud/ssh
  method: POST
  body:   "{\"sshKey\":\"ssh-ed25519 AAAA… user@host\",\"machineType\":\"e2-micro\"}"
```

Send the *public* key — the contents of `~/.ssh/<name>.pub`. Never send a private key. Reuse
a key the user already has rather than generating one, and if you do generate one, say where
it was written.

A successful purchase returns the usual `transaction`, `instance`, `expiresAt`, and `poll`
fields, plus `ip`, `user`, and a ready-made `ssh` command:

```json
{"instance":"<instance>","ip":"35.212.153.43","user":"buy","ssh":"ssh buy@35.212.153.43",
 "expiresAt":"…","poll":"https://buy.celo-testnet.org/gcloud/vm/<token>"}
```

The poll URL stays under `/gcloud/vm/<token>` for both routes, and so does renewal.
`vmStatus` reaches `RUNNING` before sshd accepts connections; allow roughly 20 seconds more,
then connect with the matching private key.

GCP recycles these external IPs, so a later lease can land on one and trip
`REMOTE HOST IDENTIFICATION HAS CHANGED`. Offer
`-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null` when that happens.

Egress is the one cost this service does not cap, and an interactive session is where it
runs up: the traffic bills the gateway operator, not the buyer. Prefer `/gcloud/vm` when a
script would do, and buy SSH only when the user actually wants a shell.

## Renew only when needed

Use the original poll token:

```text
buy_pay_quote
  url:    https://buy.celo-testnet.org/gcloud/vm/<poll-token>/renew
  method: POST
```

Then use the renewal quote's atomic amount:

```text
buy_curl
  url:       https://buy.celo-testnet.org/gcloud/vm/<poll-token>/renew
  method:    POST
  maxAmount: "<maxAmountRequired from the renewal quote>"
```

Quote that renewal URL first, obtain approval for the new payment, and use the returned
`maxAmountRequired`. A renewal is a separate irreversible payment and reboots the VM;
for the attestation-gated `e2-standard-*` sizes it also rechecks the Self attestation. The boot disk survives, but the ephemeral external IP may
change; always use the renewed response's `ip` and expect SSH to warn about a changed host key. It cannot extend the instance beyond 24 hours from its
original creation. A completed script normally does not need renewal because its result
is retained for polling.

The paying wallet is the ownership check that binds today. A different wallet receives
`403 not_your_lease`. The verified Self identity half of that ownership check is inactive
while the per-human limits and stable server-side Self endpoint are disabled, so describe
the current rule as wallet-only. Self verification is rechecked only when the VM type is
in the attestation-gated tier.

`200` with `unconfirmed: true` means the extension succeeded but the new deadline could
not yet be read back. No refund is due. Poll for the confirmed deadline; this is not a
failed renewal.

## Failure handling

| Response | Charged? | Action |
|---|---|---|
| `400` | No | Correct the body, script, or machine type. |
| `404` on `/gcloud/ssh` | No | That deployment runs `BUY_GCE_ALLOW_SSH=0`. Use `/gcloud/vm`. |
| `insufficient_balance` (client-side balance check) | No | The wallet cannot cover the price. For a KYC-gated request, Self attestation is checked first; an unverified wallet may see `self_attestation_required` before the balance check. Once the attestation is available, no payment is signed or sent. Fund the wallet, then retry. There is no mainnet faucet.
| `402 verify_payment_failed` | No | Ask the user to fund or select the correct wallet/token. |
| `402 verify_self_failed` | No | Ask the user to rerun `verify hosted --endpoint https://buy.celo-testnet.org/self/api/verify`. |
| `403` or `409` on renewal | No | Follow the returned ownership, lifetime, or transition error. |
| `503 at_capacity` | No | Retry later only if the user still wants the purchase. |
| `503 at_spend_capacity` | No | Try a smaller VM or retry later with user approval. |
| `503 coordination_unavailable` | No | Stop; the service cannot safely admit a payment. |
| `500 provision_failed` | Yes | Never retry. Report the transaction and correlation ID. |
| `500 settle_uncertain` | Maybe | Never retry. Preserve the transaction, poll URL, and correlation ID. |
| `500 renew_failed` | Yes | Never retry. Report the outcome, VM status, and transaction. |

A network disconnect after sending a paid request is also ambiguous. Do not purchase a
replacement merely because the response was lost. Preserve any receipt or transaction
information and tell the user what is known.

Inspect local payment history with `buy receipts` (or
`npx --yes @celo/buy@0.4.1 receipts`). It can show the time, target URL, amount, and network;
some non-streamed entries also include a transaction hash. It is not full VM recovery
today: streamed `buy curl` receipts do not retain the paid response, transaction hash,
poll URL, instance, IP, or correlation ID. That limitation is tracked in
[cpay#85](https://github.com/celo-org/cpay/issues/85).
For CLI purchases, preserve the response with the private `tee` pattern above; do not retry
a payment because recovery fields are absent from a receipt.
