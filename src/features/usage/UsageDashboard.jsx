import React, { useEffect, useState } from "react";

import { Activity, MessageSquare, RefreshCw, Sparkles } from "lucide-react";

import { uncachedInputTokens } from "../../shared/format.js";

const compactNumber = new Intl.NumberFormat("ko-KR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function UsageDashboard() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  async function loadUsage() {
    setStatus((current) => (data ? "refreshing" : "loading"));
    setError("");
    try {
      const response = await fetch("/api/session-usage");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "세션 사용량을 읽지 못했습니다.");
      }
      setData(payload);
      setStatus("ready");
    } catch (requestError) {
      setError(requestError.message);
      setStatus("error");
    }
  }

  useEffect(() => {
    loadUsage();
    const timer = window.setInterval(loadUsage, 15000);
    return () => window.clearInterval(timer);
  }, []);

  if (!data) {
    return (
      <main className="analysis-loading">
        {status === "loading" ? (
          <span className="spinner dark" />
        ) : (
          <Activity size={24} />
        )}
        <strong>현재 대화 사용량을 읽는 중</strong>
        {error && <p>{error}</p>}
      </main>
    );
  }

  const usageCards = [
    {
      label: "INPUT · CACHE EXCLUDED",
      value: uncachedInputTokens(data.usage),
      tone: "purple",
    },
    {
      label: "CACHED INPUT",
      value: data.usage.cached_input_tokens,
      tone: "green",
    },
    {
      label: "OUTPUT",
      value: data.usage.output_tokens,
      tone: "orange",
    },
    {
      label: "REASONING",
      value: data.usage.reasoning_output_tokens,
      tone: "ink",
    },
  ];

  return (
    <main className="usage-page">
      <header className="usage-header">
        <div>
          <div className="eyebrow">
            <span>LIVE SESSION</span>
            <span className="eyebrow-rule" />
            <span>{data.session.originator}</span>
          </div>
          <h1>Conversation<br />telemetry.</h1>
        </div>
        <button
          type="button"
          onClick={loadUsage}
          disabled={status === "refreshing"}
        >
          <RefreshCw
            className={status === "refreshing" ? "rotating" : ""}
            size={15}
          />
          새로고침
        </button>
      </header>

      <section className="usage-card-grid">
        {usageCards.map((card) => (
          <article className={card.tone} key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value.toLocaleString()}</strong>
            <div>
              <em>{compactNumber.format(card.value)}</em>
            </div>
          </article>
        ))}
      </section>

      <section className="usage-context-section">
        <div className="context-meter-card">
          <div className="usage-section-heading">
            <div>
              <span>CURRENT CONTEXT</span>
              <h2>{data.context_percent.toFixed(1)}% occupied</h2>
            </div>
            <strong>
              {data.context_used.toLocaleString()} /{" "}
              {data.context_window.toLocaleString()}
            </strong>
          </div>
          <div className="context-meter">
            <span style={{ width: `${data.context_percent}%` }} />
          </div>
        </div>

        <div className="session-card">
          <span>SESSION</span>
          <dl>
            <div><dt>ID</dt><dd>{data.session.id?.slice(0, 8)}</dd></div>
            <div><dt>Model</dt><dd>{data.session.model || "unavailable"}</dd></div>
            <div><dt>Provider</dt><dd>{data.session.model_provider}</dd></div>
            <div>
              <dt>Messages</dt>
              <dd>{data.message_counts.user + data.message_counts.assistant}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="usage-activity">
        <div className="usage-section-heading">
          <div>
            <span>CUMULATIVE TOKEN EVENTS</span>
            <h2>Token flow</h2>
          </div>
          <strong>{data.series.length} sampled events</strong>
        </div>
        <TokenChart series={data.series} />
        <div className="chart-legend">
          <span className="input">Total processed</span>
          <span className="output">Assistant output</span>
        </div>
      </section>

      <section className="conversation-section">
        <div className="usage-section-heading">
          <div>
            <span>RECENT CONVERSATION</span>
            <h2>우리 대화</h2>
          </div>
          <strong>
            User {data.message_counts.user} · Assistant{" "}
            {data.message_counts.assistant}
          </strong>
        </div>
        <div className="conversation-feed">
          {data.messages.map((message, index) => (
            <article
              className={message.role}
              key={`${message.timestamp}-${index}`}
            >
              <div className="message-meta">
                <span>
                  {message.role === "user" ? (
                    <MessageSquare size={13} />
                  ) : (
                    <Sparkles size={13} />
                  )}
                  {message.role}
                </span>
                <time>
                  {new Date(message.timestamp).toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <p>{message.text}</p>
              {message.role === "assistant" && (
                <div className="message-usage">
                  <span>{message.model || "model unavailable"}</span>
                  <span>
                    IN{" "}
                    {message.usage?.input_tokens != null
                      ? uncachedInputTokens(message.usage).toLocaleString()
                      : "unavailable"}
                  </span>
                  <span>
                    OUT{" "}
                    {message.usage?.output_tokens?.toLocaleString() ||
                      "unavailable"}
                  </span>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function TokenChart({ series }) {
  if (series.length < 2) {
    return <div className="chart-empty">토큰 이벤트가 더 필요합니다.</div>;
  }
  const width = 900;
  const height = 210;
  const padding = 8;
  const firstTotal = series[0].total_tokens;
  const maxTotal = Math.max(
    ...series.map((point) => point.total_tokens - firstTotal),
    1,
  );
  const firstOutput = series[0].output_tokens;
  const maxOutput = Math.max(
    ...series.map((point) => point.output_tokens - firstOutput),
    1,
  );
  const points = (key, base, max) =>
    series
      .map((point, index) => {
        const x =
          padding + (index / (series.length - 1)) * (width - padding * 2);
        const value = point[key] - base;
        const y =
          height - padding - (value / max) * (height - padding * 2);
        return `${x},${y}`;
      })
      .join(" ");

  return (
    <svg
      className="token-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="누적 토큰 변화 그래프"
    >
      {[0.25, 0.5, 0.75].map((ratio) => (
        <line
          x1="0"
          x2={width}
          y1={height * ratio}
          y2={height * ratio}
          key={ratio}
        />
      ))}
      <polyline
        className="total-line"
        points={points("total_tokens", firstTotal, maxTotal)}
      />
      <polyline
        className="output-line"
        points={points("output_tokens", firstOutput, maxOutput)}
      />
    </svg>
  );
}

export { TokenChart, UsageDashboard };
