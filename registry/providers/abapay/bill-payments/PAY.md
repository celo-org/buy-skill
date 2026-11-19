---
name: abapay/bill-payments
title: Nigerian bills and airtime through AbaPay (x402)
description: Pays a real bill and returns the receipt. Nigerian airtime, data bundles, prepaid electricity (returns the meter token), cable TV and exam PINs, plus airtime and data top-ups in 140+ countries. The 402 quotes the bill's own value plus fees in a USD stablecoin on Celo. Use when the user asks to top up a phone, buy power or pay a bill.
category: payments
stage: experimental
aliases: [bills, airtime, data-bundle, electricity, prepaid-meter, cable-tv, dstv, top-up, nigeria, utility]
service_url: https://agents.abapays.com/api/pay/x402
payment:
  schemes: [exact]
  networks: [celo]
  assets: [USDC, USDT, USAT]
---

# Nigerian bills and airtime through AbaPay

> Experimental listing: an early-stage third-party seller. buy has not reviewed it; confirm with the user before paying.

Sold by [AbaPay](https://www.abapays.com) directly, not through the buy gateway: the
payment goes to AbaPay's wallet and AbaPay pays the biller. Support: support@abapays.com.

| route | price | input |
|---|---|---|
| `POST /api/pay/x402` | the bill's value plus fees, from about 0.05 USD | JSON body, below |
| `GET /api/pay/x402` | same | the same fields as query parameters |

## This moves real money to a third party

Every call pays a real bill. buy cannot reverse or refund a bill payment: a top-up sent
to the wrong phone number or meter is gone. Before **every** payment, get the user's
explicit confirmation of all three:

- the recipient (`phone`, or `billersCode` for a meter, smartcard or account), read back
  character by character;
- the amount in naira;
- the quoted stablecoin price from `buy_pay_quote`, not only the naira face value.

## The request

| field | required | meaning |
|---|---|---|
| `serviceID` | yes | biller code, for example `mtn`, `ikeja-electric`, `dstv` |
| `amount` | yes | face value of the bill in Nigerian naira (NGN) |
| `serviceCategory` | no | `AIRTIME`, `DATA`, `ELECTRICITY`, `CABLE`, `EDUCATION` or `INTERNATIONAL` |
| `phone` | for airtime and data | recipient phone number, also used for the receipt |
| `billersCode` | for electricity, cable | meter number, smartcard number or account id |
| `variation_code` | for data, cable, exam PINs | plan code from AbaPay's catalogue |

```json
{"serviceID":"mtn","serviceCategory":"AIRTIME","amount":1000,"phone":"0803XXXXXXX"}
```

## Buying it

The price depends on the bill, so quote the exact body you will send. An empty request
returns a 0.05 USD placeholder that is not the price of any real bill.

```text
buy_pay_quote
  url:    https://agents.abapays.com/api/pay/x402
  method: POST
  body:   "{\"serviceID\":\"mtn\",\"serviceCategory\":\"AIRTIME\",\"amount\":1000,\"phone\":\"0803XXXXXXX\"}"
```

Then `buy_curl` with the same url, method and body, and `maxAmount` from the quote. The
402 offers USDC, USD₮ and USA₮ on Celo; pass `token` (MCP) or `--token` (CLI) to pay in
USD₮ (`USDT`) or USA₮ (`USAT`). From the CLI:

```sh
buy quote -X POST -H 'content-type: application/json' --data '<body>' https://agents.abapays.com/api/pay/x402
buy curl --max-amount <quoted amount> -X POST -H 'content-type: application/json' --data '<body>' https://agents.abapays.com/api/pay/x402
```

## What comes back

A receipt: `success`, `status`, `message`, AbaPay's `request_id`, `amount_naira`,
`token_used` and the settlement `tx_hash`. For prepaid electricity the response carries the
meter token the user types into the meter. Show it to the user and keep the whole response:
it is the only copy.

## Failures

A response with a payment receipt header was paid for, whatever its status. Never retry a
timeout or a `5xx` on this route automatically: the bill may already have been paid. Run
`buy receipts --resolve`, then ask AbaPay with the `request_id` or transaction hash.
