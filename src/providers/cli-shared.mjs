import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDir, writeText } from "../files.mjs";

function collectTextContent(value) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => collectTextContent(entry)).join("\n");
  }

  if (value && typeof value === "object") {
    if (typeof value.text === "string") {
      return value.text;
    }

    if (typeof value.content === "string") {
      return value.content;
    }

    if (Array.isArray(value.content)) {
      return collectTextContent(value.content);
    }

    if (typeof value.result === "string") {
      return value.result;
    }
  }

  return "";
}

function extractJson(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Agent returned an empty response.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {}

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }

  throw new Error(`Could not parse structured JSON from agent output:\n${trimmed.slice(0, 600)}`);
}

export function parseStructuredOutput(rawText) {
  const parsed = extractJson(rawText);

  if (parsed && typeof parsed === "object") {
    if (parsed.structured_output && typeof parsed.structured_output === "object") {
      return parsed.structured_output;
    }

    if (
      parsed.response_type === "result" ||
      parsed.response_type === "needs_input"
    ) {
      return parsed;
    }

    if (typeof parsed.result === "string") {
      return extractJson(parsed.result);
    }

    if (parsed.result && typeof parsed.result === "object") {
      return parsed.result;
    }

    if (Array.isArray(parsed.content)) {
      return extractJson(collectTextContent(parsed.content));
    }

    if (typeof parsed.content === "string") {
      return extractJson(parsed.content);
    }
  }

  return parsed;
}

export async function runCommand({
  command,
  args,
  cwd,
  stdinText,
  rawLogPrefix,
  runDir,
  timeoutMs = 900000,
  onProgress,
  progressContext
}) {
  await ensureDir(path.join(runDir, "raw"));

  const stdoutChunks = [];
  const stderrChunks = [];
  let spawnError;
  let timedOut = false;
  const startedAt = Date.now();
  let heartbeat;
  let timeoutHandle;
  let killHandle;

  const exitCode = await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
    child.on("error", (error) => {
      spawnError = error;
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (killHandle) {
        clearTimeout(killHandle);
      }
      resolve(null);
    });
    child.on("close", (code) => {
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (killHandle) {
        clearTimeout(killHandle);
      }
      resolve(code);
    });

    onProgress?.({
      type: "agent_call_start",
      command,
      rawLogPrefix,
      elapsedMs: 0,
      ...progressContext
    });

    heartbeat = setInterval(() => {
      onProgress?.({
        type: "agent_call_heartbeat",
        command,
        rawLogPrefix,
        elapsedMs: Date.now() - startedAt,
        ...progressContext
      });
    }, 10000);

    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        killHandle = setTimeout(() => {
          child.kill("SIGKILL");
        }, 5000);
        killHandle.unref?.();
      }, timeoutMs);
      timeoutHandle.unref?.();
    }

    if (typeof stdinText === "string") {
      child.stdin.write(stdinText, "utf8");
    }
    child.stdin.end();
  });

  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8");

  await Promise.all([
    writeText(path.join(runDir, "raw", `${rawLogPrefix}.stdout.log`), stdout),
    writeText(path.join(runDir, "raw", `${rawLogPrefix}.stderr.log`), stderr)
  ]);

  onProgress?.({
    type: "agent_call_done",
    command,
    rawLogPrefix,
    elapsedMs: Date.now() - startedAt,
    exitCode,
    ...progressContext
  });

  if (spawnError || exitCode !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(" ")}`,
        `Exit code: ${exitCode ?? "spawn_error"}`,
        timedOut ? `Timed out after ${timeoutMs}ms` : null,
        spawnError ? `Spawn error: ${spawnError.message}` : null,
        stderr.slice(0, 1200) || stdout.slice(0, 1200)
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return { stdout, stderr };
}

export async function writeSchemaFile(runDir, rawLogPrefix, schema) {
  const schemaPath = path.join(runDir, "raw", `${rawLogPrefix}.schema.json`);
  await ensureDir(path.dirname(schemaPath));
  await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
  return schemaPath;
}
