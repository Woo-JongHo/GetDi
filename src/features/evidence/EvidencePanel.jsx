import React from "react";

import { ArrowUpRight, BookOpen, Check, Image as ImageIcon, Sparkles, X } from "lucide-react";

import { READ_ONLY } from "../../shared/api.js";

import { formatDate } from "../../shared/format.js";

function EvidencePanel({
  detail,
  item,
  summary,
  selected,
  onClear,
  translation,
  draftStatus,
  draftError,
  onGenerate,
}) {
  return (
    <aside className="evidence-panel">
      <div className="evidence-heading">
        <div>
          <span>기사 요약</span>
          <h2>요약</h2>
        </div>
        <BookOpen size={19} />
      </div>

      {selected ? (
        <div className="selected-evidence">
          <div className="selected-topline">
            <span>{selected.type === "image" ? <ImageIcon size={14} /> : <BookOpen size={14} />}</span>
            <strong>선택한 {selected.label}</strong>
            <button type="button" onClick={onClear} aria-label="선택 해제">
              <X size={15} />
            </button>
          </div>
          <blockquote>{selected.excerpt}</blockquote>
          {selected.caption && <p className="evidence-caption">{selected.caption}</p>}
          {selected.source && (
            <a href={selected.source} target="_blank" rel="noopener noreferrer">
              이미지 원본 <ArrowUpRight size={13} />
            </a>
          )}
          {selected.index && (
            <span className="block-index">원문 블록 #{selected.index}</span>
          )}
          <div className="grounded-status">
            {selected.stale ? (
              <><X size={13} /> 오래되었거나 지원되지 않는 근거</>
            ) : (
              <><Check size={13} /> 직접 원문 근거 · 원문 스냅샷</>
            )}
          </div>
        </div>
      ) : (
        <div className="reader-summary-card">
          <span>한 줄 요약</span>
          <p>{summary || item?.summary || "요약이 준비되지 않았습니다."}</p>
        </div>
      )}

      <div className="evidence-section">
        <span className="section-label">출처</span>
        <dl className="evidence-list">
          <div>
            <dt>발행처</dt>
            <dd>{detail?.source || "Nielsen Norman Group"}</dd>
          </div>
          <div>
            <dt>수집일</dt>
            <dd>{detail ? formatDate(detail.retrieved_at?.slice(0, 10)) : "대기 중"}</dd>
          </div>
          <div>
            <dt>본문 데이터</dt>
            <dd className={detail ? "positive" : "muted"}>
              {detail ? "준비됨" : "수집되지 않음"}
            </dd>
          </div>
          <div>
            <dt>번역</dt>
            <dd className={translation ? "positive" : "muted"}>
              {translation ? "생성됨" : "생성되지 않음"}
            </dd>
          </div>
        </dl>
      </div>

      {detail?.format === "article" && (
        <div className="reader-draft-action">
          {/* 배포본에서 이미 만들어 둔 초안은 열 수 있다 — 그것은 읽기다.
              없는 초안을 새로 만드는 것만 막는다. */}
          <button
            type="button"
            disabled={
              draftStatus === "checking" ||
              draftStatus === "generating" ||
              (READ_ONLY && draftStatus !== "ready")
            }
            onClick={onGenerate}
          >
            {draftStatus === "generating" ? (
              <><span className="spinner" /> 생성 중</>
            ) : draftStatus === "ready" ? (
              <>생성 결과 열기 <ArrowUpRight size={14} /></>
            ) : READ_ONLY ? (
              <>초안 없음 · 로컬에서만 생성</>
            ) : (
              <>이 글로 카드 생성 <Sparkles size={14} /></>
            )}
          </button>
          {draftError && <p>{draftError}</p>}
        </div>
      )}
      <div className="evidence-footer">
        <span>Evidence coverage</span>
        <strong>{detail ? "Source connected" : "Listing only"}</strong>
      </div>
    </aside>
  );
}

export { EvidencePanel };
