import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/cli.mjs";

test("parseArgs rejects missing values for paired options", () => {
  assert.throws(
    () => parseArgs(["node", "cli.mjs", "run", "--config"]),
    /--config requires a value/
  );
});

test("parseArgs rejects invalid numeric option values", () => {
  assert.throws(
    () => parseArgs(["node", "cli.mjs", "run", "--max-rounds", "abc"]),
    /--max-rounds requires a non-negative integer/
  );
});
