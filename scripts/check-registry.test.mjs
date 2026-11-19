import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parsePayDoc } from '@celo/buy-registry';
import { NOTICE, RESERVED, changedEntries, checkRegistry, readEntry, summary } from './check-registry.mjs';

const USDC = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C';
const USAT = '0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771';
const offer = (asset, extra) => ({
  scheme: 'exact',
  network: 'celo',
  maxAmountRequired: '10000',
  resource: 'https://api.example.com/rates',
  description: '',
  mimeType: '',
  payTo: '0x0000000000000000000000000000000000C0FFEE',
  maxTimeoutSeconds: 60,
  asset,
  extra,
});
const challenge = (...accepts) => ({
  status: 402,
  body: JSON.stringify({ x402Version: 1, error: 'payment required', accepts }),
});
const usdc = offer(USDC, { name: 'USDC', version: '2' });
const usat = offer(USAT, { name: 'Tether America USD', version: '1' });

const payDoc = ({ fqn = 'late/seller', extra = 'stage: experimental\n', assets = 'USDC, USAT', url = 'https://api.example.com/rates', notice = `${NOTICE} an early-stage third-party seller.` } = {}) => `---
name: ${fqn}
title: Late Seller
description: Rates for agents.
category: finance
${extra}service_url: ${url}
payment:
  schemes: [exact]
  networks: [celo]
  assets: [${assets}]
---

# Late Seller

${notice}

Body.
`;

describe('changedEntries', () => {
  it('reads added, changed, renamed and removed entries, and flags anything else under registry/', () => {
    const diff = [
      'A\tregistry/providers/late/seller/PAY.md',
      'M\tregistry/providers/abapay/bill-payments/PAY.md',
      'R090\tregistry/providers/old/name/PAY.md\tregistry/providers/new/name/PAY.md',
      'D\tregistry/providers/gone/seller/PAY.md',
      'A\tregistry/providers/late/seller/logo.svg',
      'A\tregistry/providers/Late/Seller/PAY.md',
      'A\tregistry/providers/deep/er/path/PAY.md',
      'M\tregistry/README.md',
      'M\tscripts/check-registry.mjs',
      '',
    ].join('\n');
    assert.deepEqual(changedEntries(diff), [
      { kind: 'added', fqn: 'late/seller', org: 'late' },
      { kind: 'changed', fqn: 'abapay/bill-payments', org: 'abapay' },
      { kind: 'added', fqn: 'new/name', org: 'new' },
      { kind: 'removed', fqn: 'gone/seller', org: 'gone' },
      { kind: 'added', misplaced: true },
      { kind: 'added', misplaced: true },
      { kind: 'added', misplaced: true },
    ]);
  });
});

describe('readEntry', () => {
  it('accepts a new experimental entry and quotes its URL with GET', () => {
    const entry = readEntry(payDoc(), 'late/seller', { added: true });
    assert.deepEqual(entry.problems, []);
    assert.deepEqual(entry.assets, ['USDC', 'USAT']);
    assert.equal(entry.origin, 'https://api.example.com');
    assert.deepEqual(entry.route, { method: 'GET', path: '/rates' });
  });

  it('quotes a POST-only route with POST and keeps the query string', () => {
    const entry = readEntry(
      payDoc({ extra: 'stage: experimental\nservice_method: POST\n', url: 'https://api.example.com/a?x=1' }),
      'late/seller',
      { added: true },
    );
    assert.deepEqual(entry.route, { method: 'POST', path: '/a?x=1' });
  });

  const cases = [
    ['a new entry without the experimental stage', { extra: '' }, /starts as `stage: experimental`/],
    ['another stage value', { extra: 'stage: curated\n' }, /can only be `experimental`/],
    ['an experimental entry without the notice', { notice: 'Hello.' }, /experimental notice/],
    ['service_method: GET', { extra: 'stage: experimental\nservice_method: GET\n' }, /can only be `POST`/],
    ['a token buy cannot pay', { assets: 'USDC, cNGN' }, /USDC, USDT and USAT only/],
    ['a plain-http URL', { url: 'http://api.example.com/rates' }, /public HTTPS URL/],
    ['a private host', { url: 'https://localhost/rates' }, /public HTTPS URL/],
    ['a name that is not the path', { fqn: 'other/name' }, /does not parse/],
  ];
  for (const [label, over, pattern] of cases) {
    it(`refuses ${label}`, () => {
      const { problems } = readEntry(payDoc(over), 'late/seller', { added: true });
      assert.ok(problems.some((p) => pattern.test(p)), problems.join('; '));
    });
  }

  it('lets a changed entry drop the tag, which is how it comes off', () => {
    const { problems } = readEntry(payDoc({ extra: '', notice: 'Hello.' }), 'late/seller', { added: false });
    assert.deepEqual(problems, []);
  });

  it('refuses a description over 500 characters and a file over 16 KB', () => {
    const long = payDoc().replace('Rates for agents.', 'x'.repeat(501));
    assert.match(readEntry(long, 'late/seller', { added: true }).problems.join(), /over 500/);
    assert.match(readEntry(payDoc() + 'x'.repeat(17000), 'late/seller', { added: true }).problems.join(), /16 KB/);
  });
});

describe('checkRegistry', () => {
  const added = [{ kind: 'added', fqn: 'late/seller', org: 'late' }];

  it('passes each claimed token the 402 offers, from one request', async () => {
    const requests = [];
    const results = await checkRegistry(added, {
      read: () => payDoc(),
      request: async (origin, route) => {
        requests.push([origin, route]);
        return challenge(usdc, usat);
      },
    });
    assert.deepEqual(requests, [['https://api.example.com', { method: 'GET', path: '/rates' }]]);
    assert.deepEqual(results.map((r) => r.ok), [true, true]);
  });

  it('fails the token the 402 does not offer, and says which', async () => {
    const results = await checkRegistry(added, { read: () => payDoc(), request: async () => challenge(usdc) });
    assert.deepEqual(results.map((r) => r.ok), [true, false]);
    assert.match(results[1].detail, /^USAT: /);
  });

  it('fails every token when the URL does not answer 402, without echoing the response', async () => {
    const results = await checkRegistry(added, {
      read: () => payDoc(),
      request: async () => ({ status: 200, body: '<script>alert(1)</script> | injected' }),
    });
    assert.deepEqual(results.map((r) => r.ok), [false, false]);
    assert.match(results[0].detail, /returned 200 to an unpaid request/);
    assert.ok(!summary(results).includes('script'));
  });

  it('never requests an entry with a problem, a reserved org or a misplaced file', async () => {
    let requested = 0;
    const request = async () => {
      requested++;
      return challenge(usdc, usat);
    };
    const results = await checkRegistry(
      [
        { kind: 'added', fqn: 'late/seller', org: 'late' },
        { kind: 'added', fqn: 'buy/free-money', org: 'buy' },
        { kind: 'added', misplaced: true },
        { kind: 'removed', fqn: 'gone/seller', org: 'gone' },
      ],
      { read: () => payDoc({ extra: '' }), request },
    );
    assert.equal(requested, 0);
    assert.deepEqual(results.map((r) => r.ok), [false, false, false, true]);
    assert.match(results[1].detail, /reserved/);
    assert.ok(RESERVED.has('cencori') && RESERVED.has('chainstack'));
  });

  it('fails an entry whose file cannot be read', async () => {
    const results = await checkRegistry(added, {
      read: () => {
        throw new Error('ENOENT');
      },
    });
    assert.deepEqual(results.map((r) => [r.ok, r.detail]), [[false, 'the file cannot be read']]);
  });
});

// The entries in this repository are what the next gateway deploy serves, so
// each one has to parse and pass the offline rules as it stands.
describe('the entries in registry/providers', () => {
  const root = new URL('../registry/providers/', import.meta.url);
  const entries = readdirSync(root, { withFileTypes: true })
    .filter((org) => org.isDirectory())
    .flatMap((org) =>
      readdirSync(new URL(`${org.name}/`, root), { withFileTypes: true })
        .filter((name) => name.isDirectory())
        .map((name) => `${org.name}/${name.name}`),
    );

  it('holds at least the sellers listed so far, and no reserved org', () => {
    assert.ok(entries.length >= 5, entries.join(', '));
    assert.deepEqual(entries.filter((fqn) => RESERVED.has(fqn.split('/')[0])), []);
  });

  for (const fqn of entries) {
    it(`${fqn} parses and passes the offline rules`, () => {
      const content = readFileSync(new URL(`${fqn}/PAY.md`, root), 'utf8');
      assert.equal(parsePayDoc(content, fqn).fqn, fqn);
      assert.deepEqual(readEntry(content, fqn, { added: false }).problems, []);
    });
  }
});
