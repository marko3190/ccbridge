import { spawn } from "node:child_process";

function isOptional(question) {
  return question.required === false;
}

function buildSelectionHint(question) {
  if (question.input_kind === "single_select") {
    return isOptional(question)
      ? "Choose one option by number or id, or press Enter to skip: "
      : "Choose one option by number or id: ";
  }

  if (question.input_kind === "multi_select") {
    return isOptional(question)
      ? "Choose one or more options by comma-separated numbers or ids, or press Enter to skip: "
      : "Choose one or more options by comma-separated numbers or ids: ";
  }

  return isOptional(question)
    ? "Enter your answer, or press Enter to skip: "
    : "Enter your answer: ";
}

function formatQuestionBlock(question, index, total) {
  const lines = [`[${index + 1}/${total}] ${question.prompt}`];

  if (question.reason) {
    lines.push(`Why this matters: ${question.reason}`);
  }

  if (Array.isArray(question.options) && question.options.length) {
    lines.push("Options:");
    for (const [optionIndex, option] of question.options.entries()) {
      lines.push(`  ${optionIndex + 1}. ${option.label} (${option.id})`);
      if (option.description) {
        lines.push(`     ${option.description}`);
      }
    }
  } else if (question.placeholder) {
    lines.push(`Hint: ${question.placeholder}`);
  }

  return `${lines.join("\n")}\n`;
}

function normalizeSelectionToken(question, rawToken) {
  const token = rawToken.trim();
  if (!token) {
    return null;
  }

  const numericValue = Number(token);
  if (Number.isInteger(numericValue) && `${numericValue}` === token) {
    const option = question.options?.[numericValue - 1];
    if (!option) {
      throw new Error(`"${token}" is not one of the listed options.`);
    }
    return option.id;
  }

  const optionIds = new Set((question.options ?? []).map((option) => option.id));
  if (!optionIds.has(token)) {
    throw new Error(`"${token}" is not one of the listed options.`);
  }

  return token;
}

export function normalizeInteractiveAnswer(question, rawAnswer) {
  const raw = rawAnswer.trim();

  if (!raw) {
    if (isOptional(question)) {
      return undefined;
    }

    throw new Error("This question requires an answer.");
  }

  if (question.input_kind === "text") {
    return raw;
  }

  if (question.input_kind === "single_select") {
    return normalizeSelectionToken(question, raw);
  }

  if (question.input_kind === "multi_select") {
    const tokens = raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (!tokens.length) {
      if (isOptional(question)) {
        return undefined;
      }

      throw new Error("Choose at least one option.");
    }

    const normalized = [];
    const seen = new Set();
    for (const token of tokens) {
      const optionId = normalizeSelectionToken(question, token);
      if (!seen.has(optionId)) {
        seen.add(optionId);
        normalized.push(optionId);
      }
    }

    if (
      typeof question.min_select === "number" &&
      normalized.length < question.min_select
    ) {
      throw new Error(`Choose at least ${question.min_select} options.`);
    }

    if (
      typeof question.max_select === "number" &&
      normalized.length > question.max_select
    ) {
      throw new Error(`Choose at most ${question.max_select} options.`);
    }

    return normalized;
  }

  throw new Error(`Unsupported input kind: ${question.input_kind}`);
}

export async function collectAnswers({
  pendingInput,
  ask,
  write
}) {
  const answers = {};
  const questions = pendingInput.questions ?? [];

  if (pendingInput.summary) {
    write(`${pendingInput.summary}\n\n`);
  }

  for (const [index, question] of questions.entries()) {
    write(formatQuestionBlock(question, index, questions.length));

    while (true) {
      const rawAnswer = await ask(buildSelectionHint(question));

      try {
        const normalized = normalizeInteractiveAnswer(question, rawAnswer);
        if (normalized !== undefined) {
          answers[question.id] = normalized;
        }
        write("\n");
        break;
      } catch (error) {
        write(`Invalid answer: ${error.message}\n`);
      }
    }
  }

  return answers;
}

export async function promptForAnswersInteractively({
  pendingInput,
  input,
  output
}) {
  if (!pendingInput?.questions?.length) {
    throw new Error("This run is not currently waiting for interactive input.");
  }

  if (!input.isTTY || !output.isTTY) {
    throw new Error(
      "Interactive answers require a TTY. Use --answers or --answers-file instead."
    );
  }

  return collectAnswers({
    pendingInput,
    ask: (prompt) => askViaTerminal(prompt),
    write: (text) => output.write(text)
  });
}

async function askViaTerminal(prompt) {
  const shell = process.env.SHELL || "/bin/sh";
  const stdoutChunks = [];

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      shell,
      [
        "-lc",
        'printf "%s" "$CCBRIDGE_PROMPT" > /dev/tty; IFS= read -r answer < /dev/tty; printf "%s" "$answer"'
      ],
      {
        env: {
          ...process.env,
          CCBRIDGE_PROMPT: prompt
        },
        stdio: ["ignore", "pipe", "inherit"]
      }
    );

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.on("error", reject);
    child.on("close", resolve);
  });

  if (exitCode !== 0) {
    throw new Error("Failed to read interactive input from the terminal.");
  }

  return Buffer.concat(stdoutChunks).toString("utf8");
}

export function renderWaitingForUserHint(summary) {
  if (summary?.status !== "waiting_for_user") {
    return "";
  }

  const questions = summary.questions ?? [];
  const lines = [
    "",
    `Run paused: ${summary.waitingRole} needs input during ${summary.waitingStage}.`,
    `Questions pending: ${questions.length}`,
    "Answer them interactively with:",
    `  ccbridge answer --run ${summary.runId}`,
    "Or from this repo without npm link:",
    `  npm start -- answer --run ${summary.runDir}`,
    "For automation you can still use --answers or --answers-file."
  ];

  return `${lines.join("\n")}\n`;
}
