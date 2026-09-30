/**
 * Checks the published order-compute skill against the gateway that is actually
 * deployed and the CLI version it actually pins.
 *
 * This skill tells an agent how to spend real money. Every fact in it that can
 * go stale — the API prefix, the machine types, the prices, the tokens — is
 * served live by GET /catalog, which the skill itself documents as free and
 * side-effect free. So there is no reason for any of it to be checked by hand.
 *
 * It exists because both halves of that went wrong at once upstream. The API
 * prefix was renamed and the gateway accepted a new token, and the only check
 * watching the skill compared it against an unreleased branch — so it demanded
 * the skill adopt a prefix the gateway answered 404 for, and a token the pinned
 * CLI has no address for. A check against a branch cannot catch either. A check
 * against production and the published package catches both.
 *
 * Deliberately asymmetric: this asks whether the PUBLISHED skill matches what a
 * reader can do TODAY. It should go red when the skill drifts from production —
 * not when production moves ahead of the skill's next sync.
 *
 * Usage: node scripts/check-against-gateway.mjs
 */

import { readFileSync } from 'node:fs';

const SKILL = 'skills/order-compute/SKILL.md';
const README = 'README.md';

const skill = readFileSync(SKILL, 'utf8');
const readme = readFileSync(README, 'utf8');

const problems = [];
const fail = (msg) => problems.push(msg);

// ---------------------------------------------------------------- pinned CLI

// Captured whole, then compared exactly: a numeric-only pattern reads
// `@celo/buy@0.5.0-beta.1` as `0.5.0`, and `@celo/buy@latest` matches no
// version pattern at all and would pass unseen.
const pins = [...new Set([...skill.matchAll(/@celo\/buy@([A-Za-z0-9._-]+)/g)].map((m) => m[1]))];
if (pins.length !== 1) {
  fail(`${SKILL} pins ${pins.length} different @celo/buy versions: ${pins.join(', ') || '(none)'}`);
}
const version = pins[0];

const readmePins = [...new Set([...readme.matchAll(/@celo\/buy@([A-Za-z0-9._-]+)/g)].map((m) => m[1]))];
for (const pin of readmePins) {
  if (pin !== version) fail(`${README} pins @celo/buy@${pin} but the skill pins @celo/buy@${version}`);
}

// ------------------------------------------------------------- API prefix

// The catalog URL is the anchor: it is the one route the skill documents that
// is free to call, so it is the one that can be probed without spending.
const catalogUrls = [...new Set([...skill.matchAll(/https:\/\/usebuy\.ai\/[A-Za-z0-9._-]+\/catalog/g)].map((m) => m[0]))];
if (catalogUrls.length !== 1) {
  console.error(`could not find exactly one catalog URL in ${SKILL}: ${catalogUrls.join(', ') || '(none)'}`);
  process.exit(1);
}
const catalogUrl = catalogUrls[0];
const prefix = new URL(catalogUrl).pathname.split('/')[1];

// Every purchase route must sit under the same prefix. A half-applied rename
// is worse than none: the reader quotes against one prefix and pays against
// another.
for (const [url, seg] of [...skill.matchAll(/https:\/\/usebuy\.ai\/([A-Za-z0-9._-]+)\/(?:vm|ssh)\b/g)].map((m) => [m[0], m[1]])) {
  if (seg !== prefix) fail(`${url} uses prefix /${seg} but the catalog is under /${prefix}`);
}

const res = await fetch(catalogUrl, { headers: { accept: 'application/json' } });
if (!res.ok) {
  fail(
    `GET ${catalogUrl} returned ${res.status}. The skill documents an API prefix the deployed ` +
      `gateway does not serve, so every purchase URL in it is dead.`,
  );
  report();
}
const catalog = await res.json();
console.log(`catalog: ${catalogUrl} -> ${res.status}, ${catalog.machineTypes?.length ?? 0} machine types`);

// --------------------------------------------------------- machine types

// Rows look like:
// | `e2-micro` | 0.25 | 2 | 1 GiB | 0.016753 USDC or USDT | not required |
const rows = [...skill.matchAll(/^\|\s*`(e2-[a-z0-9-]+)`\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|/gm)];
if (rows.length === 0) fail(`no machine-type table rows found in ${SKILL}`);

const num = (s) => Number(String(s).replace(/[^0-9.]/g, ''));
const documented = new Set();

for (const [, name, vcpu, nproc, ram, quote, attestation] of rows) {
  documented.add(name);
  const live = catalog.machineTypes?.find((m) => m.machineType === name);
  if (!live) {
    fail(`the skill documents \`${name}\`, which the catalog no longer offers`);
    continue;
  }
  const checks = [
    ['vCPU share', num(vcpu), live.vcpu],
    ['nproc', num(nproc), live.guestCpus],
    ['RAM (GiB)', num(ram), live.memoryGb],
    ['1h quote', num(quote), live.priceUsd],
  ];
  for (const [label, doc, actual] of checks) {
    if (doc !== actual) fail(`\`${name}\` ${label}: skill says ${doc}, catalog says ${actual}`);
  }
  const docRequires = /required/.test(attestation) && !/not required/.test(attestation);
  if (docRequires !== Boolean(live.attestationRequired)) {
    fail(
      `\`${name}\` attestation: skill says ${docRequires ? 'required' : 'not required'}, ` +
        `catalog says ${live.attestationRequired ? 'required' : 'not required'}`,
    );
  }
}

for (const m of catalog.machineTypes ?? []) {
  if (!documented.has(m.machineType)) {
    fail(`the catalog offers \`${m.machineType}\`, which the skill does not document`);
  }
}

// ---------------------------------------------------------------- tokens

// A token is only usable if the gateway accepts it AND the pinned CLI can sign
// for it. The gateway is ahead here more often than not — it accepted USAT
// before any release shipped an address for it — so documenting the catalog
// alone would tell readers to pass a --token the CLI rejects.
const { TOKENS, isTokenSignable } = await import('@celo/buy-core/chains');
const signable = Object.entries(TOKENS.celo)
  .filter(([, info]) => isTokenSignable(info))
  .map(([symbol]) => symbol);

const usable = (catalog.tokens ?? []).filter((t) => signable.includes(t));
const candidates = [...new Set([...(catalog.tokens ?? []), ...signable])];

console.log(`tokens: catalog ${(catalog.tokens ?? []).join('/')}, @celo/buy-core@${version} signs ${signable.join('/')}`);

for (const token of candidates) {
  const mentioned = new RegExp(`\\b${token}\\b`).test(skill);
  if (usable.includes(token) && !mentioned) {
    fail(`${token} is accepted by the gateway and signable by @celo/buy@${version}, but the skill never mentions it`);
  }
  if (!usable.includes(token) && mentioned) {
    const why = signable.includes(token)
      ? 'the gateway does not accept it'
      : `@celo/buy-core@${version} has no address for it, so the CLI cannot sign for it`;
    fail(`the skill mentions ${token}, but ${why}`);
  }
}

report();

function report() {
  if (problems.length === 0) {
    console.log(`\nthe published skill matches the deployed gateway at @celo/buy@${version}`);
    process.exit(0);
  }
  console.error('');
  for (const p of problems) console.error(`::error file=${SKILL}::${p}`);
  console.error(
    `\n${problems.length} mismatch(es). This skill is followed by agents spending real money;` +
      `\na wrong URL, price or token is a failed or misdirected payment.` +
      `\n\nIf the gateway changed, the fix is a sync from celo-org/cpay at its latest RELEASE` +
      `\ntag — not from its main branch, which may describe an API that is not deployed yet.`,
  );
  process.exit(1);
}
