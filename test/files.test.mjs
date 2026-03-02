import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deleteFile } from "../src/files.mjs";

test("deleteFile ignores missing files", async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "ccbridge-files-"));
  await deleteFile(path.join(baseDir, "missing.json"));
});

test("deleteFile rethrows non-ENOENT errors", async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "ccbridge-files-"));
  const dirPath = path.join(baseDir, "directory");
  await mkdir(dirPath);

  await assert.rejects(() => deleteFile(dirPath));
});
