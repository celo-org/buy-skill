---
name: file-feedback
description: Draft and file a redacted bug report, payment problem, feature request, or general feedback about buy — the skills, the CLI, the MCP server, the gateway, or a purchase — as a public GitHub issue on celo-org/buy-skill, after showing the user the exact text and getting their approval. Use when a buy command, MCP tool, or skill instruction fails, surprises, or misleads the user, or when they ask to report, file, flag, or send feedback about buy. Do not use to file issues on unrelated repositories, and do not use to debug a failure the user has not asked to report.
---

# File feedback about buy

`celo-org/buy-skill` is the only public front door for `buy`. Everything goes here — a wrong
line in a skill, a CLI crash, an MCP tool that returns nothing, a gateway that answered
strangely, a payment that vanished, or an idea. Maintainers route it onward from there; the
client and gateway repositories are not reachable from outside, so do not send the user
looking for them.

The issue you create is public, permanent, and indexed. A report about a failed purchase
naturally contains material that must never leave the user's machine. Most of this skill is
about that.

## Non-negotiable boundaries

- Never file without the user's explicit approval of the final title and body. The issue is
  posted from their GitHub account, is public forever, and is indexed by search engines.
- Never file from a session where the user cannot answer. If you cannot ask, print the
  drafted issue and stop.
- Never include a poll URL. `https://usebuy.ai/gcloud/vm/<token>` is a bearer capability:
  **anyone holding that URL can read the user's result and renew the lease at the user's
  expense.** Write `https://usebuy.ai/gcloud/vm/<redacted>` instead.
- Never paste a saved response file from the `tee` pattern verbatim. It contains the poll
  URL. Quote the one field that matters.
- Never include a private key, seed phrase, keychain output, SSH private key, or any Self
  proof, nullifier, or passport material — including material the user calls a test value.
- Include the wallet address only if the user opts in after being told it links their
  spending history to their GitHub account, publicly and permanently.
- Search existing issues before opening a new one, and offer a comment on a near match.
- Report only what was observed. Never invent an error string, a version, a transaction
  hash, or a timestamp to fill a field.
- State the money facts even when they are unflattering: whether a payment was signed, and
  whether it was charged.
- File into `celo-org/buy-skill` and nowhere else. Never file into, or point the user at,
  `celo-org/cpay`; it is internal and returns 404 for them.

## What must never leave the user's machine

| Item | Public issue? | What to do instead |
|---|---|---|
| Private key, seed phrase, mnemonic | Never | Nothing replaces it. It is never evidence. |
| OS keychain contents, or a `security` / `secret-tool` dump | Never | Report the error only. |
| Poll URL `https://usebuy.ai/gcloud/vm/<token>` | Never | `https://usebuy.ai/gcloud/vm/<redacted>`. Say the token was 40+ characters if length is the bug. |
| A saved response file, pasted whole | Never | Quote `instance`, `expiresAt`, or the error field alone. |
| SSH private key (`~/.ssh/id_*` with no `.pub`) | Never | The public key is also unnecessary; say "an ed25519 public key". |
| Self proof payload, nullifier, QR contents, ID or passport images | Never | Report the user-visible message, e.g. "proof could not be verified". |
| `env`, `printenv`, or full shell history | Never | Paste the environment block below, nothing more. |
| Wallet address (`0x` + 40 hex) | Only on opt-in | Ask first; explain it publishes their spending history. Default to omitting it. |
| Wallet balance | Only on opt-in | It narrows the address even when the address is withheld. |
| Transaction hash (`0x` + 64 hex) | Yes | Already public on Celoscan. The single most useful field in the report. |
| Correlation ID | Yes | Copy it verbatim; it is how a maintainer finds the server-side trace. |
| HTTP status and error code or string | Yes | Verbatim. |
| Route and `machineType` | Yes | `POST /gcloud/vm`, `e2-micro`. |
| Request body with `script` / `sshKey` elided | Yes | `{"script":"<elided, 312 bytes>","machineType":"e2-micro"}`. |
| `@celo/buy` version, Node version, OS and arch | Yes | See the environment block below. |
| MCP client name and version | Yes | e.g. "Claude Code 2.x". |
| Timestamp with timezone or UTC offset | Yes | A bare local time is unusable server-side. |
| Amount and token | Yes | `0.016753 USDC`. |

**`0x` followed by 64 hex characters is a transaction hash — public, safe, wanted. `0x`
followed by 40 hex characters is an address — the user's, and only theirs to publish.** That
one distinction decides most redaction calls in a `buy` report.

Once the body is drafted, run a backstop scan over it before showing it to the user:

```sh
grep -nEi \
  -e 'usebuy\.ai/gcloud/vm/[A-Za-z0-9_.-]{8,}' \
  -e '0x[0-9a-fA-F]{40}([^0-9a-fA-F]|$)' \
  -e 'BEGIN [A-Z ]*PRIVATE KEY' \
  -e '(mnemonic|seed phrase|privatekey|private_key)' \
  "$body_file"
```

**This grep is a backstop, not the check.** Read the body yourself. It will not catch a seed
phrase written as prose, a key inside a screenshot, or a poll token the user pasted without
its hostname.

## Choose a category

| Category | Issue form | Title prefix | Labels the form applies |
|---|---|---|---|
| Payment or settlement problem — money moved or may have | `payment-problem.yml` | `[payment]` | `bug` |
| CLI bug | `bug.yml`, area `buy CLI` | `[bug]` | `bug` |
| MCP server bug | `bug.yml`, area `buy MCP server` | `[bug]` | `bug` |
| Gateway or API behaviour | `bug.yml`, area `Gateway (usebuy.ai)` | `[bug]` | `bug` |
| Skill content is wrong — SKILL.md says X, reality is Y | `docs-or-skill.yml` | `[docs]` | `documentation` |
| Docs unclear or ambiguous | `docs-or-skill.yml` | `[docs]` | `documentation` |
| Feature request or new skill idea | `feature-request.yml` | `[idea]` | `enhancement` |
| General praise or friction | `feedback.yml` | `[feedback]` | `question` |

**If money moved or may have moved, it is a payment problem — whatever else it also is.** A
gateway bug that charged the user is filed as a payment problem, because that is the queue a
maintainer watches. File the gateway bug separately if it is also reproducible without paying.

The title prefix is the category channel that always survives. A `labels` query parameter is
dropped for anyone without write access to the repository, and `gh issue create --label`
fails outright for a non-collaborator, so a maintainer may have to add labels by hand. The
prefix is how they know what they are looking at before they open it.

## Draft the report

Draft as a set of named blocks whose names are exactly the issue forms' field `id`s. That is
what lets the `gh` path and the browser path render the same report from one source.

| Block | Field `id` | Content |
|---|---|---|
| Title | (the issue title) | `[<prefix>] <what broke>` — the failure, not the goal. |
| Goal | `goal` | One or two sentences: what the user was trying to do. |
| Reproduction | `repro` | The exact command or MCP tool call, redacted. |
| Expected | `expected` | What the user or the skill said would happen. |
| Actual | `actual` | What happened. |
| Error text | `error` | Verbatim and complete, redacted. Not a paraphrase. |
| Payment status | `charged` | From the table below. Required whenever a purchase was attempted. |
| Identifiers | `tx`, `correlation` | Transaction hash and correlation ID, if any. |
| Environment | `environment` | The block below. |

The other forms use their own ids — `where`, `says`, `reality`, `impact`, `version` on
`docs-or-skill.yml`; `problem`, `today`, `scope`, `proposal` on `feature-request.yml`;
`what`, `context` on `feedback.yml`.

Collect the environment rather than asking the user to recite it:

```sh
npx --yes @celo/buy@0.5.0 --version
node --version
uname -srm
date -u +'%Y-%m-%dT%H:%M:%SZ'
```

Add the MCP client name and version when the failure came through an MCP tool. `--version`
may not be recognised on every release; if it is not, report the version the user actually
invoked — `@celo/buy@0.5.0` — and say that is what was pinned, not what resolved.

### Was it charged?

| What happened | Charged? | Write this |
|---|---|---|
| Quote only, or a `400` | No | No payment was signed. |
| `insufficient_balance`, or a daily cap refusal | No | Refused client-side before signing. |
| `402 verify_payment_failed` or `402 verify_self_failed` | No | Payment rejected by the gateway; nothing settled. |
| `503 at_capacity`, `at_spend_capacity`, `coordination_unavailable` | No | Refused before settlement. |
| `500 provision_failed` | Yes | Charged, no VM. Include the transaction hash. |
| `500 settle_uncertain` | Maybe | Unknown. Include the transaction hash if one was printed, and the correlation ID. |
| `500 renew_failed` | Yes | Charged, renewal outcome unknown. Include the VM status. |
| Network disconnect after a paid request | Maybe | Response lost. Do not report it as unpaid. |

Before writing "Maybe", check `buy receipts` — it may show the attempt, and a transaction
hash resolves it on Celoscan. **An absent receipt field is not evidence that no payment
happened:** streamed `buy curl` receipts do not retain the transaction hash or poll URL.
Never have the user retry the purchase to find out; a retry is a second payment.

## Search before filing

```sh
gh issue list -R celo-org/buy-skill --state all --limit 20 \
  --search "settle_uncertain in:title,body"
```

```sh
gh search issues --repo celo-org/buy-skill --state all --limit 20 "provision_failed"
```

Without `gh`, hand the user a search URL:

```text
https://github.com/celo-org/buy-skill/issues?q=is%3Aissue+settle_uncertain
```

Search two or three phrasings, not one: the error code, the HTTP status plus the route, and
the quoted human-readable message. Present near matches as a table of number, title, state,
and last-updated, then ask whether to comment instead of opening a new issue:

```sh
gh issue comment 42 -R celo-org/buy-skill --body-file "$body_file"
```

There is no prefill URL for a comment. Without `gh`, print the body and give the user the
issue URL to paste it into.

## Get approval

Show the exact rendered title and body — not a summary of it. Then ask, in one message:

> This will be posted publicly to `celo-org/buy-skill` from your GitHub account and will stay
> public. File it as written, edit it first, or not at all?

Wait for a literal answer. If the user edits the text, **re-run the redaction scan on the
edited version before filing** — they may have pasted back the thing you removed. If they
decline, offer to keep the draft at a path they name, and otherwise delete it.

## File it with gh

Probe the two failure modes separately; they need different answers:

```sh
command -v gh >/dev/null 2>&1 || echo 'gh-not-installed'
gh auth status --hostname github.com >/dev/null 2>&1 || echo 'gh-not-authenticated'
```

`gh auth status` also prints the token scopes. Filing needs `repo` or `public_repo`.

Write the body to a private temp file rather than passing it inline. It contains backticks,
quotes, `$`, and newlines, and shell quoting will corrupt it:

```sh
(
  umask 077
  set -o pipefail
  body_file=$(mktemp ./buy-feedback.XXXXXX) || exit
  cat > "$body_file" <<'BODY'
### What I was trying to do

Buy an e2-micro VM to run a one-line script.

### Payment status

Maybe — the response was lost, or said settle_uncertain.
BODY
  gh issue create -R celo-org/buy-skill \
    --title '[payment] 500 settle_uncertain on POST /gcloud/vm' \
    --body-file "$body_file" \
    --label bug
  status=$?
  printf 'Draft kept at %s\n' "$body_file" >&2
  exit "$status"
)
```

The heredoc is quoted (`<<'BODY'`) so the shell does not expand `$` or backticks inside the
user's error text. `--label` is best effort: a reporter without write access cannot set
labels and `gh` fails the whole call, so re-run without `--label` on that error — the title
prefix carries the category. `gh issue create --template` applies only in interactive mode
and does nothing here; the forms and the `gh` path are separate routes that this skill keeps
in sync by hand. Report the returned issue URL to the user, then delete the temp file.

## File it from the browser instead

**Prefill an issue form by using each field's `id` as a query parameter, not `body`.** GitHub
documents `body` for Markdown templates; for a YAML form it documents only that "query
parameters for issue form fields can also be passed to the issue template chooser". Do not
send `body` alongside `template` and assume it lands — write each field by id:

```text
https://github.com/celo-org/buy-skill/issues/new
  ?template=payment-problem.yml
  &title=%5Bpayment%5D%20500%20settle_uncertain%20on%20POST%20%2Fgcloud%2Fvm
  &goal=Buy%20an%20e2-micro%20VM%20to%20run%20one%20script
  &error=500%20settle_uncertain%0Acorrelation%3A%20abc123
```

Leave `labels` out entirely. GitHub requires permission to add a label in order to use the
`labels` parameter, so it does nothing for an outside reporter, and the form applies its own
labels server-side anyway, which needs no permission from them.

**Prefill is reliable for `input` and `textarea` fields and unreliable for `dropdown` and
`checkboxes`.** Do not assume the `route` and `charged` dropdowns arrive selected. Tell the
user which option to pick, in the sentence where you hand over the URL, and put the same fact
in a text field that does prefill — for a payment problem, restate the charged status in
`actual` — so the report still carries it if the dropdown comes up empty.

Encode with a tool, not by hand:

```sh
jq -Rrs @uri < "$body_file"
```

```sh
python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.stdin.read(),safe=""))' \
  < "$body_file"
```

| Character | Encode as |
|---|---|
| space | `%20` |
| newline | `%0A` |
| `#` | `%23` |
| `&` | `%26` |
| `+` | `%2B` |
| `/` | `%2F` |
| `?` | `%3F` |
| `"` | `%22` |
| backtick | `%60` |
| `%` | `%25` |

**An over-long URL returns `414 URI Too Long` — the page fails, it does not truncate.**
GitHub documents the error but publishes no character limit, so treat 6,000 characters for
the whole assembled URL as a working ceiling rather than a measured one. Percent-encoding a
multi-line body roughly triples its length, so a 2,000-character report is already close.
When it is longer, trim in this order and stop as soon as it fits:

1. `environment` — reduce to the four collected lines.
2. `error` — keep the first and last 15 lines, with `… <n> lines elided …` between.
3. `repro` — keep the command, drop the surrounding narration.
4. Still over: set the remaining long field to `see pasted details below`, print the full
   text to the terminal, and tell the user to paste it in after the page opens.

Never solve a length problem by dropping the payment status, the transaction hash, or the
correlation ID.

## Failure handling

| Situation | Filed? | Action |
|---|---|---|
| `gh` not installed | No | Use the prefilled URL. Do not stop to install `gh`. |
| `gh` installed, not authenticated | No | Offer `gh auth login`; if declined, use the URL. |
| Token lacks `repo` or `public_repo` scope | No | `gh auth refresh -h github.com -s public_repo`, or use the URL. |
| `--label` rejected — reporter is not a collaborator | No | Re-run without `--label`. The title prefix carries the category. |
| `403` rate limit or secondary rate limit | No | Do not loop. Wait, retry once, then use the URL. |
| Issues disabled on the repository | No | Stop. Print the body for the user to keep. Never redirect them to `celo-org/cpay`. |
| Network failure mid-`gh issue create` | Maybe | Search for the exact title before retrying; the issue may already exist. |
| `414 URI Too Long` on the fallback URL | No | Trim per the ladder above and reissue. |
| Template chooser opens instead of the form | No | The `template=` filename is wrong or not on the default branch. Pick from the chooser and prefill by hand. |
| A dropdown comes up unselected | No | Expected; prefill is unreliable for dropdowns. Tell the user which option to pick. |
| User declines to file | No | Do not file. Keep or delete the draft as they choose. |
| User edits the approved text | No | Re-run the redaction scan, then re-ask. |

Form filenames, field `id`s, the label set, and `gh` flags all age. The forms in
`.github/ISSUE_TEMPLATE/` of this repository are authoritative; when a prefill parameter is
ignored, read the form rather than trusting the table above.
