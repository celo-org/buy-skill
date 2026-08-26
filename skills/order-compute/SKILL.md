---
name: order-compute
description: Buy a short-lived GCP VM through the public buy gateway when a user or agent needs isolated Linux compute for a command, script, build, or demo, or an interactive SSH session on a real machine. Use for requests to rent, order, buy, or provision disposable compute. Do not use when a local sandbox already fits.
---

# Order compute with buy

Buy a real, short-lived Debian VM that runs one script as root and returns its output. The
public gateway is:

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
- SSH is a second purchase route, not a flag on `/gcloud/vm`. It is enabled on the public
  deployment. Quote and buy `/gcloud/ssh` for it, and tell the user an interactive session
  bills egress to the operator, so they should close it when done.

## What is available

Two purchase routes sell the same machines at the same price. They differ only in what
they hand back:

| Route | Body | You get |
|---|---|---|
| `POST /gcloud/vm` | `{"script":"…","machineType":"…"}` | the script's stdout, via the poll URL |
| `POST /gcloud/ssh` | `{"sshKey":"ssh-ed25519 …","machineType":"…"}` | an external IP and an `ssh` command |

`script` is required on `/gcloud/vm` and limited to 4 KiB. `sshKey` is required on
`/gcloud/ssh`. `machineType` is optional on both and defaults to `e2-micro`.

| Type | vCPU | RAM | Typical 1h quote |
|---|---:|---:|---:|
| `e2-micro` | 0.25 | 1 GiB | 0.016753 USDC or USDT |
| `e2-small` | 0.5 | 2 GiB | 0.033506 USDC or USDT |
| `e2-medium` | 1 | 4 GiB | 0.067011 USDC or USDT |

Treat those prices as examples, not constants. The unpaid quote is authoritative. These
are standard on-demand VMs, never Spot. They run in `us-west1`, start with a one-hour
lease, and may be renewed up to 24 hours total from creation.

Choose the smallest machine that fits:

- `e2-micro`: shell utilities, network probes, and small scripts.
- `e2-small`: light builds or jobs that need 2 GiB RAM.
- `e2-medium`: heavier builds within the service's one-core, 4 GiB ceiling.

The public service admits at most 50 live or provisioning VMs and $2/hour of aggregate
catalogued compute across all callers. A request beyond either limit is refused with `503`
before anything is charged.

## Prepare the user's wallet

The public package requires Node.js 20 or newer and does not require repository access.
Use the pinned release:

```sh
npx --yes @celo/buy@0.4.0 setup --name buy
```

Creating a wallet writes a private key to the user's OS keychain. Do it only with their
knowledge. Have the user fund the printed address with a small amount of USDC or USDT on
Celo mainnet. The wallet does not need CELO because the gateway sponsor pays gas.

For agent clients, install the local MCP server:

```sh
npx --yes @celo/buy@0.4.0 mcp install --client all
```

Restart the client after its MCP configuration changes. The MCP server uses the same
keychain wallet; it does not expose the private key to the agent.

## Obtain the Self attestation

Every purchase and renewal requires a Self.xyz proof with these live requirements:

- scope: `buy.celo`
- endpoint type: `https`
- minimum age: 18
- OFAC screening: enabled
- mock passports: REJECTED, so the user needs a real passport in the Self app

Those scope, age, and OFAC values are CLI defaults. The user must run:

```sh
npx --yes @celo/buy@0.4.0 verify hosted \
  --endpoint https://buy.celo-testnet.org/self/api/verify
```

This step needs only the Self mobile app with the user's REAL passport, then scan the
displayed QR code. Mock passports are rejected by this deployment: they register on
Self's staging hub, and the gateway verifies against the mainnet hub, so a mock proof
fails with `InvalidRoot: Onchain root does not exist`. No tunnel and no
`cloudflared` — the gateway hosts the Self receiver, so nothing listens on the user's
machine. The `--endpoint` value is whatever the 402 pinned; a failed `buy curl` prints
the whole command with it already filled in, so prefer copying that over typing this.

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

```sh
npx --yes @celo/buy@0.4.0 --verbose curl --max-amount 0.02 \
  -X POST \
  --data '{"script":"uname -a; nproc","machineType":"e2-micro"}' \
  https://buy.celo-testnet.org/gcloud/vm
```

Set `--max-amount` from the current quote rather than copying the example. Add
`--token USDT` only when the user chose USDT.

## Collect the result

A successful purchase returns a transaction hash, instance name, expiry, and a signed
`poll` URL. Poll that exact URL with an ordinary free GET; do not reconstruct it from the
transaction hash.

Wait about 15 seconds between polls. Interpret the response as follows:

- missing or null `scriptStatus`: the VM is still starting or running.
- `scriptStatus: "done"`: return `result` to the user.
- `scriptStatus: "failed:<code>"`: return the captured result and exit code.
- `vmStatus: "DELETED"`: the lease ended; a retained result may still be present.

The VM has outbound DNS, HTTP, HTTPS, and NTP, but no GCP service account or cloud
credentials. Output is bounded, so send large artifacts to storage chosen by the user
rather than printing them.

## Buy an SSH session instead

`POST /gcloud/ssh` sells the same machine with an external IP and the caller's public key
injected, instead of running a script. Quote it exactly like the script route:

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
{"instance":"cpay-…","ip":"203.0.113.42","user":"cpay","ssh":"ssh cpay@203.0.113.42",
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
`maxAmountRequired`. A renewal is a separate irreversible payment, rechecks the Self
attestation, and reboots the VM. It cannot extend the instance beyond 24 hours from its
original creation. A completed script normally does not need renewal because its result
is retained for polling.

Ownership is checked against the paying wallet: a renewal sent from a different wallet
receives `403 not_your_lease`. Self verification is still required on every renewal.

`200` with `unconfirmed: true` means the extension succeeded but the new deadline could
not yet be read back. No refund is due. Poll for the confirmed deadline; this is not a
failed renewal.

## Failure handling

| Response | Charged? | Action |
|---|---|---|
| `400` | No | Correct the body, script, or machine type. |
| `404` on `/gcloud/ssh` | No | That deployment has the SSH route disabled. Use `/gcloud/vm`. |
| `insufficient_balance` (client-side, before any request) | No | The wallet cannot cover the price. Nothing was signed or sent, so this is safe to retry once the user funds the address. There is no mainnet faucet — ask them to send USDC or USDT to it. |
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
