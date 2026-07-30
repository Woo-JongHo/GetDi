import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { sendJson } from "./http.mjs";

export function createUsageHandler({ rootDir }) {
  let sessionUsageCache = null;

  async function findCurrentCodexSession() {
    const sessionsRoot = path.join(homedir(), ".codex", "sessions");
    const entries = await readdir(sessionsRoot, { recursive: true });
    const candidates = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".jsonl"))
        .map(async (entry) => {
          const filePath = path.join(sessionsRoot, entry);
          const fileStat = await stat(filePath);
          return { filePath, mtimeMs: fileStat.mtimeMs };
        }),
    );
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);

    for (const candidate of candidates.slice(0, 30)) {
      const firstLine = (await readFile(candidate.filePath, "utf8")).split("\n", 1)[0];
      try {
        const metadata = JSON.parse(firstLine);
        if (
          metadata.type === "session_meta" &&
          metadata.payload?.cwd === rootDir
        ) {
          return candidate.filePath;
        }
      } catch {
        // Ignore incomplete or non-session JSONL candidates.
      }
    }
    throw new Error("현재 GetDi Codex 세션을 찾지 못했습니다.");
  }

  async function readCurrentSessionUsage() {
    const now = Date.now();
    if (sessionUsageCache && now - sessionUsageCache.createdAt < 3000) {
      return sessionUsageCache.value;
    }

    const sessionPath = await findCurrentCodexSession();
    const lines = (await readFile(sessionPath, "utf8")).split("\n");
    let metadata = null;
    let currentModel = null;
    const messages = [];
    const tokenEvents = [];

    for (const line of lines) {
      if (!line) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.type === "session_meta") metadata = event;
      if (event.type === "turn_context" && event.payload?.model) {
        currentModel = event.payload.model;
      }
      if (
        event.type === "event_msg" &&
        event.payload?.type === "token_count" &&
        event.payload?.info
      ) {
        tokenEvents.push({
          timestamp: event.timestamp,
          total: event.payload.info.total_token_usage,
          last: event.payload.info.last_token_usage,
          context_window: event.payload.info.model_context_window,
          model: currentModel,
        });
      }
      if (
        event.type === "response_item" &&
        event.payload?.type === "message" &&
        ["user", "assistant"].includes(event.payload.role)
      ) {
        const text = (event.payload.content || [])
          .map((part) => part.text || "")
          .join("")
          .trim();
        if (text && !text.startsWith("<environment_context>")) {
          messages.push({
            timestamp: event.timestamp,
            role: event.payload.role,
            text: text.slice(0, 1800),
            truncated: text.length > 1800,
            characters: text.length,
            model: event.payload.role === "assistant" ? currentModel : null,
          });
        }
      }
    }

    const latest = tokenEvents.at(-1);
    if (!latest) throw new Error("현재 세션에 토큰 이벤트가 없습니다.");
    const sampledEvents = tokenEvents
      .filter((event, index) => {
        if (index === tokenEvents.length - 1) return true;
        const next = tokenEvents[index + 1];
        return event.total?.total_tokens !== next?.total?.total_tokens;
      })
      .slice(-80);
    const currentTokens = latest.last?.total_tokens || 0;
    const contextWindow = latest.context_window || 0;
    const visibleMessages = messages.slice(-30);
    const messagesWithUsage = visibleMessages.map((message, index) => {
      if (message.role !== "assistant") return message;
      const nextAssistant = visibleMessages
        .slice(index + 1)
        .find((candidate) => candidate.role === "assistant");
      const usageEvent = tokenEvents.find(
        (event) =>
          event.timestamp >= message.timestamp &&
          (!nextAssistant || event.timestamp < nextAssistant.timestamp),
      );
      return {
        ...message,
        model: message.model || usageEvent?.model || currentModel,
        usage: usageEvent?.last || null,
        usage_source: usageEvent?.last ? "actual" : "unavailable",
      };
    });
    const value = {
      session: {
        id: metadata?.payload?.id,
        started_at: metadata?.timestamp,
        updated_at: latest.timestamp,
        originator: metadata?.payload?.originator,
        cli_version: metadata?.payload?.cli_version,
        model_provider: metadata?.payload?.model_provider,
        model: currentModel || latest.model,
        transcript: path.basename(sessionPath),
        adapter_status: "experimental",
      },
      usage: latest.total,
      last_turn: latest.last,
      context_window: contextWindow,
      context_used: currentTokens,
      context_percent: contextWindow
        ? Math.min(100, (currentTokens / contextWindow) * 100)
        : 0,
      cache_ratio: latest.total?.input_tokens
        ? (latest.total.cached_input_tokens / latest.total.input_tokens) * 100
        : 0,
      message_counts: {
        user: messages.filter((message) => message.role === "user").length,
        assistant: messages.filter((message) => message.role === "assistant").length,
      },
      messages: messagesWithUsage,
      series: sampledEvents.map((event) => ({
        timestamp: event.timestamp,
        input_tokens: event.total?.input_tokens || 0,
        cached_input_tokens: event.total?.cached_input_tokens || 0,
        output_tokens: event.total?.output_tokens || 0,
        reasoning_output_tokens: event.total?.reasoning_output_tokens || 0,
        total_tokens: event.total?.total_tokens || 0,
      })),
    };
    sessionUsageCache = { createdAt: now, value };
    return value;
  }

  /**
   * 모델 로그 목록에서 어느 시점 이후를 보여줄지 정하는 기준.
   *
   * 화면(`ModelLogs.jsx`)이 이 값으로 옛 실행을 걸러 내는데, 파일은 있고
   * 핸들러는 없어서 SPA fallback HTML이 돌아갔다 — 화면은 그 HTML을 JSON으로
   * 파싱하려다 실패해 늘 오류 상태였다. 파일을 그대로 내보내 그것을 없앤다.
   */
  async function readGenerationState() {
    try {
      return JSON.parse(
        await readFile(
          path.join(rootDir, "data/private/generation-state.json"),
          "utf8",
        ),
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      // 기준이 없으면 전부 보인다 — 없는 것을 "아무것도 안 보임"으로
      // 해석하면 로그가 통째로 사라진다.
      return {
        phase: "unknown",
        visible_after: "1970-01-01T00:00:00Z",
        label: "전체",
      };
    }
  }

  return async function handleUsage(request, response, url) {
    if (url.pathname === "/api/session-usage" && request.method === "GET") {
      try {
        sendJson(response, 200, await readCurrentSessionUsage());
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
      return true;
    }

    if (url.pathname === "/api/generation-state" && request.method === "GET") {
      try {
        sendJson(response, 200, await readGenerationState());
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
      return true;
    }

    return false;
  };
}
