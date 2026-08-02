import {
  createCardEditor,
  plainCardText,
} from "./cardLayout.js";

import React, { useEffect, useRef, useState } from "react";

import { ArrowLeft, ArrowUpRight, CircleHelp, Image as ImageIcon, MessageSquare } from "lucide-react";

import { apiFetch, READ_ONLY } from "../../shared/api.js";

import { ReadOnlyNotice } from "../../shared/ReadOnlyNotice.jsx";

import { SourceBadges } from "../../shared/SourceBadges.jsx";

import { HtmlCardCanvas, ModelHtmlCanvas } from "./DraftCanvases.jsx";

function DraftWorkspace({ slug }) {
  const [document, setDocument] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [selectedRevision, setSelectedRevision] = useState(null);
  const [selectedCard, setSelectedCard] = useState(1);
  const [instruction, setInstruction] = useState("");
  const [editor, setEditor] = useState(null);
  const editorCache = useRef(new Map());

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/drafts/${encodeURIComponent(slug)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "초안을 찾지 못했습니다.");
        }
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        setDocument(payload);
        setSelectedRevision(payload.revisions.at(-1)?.revision ?? null);
        setStatus("ready");
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

  useEffect(() => {
    if (!document || selectedRevision == null) return;
    const revision =
      document.revisions.find((item) => item.revision === selectedRevision) ||
      document.revisions.at(-1);
    const card =
      revision?.cards.find((item) => item.position === selectedCard) ||
      revision?.cards[0];
    if (card) {
      const key = `${revision.revision}:${card.position}`;
      setEditor(editorCache.current.get(key) || createCardEditor(card));
    }
  }, [document, selectedRevision, selectedCard]);

  async function revise() {
    if (!instruction.trim() || !document) return;
    setStatus("revising");
    setError("");
    try {
      const response = await apiFetch(
        `/api/drafts/${encodeURIComponent(slug)}/revise`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instruction: instruction.trim(),
            expected_revision: document.current_revision,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "수정본 생성에 실패했습니다.");
      setDocument(payload);
      setSelectedRevision(payload.current_revision);
      setInstruction("");
      setStatus("ready");
    } catch (requestError) {
      setError(requestError.message);
      setStatus("error");
    }
  }

  if (!document) {
    return (
      <main className="analysis-loading">
        {status === "loading" ? <span className="spinner dark" /> : <CircleHelp size={24} />}
        <strong>{status === "loading" ? "Draft를 불러오는 중" : "생성된 Draft가 없습니다."}</strong>
        {error && <p>{error}</p>}
        <a href="#/cards">카드 리스트로 돌아가기</a>
      </main>
    );
  }

  const visibleRevisions = document.revisions;

  if (!visibleRevisions.length) {
    return (
      <main className="analysis-loading">
        <ImageIcon size={26} />
        <strong>아직 만들어진 초안이 없습니다.</strong>
        <a href="#/cards">카드 리스트로 돌아가기</a>
      </main>
    );
  }

  const revision =
    visibleRevisions.find((item) => item.revision === selectedRevision) ||
    visibleRevisions.at(-1);
  const card =
    revision.cards.find((item) => item.position === selectedCard) ||
    revision.cards[0];
  const latestRun = document.model_runs.at(-1);
  const selectedRun =
    document.model_runs.find((run) => run.revision === revision.revision) ||
    latestRun;
  const isHistorical = revision.revision !== document.current_revision;

  return (
    <main className="draft-layout">
      <aside className="draft-card-rail">
        <a className="back-link" href={`#/summary/${encodeURIComponent(slug)}`}>
          <ArrowLeft size={16} /> 요약본
        </a>
        <div className="draft-source-title">
          <span>DRAFT FROM</span>
          <strong>{document.source.title}</strong>
        </div>
        <div className="draft-card-list">
          {revision.cards.map((item) => (
            <button
              className={selectedCard === item.position ? "selected" : ""}
              type="button"
              onClick={() => setSelectedCard(item.position)}
              key={item.position}
            >
              <span className={`mini-card ${item.role}`}>
                <em>{String(item.position).padStart(2, "0")}</em>
                <strong>{item.headline_ko}</strong>
              </span>
              <span>
                <em>{item.role}</em>
                <strong>{item.headline_ko}</strong>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="draft-stage">
        <header className="draft-stage-header">
          <div>
            <div className="eyebrow">
              <span>DRAFT WORKSPACE</span>
              <span className="eyebrow-rule" />
              <span>REV {revision.revision}</span>
            </div>
            <h1>{revision.draft_title_ko}</h1>
          </div>
          <div className="draft-status">
            <span className="draft-model-badge">
              {selectedRun?.provider || "Provider"} ·{" "}
              {selectedRun?.model || "model unavailable"}
            </span>
            <span>
              <span className="status-dot" />
              {isHistorical ? "과거 리비전" : "Current"}
            </span>
          </div>
        </header>

        <div className="draft-preview-wrap html-result-wrap">
          {revision.render_mode === "model-html" ? (
            <ModelHtmlCanvas
              card={card}
              cardCount={
                revision.display_card_count || revision.cards.length
              }
              css={revision.render_css}
            />
          ) : editor ? (
            <HtmlCardCanvas
              card={card}
              cardCount={revision.cards.length}
              editor={editor}
            />
          ) : null}
        </div>

        <div className="draft-evidence-row">
          <div>
            <span>SOURCE BLOCKS</span>
            <SourceBadges ids={card.source_block_ids} />
          </div>
          <div>
            <span>DESIGN RULES</span>
            <SourceBadges ids={card.design_rule_ids} />
          </div>
        </div>
      </section>

      <aside className="draft-tune-panel">
        <div className="evidence-heading">
          <div>
            <span>PROMPT CUSTOMIZATION</span>
            <h2>말로 수정하기</h2>
          </div>
          <MessageSquare size={19} />
        </div>

        <div className="prompt-customize-intro">
          <span>글씨 · 캐릭터 · 본문 이미지</span>
          <p>배경을 만들지 않고 디자이너가 이어받을 배정 정보만 정리합니다.</p>
        </div>

        <div className="draft-assignment-summary">
          <span>TYPOGRAPHY</span>
          <strong>{editor?.typography.title_zone} · {editor?.typography.title_align} · {editor?.typography.title_scale}</strong>
          <span>CHARACTER</span>
          <strong>{editor?.characterAssignment ? `${editor.characterAssignment.pose} · ${editor.characterAssignment.position} · ${editor.characterAssignment.scale}` : "배정 없음"}</strong>
        </div>

        {editor?.imageSrc ? (
          <a className="download-html-button" href={`/api/article-assets/${encodeURIComponent(slug)}?source=${encodeURIComponent(editor.imageSrc)}`} download>
            본문 이미지 다운로드 <ArrowUpRight size={15} />
          </a>
        ) : (
          <p className="draft-no-source-image">이 카드에 배정된 본문 이미지가 없습니다.</p>
        )}

        <div className="revision-selector">
          <span>REVISION HISTORY</span>
          <div>
            {visibleRevisions.map((item) => (
              (() => {
                const run = document.model_runs.find(
                  (candidate) => candidate.revision === item.revision,
                );
                const modelLabel = run?.model?.includes("fable")
                  ? "FABLE"
                  : run?.model?.includes("gpt-5.6-sol")
                    ? "SOL"
                    : "LEGACY";
                return (
              <button
                className={revision.revision === item.revision ? "active" : ""}
                type="button"
                onClick={() => setSelectedRevision(item.revision)}
                key={item.revision}
              >
                R{item.revision} · {modelLabel}
              </button>
                );
              })()
            ))}
          </div>
          <p>{revision.instruction}</p>
        </div>

        {/* 프롬프트 상자는 통째로 쓰기다 — 배포본에서는 입력칸만 회색으로
            만드는 대신 감춘다. 대신 위의 리비전 선택은 남겨 둔다: 어떤
            지시가 어떤 결과를 만들었는지 지난 개정을 넘겨 보는 것은 읽기다. */}
        {READ_ONLY ? (
          <ReadOnlyNotice what="초안 수정" />
        ) : (
          <div className="tune-box">
            <label htmlFor="draft-instruction">CUSTOM PROMPT</label>
            <textarea
              id="draft-instruction"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="예: 제목은 위쪽 왼쪽에 크게, 캐릭터는 3번 카드 오른쪽에만 배정해줘."
              rows={6}
              disabled={status === "revising" || isHistorical}
            />
            <div className="tune-suggestions">
              {[
                "제목은 위쪽 왼쪽에 크게",
                "캐릭터는 최대 두 장만",
                "본문 이미지를 우선 배정",
              ].map((text) => (
                <button
                  type="button"
                  onClick={() => setInstruction(text)}
                  disabled={isHistorical}
                  key={text}
                >
                  {text}
                </button>
              ))}
            </div>
            {error && <div className="translation-error">{error}</div>}
            <button
              className="revise-button"
              type="button"
              disabled={!instruction.trim() || status === "revising" || isHistorical}
              onClick={revise}
            >
              {status === "revising" ? (
                <><span className="spinner" /> 새 리비전 생성 중</>
              ) : (
                <>프롬프트 적용 <ArrowUpRight size={15} /></>
              )}
            </button>
          </div>
        )}

        <div className="evidence-section">
          <span className="section-label">SELECTED MODEL RUN</span>
          <dl className="evidence-list">
            <div><dt>Provider</dt><dd>{selectedRun?.provider}</dd></div>
            <div><dt>Model</dt><dd>{selectedRun?.model}</dd></div>
            <div><dt>Usage</dt><dd className="positive">{selectedRun?.usage_source}</dd></div>
          </dl>
        </div>
      </aside>
    </main>
  );
}

export { DraftWorkspace };
