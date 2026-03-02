import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
  return dirPath;
}

export async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeText(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, value, "utf8");
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function deleteFile(filePath) {
  await unlink(filePath).catch((error) => {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  });
}

export function buildRunId(now = new Date()) {
  return now.toISOString().replaceAll(":", "-");
}
