function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const presetDefinitions = {
  balanced: {
    description: "Claude plans and implements. Codex validates plans and reviews changes.",
    roles: {
      planner: {
        provider: "claude-cli",
        model: "sonnet",
        permissionMode: "dontAsk"
      },
      critic: {
        provider: "codex-cli",
        sandbox: "read-only",
        approvalPolicy: "never",
        skipGitRepoCheck: true
      },
      executor: {
        provider: "claude-cli",
        model: "sonnet",
        permissionMode: "bypassPermissions",
        dangerouslySkipPermissions: true
      },
      reviewer: {
        provider: "codex-cli",
        sandbox: "read-only",
        approvalPolicy: "never",
        skipGitRepoCheck: true
      }
    }
  },
  "codex-exec": {
    description: "Claude plans. Codex validates and implements. Claude reviews the result.",
    roles: {
      planner: {
        provider: "claude-cli",
        model: "sonnet",
        permissionMode: "dontAsk"
      },
      critic: {
        provider: "codex-cli",
        sandbox: "read-only",
        approvalPolicy: "never",
        skipGitRepoCheck: true
      },
      executor: {
        provider: "codex-cli",
        sandbox: "workspace-write",
        approvalPolicy: "never",
        skipGitRepoCheck: true
      },
      reviewer: {
        provider: "claude-cli",
        model: "sonnet",
        permissionMode: "dontAsk"
      }
    }
  },
  "codex-leads": {
    description: "Codex plans and implements. Claude critiques plans and reviews changes.",
    roles: {
      planner: {
        provider: "codex-cli",
        sandbox: "read-only",
        approvalPolicy: "never",
        skipGitRepoCheck: true
      },
      critic: {
        provider: "claude-cli",
        model: "sonnet",
        permissionMode: "dontAsk"
      },
      executor: {
        provider: "codex-cli",
        sandbox: "workspace-write",
        approvalPolicy: "never",
        skipGitRepoCheck: true
      },
      reviewer: {
        provider: "claude-cli",
        model: "sonnet",
        permissionMode: "dontAsk"
      }
    }
  }
};

export function getPresetNames() {
  return Object.keys(presetDefinitions);
}

export function getPresetSummaries() {
  return getPresetNames().map((name) => ({
    name,
    description: presetDefinitions[name].description
  }));
}

export function getPresetConfig(name = "balanced") {
  const preset = presetDefinitions[name];
  if (!preset) {
    throw new Error(
      `Unknown preset: ${name}. Available presets: ${getPresetNames().join(", ")}`
    );
  }

  return clone(preset);
}
