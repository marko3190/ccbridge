# ccbridge

`ccbridge` is an open-source CLI orchestrator for a cooperative multi-agent coding loop:

`planner -> critic -> executor -> reviewer`

The default pairing is:

- `Claude Code` for planning and implementation
- `Codex` for plan validation and code review

`ccbridge` is for people who want more structure than "let one agent run wild", but less ceremony than a full platform. It gives you:

- explicit planning rounds
- structured critique instead of vague back-and-forth
- human handoff when requirements are unclear
- a repair loop after review
- run artifacts you can inspect and debug
- visible terminal progress while agents are working

## Status

`ccbridge` is usable, but still early.

It has been tested on real `claude` and `codex` CLI runs, including:

- planner questions that require human clarification
- multi-round planning and critique
- execution plus post-review repair rounds
- final review pass with saved artifacts

Expect sharp edges. If you use it, use it in a repo you understand.

## Safety

This project can edit files and run shell commands in your workspace.

The default `balanced` preset uses a Claude `executor` with bypassed permission checks so it can complete work and run validation commands like `npm test` or `npm run build` without interactive approval prompts.

That is intentional for automation, but it means:

- use `ccbridge` only in repos you trust
- read the task you give it carefully
- understand the role config before widening permissions further

More details are in [SECURITY.md](./SECURITY.md).

## Quick Start

Requirements:

- Node.js 20+
- local `claude` CLI installed and authenticated if you want `claude-cli`
- local `codex` CLI installed and authenticated if you want `codex-cli`

Optional one-time setup if you want `ccbridge` in your shell:

```bash
npm link
```

If you prefer not to link it globally, use `npm start -- ...` from the repo root.

Check the environment first:

```bash
ccbridge doctor
```

Or without `npm link`:

```bash
npm start -- doctor
```

Run against a target repo:

```bash
ccbridge run \
  --preset balanced \
  --workspace /absolute/path/to/repo \
  --task-file ./task.md
```

Or without `npm link`:

```bash
npm start -- run \
  --preset balanced \
  --workspace /absolute/path/to/repo \
  --task-file ./task.md
```

## Docs

Additional documentation:

- [Architecture](./docs/architecture.md)
- [How To Add A Provider](./docs/how-to-add-a-provider.md)
- [Security Model](./docs/security-model.md)
- [First Run Guide](./docs/guides/first-run.md)
- [Releasing](./RELEASING.md)

## What A Run Looks Like

1. The planner proposes a structured plan.
2. The critic either approves it or returns blocking issues.
3. If required, the planner revises the plan until approval or `maxPlanRounds`.
4. The executor implements the approved plan.
5. The reviewer checks the result and can request a repair pass.
6. If repair rounds are exhausted, you can explicitly continue from the latest review without restarting the whole run.
7. The run ends as `completed`, `plan_rejected`, or `review_changes_requested`.

Every run is saved to `.runs/<timestamp>/`.

## Presets

Built-in presets:

- `balanced`: Claude plans and implements, Codex validates and reviews
- `codex-exec`: Claude plans, Codex validates and implements, Claude reviews
- `codex-leads`: Codex plans and implements, Claude critiques and reviews

List them locally:

```bash
ccbridge presets
```

## Human Handoff

If an agent cannot proceed safely without a user decision, `ccbridge` pauses and requests structured input instead of letting the model guess.

In a normal interactive terminal, `ccbridge run` automatically opens the question step.

If the run happened in a non-interactive environment, or you want to answer later:

```bash
ccbridge answer --run <runId>
```

For automation you can still answer with JSON:

```bash
ccbridge answer \
  --run <runId> \
  --answers '{"question_id":"value"}'
```

Supported answer shapes:

- `text`: `"question_id": "free-form answer"`
- `single_select`: `"question_id": "option_id"`
- `multi_select`: `"question_id": ["option_a", "option_b"]`

If a run was interrupted after input was already recorded:

```bash
ccbridge resume --run <runId>
```

If a run stopped because the reviewer still wants changes after the allowed repair passes:

```bash
ccbridge continue --run <runId>
```

For machine-readable final output instead of the human summary:

```bash
ccbridge run ... --json
```

For a more detailed human summary, including the role-to-agent mapping and artifact file paths:

```bash
ccbridge run ... --verbose
```

Current behavior is human handoff only. `ccbridge` does not let one agent invent product decisions on behalf of the user.

## Terminal UX

Long-running agent calls are noisy on purpose. `ccbridge` prints:

- the current stage
- which role and agent are running, for example `Planner (Claude)` or `Reviewer (Codex)`
- a live spinner/status line in interactive terminals
- heartbeat lines every 10 seconds in non-interactive terminals
- a completion line with elapsed time
- a short stage summary after plan, critique, execute, and review

At the end of a run, `ccbridge` prints a human-readable summary by default. Use `--json` for machine-readable output or `--verbose` for extra detail such as role-to-agent mapping and artifact file paths.

That feedback is there so the terminal does not look frozen during long `claude` or `codex` calls.

## Configuration

The default live config is [ccbridge.config.json](./ccbridge.config.json).

If `ccbridge.config.json` is missing, `ccbridge` falls back to the `balanced` preset automatically.

There is also a [mock config](./examples/mock.config.json) for local smoke tests without real agent CLIs.

Example config:

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
      "permissionMode": "bypassPermissions",
      "dangerouslySkipPermissions": true
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

Notes:

- `planner` and `critic` exchange structured JSON, not free-form prose.
- blocking issues are meant to be rare and reserved for material execution risk
- `executor` is the only role that should edit the workspace
- `reviewer` checks the result after implementation and can trigger a repair pass
- `run` performs preflight checks for `claude` and `codex` auth before starting
- `skipGitRepoCheck` is useful when a target workspace is not a git repo
- `mock` exists only for local smoke tests

## Contributing

Open source contributions are welcome.

Start with [CONTRIBUTING.md](./CONTRIBUTING.md).

If you plan to change prompts, schema contracts, or provider behavior, please keep those three areas aligned in the same PR whenever possible.

## Security

Read [SECURITY.md](./SECURITY.md) before using `ccbridge` in a sensitive repository.

This matters more here than in a typical CLI, because `ccbridge` may:

- edit files
- run shell commands
- execute with bypassed permissions in trusted-repo setups

## License

This project is released under the [MIT License](./LICENSE).

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
| `pending-input.json` | Only while the run is waiting for user input |
| `input-N.request.json` | Each structured input request from an agent |
| `input-N.answer.json` | Each answer captured by `ccbridge answer` |
| `summary.json` | On plan rejection or after review loop completes (not written on provider command failures) |

The `raw/` subdirectory holds per-agent CLI logs. Two categories:

**Universal (written for every provider):**
- `<role>-<operation>.stdout.log`
- `<role>-<operation>.stderr.log`

**Codex-only structured artifacts:**
- `<role>-<operation>.schema.json` — JSON schema passed to `codex --output-schema`
- `<role>-<operation>.result.json` — structured output written by `codex --output-last-message`

Claude runs do not create `.schema.json` or `.result.json` files.

### Run stopped with `waiting_for_user`

This means an agent returned a structured input request instead of trying to use an interactive terminal prompt. Inspect:

```bash
cat .runs/<runId>/pending-input.json
```

Then answer it with:

```bash
ccbridge answer --run <runId>
```

If you already answered the questions and the process was interrupted, continue with:

```bash
ccbridge resume --run <runId>
```

### Run stopped with `review_changes_requested`

This means the latest review still found a blocking issue after the currently allowed repair rounds. To grant one more `executor -> reviewer` cycle without restarting planning:

```bash
ccbridge continue --run <runId>
```

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
