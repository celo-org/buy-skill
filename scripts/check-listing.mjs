/**
 * Checks a "List your service" request against the live endpoint and writes the
 * comment a maintainer reads before opening a catalog entry.
 *
 * Fifteen sellers in three weeks is too many to quote by hand, and a seller
 * should hear about a wrong network name in minutes rather than days. So this
 * asks each paid route what an agent would ask it, with an unpaid request, and
 * reads the answer with the parser the CLI itself uses. It signs nothing and
 * pays nothing, and it never accepts a listing: a maintainer still does that.
 *
 * Everything in the issue and in the 402 is written by a stranger, and the
 * workflow runs with a token that can comment. Three rules follow, and each
 * has a test:
 *
 *   - Only a public HTTPS origin on port 443 is requested, redirects are not
 *     followed, and the address is checked at connect time, so a name that
 *     resolves somewhere private is refused however it got there.
 *   - The result table holds this script's own wording. Seller text appears
 *     only inside the fenced draft, where it renders inert.
 *   - The issue is read from the event payload, never through a shell.
 *
 * Usage: node scripts/check-listing.mjs <event.json> <comment.md>
 */

import dns from 'node:dns';
import { readFileSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { pathToFileURL } from 'node:url';
import { isTokenSignable, tokenByAddress } from '@celo/buy-core/chains';
import { parseEnvelope, parseV2Header } from '@celo/buy-core/x402';

export const MARKER = '<!-- listing-check -->';

const MAX_ROUTES = 8;
const MAX_DESCRIPTION = 500;
const MAX_BODY_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

const FORM = {
  origin: 'Origin',
  description: 'What it does, for an agent deciding whether to call it',
  operator: 'Operator',
  routes: 'Paid routes',
  terms: 'Terms and support',
  dataSource: 'Where the data comes from',
  networks: 'Networks you accept',
  tokens: 'Tokens you accept',
  contact: 'Contact (optional)',
  checks: 'Checks',
};

const NO_ANSWER = new Set(['', '_No response_', 'None']);

/** An issue form renders as `### Label` sections; returns label to answer. */
export function parseForm(body) {
  const form = {};
  for (const section of String(body).split(/^### /m).slice(1)) {
    const newline = section.indexOf('\n');
    if (newline === -1) continue;
    const answer = section.slice(newline + 1).trim();
    form[section.slice(0, newline).trim()] = NO_ANSWER.has(answer) ? '' : answer;
  }
  return form;
}

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
// No entry for ::ffff:0:0/96: BlockList already checks a mapped address against
// the IPv4 rules above, and would apply that subnet to every IPv4 address too.
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
]) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

export function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 0) return false;
  return !blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

/** The origin to request, or undefined if it is not one this will touch. */
export function safeOrigin(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    return undefined;
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || url.username || url.password) return undefined;
  if (url.port !== '' && url.port !== '443') return undefined;
  if (isIP(hostname) !== 0 || !hostname.includes('.')) return undefined;
  if (/(^|\.)(localhost|local|internal|intranet|home|lan)$/i.test(hostname)) return undefined;
  return url.origin;
}

/**
 * `GET /a, POST /b` as routes. A path with a parameter cannot be requested as
 * written, so it comes back marked rather than guessed at.
 */
export function parseRoutes(raw, origin) {
  const routes = [];
  for (const entry of String(raw).split(/[,\n]/)) {
    const match = entry.trim().match(/^`?(GET|POST|PUT|PATCH|DELETE)\s+(\S+?)`?$/i);
    if (!match) continue;
    const path = match[2].startsWith(`${origin}/`) ? match[2].slice(origin.length) : match[2];
    if (!/^\/(?!\/)[A-Za-z0-9._~\-/%?=&+{}<>:]*$/.test(path)) continue;
    routes.push({
      method: match[1].toUpperCase(),
      path,
      parameterised: /[{}<>]|\/:/.test(path),
    });
  }
  return routes.slice(0, MAX_ROUTES);
}

export function guardedLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err);
    if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address))) {
      return callback(new Error('does not resolve to a public address'));
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

/** One unpaid request. Resolves to what came back; never follows a redirect. */
export function probe(origin, route) {
  return new Promise((resolve) => {
    const url = new URL(route.path, origin);
    if (url.origin !== origin) {
      resolve({ error: 'the route leaves the origin' });
      return;
    }
    const req = https.request(
      url,
      {
        method: route.method,
        lookup: guardedLookup,
        timeout: REQUEST_TIMEOUT_MS,
        headers: { accept: 'application/json', 'user-agent': 'buy-listing-check' },
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            resolve({ error: 'the response is too large' });
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            header: res.headers['payment-required'],
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('timeout', () => {
      resolve({ error: 'no answer within 15 seconds' });
      req.destroy();
    });
    req.on('error', () => resolve({ error: 'the request failed' }));
    req.end();
  });
}

/** The challenge before normalising, kept for what the parsers throw away. */
function rawChallenge(header, body) {
  const candidates = [];
  if (typeof header === 'string' && header !== '') {
    candidates.push(() => Buffer.from(header.trim(), 'base64').toString('utf8'));
  }
  candidates.push(() => body);
  for (const read of candidates) {
    try {
      const parsed = JSON.parse(read());
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.accepts)) return parsed;
    } catch {}
  }
  return undefined;
}

const formatAmount = (amount, decimals) =>
  (Number(amount) / 10 ** decimals).toFixed(decimals).replace(/\.?0+$/, '');

/**
 * What an agent could do with one 402. `problems` are this script's own
 * sentences: nothing from the response is echoed into them.
 */
export function readChallenge(response) {
  const { status, header, body } = response;
  if (response.error) return { problems: [response.error], offers: [] };
  if (status !== 402) {
    return { problems: [`returned ${Number(status)} to an unpaid request, expected 402`], offers: [] };
  }
  const raw = rawChallenge(header, body);
  const envelope = parseV2Header(header, '') ?? parseEnvelope(body);
  if (!raw) return { problems: ['the 402 carries no x402 challenge'], offers: [] };
  const named = (raw.accepts ?? []).map((offer) => offer?.network);
  if (raw.x402Version === 1 && named.includes('eip155:42220')) {
    return { problems: ['x402 v1 names this network `celo`, the offer says `eip155:42220`'], offers: [] };
  }
  if (Number(raw.x402Version) >= 2 && named.includes('celo') && !named.includes('eip155:42220')) {
    return { problems: ['x402 v2 names this network `eip155:42220`, the offer says `celo`'], offers: [] };
  }
  if (!envelope) return { problems: ['the x402 challenge cannot be read'], offers: [] };

  const onCelo = envelope.accepts.filter((offer) => offer.network === 'celo');
  if (onCelo.length === 0) return { problems: ['no offer on Celo mainnet'], offers: [] };

  const problems = [];
  const offers = [];
  for (const offer of onCelo) {
    const token = tokenByAddress('celo', offer.asset);
    if (!token || !isTokenSignable(token)) continue;
    if (offer.scheme !== 'exact') continue;
    if (offer.extra?.name !== token.eip712Name || offer.extra?.version !== token.eip712Version) {
      problems.push(
        `the ${token.symbol} offer needs \`extra\` set to name \`${token.eip712Name}\`, version \`${token.eip712Version}\``,
      );
      continue;
    }
    if (!/^\d+$/.test(String(offer.maxAmountRequired))) continue;
    offers.push({
      symbol: token.symbol,
      amount: String(offer.maxAmountRequired),
      price: formatAmount(offer.maxAmountRequired, token.decimals),
    });
  }
  if (offers.length === 0 && problems.length === 0) {
    problems.push('no Celo offer in a token buy can pay (USDC, USDT or USA₮)');
  }
  const discoverable = Boolean(raw.extensions?.bazaar) || raw.accepts.some((o) => o?.outputSchema);
  return { problems, offers, discoverable };
}

const PASS = 'pass';
const WARN = 'warn';
const FAIL = 'fail';

/** Runs every check. `request` is injected so tests never touch the network. */
export async function checkRequest({ title, body }, request = probe) {
  const form = parseForm(body);
  const answer = (key) => form[FORM[key]] ?? '';
  const results = [];
  const add = (level, name, detail) => results.push({ level, name, detail });

  const origin = safeOrigin(answer('origin'));
  if (!origin) {
    add(FAIL, 'Origin', 'needs to be a public `https://` origin on port 443, not an IP address');
    return { title, form, results, routes: [] };
  }
  add(PASS, 'Origin', 'public HTTPS origin');

  const description = answer('description');
  if (description.length === 0 || description.length > MAX_DESCRIPTION) {
    add(FAIL, 'Description', `needs to be 1 to ${MAX_DESCRIPTION} characters`);
  } else {
    add(PASS, 'Description', `${description.length} characters`);
  }

  if (FORM.dataSource in form) {
    const confirmed = /- \[x\] What the endpoint returns is my own data/i.test(answer('checks'));
    if (!answer('dataSource') || !confirmed) {
      add(FAIL, 'Data rights', 'name the data source and tick the resale check');
    } else {
      add(PASS, 'Data rights', 'answered; a maintainer still opens the terms links');
    }
  }

  const routes = parseRoutes(answer('routes'), origin);
  if (routes.length === 0) {
    add(FAIL, 'Routes', 'list them as `GET /path, POST /path`');
    return { title, form, origin, results, routes };
  }

  const live = new Set();
  let discoverable = false;
  for (const route of routes) {
    const name = `\`${route.method} ${route.path}\``;
    if (route.parameterised) {
      add(WARN, name, 'has a path parameter, so it was not requested; check it by hand');
      continue;
    }
    const seen = readChallenge(await request(origin, route));
    route.offers = seen.offers;
    for (const offer of seen.offers) live.add(offer.symbol);
    discoverable ||= Boolean(seen.discoverable);
    if (seen.problems.length > 0) {
      add(FAIL, name, seen.problems.join('; '));
    } else {
      add(PASS, name, seen.offers.map((o) => `${o.price} ${o.symbol}`).join(', '));
    }
  }

  if (!/celo mainnet/i.test(answer('networks'))) {
    add(FAIL, 'Networks', 'the form does not list Celo mainnet');
  }
  if (live.size > 0) {
    const claimed = ['USDC', 'USDT', 'USAT'].filter((symbol) => answer('tokens').includes(symbol));
    const missing = claimed.filter((symbol) => !live.has(symbol));
    if (missing.length > 0) {
      add(FAIL, 'Tokens', `the form lists ${missing.join(', ')}, the 402 does not offer it`);
    }
    if (!live.has('USAT')) {
      add(WARN, 'USA₮', 'not offered; wallets funded from the USA₮ faucet hold nothing else');
    }
    add(
      discoverable ? PASS : WARN,
      'Discovery',
      discoverable ? 'the 402 describes the route' : 'no `bazaar` extension, so agents guess the input',
    );
  }
  return { title, form, origin, results, routes };
}

const slug = (text) =>
  String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

const oneLine = (text) => String(text).replace(/\s+/g, ' ').trim();

/** A starting point for the catalog entry, from the form and the live offers. */
export function draftEntry(report) {
  const { title, form, origin, routes } = report;
  const name = oneLine(String(title).replace(/^\[list\]\s*/i, ''));
  const paid = routes.filter((route) => route.offers?.length > 0);
  if (paid.length === 0) return undefined;
  const short = name.split(/[:–—-]/)[0];
  const owner = form[FORM.operator] || short;
  const symbols = [...new Set(paid.flatMap((route) => route.offers.map((o) => o.symbol)))];
  const contact = oneLine(form[FORM.contact] ?? '');
  const rows = paid.map((route) => {
    const prices = route.offers.map((o) => `${o.price} ${o.symbol}`).join(', ');
    return `| \`${route.method} ${route.path}\` | ${prices} |`;
  });
  return [
    '---',
    `name: ${slug(owner)}/${slug(short)}`,
    `title: ${name} (x402)`,
    `description: ${oneLine(form[FORM.description])}`,
    'category: TODO',
    'stage: experimental',
    `service_url: ${origin}${paid[0].path}`,
    'payment:',
    '  schemes: [exact]',
    '  networks: [celo]',
    `  assets: [${symbols.join(', ')}]`,
    '---',
    '',
    `# ${short.trim()}`,
    '',
    '> Experimental listing: an early-stage third-party seller. buy has not reviewed it; confirm with the user before paying.',
    '',
    `Sold directly by its operator, not through the buy gateway: the payment goes to the seller's wallet.${contact ? ` Contact: ${contact}.` : ''}`,
    '',
    '| route | price |',
    '|---|---|',
    ...rows,
    '',
    '## Failures',
    '',
    'A response with a payment receipt header was paid for, whatever its status. Never retry a',
    'timeout automatically: run `buy receipts --resolve` first.',
    '',
  ].join('\n');
}

const ICONS = { [PASS]: 'pass', [WARN]: 'look', [FAIL]: 'fix' };

/** A fence no run of backticks inside `text` can close. */
function fenced(text, language) {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${text}\n${fence}`;
}

export function renderComment(report) {
  const failed = report.results.some((r) => r.level === FAIL);
  const lines = [
    MARKER,
    `### Listing check: ${failed ? 'needs changes' : 'ready for a maintainer'}`,
    '',
    'An automatic check of what this form says against what the endpoint answers. Unpaid requests only, nothing was signed or paid. A maintainer still reviews the listing. Edit the issue to run it again.',
    '',
    '| Result | Check | Detail |',
    '|---|---|---|',
    ...report.results.map((r) => `| ${ICONS[r.level]} | ${r.name} | ${r.detail} |`),
  ];
  const draft = draftEntry(report);
  if (draft) {
    lines.push(
      '',
      '<details><summary>Draft catalog entry, for the maintainer</summary>',
      '',
      fenced(draft, 'markdown'),
      '',
      '</details>',
    );
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [eventPath, outPath] = process.argv.slice(2);
  const { issue } = JSON.parse(readFileSync(eventPath, 'utf8'));
  const report = await checkRequest({ title: issue.title, body: issue.body ?? '' });
  writeFileSync(outPath, renderComment(report));
}
