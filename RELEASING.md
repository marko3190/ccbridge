# Releasing ccbridge

This file is a lightweight checklist for preparing releases.

## Versioning

`ccbridge` uses semantic versioning.

- `PATCH` for bug fixes, docs fixes, packaging fixes, and small UX improvements that do not change the expected CLI or config behavior
- `MINOR` for new user-facing features, new commands, new orchestration capabilities, or meaningful workflow changes that remain backward compatible
- `MAJOR` for breaking changes to the CLI, config format, artifact expectations, or provider contract

For normal releases, prefer bumping the version with npm so that `package.json`, the git tag, and the release version stay aligned:

```bash
npm version patch
```

or:

```bash
npm version minor
```

Use `major` only when the release intentionally breaks compatibility.

## v0.1.0 Checklist

Before tagging:

- ensure `main` is green locally:
  - `npm test`
- verify the real CLI path still works:
  - `npm start -- doctor`
- run at least one real end-to-end orchestration against a local test repo
- confirm README, `CONTRIBUTING.md`, `SECURITY.md`, and `LICENSE` are up to date
- confirm the default preset and example config still match the documented behavior

## Suggested Release Notes For v0.1.0

`v0.1.0` should communicate that `ccbridge` already supports:

- planner / critic / executor / reviewer orchestration
- structured human handoff with `needs_input`
- resume, answer, and continue-after-review flows
- role-aware terminal progress plus human-readable final summaries
- real `claude` + `codex` CLI runs
- run artifacts for debugging

It should also be honest that the project is still early and meant for trusted local repositories.

## Tagging

Example:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## GitHub Release

For the first GitHub release, include:

- what the project is
- who it is for
- what already works
- the trust and permission model
- a short getting-started command

## After Release

After publishing a release, useful next steps are:

- add GitHub Topics
- add a short repo description
- consider publishing to npm
- collect feedback from a few real users before widening scope

## npm Publish

`ccbridge` is published to npm as `ccbridge-cli`, while the installed CLI command remains `ccbridge`.

Example:

```bash
npm publish
```
