import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  compareVersions,
  normalizeUpdateAnswer,
  shouldOfferUpdatePrompt
} from "../src/update-check.mjs";

test("compareVersions orders semantic versions correctly", () => {
  assert.equal(compareVersions("0.1.4", "0.1.4"), 0);
  assert.equal(compareVersions("0.1.5", "0.1.4"), 1);
  assert.equal(compareVersions("0.1.4", "0.1.5"), -1);
});

test("normalizeUpdateAnswer handles yes, no, and invalid input", () => {
  assert.equal(normalizeUpdateAnswer(""), true);
  assert.equal(normalizeUpdateAnswer("Y"), true);
  assert.equal(normalizeUpdateAnswer("no"), false);
  assert.equal(normalizeUpdateAnswer("later"), null);
});

test("shouldOfferUpdatePrompt skips linked or local repo installs", async () => {
  const packageRoot = await mkdtemp(path.join(os.tmpdir(), "ccbridge-update-"));
  await writeFile(path.join(packageRoot, "package.json"), '{"name":"ccbridge-cli"}\n', "utf8");
  await mkdir(path.join(packageRoot, ".git"));

  const shouldPrompt = await shouldOfferUpdatePrompt({
    command: "run",
    stdinIsTTY: true,
    stdoutIsTTY: true,
    packageName: "ccbridge-cli",
    packageRoot
  });

  assert.equal(shouldPrompt, false);
});

test("shouldOfferUpdatePrompt allows globally installed npm package in TTY", async () => {
  const packageRoot = await mkdtemp(path.join(os.tmpdir(), "ccbridge-update-"));
  await writeFile(path.join(packageRoot, "package.json"), '{"name":"ccbridge-cli"}\n', "utf8");

  const shouldPrompt = await shouldOfferUpdatePrompt({
    command: "run",
    stdinIsTTY: true,
    stdoutIsTTY: true,
    packageName: "ccbridge-cli",
    packageRoot,
    env: {}
  });

  assert.equal(shouldPrompt, true);
});
