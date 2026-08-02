import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CircleHelp,
  Languages,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";

import { apiFetch, READ_ONLY } from "../../shared/api.js";

import { formatDate } from "../../shared/format.js";

import { ReadOnlyNotice } from "../../shared/ReadOnlyNotice.jsx";

import { EvidencePanel } from "../evidence/EvidencePanel.jsx";

import { SourceBadges } from "../../shared/SourceBadges.jsx";
import { CARD_ROLE_LABELS, koreanLabel } from "../../shared/koreanLabels.js";

/**
 * 화면 3 — 요약본.
 *
 * 한 기사에 대해 "무슨 말인지"를 세 가지 깊이로 본다.
 *   요약  — 모델이 뽑은 핵심 메시지·주장·카드 구성 후보
 *   한국어 — 문단과 이미지 순서를 원문 그대로 둔 번역
 *   원문  — 손대지 않은 영어 본문
 *
 * 세 가지를 별도 화면으로 나누지 않은 이유는, 요약을 의심할 때
 * 곧바로 원문을 확인할 수 있어야 하기 때문이다. 화면을 옮기면
 * 그 확인이 일어나지 않는다.
 */
function SummaryView({ slug }) {
  const [detail, setDetail] = useState(null);
  const [detailStatus, setDetailStatus] = useState("loading");
  const [tab, setTab] = useState("summary");
  const [translation, setTranslation] = useState(null);
  const [translationStatus, setTranslationStatus] = useState("idle");
  const [translationError, setTranslationError] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [analysisStatus, setAnalysisStatus] = useState("checking");
  const [analysisError, setAnalysisError] = useState("");
  const [draftStatus, setDraftStatus] = useState("checking");
  const [draftError, setDraftError] = useState("");
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const articleRef = useRef(null);

  // 덮는 패널은 Esc로 닫히는 것이 관례다. 없으면 키보드만 쓰는 사람은
  // 열고 나서 닫을 방법을 찾아야 한다.
  useEffect(() => {
    if (!panelOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setPanelOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panelOpen]);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setDetailStatus("loading");
    apiFetch(`/api/details/article/${encodeURIComponent(slug)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error("본문을 불러오지 못했습니다.");
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        setDetail(payload);
        setDetailStatus(payload ? "ready" : "queued");
      })
      .catch(() => {
        if (!cancelled) setDetailStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!detail) return undefined;
    setTranslation(null);
    if (detail.source_snapshot_available === false) {
      setTranslationStatus("local-only");
      return undefined;
    }
    let cancelled = false;
    apiFetch(`/api/translations/${encodeURIComponent(slug)}`)
      .then(async (response) => (response.status === 404 ? null : response.json()))
      .then((cached) => {
        if (cancelled) return;
        setTranslation(cached);
        setTranslationStatus(cached ? "ready" : "idle");
      })
      .catch(() => {
        if (!cancelled) setTranslationStatus("idle");
      });
    return () => {
      cancelled = true;
    };
  }, [detail, slug]);

  useEffect(() => {
    if (!detail) return undefined;
    let cancelled = false;
    apiFetch(`/api/analyses/${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then(async (response) => (response.status === 404 ? null : response.json()))
      .then((cached) => {
        if (cancelled) return;
        setAnalysis(cached);
        setAnalysisStatus(cached ? "ready" : "idle");
      })
      .catch(() => {
        if (!cancelled) setAnalysisStatus("idle");
      });
    return () => {
      cancelled = true;
    };
  }, [detail, slug]);

  useEffect(() => {
    if (!detail) return undefined;
    let cancelled = false;
    apiFetch(`/api/drafts/${encodeURIComponent(slug)}`)
      .then((response) => {
        if (!cancelled) setDraftStatus(response.ok ? "ready" : "idle");
      })
      .catch(() => {
        if (!cancelled) setDraftStatus("idle");
      });
    return () => {
      cancelled = true;
    };
  }, [detail, slug]);

  const originalHtml = useMemo(() => {
    if (detail?.schema_version === 2 && detail.blocks) {
      return detail.blocks
        .map(
          (block) =>
            `<div data-source-block="${block.block_id}" data-source-revision="${detail.revision_id}">` +
            `${cleanArticleHtml(block.html)}</div>`,
        )
        .join("");
    }
    return cleanArticleHtml(detail?.content_html);
  }, [detail]);
  const translatedHtml = useMemo(
    () => cleanArticleHtml(translation?.content_html_ko),
    [translation],
  );

  async function translate() {
    setTranslationStatus("translating");
    setTranslationError("");
    try {
      const response = await apiFetch(
        `/api/translations/${encodeURIComponent(slug)}`,
        { method: "POST" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "번역에 실패했습니다.");
      setTranslation(body);
      setTranslationStatus("ready");
    } catch (error) {
      setTranslationStatus("error");
      setTranslationError(error.message);
    }
  }

  async function analyze() {
    setAnalysisStatus("running");
    setAnalysisError("");
    try {
      const response = await apiFetch(`/api/analyses/${encodeURIComponent(slug)}`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "분석에 실패했습니다.");
      setAnalysis(body);
      setAnalysisStatus("ready");
    } catch (error) {
      setAnalysisStatus("error");
      setAnalysisError(error.message);
    }
  }

  async function generateDraft() {
    if (draftStatus === "ready") {
      window.location.hash = `#/draft/${encodeURIComponent(slug)}`;
      return;
    }
    setDraftStatus("generating");
    setDraftError("");
    try {
      const response = await apiFetch(`/api/drafts/${encodeURIComponent(slug)}`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "초안 생성에 실패했습니다.");
      setDraftStatus("ready");
      window.location.hash = `#/draft/${encodeURIComponent(slug)}`;
    } catch (error) {
      setDraftStatus("error");
      setDraftError(error.message);
    }
  }

  function selectBlock(event) {
    const node = event.target.closest(
      "p, li, h2, h3, blockquote, figure, img, figcaption",
    );
    if (!node || !articleRef.current?.contains(node)) return;

    const sourceBlock = node.closest("[data-source-block]");
    const blockId = sourceBlock?.dataset.sourceBlock ?? null;
    if (node.tagName === "IMG") {
      setSelectedEvidence({
        type: "image",
        label: "본문 이미지",
        excerpt: node.alt || "대체 텍스트 없음",
        source: node.currentSrc || node.src,
        caption: node
          .closest("figure")
          ?.querySelector("figcaption")
          ?.textContent?.trim(),
        block_id: blockId,
        revision_id: detail.revision_id ?? null,
      });
      setPanelOpen(true);
      return;
    }

    const siblings = [
      ...articleRef.current.querySelectorAll(
        "p, li, h2, h3, blockquote, figure, figcaption",
      ),
    ];
    setSelectedEvidence({
      type: "block",
      label: node.tagName.toLowerCase(),
      excerpt: node.textContent.trim().slice(0, 360),
      index: blockId ? undefined : siblings.indexOf(node) + 1,
      block_id: blockId,
      revision_id: detail.revision_id ?? null,
    });
    setPanelOpen(true);
  }

  if (detailStatus === "loading") {
    return (
      <main className="analysis-loading">
        <span className="spinner dark" />
        <strong>본문을 불러오는 중</strong>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="not-found">
        <CircleHelp size={28} />
        <h1>이 기사는 아직 본문을 받지 않았습니다.</h1>
        <p>크롤링 화면에서 수집을 마치면 여기에서 읽을 수 있습니다.</p>
        <a href="#/cards">카드 리스트로 돌아가기</a>
      </main>
    );
  }

  return (
    <main className="summary-layout">
      <section className="reader-main">
        <a className="back-link" href="#/cards">
          <ArrowLeft size={16} /> 카드 리스트
        </a>

        <div className="eyebrow">
          <span>03단계</span>
          <span className="eyebrow-rule" />
          <span>{formatDate(detail.published_date)}</span>
        </div>

        <header className="article-header">
          <h1>
            {tab === "ko" && translation?.title_ko
              ? translation.title_ko
              : detail.title}
          </h1>
          <p className="article-summary">
            {analysis?.core_message?.statement_ko ||
              translation?.summary_ko ||
              detail.summary}
          </p>
          <div className="article-meta">
            <span>{detail.authors?.join(", ") || "NN/g"}</span>
            {detail.duration_minutes && <span>{detail.duration_minutes}분</span>}
            <a href={detail.source_url} target="_blank" rel="noopener noreferrer">
              원문 열기 <ArrowUpRight size={14} />
            </a>
          </div>
        </header>

        {/* 보기 방식은 본문 위에 둔다. 옆 레일에 두면 좁은 화면에서
            레일이 접히면서 화면을 바꿀 방법이 사라진다. */}
        <div className="summary-toolbar">
          <nav className="summary-tabs" aria-label="보기 방식">
            {[
              { id: "summary", label: "요약" },
              { id: "ko", label: "한국어 전문" },
              { id: "original", label: "원문" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                className={tab === item.id ? "active" : ""}
                disabled={
                  detail.source_snapshot_available === false &&
                  (item.id === "ko" || item.id === "original")
                }
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="summary-toolbar-actions">
            <button
              type="button"
              className={`evidence-toggle ${panelOpen ? "active" : ""}`}
              aria-expanded={panelOpen}
              onClick={() => setPanelOpen((current) => !current)}
            >
              <BookOpen size={15} />
              근거·출처
            </button>
            {detail.format === "article" && (
              <button
                type="button"
                className="summary-draft-cta"
                disabled={
                  draftStatus === "checking" ||
                  draftStatus === "generating" ||
                  (READ_ONLY && draftStatus !== "ready")
                }
                onClick={generateDraft}
              >
                {draftStatus === "generating" ? (
                  <><span className="spinner" /> 초안 생성 중</>
                ) : draftStatus === "ready" ? (
                  <>04 인스타 초안 열기 <ArrowUpRight size={15} /></>
                ) : READ_ONLY ? (
                  <>04 초안 없음 · 로컬 전용</>
                ) : (
                  <>04 인스타 초안 만들기 <Sparkles size={15} /></>
                )}
              </button>
            )}
          </div>
        </div>

        {draftError && <p className="summary-draft-error">{draftError}</p>}

        {detail.source_snapshot_available === false && <LocalOnlySource />}

        {tab === "summary" && (
          <AnalysisSection
            analysis={analysis}
            error={analysisError}
            onAnalyze={analyze}
            status={analysisStatus}
          />
        )}

        {tab === "ko" &&
          (translatedHtml ? (
            <article
              className="source-article translated"
              ref={articleRef}
              onClick={selectBlock}
              dangerouslySetInnerHTML={{ __html: translatedHtml }}
            />
          ) : (
            <TranslationEmpty
              error={translationError}
              onTranslate={translate}
              status={translationStatus}
            />
          ))}

        {tab === "original" && (
          detail.source_snapshot_available === false ? (
            <LocalOnlySource />
          ) : (
            <article
              className="source-article"
              ref={articleRef}
              onClick={selectBlock}
              dangerouslySetInnerHTML={{ __html: originalHtml }}
            />
          )
        )}
      </section>

      {/* 근거는 본문 옆자리를 상시로 차지하지 않는다. 확인할 때만 연다.
          본문 위로 덮되, 열려 있는 동안 바깥을 눌러 닫을 수 있게 한다. */}
      {panelOpen && (
        <button
          type="button"
          className="evidence-scrim"
          aria-label="근거 패널 닫기"
          onClick={() => setPanelOpen(false)}
        />
      )}
      {/* 닫힌 드로어는 화면 밖으로 밀려 있을 뿐 여전히 문서에 있다.
          inert를 걸지 않으면 보이지도 않는 버튼에 탭이 들어간다. */}
      <aside
        className={`evidence-drawer ${panelOpen ? "open" : ""}`}
        inert={panelOpen ? undefined : ""}
        aria-hidden={panelOpen ? undefined : "true"}
      >
        <div className="evidence-drawer-head">
          <strong>근거·출처</strong>
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            aria-label="닫기"
          >
            <X size={17} />
          </button>
        </div>
        <EvidencePanel
          detail={detail}
          draftError={draftError}
          draftStatus={draftStatus}
          item={detail}
          onClear={() => setSelectedEvidence(null)}
          onGenerate={generateDraft}
          selected={selectedEvidence}
          summary={
            analysis?.core_message?.statement_ko ||
            translation?.summary_ko ||
            detail.summary
          }
          translation={translation}
        />
      </aside>
    </main>
  );
}

function LocalOnlySource() {
  return (
    <div className="translation-empty">
      <div className="translation-icon"><ShieldAlert size={24} /></div>
      <span className="empty-kicker">로컬 전용</span>
      <h2>원문 스냅샷은 로컬 전용입니다</h2>
      <p>공개 배포본에는 원문 전문·전체 번역·원본 이미지가 포함되지 않습니다.</p>
    </div>
  );
}

/** 분석 결과. 아직 없으면 비용이 드는 작업이라는 사실을 밝히고 버튼만 둔다. */
function AnalysisSection({ analysis, error, onAnalyze, status }) {
  if (!analysis) {
    const running = status === "running";
    return (
      <div className="translation-empty">
        <div className="translation-icon">
          <Sparkles size={24} />
        </div>
        <span className="empty-kicker">기사 분석</span>
        <h2>{running ? "분석하는 중" : "아직 분석하지 않았습니다"}</h2>
        <p>
          {READ_ONLY
            ? "분석은 모델을 부르는 작업이라 로컬에서만 돌아갑니다."
            : "모델을 호출하는 작업이라 자동으로 돌리지 않는다. 눌러야 시작한다."}
        </p>
        {error && <div className="translation-error">{error}</div>}
        <button
          className="translate-button"
          type="button"
          disabled={READ_ONLY || running}
          onClick={onAnalyze}
        >
          {running ? (
            <>
              <span className="spinner" /> 분석 중
            </>
          ) : (
            <>
              <Sparkles size={16} /> 이 기사 분석하기
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="summary-analysis">
      <section className="core-message-card">
        <div className="section-number">00</div>
        <div>
          <span>핵심 메시지</span>
          <h2>{analysis.core_message.statement_ko}</h2>
          {analysis.core_message.reasoning_ko && (
            <p className="summary-reasoning">
              {analysis.core_message.reasoning_ko}
            </p>
          )}
          <p>{analysis.core_message.why_it_matters_ko}</p>
          <blockquote>“{analysis.core_message.evidence_excerpt}”</blockquote>
          <SourceBadges ids={analysis.core_message.source_block_ids} />
        </div>
      </section>

      <section className="insight-analysis-section">
        <div className="analysis-section-heading">
          <span>핵심 주장</span>
          <strong>{analysis.key_insights.length}개</strong>
        </div>
        {/* 카드 하나가 네 칸이다 — 주장 / 증거 / 연결 / 가치.
            계약: skills/article-refinement/references/summary-method.md */}
        <div className="insight-analysis-grid">
          {analysis.key_insights.map((insight, index) => (
            <article key={`${insight.title_ko}-${index}`}>
              <span className="insight-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{insight.title_ko}</h3>
              <p>{insight.claim_ko}</p>

              {/* 근거는 갈래별로. 갈래마다 인용과 원문 위치를 함께 둔다. */}
              {(insight.grounds_ko?.length
                ? insight.grounds_ko
                : insight.evidence_excerpt
                  ? [
                      {
                        point_ko: null,
                        evidence_excerpt: insight.evidence_excerpt,
                        source_block_ids: insight.source_block_ids,
                      },
                    ]
                  : []
              ).map((ground, order) => (
                <div className="ground" key={`${insight.title_ko}-g${order}`}>
                  <span className="ground-index">
                    근거 {String(order + 1).padStart(2, "0")}
                  </span>
                  {ground.point_ko && <p>{ground.point_ko}</p>}
                  <blockquote>“{ground.evidence_excerpt}”</blockquote>
                  <SourceBadges ids={ground.source_block_ids} />
                </div>
              ))}

              {insight.grounds_shortfall_ko && (
                <p className="ground-shortfall">
                  원문이 주지 않은 것 — {insight.grounds_shortfall_ko}
                </p>
              )}

              {insight.reasoning_ko && (
                <div className="why-block reasoning">
                  <span>이 근거들이 왜 그 주장이 되는가</span>
                  <p>{insight.reasoning_ko}</p>
                </div>
              )}

              <div className="why-block">
                <span>왜 중요한가</span>
                <p>{insight.why_it_matters_ko}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card-plan-section">
        <div className="analysis-section-heading">
          <span>카드 구성 후보</span>
          <strong>{analysis.card_plan.length}장</strong>
        </div>
        <div className="card-plan-track">
          {analysis.card_plan.map((card) => (
            <article key={card.position}>
              <div className="plan-card-top">
                <span>{String(card.position).padStart(2, "0")}</span>
                <em>{koreanLabel(card.role, CARD_ROLE_LABELS)}</em>
              </div>
              <h3>{card.headline_ko}</h3>
              <p>{card.purpose_ko}</p>
            </article>
          ))}
        </div>
      </section>

      {analysis.caveats_ko?.length > 0 && (
        <section className="summary-caveats">
          <div className="analysis-section-heading">
            <span>주의할 점</span>
          </div>
          {analysis.caveats_ko.map((caveat) => (
            <p key={caveat}>
              <ShieldAlert size={13} /> {caveat}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}

function TranslationEmpty({ error, onTranslate, status }) {
  const translating = status === "translating";
  return (
    <div className="translation-empty">
      <div className="translation-icon">
        <Languages size={24} />
      </div>
      <span className="empty-kicker">한국어 번역</span>
      <h2>{translating ? "번역하는 중" : "한국어 번역"}</h2>
      <p>
        {READ_ONLY
          ? "이 기사는 아직 번역하지 않았습니다. 번역은 모델을 부르는 작업이라 로컬에서만 돌아갑니다."
          : "처음 한 번만 시간이 걸린다. 번역한 글은 저장되어 다음엔 바로 뜬다."}
      </p>
      {error && <div className="translation-error">{error}</div>}
      <button
        className="translate-button"
        type="button"
        disabled={READ_ONLY || translating}
        onClick={onTranslate}
      >
        {translating ? (
          <>
            <span className="spinner" /> 번역 중
          </>
        ) : (
          <>
            <Languages size={16} /> 한국어 번역 시작
          </>
        )}
      </button>
      <ReadOnlyNotice what="번역" />
    </div>
  );
}

/** 저장된 본문을 화면에 넣기 전 마지막으로 한 번 더 거른다. */
function cleanArticleHtml(html) {
  if (!html || typeof window === "undefined") return "";
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed
    .querySelectorAll("script, style, iframe, form, input, button")
    .forEach((node) => node.remove());

  parsed.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      if (attribute.name.toLowerCase().startsWith("on")) {
        node.removeAttribute(attribute.name);
      }
    });
  });

  parsed.querySelectorAll("a").forEach((anchor) => {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  });

  parsed.querySelectorAll("img").forEach((image) => {
    image.loading = "lazy";
    image.decoding = "async";
  });

  return parsed.body.innerHTML;
}

export { SummaryView };
