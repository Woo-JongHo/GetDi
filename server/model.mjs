import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { sendJson } from "./http.mjs";

export function createModelHandler({ rootDir }) {
  const modelLogDir = path.join(rootDir, "data/private/model-logs");

  async function writeModelLog(runId, patch) {
    await mkdir(modelLogDir, { recursive: true });
    const logPath = path.join(modelLogDir, `${runId}.json`);
    let current = {};
    try {
      current = JSON.parse(await readFile(logPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const next = { ...current, ...patch, id: runId };
    const temporaryPath = `${logPath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await rename(temporaryPath, logPath);
    return next;
  }

  async function readModelLogs() {
    try {
      const names = (await readdir(modelLogDir))
        .filter((name) => name.endsWith(".json"));
      const logs = (
        await Promise.all(
          names.map(async (name) => {
            try {
              return JSON.parse(
                await readFile(path.join(modelLogDir, name), "utf8"),
              );
            } catch {
              return null;
            }
          }),
        )
      )
        .filter(Boolean)
        .sort((a, b) =>
          (b.started_at || "").localeCompare(a.started_at || ""),
        );
      return { runs: logs.slice(0, 100) };
    } catch (error) {
      if (error.code === "ENOENT") return { runs: [] };
      throw error;
    }
  }

  async function runClaudeStructured({
    prompt,
    schema,
    timeoutMessage,
    runMeta = {},
  }) {
    const runId = randomUUID();
    const startedAt = Date.now();
    await writeModelLog(runId, {
      ...runMeta,
      status: "running",
      provider: "Claude Code",
      model: "claude-fable-5",
      reasoning_effort: null,
      started_at: new Date(startedAt).toISOString(),
      input: { prompt, schema },
    });
    return new Promise((resolve, reject) => {
      const child = spawn(
        "claude",
        [
          "-p",
          "--output-format",
          "json",
          "--json-schema",
          JSON.stringify(schema),
          "--model",
          "fable",
          "--max-budget-usd",
          "1.50",
          "--tools",
          "",
          "--safe-mode",
          "--exclude-dynamic-system-prompt-sections",
          "--no-session-persistence",
        ],
        {
          cwd: rootDir,
          env: process.env,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      let stdout = "";
      let stderr = "";
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        writeModelLog(runId, {
          status: "failed",
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
          error: timeoutMessage,
        }).finally(() => reject(new Error(timeoutMessage)));
      }, 180_000);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        writeModelLog(runId, {
          status: "failed",
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
          error: error.message,
        }).finally(() => reject(error));
      });
      child.on("close", async (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          const error = new Error(
            stderr || stdout || `Claude 종료 코드: ${code}`,
          );
          await writeModelLog(runId, {
            status: "failed",
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startedAt,
            error: error.message,
          });
          reject(error);
          return;
        }
        try {
          const envelope = JSON.parse(stdout.trim().split("\n").at(-1));
          if (envelope.is_error) {
            throw new Error(envelope.errors?.join(", ") || "Claude 실행 실패");
          }
          const output =
            envelope.structured_output || JSON.parse(envelope.result);
          await writeModelLog(runId, {
            status: "completed",
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startedAt,
            output,
            usage: {
              total_cost_usd: envelope.total_cost_usd ?? null,
              models: envelope.modelUsage || {},
            },
          });
          resolve({ output, envelope });
        } catch (error) {
          const wrapped = new Error(
            `구조화 응답을 해석할 수 없습니다: ${error.message}`,
          );
          await writeModelLog(runId, {
            status: "failed",
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startedAt,
            error: wrapped.message,
          });
          reject(wrapped);
        }
      });
      child.stdin.end(prompt);
    });
  }

  async function runCodexStructured({
    prompt,
    schema,
    timeoutMessage,
    model = "gpt-5.6-sol",
    effort = "max",
    runMeta = {},
  }) {
    const runId = randomUUID();
    const startedAt = Date.now();
    await writeModelLog(runId, {
      ...runMeta,
      status: "running",
      provider: "OpenAI Codex",
      model,
      reasoning_effort: effort,
      started_at: new Date(startedAt).toISOString(),
      input: { prompt, schema },
    });
    const temporaryDir = path.join(rootDir, "data/private/model-runs");
    const schemaPath = path.join(temporaryDir, `${runId}.schema.json`);
    const outputPath = path.join(temporaryDir, `${runId}.output.json`);
    await mkdir(temporaryDir, { recursive: true });
    await writeFile(schemaPath, JSON.stringify(schema), "utf8");

    return new Promise((resolve, reject) => {
      const child = spawn(
        "codex",
        [
          "exec",
          "--sandbox",
          "read-only",
          "--skip-git-repo-check",
          "--ephemeral",
          "--ignore-user-config",
          "-C",
          rootDir,
          "-m",
          model,
          "-c",
          `model_reasoning_effort="${effort}"`,
          "--output-schema",
          schemaPath,
          "--output-last-message",
          outputPath,
          "--json",
          "-",
        ],
        {
          cwd: rootDir,
          env: Object.fromEntries(
            Object.entries(process.env).filter(
              ([key]) =>
                ![
                  "CLAUDECODE",
                  "CLAUDE_SESSION_ID",
                  "CLAUDECODE_SESSION_ID",
                  "CLAUDE_CODE_ENTRYPOINT",
                  "RUST_LOG",
                  "RUST_BACKTRACE",
                  "RUST_LIB_BACKTRACE",
                ].includes(key),
            ),
          ),
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      let stdout = "";
      let stderr = "";
      const cleanup = () =>
        Promise.all([
          unlink(schemaPath).catch(() => {}),
          unlink(outputPath).catch(() => {}),
        ]);
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        cleanup().finally(() =>
          writeModelLog(runId, {
            status: "failed",
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startedAt,
            error: timeoutMessage,
          }).finally(() => reject(new Error(timeoutMessage))),
        );
      }, 600_000);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        cleanup().finally(() =>
          writeModelLog(runId, {
            status: "failed",
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startedAt,
            error: error.message,
          }).finally(() => reject(error)),
        );
      });
      child.on("close", async (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          await cleanup();
          const error = new Error(
            stderr || stdout || `Codex 종료 코드: ${code}`,
          );
          await writeModelLog(runId, {
            status: "failed",
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startedAt,
            error: error.message,
          });
          reject(error);
          return;
        }
        try {
          const output = JSON.parse(await readFile(outputPath, "utf8"));
          const events = stdout
            .split("\n")
            .filter(Boolean)
            .map((line) => {
              try {
                return JSON.parse(line);
              } catch {
                return null;
              }
            })
            .filter(Boolean);
          const usage =
            [...events]
              .reverse()
              .find((event) => event.type === "turn.completed")?.usage || {};
          await cleanup();
          await writeModelLog(runId, {
            status: "completed",
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startedAt,
            output,
            usage,
          });
          resolve({
            output,
            envelope: {
              provider: "OpenAI Codex",
              model,
              reasoning_effort: effort,
              duration_ms: Date.now() - startedAt,
              total_cost_usd: null,
              modelUsage: {
                [model]: {
                  inputTokens: usage.input_tokens ?? null,
                  outputTokens: usage.output_tokens ?? null,
                  cacheReadInputTokens: usage.cached_input_tokens ?? null,
                },
              },
            },
          });
        } catch (error) {
          await cleanup();
          const wrapped = new Error(
            `Codex 구조화 응답을 해석할 수 없습니다: ${error.message}`,
          );
          await writeModelLog(runId, {
            status: "failed",
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startedAt,
            error: wrapped.message,
          });
          reject(wrapped);
        }
      });
      child.stdin.end(prompt);
    });
  }

  function normalizeModelUsage(envelope) {
    return Object.entries(envelope.modelUsage || {}).map(([model, usage]) => ({
      model,
      input_tokens: usage.inputTokens ?? null,
      output_tokens: usage.outputTokens ?? null,
      cached_input_tokens: usage.cacheReadInputTokens ?? null,
      cache_creation_input_tokens: usage.cacheCreationInputTokens ?? null,
      cost_usd: usage.costUSD ?? null,
    }));
  }

  async function handleModel(request, response, url) {
    if (url.pathname === "/api/model-logs" && request.method === "GET") {
      try {
        sendJson(response, 200, await readModelLogs());
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
      return true;
    }

    return false;
  }

  return {
    handleModel,
    normalizeModelUsage,
    runClaudeStructured,
    runCodexStructured,
  };
}
