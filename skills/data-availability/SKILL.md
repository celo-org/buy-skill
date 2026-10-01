---
name: data-availability
description: Use when a user or agent wants to query on-chain blockchain data across 113+ networks (Ethereum, Arbitrum, Base, Polygon, BSC, Solana, Bitcoin, Tron, Hyperliquid, Substrate, etc.) through the buy gateway at https://gateway.usebuy.ai/sqd. Covers free ad-hoc queries for blocks, transactions, logs, instructions, finalized heads, and timestamp-to-block resolution without RPC rate limits.
---

# Multi-chain data availability (SQD)

Query raw and decoded on-chain blockchain data across **113+ networks** through the buy
gateway at `https://gateway.usebuy.ai/sqd`.

The gateway proxies requests to the decentralized **SQD Network** (formerly Subsquid)
Portal, providing high-throughput historical and real-time data access without requiring node
infrastructure, archive nodes, or chain-specific RPC providers.

Unlike the paid API capabilities under `/v1/`, the `/sqd/` endpoints are **completely free**
— no x402 payment challenge, no signing, and no tokens required.

## Non-negotiable boundaries

- **Zero cost / No payment:** Never call `buy_pay_quote` or `buy curl` for `/sqd/*` routes.
  Use ordinary `curl` or standard HTTP `fetch`.
- **IP rate limiting:** The free tier enforces token-bucket rate limits per client IP (120
  requests/minute, burst 20). If throttled (`HTTP 429`), read the `Retry-After` header and wait
  before retrying.
- **Ad-hoc bounded queries only:** Request bounded block ranges (`fromBlock` and `toBlock`).
  Do not initiate long-lived persistent streams or webhooks.
- **Deterministic finality:** For payment verification, deposit tracking, or financial auditing,
  always use `/finalized-stream` or `/finalized-head` rather than unfinalized endpoints to avoid
  reorganization rollbacks.
- **NDJSON parsing:** Responses from `/stream` and `/finalized-stream` are newline-delimited
  JSON (NDJSON). Parse each line as an independent JSON object.
- **Field selection:** Only requested fields are returned. Always specify the exact fields
  needed under `fields` (e.g. `block: { number: true, timestamp: true }`).

## Available networks

The gateway serves 113+ active networks:

| Ecosystem | Networks |
|---|---|
| **EVM (100+ chains)** | `ethereum-mainnet`, `arbitrum-one`, `base-mainnet`, `optimism-mainnet`, `polygon-mainnet`, `binance-mainnet`, `avalanche-mainnet`, `berachain-mainnet`, `blast-l2-mainnet`, `celo-mainnet`, `linea-mainnet`, `scroll-mainnet`, `abstract-mainnet`, `gnosis-mainnet`, and testnets. |
| **Solana** | `solana-mainnet`, `solana-devnet` |
| **Bitcoin** | `bitcoin-mainnet` |
| **Tron** | `tron-mainnet` |
| **DEX / Perpetuals** | `hyperliquid-fills`, `hyperliquid-replica-cmds` |
| **Substrate / Polkadot** | `bittensor`, `astar-substrate`, `asset-hub-polkadot`, `asset-hub-kusama` |

To list all current datasets dynamically:

```sh
curl --fail --silent --show-error https://gateway.usebuy.ai/sqd/datasets | jq '.[].dataset'
```

## Quick reference: Core endpoints

All endpoints follow the base URL `https://gateway.usebuy.ai/sqd/datasets/{dataset}`:

| Endpoint | Method | Purpose |
|---|---|---|
| `/sqd/datasets` | `GET` | List all 113+ available datasets and their real-time status. |
| `/sqd/datasets/{dataset}/metadata` | `GET` | Dataset metadata (start block, aliases, status). |
| `/sqd/datasets/{dataset}/head` | `GET` | Latest unfinalized block number and hash. |
| `/sqd/datasets/{dataset}/finalized-head` | `GET` | Latest finalized block (safe for settlement). |
| `/sqd/datasets/{dataset}/timestamps/{timestamp}/block` | `GET` | Resolve a Unix timestamp (seconds) to the first block at or after it. |
| `/sqd/datasets/{dataset}/stream` | `POST` | Ad-hoc query across blocks, logs, transactions, instructions. |
| `/sqd/datasets/{dataset}/finalized-stream` | `POST` | Query finalized blocks only (zero reorg risk). |

---

## Use cases & examples

### 1. Verify a payment or token transfer (EVM)

Check for ERC-20 transfers (e.g. USDC on Arbitrum or Base) to a specific recipient address
over a block range:

```sh
curl --fail --silent --show-error \
  --request POST \
  --header 'content-type: application/json' \
  --data '{
    "type": "evm",
    "fromBlock": 200000000,
    "toBlock": 200000100,
    "fields": {
      "block": { "number": true, "timestamp": true },
      "log": { "address": true, "topics": true, "data": true, "transactionHash": true }
    },
    "logs": [{
      "address": ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831"],
      "topic0": ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"],
      "topic2": ["0x000000000000000000000000YOUR_WALLET_ADDRESS_HEX"]
    }]
  }' \
  https://gateway.usebuy.ai/sqd/datasets/arbitrum-one/finalized-stream
```

### 2. Verify a Solana token transfer or program interaction

Check for SPL token account balance changes on Solana:

```sh
curl --fail --silent --show-error \
  --request POST \
  --header 'content-type: application/json' \
  --data '{
    "type": "solana",
    "fromBlock": 317617480,
    "toBlock": 317617500,
    "fields": {
      "block": { "number": true, "timestamp": true },
      "tokenBalance": { "account": true, "postAmount": true, "postMint": true, "postOwner": true },
      "transaction": { "signatures": true }
    },
    "tokenBalances": [{
      "account": ["RECIPIENT_TOKEN_ACCOUNT_PUBKEY"]
    }]
  }' \
  https://gateway.usebuy.ai/sqd/datasets/solana-mainnet/finalized-stream
```

Or query Solana program instructions by program ID (e.g. Orca, Raydium, SPL Token):

```sh
curl --fail --silent --show-error \
  --request POST \
  --header 'content-type: application/json' \
  --data '{
    "type": "solana",
    "fromBlock": 317617480,
    "toBlock": 317617485,
    "fields": {
      "block": { "number": true },
      "instruction": { "programId": true, "data": true, "accounts": true }
    },
    "instructions": [{
      "programId": ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"]
    }]
  }' \
  https://gateway.usebuy.ai/sqd/datasets/solana-mainnet/stream
```

### 3. Check wallet transaction history

Extract recent transactions involving an address across any EVM chain:

```sh
curl --fail --silent --show-error \
  --request POST \
  --header 'content-type: application/json' \
  --data '{
    "type": "evm",
    "fromBlock": 10000000,
    "toBlock": 10000500,
    "fields": {
      "block": { "number": true, "timestamp": true },
      "transaction": { "hash": true, "from": true, "to": true, "value": true, "status": true }
    },
    "transactions": [
      { "from": ["0xYOUR_WALLET_ADDRESS"] },
      { "to": ["0xYOUR_WALLET_ADDRESS"] }
    ]
  }' \
  https://gateway.usebuy.ai/sqd/datasets/base-mainnet/stream
```

### 4. Timestamp-to-block resolution

Find the exact block or slot number across any network corresponding to a Unix timestamp:

```sh
# Ethereum mainnet at timestamp 1710000000 (2024-03-09 16:00:00 UTC)
curl --fail --silent --show-error \
  https://gateway.usebuy.ai/sqd/datasets/ethereum-mainnet/timestamps/1710000000/block
# -> {"block_number": 19398595}

# Solana mainnet at timestamp 1710000000
curl --fail --silent --show-error \
  https://gateway.usebuy.ai/sqd/datasets/solana-mainnet/timestamps/1710000000/block
# -> {"block_number": 252971234}
```

### 5. Check chain finality head

Get the latest finalized block number and hash:

```sh
curl --fail --silent --show-error \
  https://gateway.usebuy.ai/sqd/datasets/arbitrum-one/finalized-head
```

---

## Response parsing (NDJSON)

Stream endpoints return newline-delimited JSON Lines (`application/jsonl`), with one block
record per line. Parse the output into a standard array:

```javascript
async function fetchAdHoc(dataset, payload) {
  const res = await fetch(`https://gateway.usebuy.ai/sqd/datasets/${dataset}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After');
    throw new Error(`Rate limit exceeded. Wait ${retryAfter}s.`);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const text = await res.text();
  const blocks = text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  return blocks;
}
```

---

## Error handling

| Status | Cause | Action |
|---|---|---|
| `400 invalid_request` | Malformed JSON or unknown field selector. | Review `fields` and filter keys against the SQD schema. |
| `404 not_found` | Unknown dataset name. | Check dataset list at `GET /sqd/datasets`. |
| `405 method_not_allowed` | HTTP method not permitted. | Only `GET` and `POST` are allowed on `/sqd/*`. |
| `413 body_too_large` | Request payload exceeded 64 KB limit. | Narrow filter lists or split queries. |
| `429 rate_limited` | Exceeded 120 req/min or burst cap of 20. | Read `Retry-After` header and wait before retrying. |
| `502 bad_gateway` | Upstream SQD network temporarily unreachable. | Retry with exponential backoff. |
