# Security Model

`ccbridge` is an orchestration tool for coding agents, so its security model matters more than it would for a passive library.

This document explains the intended trust boundaries and risk assumptions.

## Core Assumption

`ccbridge` is designed for trusted local repositories.

That means:

- you understand the repo you point it at
- you trust the code in that workspace
- you trust the task you are giving it
- you accept that agents may edit files and run shell commands there

It is not designed as a hardened sandbox for arbitrary third-party repositories.

## Role Separation

The main safety mechanism is role separation:

- `planner` proposes
- `critic` challenges
- `executor` changes code
- `reviewer` checks output

Only the `executor` should modify the workspace.

This does not eliminate risk, but it reduces the chance of one agent both inventing a plan and silently executing it without challenge.

## Human Handoff

`ccbridge` treats unresolved product or scope decisions as a human problem, not an agent guessing problem.

When a role cannot continue safely, it returns `needs_input`.

That creates an explicit pause:

- the question is persisted to disk
- the user answers explicitly
- the answer is fed back into later stages

This is a safety feature, not just a UX feature.

## Permission Model

The most important practical risk is the `executor`.

In the default `balanced` preset, the Claude executor is configured to run with bypassed permission checks so it can:

- edit files
- run validation commands
- complete work without waiting for shell approval prompts

This is useful for automation, but it widens trust requirements significantly.

Use this mode only:

- on repos you trust
- on machines you control
- when you accept that commands may run without interactive approval

If that is too permissive for your environment, define a stricter custom config.

## Workspace Scope

`ccbridge` operates on one target workspace at a time.

That helps keep edits and artifacts scoped to a single repo. It does not guarantee perfect isolation from every upstream CLI behavior, so you should still assume the active agent can inspect whatever the provider CLI is allowed to inspect.

## Artifacts And Logs

Runs write durable artifacts, including raw stdout/stderr logs for provider calls.

This improves debuggability, but it also means:

- prompts are persisted
- agent outputs are persisted
- user answers are persisted

Do not run `ccbridge` on tasks that include secrets you do not want written into run artifacts.

## Threats This Project Tries To Reduce

`ccbridge` tries to reduce:

- silent scope drift
- unreviewed execution
- hidden agent disagreement
- ambiguous human decisions
- opaque failure modes

It does this through:

- role separation
- structured JSON contracts
- resumable artifacts
- explicit review passes
- visible terminal progress

## Threats It Does Not Solve

`ccbridge` does not fully solve:

- malicious code already present in the target repo
- upstream CLI vulnerabilities
- all prompt injection attacks
- data exfiltration risks inherent to permissive agent execution
- misuse caused by intentionally unsafe configuration

If you need stronger isolation, you should add it at the environment level:

- disposable workspaces
- containers or VMs
- network restrictions
- separate credentials

## Recommended Safe Usage

For practical use, the safest baseline is:

- use `ccbridge` on a disposable branch or worktree
- start with a narrow task
- inspect the config before running
- inspect artifacts after failures
- avoid feeding secrets into prompts
- keep the executor role limited to the minimum necessary environment

## Reporting

For security reporting guidance, see the root [SECURITY.md](../SECURITY.md).
