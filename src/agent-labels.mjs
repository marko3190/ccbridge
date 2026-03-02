function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getRoleDisplayName(roleName) {
  return titleCase(roleName);
}

export function getAgentDisplayName(roleConfig = {}) {
  switch (roleConfig.provider) {
    case "claude-cli":
      return "Claude";
    case "codex-cli":
      return "Codex";
    case "mock":
      return "Mock";
    default:
      return roleConfig.provider ?? "Unknown";
  }
}

export function buildRoleAgentMap(config = {}) {
  const roles = config.roles ?? {};
  const roleAgents = {};

  for (const roleName of ["planner", "critic", "executor", "reviewer"]) {
    const roleConfig = roles[roleName] ?? {};
    roleAgents[roleName] = {
      role: getRoleDisplayName(roleName),
      agent: getAgentDisplayName(roleConfig),
      provider: roleConfig.provider ?? null,
      model: roleConfig.model ?? null
    };
  }

  return roleAgents;
}

export function formatRoleWithAgent(roleName, roleAgents = {}) {
  const entry = roleAgents?.[roleName];
  if (!entry) {
    return getRoleDisplayName(roleName);
  }

  return `${entry.role} (${entry.agent})`;
}
