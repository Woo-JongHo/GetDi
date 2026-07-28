import React, { useEffect, useState } from "react";

import { ArrowLeft, ArrowUpRight, Check, CircleHelp, ShieldAlert, Sparkles } from "lucide-react";

import { uncachedInputTokens } from "../../shared/format.js";

import { SourceBadges } from "../reader/Reader.jsx";

function ArticleAnalysis({ slug }) {
  const [analysis, setAnalysis] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/analyses/${encodeURIComponent(slug)}`)
      .then(async (response) => {
        if (response.status === 404) return null;
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "분석을 불러오지 못했습니다.");
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        setAnalysis(payload);
        setStatus(payload ? "ready" : "empty");
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(requestError.message);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (status === "loading") {
    return (
      <main className="analysis-loading">
        <span className="spinner dark" />
        <strong>저장된 아티클 분석을 불러오는 중</strong>
      </main>
    );
  }

  if (!analysis) {
    return (
      <main className="analysis-loading">
        <CircleHelp size={24} />
        <strong>아직 이 아티클을 분석하지 않았습니다.</strong>
        {error && <p>{error}</p>}
        <a href={`#/article/article/${encodeURIComponent(slug)}`}>
          Reader로 돌아가기
        </a>
      </main>
    );
  }

  const usageTotals = (analysis.usage?.models || []).reduce(
    (totals, usage) => ({
      input: totals.input + uncachedInputTokens(usage),
      cacheCreation:
        totals.cacheCreation + (usage.cache_creation_input_tokens || 0),
      output: totals.output + (usage.output_tokens || 0),
    }),
    { input: 0, cacheCreation: 0, output: 0 },
  );

  return (
    <main className="article-analysis-layout">
      <aside className="article-analysis-source">
        <a
          className="back-link"
          href={`#/article/article/${encodeURIComponent(slug)}`}
        >
          <ArrowLeft size={16} /> Source Reader
        </a>
        <div className="analysis-account article-source">
          <div className="account-avatar">NN</div>
          <div>
            <span>SOURCE ARTICLE</span>
            <strong>Nielsen Norman Group</strong>
          </div>
        </div>
        <div className="source-mini-card">
          <span>ANALYZED ON DEMAND</span>
          <h2>{analysis.source.title}</h2>
          <a href={analysis.source.url} target="_blank" rel="noopener noreferrer">
            원문 열기 <ArrowUpRight size={13} />
          </a>
        </div>
        <div className="analysis-scope">
          <span className="scope-dot" />
          <div>
            <strong>Candidate analysis</strong>
            <p>검토 전 · 게시되지 않음</p>
          </div>
        </div>
      </aside>

      <section className="article-analysis-main">
        <div className="analysis-mode-switch">
          <a href="#/analysis/research">Reference library</a>
          <a className="active" href={`#/analysis/article/${encodeURIComponent(slug)}`}>
            Article analysis
          </a>
        </div>
        <div className="eyebrow">
          <span>ARTICLE ANALYSIS</span>
          <span className="eyebrow-rule" />
          <span>{new Date(analysis.created_at).toLocaleDateString("ko-KR")}</span>
        </div>
        <header className="article-analysis-header">
          <h1>원문에서 카드의<br />논리를 뽑았습니다.</h1>
          <p>{analysis.analysis_summary_ko}</p>
          <div className="analysis-audience">
            <span>TARGET READER</span>
            <strong>{analysis.target_reader_ko}</strong>
          </div>
        </header>

        <section className="core-message-card">
          <div className="section-number">00</div>
          <div>
            <span>CORE MESSAGE</span>
            <h2>{analysis.core_message.statement_ko}</h2>
            <p>{analysis.core_message.why_it_matters_ko}</p>
            <blockquote>“{analysis.core_message.evidence_excerpt}”</blockquote>
            <SourceBadges ids={analysis.core_message.source_block_ids} />
          </div>
        </section>

        <section className="insight-analysis-section">
          <div className="analysis-section-heading">
            <span>KEY INSIGHTS</span>
            <strong>{analysis.key_insights.length} grounded claims</strong>
          </div>
          <div className="insight-analysis-grid">
            {analysis.key_insights.map((insight, index) => (
              <article key={`${insight.title_ko}-${index}`}>
                <span className="insight-index">{String(index + 1).padStart(2, "0")}</span>
                <h3>{insight.title_ko}</h3>
                <p>{insight.claim_ko}</p>
                <div className="why-block">
                  <span>WHY IT MATTERS</span>
                  <p>{insight.why_it_matters_ko}</p>
                </div>
                <blockquote>“{insight.evidence_excerpt}”</blockquote>
                <SourceBadges ids={insight.source_block_ids} />
              </article>
            ))}
          </div>
        </section>

        <section className="card-plan-section">
          <div className="analysis-section-heading">
            <span>CAROUSEL LOGIC</span>
            <strong>{analysis.card_plan.length} card candidate</strong>
          </div>
          <div className="card-plan-track">
            {analysis.card_plan.map((card) => (
              <article key={card.position}>
                <div className="plan-card-top">
                  <span>{String(card.position).padStart(2, "0")}</span>
                  <em>{card.role}</em>
                </div>
                <h3>{card.headline_ko}</h3>
                <p>{card.purpose_ko}</p>
                <SourceBadges ids={card.source_block_ids} />
              </article>
            ))}
          </div>
        </section>

        {analysis.image_recommendations.length > 0 && (
          <section className="analysis-images">
            <div className="analysis-section-heading">
              <span>SOURCE IMAGES</span>
              <strong>{analysis.image_recommendations.length} original asset</strong>
            </div>
            {analysis.image_recommendations.map((image) => (
              <article key={image.src}>
                <img src={image.src} alt="" />
                <div>
                  <h3>{image.usage_ko}</h3>
                  <p>{image.reason_ko}</p>
                  <a href={image.src} target="_blank" rel="noopener noreferrer">
                    원본 이미지 <ArrowUpRight size={13} />
                  </a>
                </div>
              </article>
            ))}
          </section>
        )}
      </section>

      <aside className="article-analysis-evidence">
        <div className="evidence-heading">
          <div>
            <span>WHY & EVIDENCE</span>
            <h2>분석 실행 기록</h2>
          </div>
          <Sparkles size={19} />
        </div>
        <div className="analysis-run-status">
          <Check size={15} />
          <div>
            <strong>Analysis added</strong>
          </div>
        </div>
        <div className="evidence-section">
          <span className="section-label">MODEL RUN</span>
          <dl className="evidence-list">
            <div><dt>Model</dt><dd>{analysis.model}</dd></div>
            <div><dt>Input</dt><dd>{usageTotals.input.toLocaleString()}</dd></div>
            <div><dt>Cache creation</dt><dd>{usageTotals.cacheCreation.toLocaleString()}</dd></div>
            <div><dt>Output</dt><dd>{usageTotals.output.toLocaleString()}</dd></div>
            <div><dt>Source</dt><dd className="positive">{analysis.usage_source}</dd></div>
          </dl>
        </div>
        <div className="evidence-section">
          <span className="section-label">CAVEATS</span>
          <div className="caveat-list">
            {analysis.caveats_ko.map((caveat) => (
              <p key={caveat}><ShieldAlert size={13} /> {caveat}</p>
            ))}
          </div>
        </div>
      </aside>
    </main>
  );
}

export { ArticleAnalysis };
