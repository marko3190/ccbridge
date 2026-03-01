# Security Policy

`ccbridge` is not a passive library. It can orchestrate agents that:

- edit files
- run shell commands
- operate with bypassed permission checks in trusted-repo setups

Use it accordingly.

## Supported Versions

Security fixes are expected only for the latest state of `main` until a formal release process exists.

## Trusted Repo Assumption

The default `balanced` preset is designed for trusted local repositories.

In particular, the default Claude `executor` is configured to run with bypassed permissions so it can:

- apply edits
- run validation commands such as `npm test` and `npm run build`
- complete a run without pausing for every shell command

That is useful for automation, but it is also the main security tradeoff in this project.

Do not point `ccbridge` at:

- untrusted repositories
- unknown third-party codebases you have not inspected
- workspaces containing secrets you would not want exposed to the active agent CLIs

## What To Report

Please report issues such as:

- command execution outside the intended workspace
- permission bypass behavior that is broader than documented
- unsafe parsing that could cause the wrong agent response to be trusted
- leakage of sensitive data into logs or artifacts
- ways to coerce the orchestrator into editing or executing outside its intended flow

## Reporting A Vulnerability

Please do not open a public issue for a security vulnerability.

Use one of these options:

1. Open a private GitHub security advisory, if the repository has private reporting enabled.
2. Otherwise contact the maintainer privately on GitHub before disclosing details publicly.

If you report a vulnerability, include:

- affected version or commit
- exact reproduction steps
- impact
- any suggested mitigation

## Scope Notes

Some issues may belong primarily to upstream tools rather than `ccbridge` itself, for example:

- a vulnerability inside the `claude` CLI
- a vulnerability inside the `codex` CLI
- behavior caused entirely by a user choosing an unsafe permission mode knowingly

Those reports are still useful if they affect how `ccbridge` should document or constrain usage.
