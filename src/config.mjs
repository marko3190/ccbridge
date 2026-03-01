import { readFile } from "node:fs/promises";
import path from "node:path";

function assertRoleConfig(config, roleName) {
  if (!config?.provider) {
    throw new Error(`Missing provider for role "${roleName}".`);
  }
}

export async function loadConfig(configPath, overrides = {}) {
  const resolvedConfigPath = path.resolve(configPath);
  const configDir = path.dirname(resolvedConfigPath);
  const raw = await readFile(resolvedConfigPath, "utf8");
  const parsed = JSON.parse(raw);

  const workspaceDir = path.resolve(
    configDir,
    overrides.workspaceDir ?? parsed.workspaceDir ?? process.cwd()
  );

  const artifactsDir = path.resolve(
    workspaceDir,
    overrides.artifactsDir ?? parsed.artifactsDir ?? ".runs"
  );

  const config = {
    workspaceDir,
    artifactsDir,
    maxPlanRounds: overrides.maxPlanRounds ?? parsed.maxPlanRounds ?? 3,
    maxReviewRounds: overrides.maxReviewRounds ?? parsed.maxReviewRounds ?? 1,
    roles: {
      planner: parsed.roles?.planner,
      critic: parsed.roles?.critic,
      executor: parsed.roles?.executor,
      reviewer: parsed.roles?.reviewer
    }
  };

  for (const roleName of ["planner", "critic", "executor", "reviewer"]) {
    assertRoleConfig(config.roles[roleName], roleName);
  }

  return config;
}
