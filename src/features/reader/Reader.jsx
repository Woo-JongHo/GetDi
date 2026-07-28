import React, { useEffect, useMemo, useRef, useState } from "react";

import { ArrowLeft, ArrowUpRight, Check, CircleHelp, FileText, Languages, Play, Video } from "lucide-react";

import { collection } from "../../shared/collection.js";

import { formatDate } from "../../shared/format.js";

import { EvidencePanel } from "../evidence/EvidencePanel.jsx";

function cleanArticleHtml(html) {
  if (!html || typeof window === "undefined") return "";
  const document = new DOMParser().parseFromString(html, "text/html");
  document
    .querySelectorAll("script, style, iframe, form, input, button")
    .forEach((node) => node.remove());

  document.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      if (attribute.name.toLowerCase().startsWith("on")) {
        node.removeAttribute(attribute.name);
      }
    });
  });

  document.querySelectorAll("a").forEach((anchor) => {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  });

  document.querySelectorAll("img").forEach((image) => {
    image.loading = "lazy";
    image.decoding = "async";
  });

  return document.body.innerHTML;
}

function getOutline(html) {
  if (!html || typeof window === "undefined") return [];
  const document = new DOMParser().parseFromString(html, "text/html");
  return [...document.querySelectorAll("h2, h3")].map((heading, index) => ({
    id: `article-heading-${index}`,
    level: heading.tagName.toLowerCase(),
    text: heading.textContent.trim(),
  }));
}

function SourceBadges({ ids = [] }) {
  return (
    <div className="source-badges">
      {ids.map((id) => <span key={id}>{id}</span>)}
    </div>
  );
}

function Reader({ slug, formatHint = null }) {
  const listingItem = collection.items.find(
    (item) =>
      item.slug === slug && (!formatHint || item.format === formatHint),
  );
  const [detail, setDetail] = useState(null);
  const [detailStatus, setDetailStatus] = useState("loading");
  const [language, setLanguage] = useState("ko");
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [translation, setTranslation] = useState(null);
  const [translationStatus, setTranslationStatus] = useState("checking");
  const [translationError, setTranslationError] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [draftStatus, setDraftStatus] = useState("checking");
  const [draftError, setDraftError] = useState("");
  const articleRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setDetailStatus("loading");
    const detailPath = formatHint
      ? `/api/details/${formatHint}/${encodeURIComponent(slug)}`
      : `/api/details/${encodeURIComponent(slug)}`;
    fetch(detailPath, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error("상세 본문을 불러오지 못했습니다.");
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
  }, [formatHint, slug]);

  const originalHtml = useMemo(
    () => cleanArticleHtml(detail?.content_html),
    [detail],
  );
  const translatedHtml = useMemo(
    () => cleanArticleHtml(translation?.content_html_ko),
    [translation],
  );
  const activeHtml =
    language === "ko" && translatedHtml ? translatedHtml : originalHtml;
  const outline = useMemo(() => getOutline(activeHtml), [activeHtml]);

  useEffect(() => {
    if (!detail) {
      setTranslationStatus("unavailable");
      return;
    }
    let cancelled = false;
    setTranslationStatus("checking");
    fetch(`/api/translations/${encodeURIComponent(slug)}`)
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error("번역 캐시를 불러오지 못했습니다.");
        return response.json();
      })
      .then((cached) => {
        if (cancelled) return;
        setTranslation(cached);
        setTranslationStatus(cached ? "ready" : "idle");
      })
      .catch((error) => {
        if (cancelled) return;
        setTranslationStatus("error");
        setTranslationError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [detail, slug]);

  useEffect(() => {
    if (!detail || detail.format !== "article") {
      setDraftStatus("unavailable");
      return;
    }
    let cancelled = false;
    setDraftStatus("checking");
    fetch(`/api/drafts/${encodeURIComponent(slug)}`)
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

  useEffect(() => {
    if (!detail || detail.format !== "article") {
      setAnalysis(null);
      return;
    }
    let cancelled = false;
    const refreshAnalysis = () => {
      fetch(`/api/analyses/${encodeURIComponent(slug)}`, {
        cache: "no-store",
      })
        .then(async (response) => {
          if (response.status === 404) return null;
          if (!response.ok) throw new Error("분석 캐시를 확인하지 못했습니다.");
          return response.json();
        })
        .then((cached) => {
          if (!cancelled) setAnalysis(cached);
        })
        .catch(() => {
          if (!cancelled) setAnalysis(null);
        });
    };
    refreshAnalysis();
    window.addEventListener("focus", refreshAnalysis);
    const interval = window.setInterval(refreshAnalysis, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshAnalysis);
    };
  }, [detail, slug]);

  useEffect(() => {
    if (!articleRef.current) return;
    articleRef.current
      .querySelectorAll("h2, h3")
      .forEach((heading, index) => {
        heading.id = `article-heading-${index}`;
      });
  }, [activeHtml, language]);

  if (!listingItem && !detail && detailStatus !== "loading") {
    return (
      <main className="not-found">
        <CircleHelp size={28} />
        <h1>자료를 찾을 수 없습니다.</h1>
        <a href="#/">Library로 돌아가기</a>
      </main>
    );
  }

  const originalTitle = detail?.title || listingItem.title;
  const originalSummary = detail?.summary || listingItem.summary;
  const title =
    language === "ko" && translation?.title_ko
      ? translation.title_ko
      : originalTitle;
  const summary =
    language === "ko" && analysis?.core_message?.statement_ko
      ? analysis.core_message.statement_ko
      : language === "ko" && translation?.summary_ko
        ? translation.summary_ko
      : originalSummary;
  const sourceUrl = detail?.source_url || listingItem.url;
  const format = detail?.format || listingItem.format;

  function selectBlock(event) {
    const node = event.target.closest(
      "p, li, h2, h3, blockquote, figure, img, figcaption",
    );
    if (!node || !articleRef.current?.contains(node)) return;

    if (node.tagName === "IMG") {
      const figure = node.closest("figure");
      setSelectedEvidence({
        type: "image",
        label: "본문 이미지",
        excerpt: node.alt || "대체 텍스트 없음",
        source: node.currentSrc || node.src,
        caption: figure?.querySelector("figcaption")?.textContent?.trim(),
      });
      return;
    }

    const siblings = [...articleRef.current.querySelectorAll(
      "p, li, h2, h3, blockquote, figure, figcaption",
    )];
    setSelectedEvidence({
      type: "block",
      label: node.tagName.toLowerCase(),
      excerpt: node.textContent.trim().slice(0, 360),
      index: siblings.indexOf(node) + 1,
    });
  }

  async function translate() {
    setTranslationStatus("translating");
    setTranslationError("");
    try {
      const response = await fetch(
        `/api/translations/${encodeURIComponent(slug)}`,
        { method: "POST" },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "번역에 실패했습니다.");
      }
      setTranslation(body);
      setTranslationStatus("ready");
    } catch (error) {
      setTranslationStatus("error");
      setTranslationError(error.message);
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
      const response = await fetch(`/api/drafts/${encodeURIComponent(slug)}`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Draft 생성에 실패했습니다.");
      }
      setDraftStatus("ready");
      window.location.hash = `#/draft/${encodeURIComponent(slug)}`;
    } catch (requestError) {
      setDraftStatus("error");
      setDraftError(requestError.message);
    }
  }

  return (
    <main className="reader-layout">
      <aside className="outline-rail">
        <a className="back-link" href="#/">
          <ArrowLeft size={16} /> Library
        </a>
        <div className="outline-title">ON THIS PAGE</div>
        {detail ? (
          <nav className="outline-nav">
            {outline.map((item) => (
              <a
                className={item.level === "h3" ? "nested" : ""}
                href={`#${item.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  document
                    .getElementById(item.id)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                key={item.id}
              >
                {item.text}
              </a>
            ))}
          </nav>
        ) : (
          <div className="outline-empty">수집 대기</div>
        )}
      </aside>

      <section className="reader-main">
        <div className="reader-breadcrumb">
          <span>{collection.topic.name}</span>
          <span>/</span>
          <span>{format === "article" ? "Article" : "Video"}</span>
        </div>

        <header className="article-header">
          <div className="article-status-row">
            <span className={`format-badge ${format}`}>
              {format === "article" ? <FileText size={13} /> : <Video size={13} />}
              {format.toUpperCase()}
            </span>
            <span className={`readiness ${detail ? "is-ready" : ""}`}>
              {detail ? <><Check size={12} /> 원문 스냅샷</> : "본문 수집 대기"}
            </span>
          </div>
          <h1>{title}</h1>
          <p className="article-summary">{summary}</p>
          <div className="article-meta">
            <span>{detail?.authors?.join(", ") || "NN/g"}</span>
            <span>{formatDate(detail?.published_date || listingItem.published_date)}</span>
            {(detail?.duration_minutes || listingItem.duration_minutes) && (
              <span>
                {detail?.duration_minutes || listingItem.duration_minutes}분
              </span>
            )}
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
              원문 열기 <ArrowUpRight size={14} />
            </a>
          </div>
        </header>

        <div className="language-bar">
          <div className="language-tabs" role="tablist">
            <button
              className={language === "ko" ? "active" : ""}
              type="button"
              onClick={() => setLanguage("ko")}
            >
              한국어
              {translationStatus === "ready" ? (
                <span className="tab-state ready">완료</span>
              ) : (
                <span className="tab-state">번역</span>
              )}
            </button>
            <button
              className={language === "original" ? "active" : ""}
              type="button"
              onClick={() => setLanguage("original")}
            >
              Original
            </button>
          </div>
        </div>

        {detail?.youtube_embed_url && <VideoStage detail={detail} />}

        {detail ? (
          language === "original" ? (
            originalHtml ? (
              <article
                className="source-article"
                ref={articleRef}
                onClick={selectBlock}
                dangerouslySetInnerHTML={{ __html: originalHtml }}
              />
            ) : (
              <TranscriptUnavailable translated={false} />
            )
          ) : translation ? (
            translatedHtml ? (
              <article
                className="source-article translated"
                ref={articleRef}
                onClick={selectBlock}
                dangerouslySetInnerHTML={{ __html: translatedHtml }}
              />
            ) : (
              <TranscriptUnavailable translated />
            )
          ) : (
            <TranslationEmpty
              status={translationStatus}
              error={translationError}
              onTranslate={translate}
            />
          )
        ) : (
          <DetailQueued item={listingItem} />
        )}
      </section>

      <EvidencePanel
        detail={detail}
        item={listingItem}
        summary={summary}
        selected={selectedEvidence}
        onClear={() => setSelectedEvidence(null)}
        translation={translation}
        draftStatus={draftStatus}
        draftError={draftError}
        onGenerate={generateDraft}
      />
    </main>
  );
}

function VideoStage({ detail }) {
  return (
    <div className="video-stage">
      <div className="video-frame">
        <iframe
          src={detail.youtube_embed_url}
          title={detail.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
      <div className="video-stage-meta">
        <span><Play size={13} /> YouTube embed</span>
        <span>{detail.duration_minutes}분</span>
      </div>
    </div>
  );
}

function TranscriptUnavailable({ translated }) {
  return (
    <div className="transcript-empty">
      <Video size={22} />
      <span className="empty-kicker">TRANSCRIPT STATUS</span>
      <h2>{translated ? "번역할 자막 원문이 없습니다." : "수집된 자막이 없습니다."}</h2>
    </div>
  );
}

function TranslationEmpty({ status, error, onTranslate }) {
  const translating = status === "translating" || status === "checking";
  return (
    <div className="translation-empty">
      <div className="translation-icon"><Languages size={24} /></div>
      <span className="empty-kicker">TRANSLATION SLOT</span>
      <h2>{translating ? "확인 중" : "한국어 번역"}</h2>
      {error && <div className="translation-error">{error}</div>}
      <button
        className="translate-button"
        type="button"
        disabled={translating}
        onClick={onTranslate}
      >
        {translating ? (
          <><span className="spinner" /> 번역 준비 중</>
        ) : (
          <><Languages size={16} /> 한국어 번역 시작</>
        )}
      </button>
    </div>
  );
}

function DetailQueued({ item }) {
  return (
    <div className="detail-queued">
      <span className="queue-number">{item.listing_page ?? "—"}</span>
      <div>
        <span className="empty-kicker">DETAIL NOT COLLECTED</span>
        <h2>본문 수집 대기</h2>
        <a href={item.url} target="_blank" rel="noopener noreferrer">
          NN/g에서 원문 보기 <ArrowUpRight size={15} />
        </a>
      </div>
    </div>
  );
}

export { DetailQueued, Reader, SourceBadges, TranscriptUnavailable, TranslationEmpty, VideoStage };
