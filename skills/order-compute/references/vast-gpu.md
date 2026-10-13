# Buy a Vast GPU lease

Use this procedure for GPU or CUDA workloads. The buyer purchases through buy;
the gateway owns the Vast account and API key. Supply only a public SSH key.
Use buy 0.8.2 or newer. Fetch the live catalog directly even if the installed
package's bundled registry does not yet contain `buy/vast-gpu`.

## Discover and obtain the product quote

Free `GET https://gateway.usebuy.ai/vast/catalog`. HTTP 404 means Vast is disabled
on that deployment. `available: false` means sales are paused or capacity is full.
Even when available, a product quote must succeed before attempting payment.

The initial product is one RTX 4090, 24 GB-class GPU memory, 40 GB disk and a fixed
PyTorch/CUDA container for 30 minutes after readiness and settlement. Read current
hardware, duration, image, tokens and wait guidance from the catalog. Price is a
live full-lease quote, not an hourly tariff. USDC, USDT and USAT are accepted on
Celo mainnet. CPU machine types, script bodies and renewals do not apply here.

Free `POST https://gateway.usebuy.ai/vast/quotes` with a public SSH key:

```sh
curl --fail --silent --show-error \
  --request POST \
  --header 'content-type: application/json' \
  --data '{"sshPublicKey":"ssh-ed25519 <public-key-base64>"}' \
  https://gateway.usebuy.ai/vast/quotes
```

Save the complete response privately, especially `id`, `purchaseUrl`, `poll`,
`expiresAt` and `price.atomic`. The `poll` URL is a bearer access token; do not put
it in public output or feedback. Product quotes expire after 60 seconds and do
not allocate a GPU. Obtain a new free quote if it expires before purchase.

Customers cannot select an image, script, duration, renewal or spot instance.
Never send a private key or a Vast API key. Retain the private SSH key locally
to connect after delivery.

## Quote the payment and buy once

Use the returned `purchaseUrl`, method `POST` and the empty JSON body `{}` for
both the unpaid x402 challenge and the paid request. Do not repeat the SSH key
in the purchase body, and do not pay the product-quote endpoint.

With MCP:

```text
buy_pay_quote
  url:    <purchaseUrl from the product quote>
  method: POST
  body:   "{}"
  token:  USDC
```

Read `price.atomic` and `price.token` from the MCP quote; the raw 402 response
instead calls the amount `accepts[].maxAmountRequired`. Confirm the challenge
price matches the product quote. Obtain approval for the selected token and full
lease price unless the user's request already authorizes that spend.
The examples select USDC. If the user selects USDT or USAT, use that same token
in both the payment quote and the paid request.

```text
buy_curl
  url:       <same purchaseUrl>
  method:    POST
  body:      "{}"
  token:     USDC
  maxAmount: "<price.atomic from the MCP quote>"
```

MCP `maxAmount` is in six-decimal atomic units. With the CLI, use decimal token
units and preserve the paid response in a private file:

```sh
umask 077
buy curl --token '<selected token>' --max-amount '<approved decimal token amount>' \
  --request POST --header 'content-type: application/json' --data '{}' \
  '<purchaseUrl>' | tee gpu-purchase.json
```

Allow up to seven minutes for GPU startup and CUDA verification before payment
settles. Do not interrupt or resend a purchase while it is pending. A stockout
before settlement does not charge the buyer; the saved poll URL remains the
recovery route if a response is lost.

## Use SSH and observe expiry

Success includes `state: delivered`, `paymentState: settled`, `settlementTx`,
`expiresAt`, `gpu`, `ssh.host`, `ssh.port`, `ssh.user` and `recoveryId`.

```sh
ssh -i <local-private-key-file> -p <ssh.port> root@<ssh.host>
```

Retry an initial SSH authentication failure briefly with the same key: the
per-instance key update may take a few seconds to propagate. This retries SSH
access, not the paid purchase.

Free `GET` the exact saved `poll` URL about every 15 seconds. `quoted` means no
purchase was claimed; `allocating` and `settling` mean keep polling. A delivered
lease is usable only while `instanceStatus: running`, SSH details are present
and `expiresAt` has not passed. Run the user's workload through SSH and copy
required output elsewhere before expiry. The independent cleaner deletes the
instance and disk; polling alone does not stop billing.

## Recover without paying twice

HTTP status alone does not establish whether payment settled. In particular, a
503 purchase failure can report `paymentSettled: true` or `"unknown"`.

- For `settle_uncertain`, a timeout or a disconnect after sending payment, preserve
  the response and saved poll URL. Do not buy a replacement automatically.
- For `cleanup_pending`, keep polling and report `id` and `recoveryId` to the
  operator; do not purchase again while payment or creation remains unresolved.
- For `destroyed` or `not_created`, inspect `paymentState`, `refundStatus`,
  `settlementTx` and `recoveryId`. A destroyed instance is not proof of no payment.
- Honor `retryable: false` even when the response says no payment settled.
  Confirm the previous attempt is resolved before proposing another purchase.
- Confirmed non-delivery after settlement creates a refund obligation. Refunds
  are operator handled; do not promise an automatic refund. Early termination,
  renewals and refunds for a host outage after delivery are outside this SKU.

Use `buy receipts --resolve` to reconcile ambiguous payment authorizations.
Report the paid amount, token, transaction hash, GPU, SSH availability and expiry
to the user. Keep poll tokens, private keys and raw payment authorizations private.
