# ccbridge

`ccbridge` is a small Node.js orchestrator for a `planner -> critic -> executor -> reviewer` loop across two coding agents.

The default intended pairing is:

- `Claude Code` for planning and implementation
- `Codex` for plan validation and code review

The runtime is provider-based, but the primary path in this project is direct CLI-to-CLI orchestration:

- `claude-cli`
- `codex-cli`
- `mock`

## Quick start

For most runs you only need a preset, a workspace, and a task file:

```bash
ccbridge run \
  --preset balanced \
  --workspace /absolute/path/to/repo \
  --task-file ./task.md
```

Useful presets:

- `balanced`: Claude plans and implements, Codex validates and reviews
- `codex-exec`: Claude plans, Codex validates and implements, Claude reviews
- `codex-leads`: Codex plans and implements, Claude critiques and reviews

## What it does

1. Planner creates a structured implementation plan.
2. Critic reviews the plan with a high bar for blocking issues and pushes non-critical concerns into non-blocking feedback.
3. Planner revises the plan with explicit `revision_notes` until approval or `maxPlanRounds`.
4. Executor implements the approved plan in the target workspace.
5. Reviewer reviews the resulting changes and returns structured findings.
6. If review requests changes, executor gets one or more repair rounds before the run ends.

Each run is written to `.runs/<timestamp>/` with raw agent logs and JSON artifacts.

## Why Node.js works well here

Node.js is a good fit because the orchestrator is mostly:

- process spawning
- structured JSON handling
- file-based artifacts
- simple CLI composition

You do not need a web server for the MVP.

## Requirements

- Node.js 20+
- Local `claude` CLI installed and authenticated if you want to use `claude-cli`
- Local `codex` CLI installed and authenticated if you want to use `codex-cli`

## Config

The default live config is [ccbridge.config.json](./ccbridge.config.json).

If you want a no-network smoke test, there is still [examples/mock.config.json](./examples/mock.config.json), but it is only for local validation.

You do not need a config file for basic usage. If `ccbridge.config.json` is missing, `ccbridge` falls back to the `balanced` preset automatically.

Example:

```json
{
  "workspaceDir": ".",
  "artifactsDir": ".runs",
  "maxPlanRounds": 3,
  "maxReviewRounds": 1,
  "roles": {
    "planner": {
      "provider": "claude-cli",
      "model": "sonnet",
      "permissionMode": "dontAsk"
    },
    "critic": {
      "provider": "codex-cli",
      "sandbox": "read-only",
      "approvalPolicy": "never",
      "skipGitRepoCheck": true
    },
    "executor": {
      "provider": "claude-cli",
      "model": "sonnet",
      "permissionMode": "acceptEdits"
    },
    "reviewer": {
      "provider": "codex-cli",
      "sandbox": "read-only",
      "approvalPolicy": "never",
      "skipGitRepoCheck": true
    }
  }
}
```

## Usage

First verify both CLIs are installed and logged in:

```bash
npm run doctor
```

List the built-in role layouts:

```bash
ccbridge presets
```

Then run against the current repository:

```bash
npm start -- run \
  --task "Implement a safer retry policy for outbound webhooks."
```

Or load the task from a file:

```bash
npm start -- run \
  --task-file ./task.md
```

If your target repository is not the current directory, override it explicitly:

```bash
npm start -- run \
  --preset balanced \
  --workspace /absolute/path/to/repo \
  --task "Implement a safer retry policy for outbound webhooks."
```

## Notes

- `planner` and `critic` exchange structured JSON, not free-form prose.
- The planning loop is intentionally cooperative: blocking issues should be rare, stable across rounds, and reserved for material execution risk.
- `executor` is the only role that should modify the workspace.
- `reviewer` checks the result after implementation, and the orchestrator can feed blocking findings back into a repair pass.
- `run` performs a preflight check for `claude` and `codex` auth before starting.
- Set `skipGitRepoCheck` for `codex-cli` roles if the target workspace is not a git repository.
- `maxReviewRounds` controls how many repair passes are allowed after the first review requests changes.
- `mock` provider exists only for local smoke tests without hitting external agent CLIs.

## Troubleshooting

### Reading doctor output

`npm run doctor` prints one line per provider in this format:

```
[OK|FAIL] <provider> version=<X> auth=<ready|missing> <message>
```

`OK` means the binary was found and auth is confirmed. `FAIL` means at least one check did not pass. The `message` field contains the specific reason or a remediation hint.

### Checking raw logs after a failed run

Every run writes artifacts to `<artifactsDir>/<timestamp>/` (default: `.runs/<timestamp>/`). Key files:

| File | When written |
|---|---|
| `task.txt` | Always |
| `plan.round-N.json` | Each plan revision |
| `critique.round-N.json` | Each critique round |
| `plan.approved.json` | Once the critic approves |
| `execution.round-N.json` | Each execution attempt |
| `execution.json` | Latest execution (overwritten each round) |
| `review.round-N.json` | Each review round |
| `review.json` | Latest review (overwritten each round) |
| `summary.json` | On plan rejection or after review loop completes (not written on provider command failures) |

The `raw/` subdirectory holds per-agent CLI logs. Two categories:

**Universal (written for every provider):**
- `<role>-<operation>.stdout.log`
- `<role>-<operation>.stderr.log`

**Codex-only structured artifacts:**
- `<role>-<operation>.schema.json` — JSON schema passed to `codex --output-schema`
- `<role>-<operation>.result.json` — structured output written by `codex --output-last-message`

Claude runs do not create `.schema.json` or `.result.json` files.

### Binary not found (ENOENT)

When doctor shows `binary unavailable: spawn <cli> ENOENT`, the CLI is not on your `PATH`. Install the respective CLI from its official documentation and ensure the binary is reachable from your shell before running the orchestrator.

### Auth not configured

When doctor shows `auth=missing`, the binary was found but authentication is not set up. Run the remediation command shown in the doctor output:

- **claude-cli:** `claude auth login`
- **codex-cli:** `codex login`

Then re-run `npm run doctor` to confirm `auth=ready` before starting a run.

To debug a false-negative `auth=missing`, run the same checks the doctor performs internally:

```bash
# Claude — expects JSON with loggedIn: true
claude auth status

# Codex — expects "logged in" in combined stdout/stderr
codex login status
```

### Codex: WARNING lines in version output

When running `codex -V` manually you may see a `WARNING:` banner before the version string. This is normal. The doctor strips that banner automatically when parsing the version, so it does not cause a check failure.

### Non-git workspace

`codex` exits non-zero when the target workspace is not a git repository, which causes the run to fail. Set `"skipGitRepoCheck": true` in the role config to suppress this check:

```json
"critic": {
  "provider": "codex-cli",
  "skipGitRepoCheck": true
}
```

### Command failed / non-zero exit code

When a run fails with a message like:

```
Command failed: claude --print --output-format json ...
Exit code: 1
<up to 1200 chars of stderr or stdout>
```

the CLI process exited with a non-zero code. The truncated output is a snapshot; the full logs are in:

```
<artifactsDir>/<timestamp>/raw/<role>-<operation>.stderr.log
```

Start with the `.stderr.log` file — it typically contains the CLI's own error message (authentication failure, unknown flag, network error, etc.).

### Claude Code: --output-format json not recognised

The orchestrator passes `--output-format json` and `--json-schema <schema>` to every `claude` invocation. If the `claude` binary does not support these flags, the command fails immediately with `unknown flag` or similar in stderr.

**Fix:** upgrade your `claude` CLI to the latest version.

```bash
claude --version   # verify which version is installed
```

### Codex: output-last-message issues

The orchestrator passes `--output-schema <path>` and `--output-last-message <path>` to every `codex` invocation. Two distinct failure modes can occur:

**Case A — non-zero exit code:** `codex` exits non-zero and the orchestrator throws immediately. The `.result.json` file is irrelevant here. Check the stderr log for the root cause (auth error, unrecognised flag, network failure, etc.):

```
<artifactsDir>/<timestamp>/raw/<role>-<operation>.stderr.log
```

**Case B — zero exit but missing or unreadable `.result.json`:** The provider falls back to raw stdout and calls `parseStructuredOutput()` on it. The run may then fail with `Agent returned an empty response` or `Could not parse structured JSON`. This can happen with older `codex` builds that ignore `--output-last-message` and write to stdout instead of the file. Confirm `codex` is up to date and check the raw stdout log:

```
<artifactsDir>/<timestamp>/raw/<role>-<operation>.stdout.log
```

### Structured JSON parse error

When a run fails with `Could not parse structured JSON from agent output`, the agent returned free-form text instead of valid JSON. The full raw output is in:

```
<artifactsDir>/<timestamp>/raw/<role>-<operation>.stdout.log
```

To isolate whether the issue is in the prompt or the CLI, switch the failing role to `"provider": "mock"` and re-run. If the mock provider succeeds, the prompt is fine and the problem is with the CLI response.

### Bypassing preflight for debugging

Pass `--skip-preflight` to skip the auth and binary checks entirely:

```bash
npm start -- run --skip-preflight --task "..."
```

Use this only during debugging when you know a check would fail for a transient reason (for example, a flaky `codex login status` call). Do not use it to permanently bypass a missing auth configuration.

## Test

```bash
npm test
```
