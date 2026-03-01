import { spawn } from "node:child_process";

function parseClaudeStatus(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function providersFromConfig(config) {
  return new Set(
    Object.values(config.roles ?? {})
      .map((role) => role?.provider)
      .filter(Boolean)
  );
}

function summarizeCheck(check) {
  const status = check.ok ? "OK" : "FAIL";
  const versionLine = check.version ? `version=${check.version}` : "version=unknown";
  const authLine = check.authenticated ? "auth=ready" : "auth=missing";
  return `[${status}] ${check.provider} ${versionLine} ${authLine} ${check.message}`;
}

async function runProcess(command, args) {
  const stdoutChunks = [];
  const stderrChunks = [];

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));

    child.on("error", (error) => {
      resolve({
        code: null,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        error: error.message
      });
    });

    child.on("close", (code) => {
      resolve({
        code,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        error: null
      });
    });
  });
}

async function checkClaude() {
  const versionResult = await runProcess("claude", ["--version"]);
  if (versionResult.error) {
    return {
      provider: "claude-cli",
      ok: false,
      authenticated: false,
      version: null,
      message: `binary unavailable: ${versionResult.error}`
    };
  }

  const statusResult = await runProcess("claude", ["auth", "status"]);
  const status = parseClaudeStatus(statusResult.stdout);
  const authenticated = Boolean(status?.loggedIn);

  return {
    provider: "claude-cli",
    ok: authenticated,
    authenticated,
    version: versionResult.stdout.trim(),
    message: authenticated
      ? `logged in via ${status.authMethod ?? "unknown"}`
      : "run `claude auth login` before starting the orchestrator"
  };
}

async function checkCodex() {
  const versionResult = await runProcess("codex", ["-V"]);
  if (versionResult.error) {
    return {
      provider: "codex-cli",
      ok: false,
      authenticated: false,
      version: null,
      message: `binary unavailable: ${versionResult.error}`
    };
  }

  const statusResult = await runProcess("codex", ["login", "status"]);
  const combinedOutput = `${statusResult.stdout}\n${statusResult.stderr}`.trim();
  const authenticated = /logged in/i.test(combinedOutput) && !/not logged in/i.test(combinedOutput);

  return {
    provider: "codex-cli",
    ok: authenticated,
    authenticated,
    version: versionResult.stdout.trim().replace(/^WARNING:.*\n?/m, "").trim(),
    message: authenticated
      ? combinedOutput.split("\n").pop()
      : "run `codex login` before starting the orchestrator"
  };
}

export async function runPreflight(config) {
  const providers = providersFromConfig(config);
  const checks = [];

  if (providers.has("claude-cli")) {
    checks.push(await checkClaude());
  }

  if (providers.has("codex-cli")) {
    checks.push(await checkCodex());
  }

  return {
    ok: checks.every((check) => check.ok),
    checks
  };
}

export function formatPreflightReport(result) {
  return result.checks.map(summarizeCheck).join("\n");
}
