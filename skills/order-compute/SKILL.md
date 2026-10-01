---
name: order-compute
description: Buy a short-lived GCP VM through the public buy gateway when a user or agent needs isolated Linux compute for a command, script, build, or demo, or an interactive SSH session on a real machine. Use for requests to rent, order, buy, or provision disposable compute. Do not use when a local sandbox already fits.
---

# Order compute with buy

Buy a real, short-lived Debian VM that runs one script as root and returns its output. The
public beta gateway is:

```text
https://usebuy.ai/google/vm
```

It settles real USDC, USDT or USAT on Celo mainnet. Payment is irreversible. Use a local
sandbox instead when it can do the work safely.

## Fast path

Follow these steps; only the purchase costs money:

1. `GET https://usebuy.ai/google/catalog`, free. One response lists every machine type
   with its price, RAM, guaranteed vCPU share and whether Self attestation is required,
   plus the accepted tokens. Choose the type from this; do not probe each type with a POST.
2. Quote the exact body once (`buy_pay_quote`, or an unpaid `curl` POST), free. This
   confirms the price for that body: read `price.atomic` from the MCP quote, or
   `maxAmountRequired` from the selected requirement in the raw 402 response.
3. Pay once with the same URL, method, headers, and body (`buy_curl`, or `buy curl`).
4. For scripts, poll the returned URL with a free GET until `scriptStatus` is `done`
   or `failed:<code>`, then report the result. For SSH, `scriptStatus: "not_requested"`
   is expected: use the returned IP and `ssh` command once `vmStatus` is `RUNNING`,
   allowing roughly 20 more seconds for sshd. Stop if the lease expires, the VM is
   deleted or preempted, or the poll returns `404 no such lease`; return any retained
   result, or report that no result is available.

Everything below explains each step. Do not add calls between them: each extra probe adds
latency for the user, and an extra *paid* call is a second charge.

## Non-negotiable boundaries

- Quote before paying. The request body determines the price.
- Obtain the user's approval for the exact token and maximum amount unless their request
  already authorizes that spend.
- Never use `--sandbox`, and never buy from an account created with `--network sepolia`.
  This gateway exists on Celo mainnet only; there is no testnet deployment, and a testnet
  account gets `no_matching_requirements` because every `accepts` entry names `celo`.
  Testing costs real money here: use the smallest type and a one-line script.
- Budget every settlement at the quoted price. The 402 quotes the full amount, and no
  response reports a free allowance or a remaining count; do not promise the user one.
- Never retry `500 provision_failed` or `500 settle_uncertain`. Payment succeeded or may
  have succeeded, so a retry can charge twice. `buy receipts --resolve` says which.
- Report the paid amount, token, transaction hash, instance, expiry, and poll URL.
- Preserve the paid response. The poll URL is a capability; `buy receipts` keeps it, but
  not the instance, IP, or correlation ID.
- SSH is a second purchase route, not a flag on `/google/vm`. It is enabled on the public
  deployment. Quote and buy `/google/ssh` for it, and tell the user an interactive session
  bills egress to the operator, so they should close it when done.

## What is available

Before choosing a machine type or calculating a payment, query the live catalog. With the
CLI, issue a free `GET` request to:

```text
https://usebuy.ai/google/catalog
```

`GET /google/catalog` is free and side-effect free. Each `machineTypes` entry names
`machineType`, `vcpu` (guaranteed vCPU share), `guestCpus` (guest CPU count), `memoryGb`,
`diskGb`, `priceAtomic`, `priceUsd`, and `attestationRequired`. `priceAtomic` is a string
in six-decimal token units: `16753` means `0.016753` USDC, USDT, or USAT. `priceUsd` is
the corresponding decimal lease price. Use the top-level `network`, `region`, `tokens`,
`leaseSeconds`, and `maxTotalLeaseSeconds` fields for the current service configuration.
Read top-level `responseWait` before paying for purchase and renewal wait guidance.
Treat the catalog as the live source for choosing a type and price; still quote the exact
purchase body before paying, because the 402 challenge is authoritative for that request.

Two purchase routes sell the same machines at the same price. They differ only in what
they hand back:

| Route | Body | You get |
|---|---|---|
| `POST /google/vm` | `{"script":"…","machineType":"…"}` | the script's stdout, via the poll URL |
| `POST /google/ssh` | `{"sshKey":"ssh-ed25519 …","machineType":"…"}` | an external IP and an `ssh` command |

`script` is required on `/google/vm` and limited to 4 KiB. `sshKey` is required on
`/google/ssh`. `machineType` is optional on both and defaults to `e2-micro`.

| Type | vCPU share | `nproc` | RAM | 1h quote (USDC, USDT or USAT) | Attestation |
|---|---:|---:|---:|---:|---|
| `e2-micro` | 0.25 | 2 | 1 GiB | 0.016753 | not required |
| `e2-small` | 0.5 | 2 | 2 GiB | 0.033506 | not required |
| `e2-medium` | 1 | 2 | 4 GiB | 0.067011 | not required |
| `e2-standard-2` | 2 | 2 | 8 GiB | 0.134023 | **required** |
| `e2-standard-4` | 4 | 4 | 16 GiB | 0.268046 | **required** |
| `e2-standard-8` | 8 | 8 | 32 GiB | 0.536091 | **required** |

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

Prices above are indicative; the catalog and the 402 quote for the exact body are
authoritative, and anything written here can age.

These are standard on-demand VMs, never Spot. They run in `us-west1`, start with a
one-hour lease, and may be renewed up to 24 hours total from creation.

**Egress is restricted, and a denied connection hangs instead of failing.** A leased VM
can reach DNS (53), HTTP (80), HTTPS (443) and NTP (123), and nothing else — outbound
SSH, SMTP and arbitrary TCP are silently dropped. `apt`, `curl`, `git` over HTTPS and
package registries work. Anything else waits forever, inside a lease the user has already
paid for, and the poll never reaches `done`. Wrap every outbound call in a script with an
explicit timeout, for example `timeout 20 curl -sS https://example.com/api` or
`timeout 5 bash -c 'cat < /dev/tcp/host/25'`, so a blocked port turns into an exit code
the script can report rather than a lease that runs out. Inbound, only port 22 is open,
and only on `/google/ssh` purchases, which are the only ones given an external IP.

Choose the smallest machine that fits:

- `e2-micro`: shell utilities, network probes, and small scripts.
- `e2-small`: light builds or jobs that need 2 GiB RAM.
- `e2-medium`: heavier builds that fit in one core and 4 GiB.
- `e2-standard-2`, `e2-standard-4`, and `e2-standard-8`: larger builds with 8, 16, and
  32 GiB RAM respectively; these require a Self attestation.

The public service admits at most 25 live or provisioning VMs and $25/hour of aggregate
catalogued compute. Each VM may send at most 10 GB of network egress; one that sends
more is deleted within minutes, and its lease is not refunded.

## Prepare the user's wallet

The public package requires Node.js 20 or newer and does not require repository access.
Use the pinned release:

```sh
npx --yes @celo/buy@0.8.0 setup --name demo
```

Creating a wallet writes a private key to the user's OS keychain. Do it only with their
knowledge. If the user has already declared a paying wallet elsewhere (a registration
form, a leaderboard, an allowlist), do not generate a second one: have them run
`setup --import --name demo` themselves with the raw hex key in `BUY_IMPORT_KEY` or on
stdin. Never ask for the key or pass it as an argument. Have the user fund the printed address with a small amount of USDC, USDT or USAT on
Celo mainnet. The wallet does not need CELO: the gateway sponsor pays gas, and `buy send`
pays its gas in the token it sends.

Set a daily spend cap before the first purchase. An agent buying on someone's behalf
should have a ceiling that does not depend on the agent behaving:

```sh
npx --yes @celo/buy@0.8.0 account cap demo 1.00
```

**The amount is in stablecoins (USDC/USDT/USAT), not atomic units.** `1.00` means one
dollar per day, and the cap is one ceiling over every stablecoin the wallet spends — a USDT
purchase counts against it exactly as a USDC one does. A figure of
1000 or more is refused unless `--force` is passed, because a large round number is far
more likely a units mistake than an intent — and a cap only fails dangerously in one
direction. `account list` shows the cap, `--clear` removes it.

Check the balance before quoting. The command differs by client, which is worth
knowing before a purchase fails on funds:

- **MCP agents**: `buy_balance` (and `buy_whoami` for the address and network)
- **CLI**: `buy whoami`, which prints the address and every token balance. There is
  no `buy balance` subcommand.

The MCP server is optional. The CLI performs every operation the tools do, so a host
that cannot run it loses nothing but typed `maxAmount` fields. For agent clients that
want it:

```sh
npx --yes @celo/buy@0.8.0 mcp install --client all
```

Restart the client after its MCP configuration changes. The MCP server uses the same
keychain wallet; it does not expose the private key to the agent. If `mcp install` cannot
register with a client, register it with the client's own command at the same user scope
`mcp install` uses; for Claude Code:

```sh
claude mcp add -s user buy -- npx --yes @celo/buy@0.8.0 mcp serve
```

## Obtain the Self attestation

**Only `e2-standard-2`, `e2-standard-4`, and `e2-standard-8` require one.**
`e2-micro`, `e2-small`, and `e2-medium` are buyable with no proof at all, on both routes —
the gateway requires an attestation only above a spend threshold, so
someone without a compatible identity document can still use the service. Check before
sending a user through verification: read `attestationRequired` for the chosen type from
`GET /google/catalog`, which answers for every size in one free call. The 402 quote
confirms it for the exact body — a challenge with no `extra.selfRequirements` needs no
attestation — but do not use the 402 as the way to discover it across types.

Where one IS required, these are the live requirements, as served by the gateway today:

| Setting | Value |
|---|---|
| scope | `buy.celo` |
| endpoint type | `https` (production Self hub, Celo mainnet) |
| hosted receiver | `https://usebuy.ai/self/api/verify` |
| minimum age | 18 |
| OFAC screening | enabled |
| mock passports | **rejected** — the gateway runs `BUY_SELF_MOCK_PASSPORT=0` |

A mock passport registers on Self's **staging** hub while this gateway verifies against
the **mainnet** hub, so a mock proof fails with `InvalidRoot: Onchain root does not exist`
— surfaced to the user only as "proof could not be verified". The user needs a real
passport. Do not suggest `verify mock`: gateways that re-verify, including this one,
refuse it.

Those scope, age, and OFAC values are CLI defaults. The user must run:

```sh
npx --yes @celo/buy@0.8.0 verify hosted \
  --endpoint https://usebuy.ai/self/api/verify
```

This step needs only the Self mobile app and the user's passport: scan the displayed QR
code. The gateway hosts the Self receiver, so nothing runs on the user's machine. Its 402
carries no `endpoint` field, so use the URL above; when a gateway's 402 does carry
`extra.selfRequirements.endpoint`, that value is authoritative.

Only the user can complete this proof. If it is missing or stale, stop and ask them to
run the command again. Retrying a purchase does not create or refresh an attestation.

## Quote, approve, then buy through MCP

Pass `body` as a raw JSON string, not as an object. Quote with the exact body that will be
used for the purchase:

```text
buy_pay_quote
  url:     https://usebuy.ai/google/vm
  method:  POST
  headers: {"content-type":"application/json"}
  body:    "{\"script\":\"uname -a; nproc\",\"machineType\":\"e2-micro\"}"
```

Read `price.atomic` and `price.token` from the MCP quote. `price.atomic` is the selected
requirement's `maxAmountRequired` from the raw 402 response. `buy_pay_quote` never signs
or pays. If the user has not already approved that spend, state the human-readable
amount and token and wait for approval.

Then reuse the same URL, method, headers, and body:

```text
buy_curl
  url:       https://usebuy.ai/google/vm
  method:    POST
  headers:   {"content-type":"application/json"}
  body:      "{\"script\":\"uname -a; nproc\",\"machineType\":\"e2-micro\"}"
  maxAmount: "<price.atomic from the MCP quote>"
```

`maxAmount` is in atomic token units; USDC, USDT and USAT all use six decimals. Omit any
`sandbox` field. The default token is USDC; honor an explicit request for USDT or USAT.

## Buy through the CLI

An unpaid ordinary `curl` POST returns the 402 quote. The buy CLI performs the paid retry:

```bash
(
  umask 077
  set -o pipefail
  response_file=$(mktemp ./buy-vm.XXXXXX) || exit
  npx --yes @celo/buy@0.8.0 --verbose curl --max-amount 0.02 \
    -X POST -H 'content-type: application/json' \
    --data '{"script":"uname -a; nproc","machineType":"e2-micro"}' \
    https://usebuy.ai/google/vm | tee "$response_file"
  response_status=$?
  printf 'Private response saved to %s\n' "$response_file" >&2
  exit "$response_status"
)
```

Keep the URL, method, headers, and body identical between the unpaid quote and paid
request. Set `--max-amount` from the current quote rather than copying the example.
**`--max-amount` is a decimal token amount, while the raw 402's `maxAmountRequired`,
the MCP quote's `price.atomic`, and the MCP `maxAmount` field are atomic.**
A quote of `16753` atomic is `0.016753` USDC, so pass
`--max-amount 0.016753` or a little more; `--max-amount 16753` would authorize 16,753 USDC.
Add `--token USDT` or `--token USAT` only when the user chose that token. Keep the generated
response file private: it contains the poll URL used to read the result. Delete it after
the lease and retained-result window end.

The 402 this gateway returns carries `"x402Version": 1`. Celo's public facilitator at
`api.x402.celo.org`, and resource servers built on `@x402/express`, issue version 2. The
buy CLI and MCP server handle this gateway's challenge; a client written against the other
version may fail at parse time with no hint that two versions exist, so name the version
when a third-party client cannot read the challenge.

### Preview the price without paying

`buy quote` sends the unpaid request and prints every `accepts` entry in decimal and atomic
units, with the token, network, `payTo` and description. It needs no wallet and never signs:

```sh
npx --yes @celo/buy@0.8.0 quote -X POST -H 'content-type: application/json' \
  --data '{"script":"uname -a; nproc","machineType":"e2-micro"}' \
  https://usebuy.ai/google/vm
```

Add `--json` to get the raw 402 envelope instead of the table. Without the CLI, the same
preview is the 402 itself, which any unpaid request receives:

```sh
curl -s -X POST -H 'content-type: application/json' \
  --data '{"script":"uname -a; nproc","machineType":"e2-micro"}' \
  https://usebuy.ai/google/vm | jq '.accepts[] | {asset, maxAmountRequired, description}'
```

Each `accepts` entry is one token at the same atomic price. With MCP, `buy_pay_quote` does
the same and never signs.

### Read the outcome from the body, not the exit code

`buy curl` has been observed exiting `1` after a paid request that returned HTTP 200 with
a complete body on stdout and nothing on stderr, on `/google/ssh` and on renewal. A complete JSON response carrying `transaction` and `poll` means the payment
settled and the purchase exists, whatever the exit code says. Never treat a non-zero exit
alone as a failed purchase, and never buy again because of one. Check the saved response
file first, then `buy receipts`.

## Collect the result

**Expect the paid request to block for about a minute.** The payment is signed and settled
at the start of that window, and the gateway returns nothing until the VM is provisioned;
observed waits run 45 to 75 seconds with no output on either stream. Do not interrupt it:
a Ctrl-C after signing leaves a charged VM whose poll URL was never received. Run the paid
`curl` only with stdout redirected, as in the `tee` pattern above; with `--verbose` on a
terminal the streamed body has been observed cut off inside the `poll` field.

A successful purchase returns a transaction hash, instance name, expiry, and a signed
`poll` URL. Poll that exact URL with an ordinary free GET.

**The poll URL cannot be rebuilt.** It is not derived from the transaction hash or the
instance name: `https://usebuy.ai/google/vm/<instance>` answers `{"error":"not_found"}`.
If the response was lost, run `buy receipts`: the purchase row carries a `poll` line, read
from the paid response's `Content-Location` header. With neither the response nor that
line, the lease is paid for and unreachable, and buying again is a second purchase.

Wait about 15 seconds between polls. A poll response looks like this; there is no
top-level `status` field:

```json
{"instance":"cpay-5d9837674811","vmStatus":"RUNNING","scriptStatus":"done",
 "result":"Linux cpay-5d9837674811 6.1.0-53-cloud-amd64 …\n2\n",
 "expiresAt":"2026-09-19T12:40:04.474Z"}
```

Interpret it as follows:

- missing or null `scriptStatus`: the VM is still starting or running (script route).
- `scriptStatus: "not_requested"`: this is an SSH lease; no script was submitted.
- `scriptStatus: "done"`: return `result` to the user.
- `scriptStatus: "failed:<code>"`: return the captured result and exit code.
- `vmStatus: "DELETED"` or `"PREEMPTED"`, the lease has reached `expiresAt`, or the
  poll returns `404 no such lease`: stop polling and return any retained result; if
  none is present, report that the lease ended without an available result.

For SSH, do not wait for `scriptStatus: "done"`; no script was requested. Use the
returned `ip` and `ssh` command when `vmStatus` is `RUNNING`, allowing roughly 20 more
seconds for sshd to accept connections.

On the script route the script runs as `root`; the `buy` login with passwordless `sudo`
belongs to the SSH route. The VM has outbound DNS, HTTP, HTTPS, and NTP, but no GCP service
account or cloud credentials. Output is bounded, so send large artifacts to storage chosen by the user
rather than printing them.

## Buy through the CLI on Windows

The CLI is developed on macOS and Linux. It works on Windows, with three things that have
each cost a first-time user an hour:

- **Schannel revocation errors.** A stock Windows `curl` may refuse `https://usebuy.ai`
  with a certificate-revocation check failure. Pass `--ssl-no-revoke` through `buy curl`,
  or run the CLI under WSL, where the commands in this skill work unchanged.
- **PowerShell 5.1 corrupts an inline JSON body.** The `buy.ps1` wrapper that npm installs
  forwards arguments in a way that strips braces and quotes from `-d '{…}'`, and
  `Out-File -Encoding utf8` prepends a byte-order mark that the console hides but the
  gateway rejects with `400 body must be valid JSON`. Write the body to a file without a
  BOM and let curl read it:

  ```powershell
  $body = '{"script":"uname -a; nproc","machineType":"e2-micro"}'
  [IO.File]::WriteAllText("$PWD\body.json", $body, (New-Object Text.UTF8Encoding $false))
  npx --yes @celo/buy@0.8.0 curl --max-amount 0.02 -X POST `
    -H "content-type: application/json" -d "@body.json" `
    https://usebuy.ai/google/vm | Tee-Object -Variable response
  [IO.File]::WriteAllLines("$PWD\response.json", $response, (New-Object Text.UTF8Encoding $false))
  ```

  Save the response the same way. On PowerShell 5.1 `Tee-Object -FilePath` writes UTF-16LE
  (`-Encoding` only exists from PowerShell 7.2), and a UTF-16 file holding the one copy of
  the poll URL is rejected by `jq` and every UTF-8 JSON parser.

  Global flags such as `--account` and `--verbose` go before `curl`; placed after the URL
  they are forwarded to curl, which rejects them.
- **Keep stdout and stderr apart.** The server body is stdout and the CLI's JSON error
  envelope is stderr, and PowerShell 5.1 additionally wraps native stderr in a
  `NativeCommandError` record. Redirecting `2>&1` into one file interleaves two objects that
  both start with `"error"`. Capture stdout alone and read stderr separately.

## Buy an SSH session instead

`POST /google/ssh` sells the same machine with an external IP and the caller's public key
injected, instead of running a script. Quote it exactly like the script route. With the CLI, use:

```sh
npx --yes @celo/buy@0.8.0 --verbose curl --max-amount 0.07 \
  -X POST -H 'content-type: application/json' \
  --data '{"sshKey":"ssh-ed25519 AAAA… user@host","machineType":"e2-micro"}' \
  https://usebuy.ai/google/ssh
```

With MCP, use:

```text
buy_pay_quote
  url:     https://usebuy.ai/google/ssh
  method:  POST
  headers: {"content-type":"application/json"}
  body:    "{\"sshKey\":\"ssh-ed25519 AAAA… user@host\",\"machineType\":\"e2-micro\"}"
```

Send the *public* key — the contents of `~/.ssh/<name>.pub`. Never send a private key. Reuse
a key the user already has rather than generating one, and if you do generate one, say where
it was written.

A successful purchase returns the usual `transaction`, `instance`, `expiresAt`, and `poll`
fields, plus `ip`, `user`, and a ready-made `ssh` command:

```json
{"instance":"<instance>","ip":"35.212.153.43","user":"buy","ssh":"ssh buy@35.212.153.43",
 "expiresAt":"…","poll":"https://usebuy.ai/google/vm/<token>"}
```

The poll URL stays under `/google/vm/<token>` for both routes, and so does renewal.
`vmStatus` reaches `RUNNING` before sshd accepts connections; allow roughly 20 seconds more,
then connect with the matching private key.

GCP recycles these external IPs, so a later lease can land on one and trip
`REMOTE HOST IDENTIFICATION HAS CHANGED`. Offer
`-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null` when that happens.

Egress is the one cost this service does not cap, and an interactive session is where it
runs up: the traffic bills the gateway operator, not the buyer. Prefer `/google/vm` when a
script would do, and buy SSH only when the user actually wants a shell.

## Renew only when needed

Use the original poll token:

```text
buy_pay_quote
  url:    https://usebuy.ai/google/vm/<poll-token>/renew
  method: POST
```

Then use the renewal quote's atomic amount:

```text
buy_curl
  url:       https://usebuy.ai/google/vm/<poll-token>/renew
  method:    POST
  maxAmount: "<price.atomic from the MCP renewal quote>"
```

Quote that renewal URL first, obtain approval for the new payment, and use the returned
`price.atomic` from the MCP quote (`maxAmountRequired` in the raw 402 response).
A renewal is a separate irreversible payment and reboots the VM;
for the attestation-gated `e2-standard-*` sizes it also rechecks the Self attestation. The boot disk survives, and the renewal quote describes the external IP as surviving too;
it has been observed to survive, and the quoted 2–3 minutes of downtime measured about one
minute from the request to sshd accepting connections again. Still read `ip` from the
renewed response rather than assuming it, and if it did change expect SSH to warn about a
changed host key. A renewal cannot extend the instance beyond 24 hours from its original
creation. A completed script normally does not need renewal because its result
is retained for polling.

Renewal ownership is wallet-only: a different wallet receives `403 not_your_lease`,
meaning a different address paid — the user's identity has not changed and re-verifying
will not help. The verified Self identity half of that check is inactive.

`200` with `unconfirmed: true` means the extension succeeded but the new deadline could
not yet be read back. No refund is due. Poll for the confirmed deadline; this is not a
failed renewal.

## Failure handling

| Response | Charged? | Action |
|---|---|---|
| `400` | No | Correct the body, script, or machine type. |
| `404` on `/google/ssh` | No | That deployment runs `BUY_GCE_ALLOW_SSH=0`. Use `/google/vm`. |
| `insufficient_balance` (client-side balance check) | No | The wallet cannot cover the price. For a KYC-gated request, Self attestation is checked first; an unverified wallet may see `self_attestation_required` before the balance check. Once the attestation is available, no payment is signed or sent. Fund the wallet, then retry. There is no mainnet faucet.
| `402 verify_payment_failed` | No | Ask the user to fund or select the correct wallet/token. |
| `402 verify_self_failed` | No | Ask the user to rerun `verify hosted --endpoint https://usebuy.ai/self/api/verify`. |
| `403` or `409` on renewal | No | Follow the returned ownership, lifetime, or transition error. |
| `503 at_capacity` | No | Retry later only if the user still wants the purchase. |
| `503 at_spend_capacity` | No | Try a smaller VM or retry later with user approval. |
| `503 coordination_unavailable` | No | Stop; the service cannot safely admit a payment. |
| `500 provision_failed` | Yes | Never retry. Report the transaction and correlation ID. |
| `500 settle_uncertain` | Maybe | Never retry. Preserve the transaction, poll URL, and correlation ID. |
| `500 renew_failed` | Yes | Never retry. Report the outcome, VM status, and transaction. |
| `no_matching_requirements` (client-side) | No | The account is on a different network from the gateway, usually a `--network sepolia` account or `--sandbox`. Nothing was signed. Switch to a mainnet account with `--account`; there is no testnet gateway to point at instead. |

A network disconnect after sending a paid request is also ambiguous. Do not purchase a
replacement merely because the response was lost. Preserve any receipt or transaction
information and tell the user what is known.

**Why the retry rule is asymmetric.** Every refusal in the table marked "No" happens
before settlement: the client refused to sign, or the gateway refused the payment. Those
are safe to send again once the cause is fixed. The `500` rows are returned *after* the
gateway has settled, or while it cannot tell whether it did, and a second request is not a
resend of the first payment: it is a new payment with a new transaction. Nothing on the
client can prove that a lost or ambiguous settlement did not land, so "no payment found"
is never permission to buy again. The section below says what can be established.

### After `settle_uncertain`

The response says the payment may have settled. `buy receipts --resolve` answers that from
the token contract, without trusting the gateway. Do this, in order, and do not buy again
while any step is open:

1. Read the saved response file for a `transaction` or `poll` field, and take the
   correlation ID from the `500` body there; the CLI records no correlation ID anywhere
   else. A lost response is not evidence that nothing was paid.
2. Run `buy receipts --resolve`. It prints one answer per receipt still in doubt:
   - `settled <tx>`: paid, in that transaction.
   - `not settled: the authorization expired unused …`: it can never settle; paying
     again is safe.
   - `not settled yet: it can still settle until <time> …`: do not pay again before that
     time; run the command again after it.
   - `settlement unknown: <reason>` or `cannot resolve: …`: go on to step 3. A payment
     made with `0.7.0` or earlier says `cannot resolve`, because its receipt has no
     authorization to check.
3. Take the wallet address from `buy whoami` and open it on a Celo block explorer, on the
   address's **Token transfers** tab, not Transactions: the facilitator broadcasts the
   settlement, so it never appears in the payer's Transactions list. Look for an outgoing
   transfer of the quoted amount to the gateway's `payTo` address at the time of the
   request. A transfer that exists is the payment, and its transaction hash identifies the
   purchase.
4. Report the amount, token, correlation ID, and transaction hash if any to the user, and
   file feedback with those fields so the maintainers can look the settlement up.

Inspect local payment history with `buy receipts` (or
`npx --yes @celo/buy@0.8.0 receipts`). It shows the time, target URL, amount, network and
outcome, the settlement transaction hash when the gateway returned one, and for a VM
purchase the poll URL. It does not keep the response body, instance, IP, or correlation ID,
so for CLI purchases preserve the response with the private `tee` pattern above; do not
retry a payment because recovery fields are absent from a receipt.
