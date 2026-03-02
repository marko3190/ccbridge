import os from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { renderBashCompletion, renderZshCompletion } from "./completion.mjs";
import { ensureDir, writeText } from "./files.mjs";

const BLOCK_START = "# >>> ccbridge shell completion >>>";
const BLOCK_END = "# <<< ccbridge shell completion <<<";

function buildManagedBlock(shell) {
  if (shell === "zsh") {
    return [
      BLOCK_START,
      'if [[ -d "$HOME/.zsh/completions" ]]; then',
      '  fpath=("$HOME/.zsh/completions" $fpath)',
      "fi",
      "autoload -Uz compinit",
      "compinit",
      BLOCK_END
    ].join("\n");
  }

  if (shell === "bash") {
    return [
      BLOCK_START,
      'if [ -f "$HOME/.bash_completion.d/ccbridge" ]; then',
      '  . "$HOME/.bash_completion.d/ccbridge"',
      "fi",
      BLOCK_END
    ].join("\n");
  }

  throw new Error(`Unsupported shell for setup: ${shell}`);
}

export function upsertManagedBlock(content, block) {
  const pattern = new RegExp(`${BLOCK_START}[\\s\\S]*?${BLOCK_END}\\n?`, "m");
  const normalized = content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;

  if (pattern.test(normalized)) {
    return normalized.replace(pattern, `${block}\n`);
  }

  return `${normalized}${normalized ? "\n" : ""}${block}\n`;
}

function getShellSetupSpec(shell, homeDir = os.homedir()) {
  if (shell === "zsh") {
    return {
      shell,
      rcFile: path.join(homeDir, ".zshrc"),
      completionFile: path.join(homeDir, ".zsh", "completions", "_ccbridge"),
      completionScript: renderZshCompletion(),
      managedBlock: buildManagedBlock(shell)
    };
  }

  if (shell === "bash") {
    return {
      shell,
      rcFile: path.join(homeDir, ".bashrc"),
      completionFile: path.join(homeDir, ".bash_completion.d", "ccbridge"),
      completionScript: renderBashCompletion(),
      managedBlock: buildManagedBlock(shell)
    };
  }

  throw new Error(`Unsupported shell for setup: ${shell}. Supported shells: zsh, bash`);
}

export async function setupShellCompletion(shell, { homeDir = os.homedir() } = {}) {
  const spec = getShellSetupSpec(shell, homeDir);

  await ensureDir(path.dirname(spec.completionFile));
  await writeText(spec.completionFile, spec.completionScript);

  let rcContent = "";
  try {
    rcContent = await readFile(spec.rcFile, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const updatedRcContent = upsertManagedBlock(rcContent, spec.managedBlock);
  if (updatedRcContent !== rcContent) {
    await writeText(spec.rcFile, updatedRcContent);
  }

  return {
    shell: spec.shell,
    completionFile: spec.completionFile,
    rcFile: spec.rcFile
  };
}
