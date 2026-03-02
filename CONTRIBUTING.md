# Contributing To ccbridge

Thanks for considering a contribution.

`ccbridge` is still early, so the most useful contributions are usually:

- bug fixes in orchestration flow
- prompt / schema / provider consistency fixes
- UX improvements in the CLI
- documentation updates based on real usage
- focused tests that protect tricky behavior

## Before You Start

Make sure you can run:

```bash
npm test
```

If you are working on real CLI integrations, also verify:

```bash
npm start -- doctor
```

## Local Development

Install dependencies and run tests:

```bash
npm install
npm test
```

Useful commands:

```bash
npm start -- doctor
npm start -- presets
npm start -- run --preset balanced --workspace /path/to/repo --task-file ./task.md
```

## Project Areas

The main parts of the project are:

- `src/orchestrator.mjs`: orchestration state machine
- `src/prompts.mjs`: planner / critic / executor / reviewer prompts
- `src/schema.mjs`: structured output contracts
- `src/providers/`: CLI adapters for Claude, Codex, and mock mode
- `src/cli.mjs`: user-facing terminal workflow
- `test/`: regression coverage

If you are adding a provider, read [docs/how-to-add-a-provider.md](./docs/how-to-add-a-provider.md) before editing `src/providers/`.

If you change one of these areas, look for impact on the others.

Example:

- prompt changes often require schema changes
- schema changes often require provider and test updates
- CLI UX changes often require README updates

## Pull Requests

Please keep PRs focused.

Good PRs usually:

- solve one coherent problem
- include tests when behavior changes
- update docs if the user-facing workflow changes
- explain the tradeoff, not just the code diff

For bug-fix PRs, include:

- what was broken
- how to reproduce it
- why the fix is correct

## AI-Assisted Contributions

AI-assisted contributions are fine.

If you used AI heavily, please review the output carefully before opening a PR. In particular:

- verify prompts and schema still agree
- verify tests still cover the changed behavior
- do not submit generated text you do not understand

## Style Expectations

- prefer small, direct fixes over abstraction-heavy rewrites
- keep terminal UX explicit and debuggable
- preserve artifact transparency in `.runs`
- avoid widening permissions unless there is a clear reason

## Security-Sensitive Changes

Changes touching these areas deserve extra care:

- permission modes
- shell command execution
- workspace boundaries
- human handoff logic
- provider output parsing

If your change affects any of those, mention it clearly in the PR description.

## Questions

If you are unsure whether a change fits the project, open an issue or start with a small PR.
