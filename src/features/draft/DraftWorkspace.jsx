import React, { useEffect, useRef, useState } from "react";

import { ArrowLeft, ArrowUpRight, CircleHelp, Image as ImageIcon, MessageSquare } from "lucide-react";

import { SourceBadges } from "../reader/Reader.jsx";

function plainCardText(value = "") {
  return value.replace(/\*\*/g, "").trim();
}

function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createCardEditor(card) {
  const cover = card.role === "cover";
  const visualizationMethod = card.visualization_method || "statement";
  const palettes = {
    statement: { background: "#f1eee7", accent: "#7566c4" },
    comparison: { background: "#edf0ed", accent: "#387b65" },
    steps: { background: "#f3eee8", accent: "#c06945" },
    cycle: { background: "#eceaf4", accent: "#6757bd" },
    checklist: { background: "#edf1ec", accent: "#477b5d" },
    warning: { background: "#f3e8e4", accent: "#b64f40" },
    example: { background: "#e9eef2", accent: "#466f8f" },
    quote: { background: "#f1ece5", accent: "#9a6945" },
    number: { background: "#ece9f1", accent: "#6552b6" },
  };
  const palette = palettes[visualizationMethod] || palettes.statement;
  return {
    width: 1080,
    height: 1350,
    background: cover ? "#18191b" : palette.background,
    textColor: cover ? "#ffffff" : "#1d1e20",
    accentColor: palette.accent,
    backgroundMode:
      cover && card.source_image_src ? "image-gradient" : cover ? "gradient" : "solid",
    overlay: 72,
    titleSize: cover ? 100 : 80,
    bodySize: cover ? 50 : 45,
    subtitleSize: 50,
    titleLines: cover ? 3 : 2,
    imagePosition: cover ? "background" : "bottom",
    imageSrc: card.source_image_src || "",
    imageFit: "cover",
    eyebrow: plainCardText(card.eyebrow_ko),
    headline: plainCardText(card.headline_ko),
    body: plainCardText(card.body_ko),
    signature: "네카라쿠배 디자이너, 피그마스터",
    visualizationMethod,
  };
}

function DraftWorkspace({ slug }) {
  const [document, setDocument] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [selectedRevision, setSelectedRevision] = useState(null);
  const [selectedCard, setSelectedCard] = useState(1);
  const [instruction, setInstruction] = useState("");
  const [editor, setEditor] = useState(null);
  const [generationState, setGenerationState] = useState(null);
  const editorCache = useRef(new Map());

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/drafts/${encodeURIComponent(slug)}`),
      fetch("/api/generation-state", { cache: "no-store" }),
    ])
      .then(async ([draftResponse, stateResponse]) => {
        const [payload, statePayload] = await Promise.all([
          draftResponse.json(),
          stateResponse.json(),
        ]);
        if (!draftResponse.ok) {
          throw new Error(payload.error || "Draft를 찾지 못했습니다.");
        }
        if (!stateResponse.ok) {
          throw new Error(statePayload.error || "생성 단계를 찾지 못했습니다.");
        }
        return { payload, statePayload };
      })
      .then(({ payload, statePayload }) => {
        if (cancelled) return;
        setDocument(payload);
        setGenerationState(statePayload);
        const fableRevisions = new Set(
          payload.model_runs
            .filter((run) => run.model?.includes("fable"))
            .map((run) => run.revision),
        );
        const latestVisible = [...payload.revisions]
          .reverse()
          .find(
            (revision) =>
              revision.created_at >= statePayload.visible_after ||
              fableRevisions.has(revision.revision),
          );
        setSelectedRevision(latestVisible?.revision || null);
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
      const response = await fetch(
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
        <a href="#/">Library로 돌아가기</a>
      </main>
    );
  }

  const fableRevisions = new Set(
    document.model_runs
      .filter((run) => run.model?.includes("fable"))
      .map((run) => run.revision),
  );
  const latestFableRevision = Math.max(...fableRevisions, -1);
  const visibleRevisions = generationState
    ? document.revisions.filter(
        (revision) =>
          revision.created_at >= generationState.visible_after ||
          revision.revision === latestFableRevision,
      )
    : [];

  if (!visibleRevisions.length) {
    return (
      <main className="analysis-loading">
        <ImageIcon size={26} />
        <strong>실제 이미지 생성 결과를 준비 중입니다.</strong>
        <p>이전 텍스트·도형 초안은 숨겼습니다.</p>
        <a href="#/logs">새 생성 로그 보기</a>
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

  function patchEditor(patch) {
    const key = `${revision.revision}:${card.position}`;
    setEditor((current) => {
      const next = { ...current, ...patch };
      editorCache.current.set(key, next);
      return next;
    });
  }

  function updateEditor(field, value) {
    patchEditor({ [field]: value });
  }

  function downloadHtml() {
    if (!editor) return;
    const cover = card.role === "cover";
    const image = editor.imageSrc
      ? `<img src="${escapeHtml(editor.imageSrc)}" alt="" />`
      : "";
    const useBackgroundImage =
      editor.backgroundMode === "image-gradient" &&
      editor.imagePosition === "background" &&
      editor.imageSrc;
    const backgroundImage = useBackgroundImage
      ? `background-image:url('${escapeHtml(editor.imageSrc)}');`
      : editor.backgroundMode === "gradient"
        ? `background-image:linear-gradient(135deg,${editor.background},${editor.accentColor});`
        : "";
    const bodyImage =
      !cover && editor.imagePosition !== "background"
        ? image.replace(
            "<img ",
            `<img class="body-image" style="object-fit:${escapeHtml(editor.imageFit)}" `,
          )
        : "";
    const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(editor.headline)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#ddd;display:grid;place-items:center;min-height:100vh;font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Noto Sans KR",sans-serif}
.card{position:relative;width:${editor.width}px;height:${editor.height}px;overflow:hidden;color:${editor.textColor};background:${editor.background};${backgroundImage}background-size:cover;background-position:center}
.overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,${editor.overlay / 100}))}
.content{position:absolute;inset:${cover ? "auto 84px 96px" : "72px 72px 84px"};z-index:2;display:flex;flex-direction:column;height:${cover ? "auto" : "calc(100% - 156px)"}}
.signature,.eyebrow{font-size:${cover ? editor.subtitleSize : 22}pt;font-weight:700;color:${cover ? editor.textColor : editor.accentColor}}
h1{margin:${cover ? "30px 0 0" : "72px 0 0"};font-size:${editor.titleSize}pt;line-height:.96;letter-spacing:-.06em;display:-webkit-box;-webkit-line-clamp:${editor.titleLines};-webkit-box-orient:vertical;overflow:hidden}
p{margin:34px 0 0;font-size:${editor.bodySize}pt;line-height:1.38;letter-spacing:-.035em}
.body-image{width:100%;height:38%;margin-top:auto;object-fit:cover;border-radius:24px}
.middle .body-image{order:2;margin:38px 0 0}.middle p{order:3}
.footer{position:absolute;right:32px;bottom:26px;z-index:3;font-size:14pt;opacity:.55}
</style>
</head>
<body>
<article class="card ${escapeHtml(editor.imagePosition)}">
${useBackgroundImage ? '<div class="overlay"></div>' : ""}
<div class="content">
  <div class="${cover ? "eyebrow" : "signature"}">${escapeHtml(cover ? editor.eyebrow : editor.signature)}</div>
  <h1>${escapeHtml(editor.headline)}</h1>
  ${cover ? "" : `<p>${escapeHtml(editor.body)}</p>`}
  ${bodyImage}
</div>
<div class="footer">${String(card.position).padStart(2, "0")} / ${String(revision.cards.length).padStart(2, "0")}</div>
</article>
</body>
</html>`;
    const url = URL.createObjectURL(
      new Blob([html], { type: "text/html;charset=utf-8" }),
    );
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${slug}-card-${String(card.position).padStart(2, "0")}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="draft-layout">
      <aside className="draft-card-rail">
        <a className="back-link" href="#/">
          <ArrowLeft size={16} /> Library
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

        {false && editor && (
          <div className="html-editor-controls">
            <EditorSection title="CANVAS">
              <label>
                <span>Preset</span>
                <select
                  value={`${editor.width}x${editor.height}`}
                  onChange={(event) => {
                    const [width, height] = event.target.value
                      .split("x")
                      .map(Number);
                    patchEditor({ width, height });
                  }}
                >
                  <option value="1080x1350">Instagram 4:5</option>
                  <option value="1080x1080">Instagram 1:1</option>
                  <option value="1080x1920">Story 9:16</option>
                </select>
              </label>
              <label>
                <span>Width</span>
                <input
                  type="number"
                  value={editor.width}
                  onChange={(event) =>
                    updateEditor("width", Number(event.target.value))
                  }
                />
              </label>
              <label>
                <span>Height</span>
                <input
                  type="number"
                  value={editor.height}
                  onChange={(event) =>
                    updateEditor("height", Number(event.target.value))
                  }
                />
              </label>
            </EditorSection>

            <EditorSection title="BACKGROUND">
              <label>
                <span>Mode</span>
                <select
                  value={editor.backgroundMode}
                  onChange={(event) =>
                    updateEditor("backgroundMode", event.target.value)
                  }
                >
                  <option value="image-gradient">Image + gradient</option>
                  <option value="solid">Solid</option>
                  <option value="gradient">Gradient</option>
                </select>
              </label>
              <label>
                <span>Color</span>
                <input
                  type="color"
                  value={editor.background}
                  onChange={(event) =>
                    updateEditor("background", event.target.value)
                  }
                />
              </label>
              <label>
                <span>Overlay {editor.overlay}%</span>
                <input
                  type="range"
                  min="0"
                  max="95"
                  value={editor.overlay}
                  onChange={(event) =>
                    updateEditor("overlay", Number(event.target.value))
                  }
                />
              </label>
            </EditorSection>

            <EditorSection title="TYPOGRAPHY">
              <label>
                <span>Title</span>
                <input
                  type="number"
                  value={editor.titleSize}
                  onChange={(event) =>
                    updateEditor("titleSize", Number(event.target.value))
                  }
                />
              </label>
              <label>
                <span>Body</span>
                <input
                  type="number"
                  value={editor.bodySize}
                  onChange={(event) =>
                    updateEditor("bodySize", Number(event.target.value))
                  }
                />
              </label>
              <label>
                <span>Title lines</span>
                <select
                  value={editor.titleLines}
                  onChange={(event) =>
                    updateEditor("titleLines", Number(event.target.value))
                  }
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </label>
              <label>
                <span>Text</span>
                <input
                  type="color"
                  value={editor.textColor}
                  onChange={(event) =>
                    updateEditor("textColor", event.target.value)
                  }
                />
              </label>
              <label>
                <span>Accent</span>
                <input
                  type="color"
                  value={editor.accentColor}
                  onChange={(event) =>
                    updateEditor("accentColor", event.target.value)
                  }
                />
              </label>
            </EditorSection>

            <EditorSection title="CONTENT" wide>
              {card.role !== "cover" && (
                <label>
                  <span>Signature</span>
                  <input
                    type="text"
                    value={editor.signature}
                    onChange={(event) =>
                      updateEditor("signature", event.target.value)
                    }
                  />
                </label>
              )}
              <label>
                <span>Title</span>
                <textarea
                  rows="2"
                  value={editor.headline}
                  onChange={(event) =>
                    updateEditor("headline", event.target.value)
                  }
                />
              </label>
              <label>
                <span>{card.role === "cover" ? "Subtitle" : "Body"}</span>
                <textarea
                  rows="3"
                  value={card.role === "cover" ? editor.eyebrow : editor.body}
                  onChange={(event) =>
                    updateEditor(
                      card.role === "cover" ? "eyebrow" : "body",
                      event.target.value,
                    )
                  }
                />
              </label>
            </EditorSection>

            <EditorSection title="IMAGE">
              <label>
                <span>Position</span>
                <select
                  value={editor.imagePosition}
                  onChange={(event) => {
                    const imagePosition = event.target.value;
                    patchEditor({
                      imagePosition,
                      backgroundMode:
                        imagePosition === "background"
                          ? "image-gradient"
                          : editor.backgroundMode === "image-gradient"
                            ? "solid"
                            : editor.backgroundMode,
                    });
                  }}
                >
                  <option value="background">Background</option>
                  <option value="middle">Middle</option>
                  <option value="bottom">Bottom</option>
                </select>
              </label>
              <label>
                <span>Fit</span>
                <select
                  value={editor.imageFit}
                  onChange={(event) =>
                    updateEditor("imageFit", event.target.value)
                  }
                >
                  <option value="cover">Cover</option>
                  <option value="contain">Contain</option>
                </select>
              </label>
              <label className="editor-span-all">
                <span>Image URL</span>
                <input
                  type="url"
                  value={editor.imageSrc}
                  onChange={(event) =>
                    updateEditor("imageSrc", event.target.value)
                  }
                  placeholder="https://..."
                />
              </label>
            </EditorSection>

            <button
              className="download-html-button"
              type="button"
              onClick={downloadHtml}
            >
              HTML 결과 다운로드 <ArrowUpRight size={15} />
            </button>
          </div>
        )}

        <div className="prompt-customize-intro">
          <span>글씨 · 배경 · 무드 · 문구</span>
          <p>원하는 결과를 문장으로 적으면 새 리비전에 함께 반영합니다.</p>
        </div>

        <button
          className="download-html-button"
          type="button"
          onClick={downloadHtml}
        >
          현재 HTML 결과 다운로드 <ArrowUpRight size={15} />
        </button>

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

        <div className="tune-box">
          <label htmlFor="draft-instruction">CUSTOM PROMPT</label>
          <textarea
            id="draft-instruction"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="예: 글씨는 굵고 단단하게, 배경은 밝게, 전체 무드는 차분하게. 모든 본문은 더 짧게 줄여줘."
            rows={6}
            disabled={status === "revising" || isHistorical}
          />
          <div className="tune-suggestions">
            {[
              "글씨는 굵고 문구는 더 짧게",
              "밝은 배경에 차분한 무드",
              "이미지를 크게, 설명은 최소화",
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

function EditorSection({ title, wide = false, children }) {
  return (
    <section className={`editor-section ${wide ? "wide" : ""}`}>
      <span>{title}</span>
      <div className="editor-field-grid">{children}</div>
    </section>
  );
}

function GeneratedCardVisual({ method, position }) {
  return (
    <div className={`generated-card-visual generated-${method}`}>
      <span className="visual-shape one" />
      <span className="visual-shape two" />
      <span className="visual-shape three" />
      <em>{String(position).padStart(2, "0")}</em>
      {method === "comparison" && (
        <div className="visual-comparison-labels"><b>A</b><b>B</b></div>
      )}
      {method === "checklist" && (
        <div className="visual-checks"><i /><i /><i /></div>
      )}
    </div>
  );
}

function ModelHtmlCanvas({ card, cardCount, css }) {
  const scale = Math.min(0.46, 500 / 1080, 640 / 1350);
  const replacements = {
    "{{EYEBROW}}": escapeHtml(card.eyebrow_ko || ""),
    "{{SIGNATURE}}": escapeHtml("네카라쿠배 디자이너, 피그마스터"),
    "{{HEADLINE}}": escapeHtml(card.headline_ko || ""),
    "{{BODY}}": escapeHtml(card.body_ko || ""),
    "{{POSITION}}": String(card.position).padStart(2, "0"),
    "{{COUNT}}": String(cardCount).padStart(2, "0"),
    "{{SOURCE_IMAGE}}": escapeHtml(card.source_image_src || ""),
  };
  let markup = card.render_template || "";
  Object.entries(replacements).forEach(([placeholder, value]) => {
    markup = markup.replaceAll(placeholder, value);
  });
  const srcDoc = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=1080,initial-scale=1" />
<style>
*{box-sizing:border-box}
html,body{width:1080px;height:1350px;margin:0;overflow:hidden}
body{font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}
${css || ""}
</style>
</head>
<body>${markup}</body>
</html>`;

  return (
    <div
      className="html-card-viewport model-html-viewport"
      style={{ width: 1080 * scale, height: 1350 * scale }}
    >
      <iframe
        title={`${card.position}번 모델 HTML 카드`}
        srcDoc={srcDoc}
        sandbox=""
        style={{
          width: 1080,
          height: 1350,
          transform: `scale(${scale})`,
        }}
      />
    </div>
  );
}

function HtmlCardCanvas({ card, cardCount, editor }) {
  const cover = card.role === "cover";
  const visualizationMethod =
    card.visualization_method || editor.visualizationMethod || "statement";
  const scale = Math.min(0.46, 500 / editor.width, 640 / editor.height);
  const useBackgroundImage =
    editor.backgroundMode === "image-gradient" &&
    editor.imagePosition === "background" &&
    editor.imageSrc;
  const backgroundImage = useBackgroundImage
    ? `url("${editor.imageSrc.replaceAll('"', '\\"')}")`
    : editor.backgroundMode === "gradient"
      ? `linear-gradient(135deg, ${editor.background}, ${editor.accentColor})`
      : "none";
  const image = editor.imageSrc && editor.imagePosition !== "background" && (
    <img
      className="html-card-image"
      src={editor.imageSrc}
      alt=""
      style={{ objectFit: editor.imageFit }}
    />
  );

  return (
    <div
      className="html-card-viewport"
      style={{
        width: editor.width * scale,
        height: editor.height * scale,
      }}
    >
      <article
        className={`html-card-canvas html-card-${cover ? "cover" : "body"} image-${editor.imagePosition} visual-${visualizationMethod} layout-${card.position % 2 ? "a" : "b"}`}
        style={{
          width: editor.width,
          height: editor.height,
          color: editor.textColor,
          backgroundColor: editor.background,
          backgroundImage,
          "--card-accent": editor.accentColor,
          transform: `scale(${scale})`,
        }}
      >
        <div className="html-card-background-art" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        {useBackgroundImage && (
          <div
            className="html-card-overlay"
            style={{
              background: `linear-gradient(180deg, rgb(0 0 0 / 8%), rgb(0 0 0 / ${editor.overlay}%))`,
            }}
          />
        )}
        <div className="html-card-content">
          <div
            className={cover ? "html-card-subtitle" : "html-card-signature"}
            style={{
              color: cover ? editor.textColor : editor.accentColor,
              fontSize: `${cover ? editor.subtitleSize : 22}pt`,
            }}
          >
            {cover ? editor.eyebrow : editor.signature}
          </div>
          <h1
            className="html-card-title"
            style={{
              fontSize: `${editor.titleSize}pt`,
              WebkitLineClamp: editor.titleLines,
            }}
          >
            {editor.headline}
          </h1>
          {!cover && editor.imagePosition === "middle" && image}
          {!cover && (
            <p
              className="html-card-body-copy"
              style={{ fontSize: `${editor.bodySize}pt` }}
            >
              {editor.body}
            </p>
          )}
          {!cover && editor.imagePosition === "bottom" && image}
          {!cover && !editor.imageSrc && (
            <GeneratedCardVisual
              method={visualizationMethod}
              position={card.position}
            />
          )}
        </div>
        <div className="html-card-footer">
          {String(card.position).padStart(2, "0")} /{" "}
          {String(cardCount).padStart(2, "0")}
        </div>
      </article>
    </div>
  );
}

export { DraftWorkspace, EditorSection, GeneratedCardVisual, HtmlCardCanvas, ModelHtmlCanvas };
