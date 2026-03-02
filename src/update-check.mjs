import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { ensureDir, writeJson } from "./files.mjs";

const PACKAGE_NAME = "ccbridge-cli";
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPDATE_CHECK_TIMEOUT_MS = 2500;
const ELIGIBLE_COMMANDS = new Set(["run", "doctor", "presets"]);

function getPackageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function getUpdateCachePath(env = process.env) {
  if (env.CCBRIDGE_UPDATE_CACHE_PATH) {
    return env.CCBRIDGE_UPDATE_CACHE_PATH;
  }

  const configHome =
    env.XDG_CONFIG_HOME ??
    (process.platform === "win32"
      ? env.APPDATA
      : path.join(os.homedir(), ".config"));

  return path.join(configHome, "ccbridge", "update-check.json");
}

async function readInstalledPackageMetadata(packageRoot = getPackageRoot()) {
  const packageJson = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8")
  );

  return {
    name: packageJson.name,
    version: packageJson.version,
    packageRoot
  };
}

async function readUpdateCache(cachePath) {
  try {
    return JSON.parse(await readFile(cachePath, "utf8"));
  } catch {
    return {};
  }
}

async function writeUpdateCache(cachePath, cache) {
  await ensureDir(path.dirname(cachePath));
  await writeJson(cachePath, cache);
}

async function hasGitMetadata(packageRoot) {
  try {
    await access(path.join(packageRoot, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function fetchLatestVersion(packageName = PACKAGE_NAME) {
  const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`, {
    headers: {
      accept: "application/json"
    },
    signal: AbortSignal.timeout(UPDATE_CHECK_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`Registry returned ${response.status}`);
  }

  const payload = await response.json();
  if (!payload?.version || typeof payload.version !== "string") {
    throw new Error("Registry response did not include a version.");
  }

  return payload.version;
}

function parseVersion(version) {
  return version
    .split("-")[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

export function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue > rightValue) {
      return 1;
    }

    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

export function normalizeUpdateAnswer(value) {
  const normalized = value.trim().toLowerCase();

  if (!normalized || normalized === "y" || normalized === "yes") {
    return true;
  }

  if (normalized === "n" || normalized === "no") {
    return false;
  }

  return null;
}

export async function shouldOfferUpdatePrompt({
  command,
  json = false,
  env = process.env,
  stdinIsTTY = process.stdin.isTTY,
  stdoutIsTTY = process.stdout.isTTY,
  packageName = PACKAGE_NAME,
  packageRoot = getPackageRoot()
}) {
  if (!ELIGIBLE_COMMANDS.has(command)) {
    return false;
  }

  if (json || !stdinIsTTY || !stdoutIsTTY) {
    return false;
  }

  if (env.CI || env.CCBRIDGE_SKIP_UPDATE_CHECK === "1") {
    return false;
  }

  if (packageName !== PACKAGE_NAME) {
    return false;
  }

  if (await hasGitMetadata(packageRoot)) {
    return false;
  }

  return true;
}

async function promptForUpdate({
  currentVersion,
  latestVersion,
  input = process.stdin,
  output = process.stderr
}) {
  const rl = createInterface({
    input,
    output
  });

  try {
    while (true) {
      const answer = await rl.question(
        `\nNew ccbridge version available: ${currentVersion} -> ${latestVersion}\nUpdate now? [Y/n] `
      );
      const normalized = normalizeUpdateAnswer(answer);
      if (normalized !== null) {
        return normalized;
      }

      output.write("Please answer y/yes or n/no.\n");
    }
  } finally {
    rl.close();
  }
}

async function installLatestVersion({
  packageName = PACKAGE_NAME,
  output = process.stderr
}) {
  output.write(`Updating ${packageName}...\n`);

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(npmCommand, ["install", "-g", `${packageName}@latest`], {
      cwd: process.cwd(),
      stdio: ["ignore", "inherit", "inherit"]
    });

    child.on("error", reject);
    child.on("close", resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`npm install exited with code ${exitCode ?? "unknown"}`);
  }
}

async function restartCurrentCommand({
  argv = process.argv,
  output = process.stderr
}) {
  output.write("Restarting ccbridge with the updated version...\n");

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd: process.cwd(),
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("close", resolve);
  });

  process.exitCode = exitCode ?? 1;
}

export async function maybeHandleUpdateCheck({
  args,
  input = process.stdin,
  output = process.stderr,
  env = process.env,
  now = Date.now(),
  cachePath = getUpdateCachePath(env)
} = {}) {
  const metadata = await readInstalledPackageMetadata();
  const shouldPrompt = await shouldOfferUpdatePrompt({
    command: args?.command,
    json: args?.json,
    env,
    stdinIsTTY: input.isTTY,
    stdoutIsTTY: process.stdout.isTTY,
    packageName: metadata.name,
    packageRoot: metadata.packageRoot
  });

  if (!shouldPrompt) {
    return false;
  }

  let cache = await readUpdateCache(cachePath);
  let latestVersion = cache.latestVersion;

  if (
    typeof cache.checkedAt !== "number" ||
    now - cache.checkedAt > UPDATE_CHECK_INTERVAL_MS ||
    typeof latestVersion !== "string"
  ) {
    try {
      latestVersion = await fetchLatestVersion(metadata.name);
      cache = {
        ...cache,
        checkedAt: now,
        latestVersion
      };
      await writeUpdateCache(cachePath, cache);
    } catch {
      return false;
    }
  }

  if (!latestVersion || compareVersions(latestVersion, metadata.version) <= 0) {
    return false;
  }

  if (cache.ignoredVersion === latestVersion) {
    return false;
  }

  const shouldUpdate = await promptForUpdate({
    currentVersion: metadata.version,
    latestVersion,
    input,
    output
  });

  if (!shouldUpdate) {
    await writeUpdateCache(cachePath, {
      ...cache,
      checkedAt: now,
      latestVersion,
      ignoredVersion: latestVersion
    });
    return false;
  }

  try {
    await installLatestVersion({
      packageName: metadata.name,
      output
    });
    await writeUpdateCache(cachePath, {
      ...cache,
      checkedAt: now,
      latestVersion,
      ignoredVersion: null
    });
    await restartCurrentCommand({
      argv: process.argv,
      output
    });
    return true;
  } catch (error) {
    output.write(
      `Update failed: ${error.message}\nContinuing with the current version.\n`
    );
    return false;
  }
}
