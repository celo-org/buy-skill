/**
 * Checks the catalog entries a pull request adds or changes under
 * `registry/providers/`, and fails the job when one of them could not be paid.
 *
 * A seller lists a service by adding one file, `registry/providers/<org>/<name>/PAY.md`.
 * Anyone can open that pull request, so this runs the way the listing check
 * does: from the default branch, against the pull request's files as data,
 * with no secret in reach. It asks the listed URL what an agent would ask it,
 * with one unpaid request through the same guarded prober, and reads the 402
 * with the parser the CLI uses. It signs nothing and pays nothing, and it
 * never lists anything: a maintainer still merges.
 *
 * The summary holds this script's own wording. A path that is not shaped like
 * `<org>/<name>/PAY.md` is reported without being echoed.
 *
 * Usage: node scripts/check-registry.mjs <registry dir> <changes file> [summary.md]
 *   <registry dir>  the pull request's `registry/` directory
 *   <changes file>  `git diff --name-status <base>...<head> -- registry/`
 */

import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseFrontmatter, parsePayDoc } from '@celo/buy-registry';
import { probe, readChallenge, safeOrigin } from './check-listing.mjs';

/** Orgs whose entries the buy gateway serves itself. They are not listed here. */
export const RESERVED = new Set(['buy', 'cencori', 'chainstack', 'celo']);
/** The tokens buy pays with on Celo, as `payment.assets` names them. */
const TOKENS = new Set(['USDC', 'USDT', 'USAT']);
const SEGMENT = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_BYTES = 16 * 1024;
const MAX_DESCRIPTION = 500;
const MAX_ENTRIES = 10;
export const NOTICE = '> Experimental listing:';
/** Files a maintainer keeps next to the entries. A change to one is not an entry. */
const DOCS = new Set(['registry/README.md', 'registry/LISTING.md']);

/**
 * The entries a diff touches. Renames and copies count as an addition at the
 * new path; a deletion is kept so the summary can say so.
 */
export function changedEntries(nameStatus) {
  const changes = [];
  for (const line of String(nameStatus).split('\n')) {
    const [status, ...paths] = line.split('\t');
    if (!status || paths.length === 0) continue;
    const path = paths[paths.length - 1];
    if (!path.startsWith('registry/') || DOCS.has(path)) continue;
    const kind = status[0] === 'D' ? 'removed' : status[0] === 'M' ? 'changed' : 'added';
    const match = path.match(/^registry\/providers\/([^/]+)\/([^/]+)\/PAY\.md$/);
    if (!match || !SEGMENT.test(match[1]) || !SEGMENT.test(match[2])) {
      changes.push({ kind, misplaced: true });
      continue;
    }
    changes.push({ kind, fqn: `${match[1]}/${match[2]}`, org: match[1] });
  }
  return changes;
}

/** Everything that can be said about one entry without the network. */
export function readEntry(content, fqn, { added }) {
  const problems = [];
  if (Buffer.byteLength(content) > MAX_BYTES) return { problems: ['the file is over 16 KB'] };
  let entry;
  let data;
  try {
    entry = parsePayDoc(content, fqn);
    ({ data } = parseFrontmatter(content));
  } catch {
    return { problems: ['the frontmatter does not parse, or `name` does not match the path'] };
  }
  if (entry.description.length > MAX_DESCRIPTION) {
    problems.push('`description` is over 500 characters');
  }
  if (data.stage !== undefined && data.stage !== 'experimental') {
    problems.push('`stage` can only be `experimental`');
  }
  if (added && data.stage !== 'experimental') {
    problems.push('a new listing starts as `stage: experimental`');
  }
  if (data.stage === 'experimental' && !entry.body.split('\n').some((l) => l.startsWith(NOTICE))) {
    problems.push('the body needs the experimental notice, as in registry/LISTING.md');
  }
  if (data.service_method !== undefined && data.service_method !== 'POST') {
    problems.push('`service_method` can only be `POST`; leave it out for GET');
  }
  if (!entry.payment.schemes.includes('exact')) problems.push('`payment.schemes` needs `exact`');
  if (!entry.payment.networks.includes('celo')) problems.push('`payment.networks` needs `celo`');
  const assets = entry.payment.assets;
  if (assets.some((asset) => !TOKENS.has(asset))) {
    problems.push('`payment.assets` can hold USDC, USDT and USAT only');
  }
  const origin = safeOrigin(entry.serviceUrl);
  if (!origin) problems.push('`service_url` is not a public HTTPS URL on port 443');
  const url = origin ? new URL(entry.serviceUrl) : undefined;
  return {
    problems,
    assets: assets.filter((asset) => TOKENS.has(asset)),
    origin,
    route: url && {
      method: data.service_method === 'POST' ? 'POST' : 'GET',
      path: `${url.pathname}${url.search}`,
    },
  };
}

/** Every check for the changed entries. `read` and `request` are injected by tests. */
export async function checkRegistry(changes, { read, request = probe }) {
  const results = [];
  const add = (ok, entry, detail) => results.push({ ok, entry, detail });
  let quoted = 0;
  for (const change of changes) {
    if (change.misplaced) {
      add(false, '(other file)', 'only `registry/providers/<org>/<name>/PAY.md` files belong under `registry/`, with lowercase names');
      continue;
    }
    const { fqn, org, kind } = change;
    if (RESERVED.has(org)) {
      add(false, fqn, 'this org name is reserved for services the buy gateway serves itself');
      continue;
    }
    if (kind === 'removed') {
      add(true, fqn, 'removed; a maintainer confirms it with the seller');
      continue;
    }
    let content;
    try {
      content = read(fqn);
    } catch {
      add(false, fqn, 'the file cannot be read');
      continue;
    }
    const entry = readEntry(content, fqn, { added: kind === 'added' });
    for (const problem of entry.problems) add(false, fqn, problem);
    if (entry.problems.length > 0) continue;
    if (++quoted > MAX_ENTRIES) {
      add(false, fqn, 'too many entries in one pull request to quote; split it');
      continue;
    }
    // One unpaid request per entry: every claimed token is judged from the same 402.
    const challenge = readChallenge(await request(entry.origin, entry.route));
    const payable = new Set(challenge.offers.map((offer) => offer.symbol));
    for (const asset of entry.assets) {
      if (payable.has(asset)) {
        add(true, fqn, `${asset}: the 402 offers it on Celo and buy can pay it`);
      } else {
        const why = challenge.problems[0] ?? 'the 402 has no payable Celo offer in this token';
        add(false, fqn, `${asset}: ${why}`);
      }
    }
  }
  return results;
}

export function summary(results) {
  if (results.length === 0) return 'No catalog entry was added or changed.\n';
  const rows = results.map(
    (r) => `| ${r.ok ? 'pass' : 'fail'} | \`${r.entry}\` | ${r.detail.replace(/\|/g, '\\|')} |`,
  );
  return [
    '### Registry check',
    '',
    'One unpaid request per entry. Nothing was signed or paid, and passing does not list the service: a maintainer reviews and merges.',
    '',
    '| Result | Entry | What the check found |',
    '|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [registryDir, changesFile, summaryFile] = process.argv.slice(2);
  if (!registryDir || !changesFile) {
    console.error('usage: node scripts/check-registry.mjs <registry dir> <changes file> [summary.md]');
    process.exit(2);
  }
  const root = realpathSync(registryDir);
  const read = (fqn) => {
    const path = join(root, 'providers', fqn, 'PAY.md');
    // A symlink could point the read anywhere on the runner; a listing is a
    // plain file that resolves inside the registry directory.
    if (!lstatSync(path).isFile() || !realpathSync(path).startsWith(root + sep)) {
      throw new Error('not a plain file in the registry');
    }
    return readFileSync(path, 'utf8');
  };
  const results = await checkRegistry(changedEntries(readFileSync(changesFile, 'utf8')), { read });
  const text = summary(results);
  process.stdout.write(text);
  if (summaryFile) writeFileSync(summaryFile, text);
  if (results.some((r) => !r.ok)) process.exit(1);
}
