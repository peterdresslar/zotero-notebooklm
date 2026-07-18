# Agent Working Agreement

This repository is maintained by Peter Dresslar with help from coding agents and
human contributors. Treat this file as the shared contract for how work should be
planned, changed, reviewed, and shipped.

## Project Boundary

This project is a Zotero plugin plus a Chrome extension for moving staged Zotero
sources into Gemini Notebook (formerly NotebookLM). Keep changes inside that
product boundary unless an issue or maintainer decision explicitly expands the
scope.

An agent-facing or MCP-style interface is within scope when it serves the same
workflow: allowing a trusted chatbot or automation client to select Zotero
collections or items and create or populate a notebook in Gemini Notebook from
those sources. Such work should reuse the same staging, permission, and
local-server safety boundaries rather than opening broad library or filesystem
access.

The integration with Gemini Notebook is browser-DOM automation against a
third-party web app because stable public API access is not generally available
to non-business users. Assume this DOM path is inherently brittle. Prefer small,
well-isolated changes that make the failure modes easier to understand and
recover from.

If supported Gemini Notebook API access becomes available, that should improve
the transport path rather than obsolete the project. Keep the product centered
on moving Zotero-managed sources into Gemini Notebook with the least brittle
available mechanism for the user.

## Roles

Humans own product direction, release decisions, issue prioritization, and
security tradeoffs.

Agents may inspect, implement, test, document, and prepare PRs. Agents should
make reasonable local engineering decisions, but should pause before changing
the product shape, dependency strategy, release process, or security model.

Do not overwrite or revert work you did not make unless the maintainer explicitly
asks for that operation.

## Branch And PR Discipline

Do not commit directly to `main`. Use a branch for every change and open a PR.

Keep PRs reviewable. A good default is one PR for one issue or one coherent
maintenance task. Avoid mixing bug fixes, dependency migrations, UI polish, and
documentation rewrites unless the PR description explains why they belong
together.

Prefer atomic commits:

- Reproduce or document the bug.
- Implement the narrow fix.
- Add or update tests.
- Update docs or release notes.

Link PRs to the relevant GitHub issue when one exists.

## GitHub Ruleset

This repository uses the active `Solo-to-Small Workflow` ruleset on the default
branch, based on `peterdresslar/rulesets`.

The ruleset enforces the baseline workflow:

- Direct commits to `main` are blocked because all changes must go through a PR.
- Human review is encouraged but not required by tooling for solo-maintainer
  work; the required approval count is zero.
- The default branch cannot be deleted.
- Non-fast-forward updates to the default branch are blocked.

Treat the PR as the required self-review surface even when no second reviewer is
involved. When collaborating with another human or agent, ask for review when the
change has meaningful risk, scope uncertainty, or security implications.

If this repository later adopts the `Solo-to-Small-Testing` variant or another
required-check ruleset, do not merge while required checks are red. Fix the
failure or document an explicit maintainer bypass for emergencies.

## Commit Messages

Follow GitHub-friendly commit messages. Use a short imperative subject, include
the relevant issue number when one exists, and keep the body focused on why the
change was made.

Good examples:

- `Fix Zotero 9 request headers (#3)`
- `Document agent workflow boundaries (#4)`
- `Migrate dependency workflow to pnpm`

When a commit closes or fixes an issue on merge, use GitHub keywords in the PR
description rather than forcing every commit subject to carry `Fixes #...`.

## Merge Policy

Squash merge PRs by default to keep `main` readable.

Use a regular merge only when the PR has a deliberately structured commit
history that is useful to preserve. Do not use rebase merges unless the
maintainer explicitly asks for one.

Before merging, make sure the final PR title and description are accurate,
because the squash commit will usually become the durable history entry.

## Package Management

_Please_ use `pnpm` for dependency installation and scripts.

If this repository still contains `package-lock.json`, migrate package-manager
state in a dedicated commit before doing dependency work. Do not maintain npm and
pnpm lockfiles in parallel.

Avoid adding new runtime dependencies unless they materially reduce complexity or
match an established project pattern.

## Local Tooling

Keep personal editor, IDE, browser-profile, and local-agent state out of the
repository. Do not add `.vscode`, `.idea`, `.cursor`, `.zed`, `.agents`,
`.codex`, or similar tool-specific folders.

Shared project standards should live in editor-neutral files such as
`AGENTS.md`, `package.json`, `tsconfig.json`, ESLint config, Prettier config, and
test configuration. If a tool-specific setup becomes necessary, document the
reason in the PR and prefer an editor-neutral script or command when possible.

## Verification

Before marking work ready for review, run the relevant checks for the files you
touched. For typical code changes, expect:

- `pnpm install --frozen-lockfile`
- `pnpm run build`
- `pnpm run lint:check`

When automation cannot cover the behavior, document the manual verification in
the PR. Browser-extension and Gemini Notebook DOM behavior usually needs manual
testing in Chrome with Zotero running.

## Extension And Local Server Safety

Keep the Zotero local HTTP server narrow. It should serve only staged items, not
arbitrary file paths or unstaged attachments.

Keep CORS and request headers as specific as the workflow allows. Do not broaden
host permissions, content-script matches, or local server endpoints without a
clear reason.

Do not log file contents, credentials, browser cookies, private library data, or
Gemini Notebook page state.

## Browser Automation Boundary

Keep Gemini Notebook selectors and injection logic isolated in the Chrome
extension. When Gemini Notebook changes its DOM, fix the smallest reliable
interaction path and leave notes about what was manually verified.

Prefer explicit loading, error, retry, and timeout states over silent failure.

## Documentation

Public docs should help a new user install, build, troubleshoot, and report
issues without private context.

Keep README changes accurate to the current release state. If there is no
published release, do not imply that one exists.

## Privacy

Do not commit secrets, personal tokens, private assessment links, generated logs
with personal data, or local browser/profile state.

When sharing command output in issues or PRs, remove paths, filenames, or Zotero
library details that are not necessary to understand the problem.
