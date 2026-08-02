import React, { useEffect, useState } from "react";

import { Activity, MessageSquare, RefreshCw, Sparkles } from "lucide-react";

import { apiFetch } from "../../shared/api.js";

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
      const response = await apiFetch("/api/session-usage");
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
      <section className="analysis-loading">
        {status === "loading" ? (
          <span className="spinner dark" />
        ) : (
          <Activity size={24} />
        )}
        <strong>현재 대화 사용량을 읽는 중</strong>
        {error && <p>{error}</p>}
      </section>
    );
  }

  const usageCards = [
    {
      label: "입력 · 캐시 제외",
      value: uncachedInputTokens(data.usage),
      tone: "purple",
    },
    {
      label: "캐시 입력",
      value: data.usage.cached_input_tokens,
      tone: "green",
    },
    {
      label: "출력",
      value: data.usage.output_tokens,
      tone: "orange",
    },
    {
      label: "추론",
      value: data.usage.reasoning_output_tokens,
      tone: "ink",
    },
  ];

  return (
    <section className="usage-page">
      <header className="usage-header">
        <div>
          <div className="eyebrow">
            <span>현재 세션</span>
            <span className="eyebrow-rule" />
            <span>{data.session.originator}</span>
          </div>
          <h1>대화<br />사용량.</h1>
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
              <span>현재 문맥</span>
              <h2>{data.context_percent.toFixed(1)}% 사용 중</h2>
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
          <span>세션</span>
          <dl>
            <div><dt>ID</dt><dd>{data.session.id?.slice(0, 8)}</dd></div>
            <div><dt>모델</dt><dd>{data.session.model || "정보 없음"}</dd></div>
            <div><dt>제공자</dt><dd>{data.session.model_provider}</dd></div>
            <div>
              <dt>메시지</dt>
              <dd>{data.message_counts.user + data.message_counts.assistant}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="usage-activity">
        <div className="usage-section-heading">
          <div>
            <span>누적 토큰 변화</span>
            <h2>토큰 흐름</h2>
          </div>
          <strong>{data.series.length}개 측정 시점</strong>
        </div>
        <TokenChart series={data.series} />
        <div className="chart-legend">
          <span className="input">전체 처리량</span>
          <span className="output">도우미 출력</span>
        </div>
      </section>

      <section className="conversation-section">
        <div className="usage-section-heading">
          <div>
            <span>최근 대화</span>
            <h2>우리 대화</h2>
          </div>
          <strong>
            사용자 {data.message_counts.user} · 도우미{" "}
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
                  {message.role === "user" ? "사용자" : "도우미"}
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
                  <span>{message.model || "모델 정보 없음"}</span>
                  <span>
                    입력{" "}
                    {message.usage?.input_tokens != null
                      ? uncachedInputTokens(message.usage).toLocaleString()
                      : "정보 없음"}
                  </span>
                  <span>
                    출력{" "}
                    {message.usage?.output_tokens?.toLocaleString() ||
                      "정보 없음"}
                  </span>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </section>
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
