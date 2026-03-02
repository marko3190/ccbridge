import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPresetConfig } from "./presets.mjs";

function assertRoleConfig(config, roleName) {
  if (!config?.provider) {
    throw new Error(`Missing provider for role "${roleName}".`);
  }
}

function mergeRoleConfig(baseConfig, overrideConfig) {
  return {
    ...(baseConfig ?? {}),
    ...(overrideConfig ?? {})
  };
}

function buildBaseConfig(presetName) {
  const preset = getPresetConfig(presetName);
  return {
    workspaceDir: ".",
    artifactsDir: ".runs",
    maxPlanRounds: 3,
    maxReviewRounds: 1,
    maxAgentCallMs: 300000,
    roles: preset.roles
  };
}

export async function loadConfig(configPath, overrides = {}) {
  const baseConfig = buildBaseConfig(overrides.preset);
  let configDir = process.cwd();
  let parsed = {};

  if (configPath) {
    const resolvedConfigPath = path.resolve(configPath);
    configDir = path.dirname(resolvedConfigPath);
    const raw = await readFile(resolvedConfigPath, "utf8");
    parsed = JSON.parse(raw);
  }

  const workspaceDir = path.resolve(
    configDir,
    overrides.workspaceDir ?? parsed.workspaceDir ?? baseConfig.workspaceDir ?? process.cwd()
  );

  const artifactsDir = path.resolve(
    workspaceDir,
    overrides.artifactsDir ?? parsed.artifactsDir ?? baseConfig.artifactsDir ?? ".runs"
  );

  const config = {
    workspaceDir,
    artifactsDir,
    maxPlanRounds:
      overrides.maxPlanRounds ?? parsed.maxPlanRounds ?? baseConfig.maxPlanRounds ?? 3,
    maxReviewRounds:
      overrides.maxReviewRounds ?? parsed.maxReviewRounds ?? baseConfig.maxReviewRounds ?? 1,
    maxAgentCallMs:
      parsed.maxAgentCallMs ?? baseConfig.maxAgentCallMs ?? 300000,
    roles: {
      planner: mergeRoleConfig(baseConfig.roles?.planner, parsed.roles?.planner),
      critic: mergeRoleConfig(baseConfig.roles?.critic, parsed.roles?.critic),
      executor: mergeRoleConfig(baseConfig.roles?.executor, parsed.roles?.executor),
      reviewer: mergeRoleConfig(baseConfig.roles?.reviewer, parsed.roles?.reviewer)
    }
  };

  for (const roleName of ["planner", "critic", "executor", "reviewer"]) {
    assertRoleConfig(config.roles[roleName], roleName);
  }

  return config;
}
