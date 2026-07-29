import React, { useEffect, useRef, useState } from "react";

import { Image as ImageIcon, ShieldAlert } from "lucide-react";

const CARDNEWS_RESEARCH = [
  {
    id: "FMT-01",
    group: "FORMAT",
    title: "세로형 4:5",
    principle: "피드 점유 면적을 확보하면서 Instagram 지원 범위 안에서 출력한다.",
    application: "1080 × 1350px를 GetDi 기본 캔버스로 사용한다.",
    evidence:
      "Instagram은 최대 너비 1080px와 1.91:1~3:4 사이의 사진 비율을 원본 해상도로 지원한다. 4:5는 이 범위 안에 있다.",
    source: "Instagram Help Centre",
    sourceUrl: "https://www.facebook.com/help/instagram/1631821640426723",
    strength: "Platform",
    visual: "format",
  },
  {
    id: "COPY-01",
    group: "COPY",
    title: "짧고 스캔 가능하게",
    principle: "긴 문단을 옮기지 않고 의미 있는 제목과 짧은 덩어리로 재구성한다.",
    application: "카드 제목 하나, 핵심 문장 하나, 보조 설명 하나를 기본 위계로 둔다.",
    evidence:
      "NN/g는 화면 콘텐츠를 짧고, 훑어보기 쉽고, 의미 있는 제목으로 구조화할 것을 권한다.",
    source: "Nielsen Norman Group",
    sourceUrl: "https://www.nngroup.com/articles/be-succinct-writing-for-the-web/",
    strength: "Research",
    visual: "copy",
  },
  {
    id: "SEG-01",
    group: "SEQUENCE",
    title: "한 장에 한 단계",
    principle: "복잡한 설명은 사용자가 넘겨볼 수 있는 작은 의미 단위로 나눈다.",
    application: "카드 한 장에는 하나의 주장만 배치하고 다음 장과 순서를 연결한다.",
    evidence:
      "멀티미디어 학습의 segmentation 원칙은 복잡한 내용을 학습자 속도에 맞춘 구간으로 나눌 때 이해 부담을 줄일 수 있음을 제시한다.",
    source: "Mayer & Moreno, Learning and Instruction",
    sourceUrl:
      "https://www.psychology.mcmaster.ca/bennett/psy720/readings/m1/m1r3.pdf",
    strength: "Derived",
    visual: "sequence",
  },
  {
    id: "IMG-01",
    group: "IMAGE",
    title: "설명하는 이미지만",
    principle: "장식 이미지가 아니라 현재 주장을 이해시키는 이미지를 선택한다.",
    application: "원문 본문 이미지 중 해당 카드의 주장과 직접 연결되는 자산을 우선한다.",
    evidence:
      "coherence 원칙은 학습 목표와 무관한 단어·이미지·소리를 제거할 때 이해가 좋아진다고 설명한다.",
    source: "Mayer & Moreno, Learning and Instruction",
    sourceUrl:
      "https://www.psychology.mcmaster.ca/bennett/psy720/readings/m1/m1r3.pdf",
    strength: "Research",
    visual: "image",
  },
  {
    id: "REL-01",
    group: "LAYOUT",
    title: "문장과 이미지를 가깝게",
    principle: "서로 설명하는 문장과 시각 자료가 어디에서 연결되는지 즉시 보이게 한다.",
    application: "이미지 설명은 이미지 인접 영역에 배치하고 원거리 범례를 피한다.",
    evidence:
      "spatial contiguity 원칙은 대응하는 단어와 그림을 가까이 제시할 때 학습 효과가 높아진다고 제안한다.",
    source: "Mayer & Moreno, Learning and Instruction",
    sourceUrl:
      "https://www.psychology.mcmaster.ca/bennett/psy720/readings/m1/m1r3.pdf",
    strength: "Research",
    visual: "proximity",
  },
  {
    id: "A11Y-01",
    group: "LEGIBILITY",
    title: "대비를 수치로 확인",
    principle: "사진 위 텍스트도 배경과 분리되어 읽혀야 한다.",
    application: "일반 텍스트 4.5:1, 큰 텍스트 3:1을 최소 검사 기준으로 둔다.",
    evidence:
      "WCAG 2.2는 일반 텍스트에 4.5:1, 큰 텍스트에 3:1의 최소 대비를 요구한다.",
    source: "W3C · WCAG 2.2",
    sourceUrl: "https://www.w3.org/TR/WCAG22/#contrast-minimum",
    strength: "Standard",
    visual: "contrast",
  },
];

const GETDI_BASELINE = [
  { id: "01", role: "Cover", text: "주제와 약속" },
  { id: "02", role: "Context", text: "출처와 문제" },
  { id: "03", role: "Insight", text: "핵심 주장 1" },
  { id: "04", role: "Insight", text: "핵심 주장 2" },
  { id: "05", role: "Insight", text: "핵심 주장 3" },
  { id: "06", role: "Source", text: "정리와 원문" },
];

function CardNewsResearch() {
  const [references, setReferences] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState("loading");
  const [uploadProgress, setUploadProgress] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef(null);

  async function loadLibrary() {
    setError("");
    try {
      const [libraryResponse, analysisResponse] = await Promise.all([
        fetch("/api/references"),
        fetch("/api/reference-analysis"),
      ]);
      const library = await libraryResponse.json();
      if (!libraryResponse.ok) {
        throw new Error(library.error || "레퍼런스를 불러오지 못했습니다.");
      }
      setReferences(library.items || []);
      setSelectedId((current) => current || library.items?.[0]?.id || null);
      if (analysisResponse.ok) setAnalysis(await analysisResponse.json());
      setStatus("ready");
    } catch (requestError) {
      setError(requestError.message);
      setStatus("error");
    }
  }

  useEffect(() => {
    loadLibrary();
  }, []);

  async function uploadFiles(files) {
    const accepted = [...files].filter((file) =>
      ["image/png", "image/jpeg"].includes(file.type),
    );
    if (!accepted.length) {
      setError("PNG 또는 JPEG 이미지를 선택해주세요.");
      return;
    }
    setStatus("uploading");
    setError("");
    for (let index = 0; index < accepted.length; index += 1) {
      const file = accepted[index];
      setUploadProgress(`${index + 1} / ${accepted.length} 저장 중`);
      try {
        const bitmap = await createImageBitmap(file);
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        const response = await fetch("/api/references", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            original_name: file.name,
            mime_type: file.type,
            width: bitmap.width,
            height: bitmap.height,
            data_base64: String(dataUrl).split(",").at(-1),
            reference_set: "custom",
            tags: ["instagram", "reference"],
          }),
        });
        bitmap.close();
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "저장에 실패했습니다.");
        setSelectedId(payload.item.id);
      } catch (uploadError) {
        setError(`${file.name}: ${uploadError.message}`);
      }
    }
    setUploadProgress("");
    await loadLibrary();
  }

  const selected =
    references.find((item) => item.id === selectedId) || references[0];
  const selectedSet = analysis?.sets?.find(
    (set) => set.id === selected?.reference_set,
  );

  return (
    <section className="research-page reference-library-page">
      <header className="research-header reference-library-header">
        <div>
          <div className="eyebrow">
            <span>LOCAL REFERENCE LIBRARY</span>
            <span className="eyebrow-rule" />
            <span>{references.length} IMAGES</span>
          </div>
          <h1>Reference<br />foundation.</h1>
        </div>
        <div className="reference-library-actions">
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg"
            multiple
            hidden
            onChange={(event) => uploadFiles(event.target.files)}
          />
          <span>{uploadProgress || "PNG · JPG · LOCAL ONLY"}</span>
          <button type="button" onClick={() => fileInput.current?.click()}>
            <ImageIcon size={15} /> 이미지 추가
          </button>
        </div>
      </header>

      {error && <div className="reference-library-error">{error}</div>}

      {status === "loading" ? (
        <div className="analysis-loading">
          <span className="spinner dark" />
          <strong>레퍼런스를 정리하는 중</strong>
        </div>
      ) : (
        <section className="reference-library-workspace">
          <div className="reference-archive">
            <div className="reference-archive-heading">
              <span>PROVIDED IMAGES</span>
              <strong>생성 프롬프트의 시각 근거</strong>
            </div>
            <div className="reference-archive-grid">
              {references.map((item, index) => (
                <button
                  className={selected?.id === item.id ? "selected" : ""}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  key={item.id}
                >
                  <img
                    src={`/api/references/${item.id}/content`}
                    alt={item.post_label || item.original_name}
                  />
                  <span>
                    <em>{String(index + 1).padStart(2, "0")}</em>
                    <strong>{item.post_label || item.original_name}</strong>
                    <small>
                      {item.width || "—"} × {item.height || "—"} ·{" "}
                      {(item.bytes / 1024).toFixed(0)} KB
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="reference-insight-panel">
            {selected ? (
              <>
                <div className="reference-selected-preview">
                  <img
                    src={`/api/references/${selected.id}/content`}
                    alt={selected.post_label || selected.original_name}
                  />
                  <div>
                    <span>{selected.reference_set?.toUpperCase()}</span>
                    <strong>{selected.post_label || selected.original_name}</strong>
                    <small>{selected.original_name}</small>
                  </div>
                </div>

                <section className="reference-analysis-summary">
                  <span>ANALYZED FOUNDATION</span>
                  <h2>{selectedSet?.label || "분석 준비 중"}</h2>
                  <p>
                    {selectedSet?.summary
                      ? `${selectedSet.summary.topic} ${selectedSet.summary.visual_system}`
                      : "제공된 이미지에서 반복되는 레이아웃·타이포·색상·카피 밀도를 분석하고 있습니다."}
                  </p>
                </section>

                <div className="reference-rule-stack">
                  {(selectedSet?.rules || []).map((rule) => (
                    <article key={rule.id}>
                      <div>
                        <span>{rule.id}</span>
                        <em>{rule.confidence}</em>
                      </div>
                      <strong>{rule.title}</strong>
                      <p>{rule.instruction}</p>
                      <small>
                        EVIDENCE · {(rule.evidence_cards || []).join(", ")}
                      </small>
                    </article>
                  ))}
                </div>

                {selectedSet?.prohibited_elements?.length > 0 && (
                  <div className="reference-prohibited">
                    <ShieldAlert size={17} />
                    <div>
                      <strong>복제하지 않는 요소</strong>
                      <p>{selectedSet.prohibited_elements.join(" · ")}</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="analysis-loading">
                <ImageIcon size={24} />
                <strong>레퍼런스 이미지를 추가해주세요.</strong>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="reference-pipeline">
        <span>GENERATION INPUT</span>
        <div>
          <article>
            <em>01</em>
            <strong>미리 만든 요약본</strong>
            <p>2025–2026 아티클의 핵심 메시지와 근거 블록</p>
          </article>
          <span>→</span>
          <article>
            <em>02</em>
            <strong>카드 문구 프롬프트</strong>
            <p>4–8장, 제목 22자·본문 55자 제한</p>
          </article>
          <span>→</span>
          <article>
            <em>03</em>
            <strong>Reference profile</strong>
            <p>이 저장창고에서 분석한 구조·무드·이미지 규칙</p>
          </article>
          <span>→</span>
          <article>
            <em>04</em>
            <strong>실제 HTML 결과</strong>
            <p>1080×1350 카드와 근거 연결</p>
          </article>
        </div>
      </section>
    </section>
  );
}

function ResearchVisual({ type }) {
  if (type === "format") {
    return (
      <div className="research-demo format-demo">
        <span className="measure horizontal">1080</span>
        <span className="measure vertical">1350</span>
        <div className="demo-card">
          <span>4:5</span>
          <strong>FULL FEED<br />CANVAS</strong>
        </div>
      </div>
    );
  }

  if (type === "copy") {
    return (
      <div className="research-demo copy-demo">
        <div className="copy-number">01</div>
        <strong>하나의 명확한 제목</strong>
        <p>핵심 문장은 짧게.</p>
        <span>설명은 필요한 만큼만 남긴다.</span>
      </div>
    );
  }

  if (type === "sequence") {
    return (
      <div className="research-demo sequence-demo">
        {[1, 2, 3].map((number) => (
          <div key={number}>
            <span>0{number}</span>
            <strong>{number === 2 ? "ONE IDEA" : "NEXT"}</strong>
          </div>
        ))}
      </div>
    );
  }

  if (type === "image") {
    return (
      <div className="research-demo image-demo">
        <div>
          <span>CLAIM</span>
          <strong>이미지는<br />주장을 설명한다</strong>
        </div>
        <div className="image-diagram">
          <span />
          <span />
          <span />
        </div>
        <div className="decorative-image">DECORATION ×</div>
      </div>
    );
  }

  if (type === "proximity") {
    return (
      <div className="research-demo proximity-demo">
        <div className="proximity-figure">
          <span>A</span>
          <i />
          <span>B</span>
        </div>
        <div className="proximity-labels">
          <strong>A · 원인</strong>
          <strong>B · 결과</strong>
        </div>
        <p>설명은 대상 바로 옆에</p>
      </div>
    );
  }

  return (
    <div className="research-demo contrast-demo">
      <div className="contrast-dark">
        <strong>AA</strong>
        <span>12.6 : 1</span>
      </div>
      <div className="contrast-light">
        <strong>PASS</strong>
        <span>4.5 : 1 minimum</span>
      </div>
    </div>
  );
}

export { CardNewsResearch, ResearchVisual };
