import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  MARKER,
  checkRequest,
  guardedLookup,
  isPublicAddress,
  parseForm,
  parseRoutes,
  probe,
  readChallenge,
  renderComment,
  safeOrigin,
} from './check-listing.mjs';

const USDC = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C';
const USAT = '0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771';
/** Not in buy's token table: an 18-decimal peso token. */
const WARS = '0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D';

const v1Offer = (over = {}) => ({
  scheme: 'exact',
  network: 'celo',
  maxAmountRequired: '10000',
  resource: 'https://api.example.com/rates',
  description: '',
  mimeType: '',
  payTo: '0x0000000000000000000000000000000000C0FFEE',
  maxTimeoutSeconds: 60,
  asset: USDC,
  extra: { name: 'USDC', version: '2' },
  ...over,
});
const v1 = (...accepts) => ({
  status: 402,
  body: JSON.stringify({ x402Version: 1, error: 'payment required', accepts }),
});

const v2Offer = (over = {}) => ({
  scheme: 'exact',
  network: 'eip155:42220',
  amount: '10000',
  asset: USAT,
  payTo: '0x0000000000000000000000000000000000C0FFEE',
  maxTimeoutSeconds: 60,
  extra: { name: 'Tether America USD', version: '1' },
  ...over,
});
const v2 = (accepts, extra = {}) => ({
  status: 402,
  body: '{}',
  header: Buffer.from(JSON.stringify({ x402Version: 2, accepts, ...extra })).toString('base64'),
});

const issue = (over = {}) => {
  const answers = {
    Origin: 'https://api.example.com',
    'What it does, for an agent deciding whether to call it': 'Live FX rates.',
    'Paid routes': 'GET /rates',
    'Networks you accept': 'Celo mainnet (eip155:42220)',
    'Tokens you accept': 'USDC',
    'Contact (optional)': '_No response_',
    ...over,
  };
  return Object.entries(answers)
    .map(([label, answer]) => `### ${label}\n\n${answer}\n`)
    .join('\n');
};

describe('parseForm', () => {
  it('reads a rendered issue form and treats "_No response_" as empty', () => {
    const form = parseForm(issue());
    assert.equal(form.Origin, 'https://api.example.com');
    assert.equal(form['Contact (optional)'], '');
  });
});

describe('safeOrigin', () => {
  it('takes a public https origin', () => {
    assert.equal(safeOrigin('https://api.example.com/'), 'https://api.example.com');
    assert.equal(safeOrigin('https://api.example.com:443'), 'https://api.example.com');
  });

  for (const raw of [
    'http://api.example.com',
    'file:///etc/passwd',
    'https://user:pass@api.example.com',
    'https://api.example.com:8443',
    'https://127.0.0.1',
    'https://169.254.169.254',
    'https://[::1]',
    'https://localhost',
    'https://metadata.internal',
    'https://printer.local',
    '--output=/tmp/x',
    '',
  ]) {
    it(`refuses ${raw || 'an empty origin'}`, () => {
      assert.equal(safeOrigin(raw), undefined);
    });
  }
});

describe('isPublicAddress', () => {
  it('accepts public addresses, IPv4 included', () => {
    for (const address of ['8.8.8.8', '172.67.144.227', '2606:4700::1']) {
      assert.equal(isPublicAddress(address), true, address);
    }
  });

  it('refuses private, loopback, link-local and mapped ones', () => {
    for (const address of [
      '10.0.0.1',
      '127.0.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '192.168.1.1',
      '100.64.0.1',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '::ffff:169.254.169.254',
      'not-an-address',
    ]) {
      assert.equal(isPublicAddress(address), false, address);
    }
  });
});

describe('parseRoutes', () => {
  const origin = 'https://api.example.com';

  it('reads methods and paths, with or without the origin', () => {
    assert.deepEqual(
      parseRoutes(`GET /a, post /b\n\`GET ${origin}/c\``, origin).map((r) => `${r.method} ${r.path}`),
      ['GET /a', 'POST /b', 'GET /c'],
    );
  });

  it('marks a path with a parameter instead of requesting it', () => {
    assert.equal(parseRoutes('GET /creator/{id}', origin)[0].parameterised, true);
    assert.equal(parseRoutes('GET /creator/:id', origin)[0].parameterised, true);
  });

  it('drops anything that would leave the origin', () => {
    for (const raw of ['GET //evil.example/x', 'GET https://evil.example/x', 'GET \\\\evil/x']) {
      assert.deepEqual(parseRoutes(raw, origin), [], raw);
    }
  });

  it('caps how many routes one request can ask for', () => {
    const many = Array.from({ length: 30 }, (_, i) => `GET /r${i}`).join(', ');
    assert.equal(parseRoutes(many, origin).length, 8);
  });
});

describe('probe', () => {
  it('refuses a name that resolves to a private address at connect time', async () => {
    // localhost passes no origin check here on purpose: this is the case of a
    // public-looking name whose DNS answer is private, which only the lookup sees.
    const refused = await new Promise((resolve) => {
      guardedLookup('localhost', { all: true }, (err) => resolve(err));
    });
    assert.match(refused.message, /public address/);
    assert.deepEqual(await probe('https://localhost', { method: 'GET', path: '/' }), {
      error: 'the request failed',
    });
  });

  it('refuses a path that resolves to another origin', async () => {
    const seen = await probe('https://api.example.com', { method: 'GET', path: '//evil.example/' });
    assert.deepEqual(seen, { error: 'the route leaves the origin' });
  });

  /** A stand-in for https.request: `serve` gets the response to drive by hand. */
  const fakeRequest = (serve) => (_url, _options, onResponse) => {
    const req = new EventEmitter();
    req.destroyed = false;
    req.destroy = () => {
      req.destroyed = true;
    };
    req.end = () => {
      const res = new EventEmitter();
      res.statusCode = 402;
      res.headers = {};
      onResponse(res);
      serve(res, req);
    };
    return req;
  };
  const route = { method: 'GET', path: '/rates' };

  it('settles when the connection drops mid-body', async () => {
    for (const drop of ['aborted', 'error', 'close']) {
      const seen = await probe('https://api.example.com', route, {
        request: fakeRequest((res) => {
          res.emit('data', Buffer.from('{"x402Version":'));
          res.emit(drop, new Error('socket hang up'));
        }),
      });
      assert.deepEqual(seen, { error: 'the response was cut off' }, drop);
    }
  });

  it('settles at the deadline when the body never ends', async () => {
    let req;
    const seen = await probe('https://api.example.com', route, {
      deadlineMs: 20,
      request: fakeRequest((res, r) => {
        req = r;
        res.emit('data', Buffer.from('{'));
      }),
    });
    assert.deepEqual(seen, { error: 'no answer within 15 seconds' });
    assert.equal(req.destroyed, true);
  });

  it('keeps the answer when the response closes after it ends', async () => {
    const seen = await probe('https://api.example.com', route, {
      request: fakeRequest((res) => {
        res.emit('data', Buffer.from('{}'));
        res.emit('end');
        res.emit('close');
      }),
    });
    assert.deepEqual(seen, { status: 402, header: undefined, body: '{}' });
  });
});

describe('readChallenge', () => {
  it('reads a v1 offer from the body', () => {
    const seen = readChallenge(v1(v1Offer()));
    assert.deepEqual(seen.problems, []);
    assert.deepEqual(seen.offers, [{ symbol: 'USDC', amount: '10000', price: '0.01' }]);
  });

  it('reads a v2 offer from the header', () => {
    const seen = readChallenge(v2([v2Offer()]));
    assert.deepEqual(seen.problems, []);
    assert.equal(seen.offers[0].symbol, 'USAT');
  });

  it('reports the status when an unpaid request is not a 402', () => {
    for (const status of [200, 302, 401, 500]) {
      assert.match(readChallenge({ status, body: '' }).problems[0], new RegExp(`returned ${status}`));
    }
  });

  it('names the v1 and v2 network mix-up in each direction', () => {
    assert.match(
      readChallenge(v1(v1Offer({ network: 'eip155:42220' }))).problems[0],
      /x402 v1 names this network `celo`/,
    );
    assert.match(
      readChallenge(v2([v2Offer({ network: 'celo' })])).problems[0],
      /x402 v2 names this network `eip155:42220`/,
    );
  });

  it('names the domain for a token signed with another network name', () => {
    const seen = readChallenge(v1(v1Offer({ extra: { name: 'USD Coin', version: '2' } })));
    assert.deepEqual(seen.offers, []);
    assert.match(seen.problems[0], /name `USDC`, version `2`/);
  });

  it('refuses a 402 with no Celo offer', () => {
    const base = v2Offer({ network: 'eip155:8453' });
    assert.ok(readChallenge(v2([base])).problems.length > 0);
    assert.match(readChallenge(v1(v1Offer({ network: 'base' }))).problems[0], /no offer on Celo/);
  });

  it('refuses a route offering only a token buy cannot pay', () => {
    const seen = readChallenge(v1(v1Offer({ asset: WARS, extra: { name: 'Peso', version: '1' } })));
    assert.match(seen.problems[0], /no Celo offer in a token buy can pay/);
  });

  it('keeps a payable offer when another on the route is not', () => {
    const seen = readChallenge(
      v1(v1Offer(), v1Offer({ asset: WARS, extra: { name: 'Peso', version: '1' } })),
    );
    assert.deepEqual(seen.problems, []);
    assert.equal(seen.offers.length, 1);
  });

  it('does not echo anything from a failed request or a hostile 402', () => {
    const hostile = '<img src=x onerror=alert(1)> @everyone';
    const seen = readChallenge(
      v1(v1Offer({ extra: { name: hostile, version: hostile }, description: hostile })),
    );
    assert.ok(!seen.problems.join(' ').includes(hostile));
    assert.deepEqual(readChallenge({ error: 'the request failed' }).offers, []);
  });

  it('gives feedback instead of crashing on malformed offers', () => {
    const cases = [
      [[null], 'an entry in `accepts` is not an offer object'],
      [['x'], 'an entry in `accepts` is not an offer object'],
      [[v1Offer({ asset: undefined })], 'a Celo offer has no `asset` token address'],
      [[v1Offer({ asset: 7 })], 'a Celo offer has no `asset` token address'],
      [[v1Offer({ asset: 'USDC' })], 'a Celo offer has no `asset` token address'],
      [[v1Offer({ maxAmountRequired: { a: 1 } })], "the USDC offer's amount is not a whole number of base units"],
      [[v1Offer({ extra: null })], 'the USDC offer needs `extra` set to name `USDC`, version `2`'],
    ];
    for (const [accepts, problem] of cases) {
      const seen = readChallenge(v1(...accepts));
      assert.ok(seen.problems.includes(problem), `${JSON.stringify(accepts)}: ${seen.problems}`);
      assert.deepEqual(seen.offers, []);
    }
  });

  it('still reads the good offer next to a malformed one', () => {
    const seen = readChallenge(v1(null, v1Offer()));
    assert.deepEqual(seen.problems, ['an entry in `accepts` is not an offer object']);
    assert.equal(seen.offers[0].price, '0.01');
  });

  it('sees the bazaar extension', () => {
    assert.equal(readChallenge(v2([v2Offer()], { extensions: { bazaar: {} } })).discoverable, true);
    assert.equal(readChallenge(v2([v2Offer()])).discoverable, false);
  });
});

describe('checkRequest', () => {
  const answering = (response) => async () => response;
  const levels = async (body, response) => {
    const report = await checkRequest({ title: '[list] Rates', body }, answering(response));
    return Object.fromEntries(report.results.map((r) => [r.name, r.level]));
  };

  it('never requests an origin it refused', async () => {
    let called = false;
    const report = await checkRequest(
      { title: '[list] x', body: issue({ Origin: 'http://169.254.169.254' }) },
      async () => {
        called = true;
        return {};
      },
    );
    assert.equal(called, false);
    assert.equal(report.results[0].level, 'fail');
  });

  it('does not request a route with a parameter', async () => {
    let calls = 0;
    await checkRequest({ title: '[list] x', body: issue({ 'Paid routes': 'GET /a/{id}' }) }, async () => {
      calls += 1;
      return {};
    });
    assert.equal(calls, 0);
  });

  it('posts a result for a malformed offer instead of throwing', async () => {
    const report = await checkRequest({ title: '[list] Rates', body: issue() }, async () => v1(null));
    const route = report.results.find((r) => r.name === '`GET /rates`');
    assert.equal(route.level, 'fail');
    assert.match(renderComment(report), /needs changes/);
  });

  it('fails a route whose 402 the reader chokes on, and checks the rest', async () => {
    let calls = 0;
    const report = await checkRequest(
      { title: '[list] Rates', body: issue({ 'Paid routes': 'GET /a, GET /b' }) },
      async () => (++calls === 1 ? { status: 402, get body() { throw new Error('boom'); } } : v1(v1Offer())),
    );
    assert.deepEqual(
      report.results.filter((r) => r.name.startsWith('`')).map((r) => [r.name, r.level, r.detail]),
      [['`GET /a`', 'fail', 'the 402 could not be read'], ['`GET /b`', 'pass', '0.01 USDC']],
    );
  });

  it('fails a token the form claims and the 402 does not offer', async () => {
    const result = await levels(issue({ 'Tokens you accept': 'USDC, USDT' }), v1(v1Offer()));
    assert.equal(result.Tokens, 'fail');
  });

  it('does not hold a token buy cannot pay against the seller', async () => {
    const result = await levels(issue({ 'Tokens you accept': 'USDC, wARS' }), v1(v1Offer()));
    assert.equal(result.Tokens, undefined);
  });

  it('flags a missing USA₮ offer without failing the request', async () => {
    const result = await levels(issue(), v1(v1Offer()));
    assert.equal(result['USA₮'], 'warn');
    assert.ok(!Object.values(result).includes('fail'));
  });

  it('fails a form that leaves out Celo mainnet', async () => {
    const result = await levels(issue({ 'Networks you accept': 'Base (eip155:8453)' }), v1(v1Offer()));
    assert.equal(result.Networks, 'fail');
  });

  it('fails a description over the limit', async () => {
    const description = 'x'.repeat(501);
    const body = issue({ 'What it does, for an agent deciding whether to call it': description });
    assert.equal((await levels(body, v1(v1Offer()))).Description, 'fail');
  });

  it('asks for data rights only on a form that has the question', async () => {
    assert.equal((await levels(issue(), v1(v1Offer())))['Data rights'], undefined);

    const dataSource = 'Where the data comes from';
    const unticked = issue({ [dataSource]: 'ExampleFX', Checks: '- [ ] What the endpoint returns is my own data' });
    assert.equal((await levels(unticked, v1(v1Offer())))['Data rights'], 'fail');

    const empty = issue({ [dataSource]: '_No response_', Checks: '- [x] What the endpoint returns is my own data' });
    assert.equal((await levels(empty, v1(v1Offer())))['Data rights'], 'fail');

    const answered = issue({ [dataSource]: 'ExampleFX', Checks: '- [X] What the endpoint returns is my own data' });
    assert.equal((await levels(answered, v1(v1Offer())))['Data rights'], 'pass');
  });
});

describe('renderComment', () => {
  const hostile = '@viral-sangani <img src=x> [click](https://evil.example) </details> ```\n| a | b |';
  const render = async () =>
    renderComment(
      await checkRequest(
        {
          title: `[list] ${hostile}`,
          body: issue({
            'What it does, for an agent deciding whether to call it': hostile,
            'Contact (optional)': hostile,
          }),
        },
        async () => v1(v1Offer()),
      ),
    );

  it('starts with the marker the workflow finds it by', async () => {
    assert.ok((await render()).startsWith(`${MARKER}\n`));
  });

  it('keeps seller text inside a fence nothing in it can close', async () => {
    const comment = await render();
    const fence = comment.match(/^(`{3,})markdown$/m)[1];
    assert.ok(fence.length > 3);
    const inside = comment.indexOf(`${fence}markdown`);
    const outside = comment.indexOf(`\n${fence}\n`, inside);
    assert.ok(outside > inside);
    const around = comment.slice(0, inside) + comment.slice(outside + fence.length + 2);
    for (const token of ['@viral-sangani', '<img', 'evil.example']) {
      assert.ok(!around.includes(token), token);
    }
  });

  it('keeps seller text out of the comment when a route fails', async () => {
    const comment = renderComment(
      await checkRequest(
        {
          title: `[list] ${hostile}`,
          body: issue({ 'What it does, for an agent deciding whether to call it': hostile }),
        },
        async () => ({ status: 500, body: hostile }),
      ),
    );
    for (const token of ['@viral-sangani', '<img', 'evil.example']) {
      assert.ok(!comment.includes(token), token);
    }
  });

  it('puts the live price and token in the draft, not what the form claimed', async () => {
    const comment = renderComment(
      await checkRequest(
        { title: '[list] Rates: live FX', body: issue({ 'Price per call': '$99' }) },
        async () => v1(v1Offer()),
      ),
    );
    assert.match(comment, /\| `GET \/rates` \| 0\.01 USDC \|/);
    assert.match(comment, /assets: \[USDC\]/);
    assert.ok(!comment.includes('$99'));
  });

  it('quotes the title and description so a colon cannot break the frontmatter', async () => {
    const comment = renderComment(
      await checkRequest(
        {
          title: '[list] Rates: live FX "now" \\ fast',
          body: issue({ 'What it does, for an agent deciding whether to call it': 'Rates: live FX, key: value' }),
        },
        async () => v1(v1Offer()),
      ),
    );
    assert.match(comment, /^title: "Rates: live FX 'now' {2}fast \(x402\)"$/m);
    assert.match(comment, /^description: "Rates: live FX, key: value"$/m);
    const frontmatter = comment.match(/^---\n([\s\S]*?)\n---$/m)[1];
    for (const line of frontmatter.split('\n')) {
      // Each line is `key: value` with the value either quoted whole or free of `: `,
      // which is what both YAML and the registry's parser need.
      const [, value] = line.match(/^\s*[a-z_]+:\s?(.*)$/);
      assert.ok(/^"[^"\\]*"$/.test(value) || !/: /.test(value), line);
    }
  });

  it('leaves the draft out when no route can be paid', async () => {
    const comment = renderComment(
      await checkRequest({ title: '[list] x', body: issue() }, async () => ({ status: 500, body: '' })),
    );
    assert.ok(!comment.includes('<details>'));
    assert.match(comment, /needs changes/);
  });
});

describe('the workflow', () => {
  const workflow = readFileSync('.github/workflows/listing-check.yml', 'utf8');

  it('never expands issue text into a shell', () => {
    assert.ok(!/\$\{\{\s*github\.event\.issue\.(title|body)/.test(workflow));
  });

  it('runs the check with no token in reach', () => {
    assert.match(workflow, /persist-credentials: false/);
    const check = workflow.slice(workflow.indexOf('name: run the check'));
    const step = check.slice(0, check.indexOf('- name:', 10));
    assert.ok(!step.includes('GH_TOKEN'));
  });
});
