import React, { useLayoutEffect, useRef, useState } from "react";

import { CharacterPose } from "./character/CharacterPose.jsx";

function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * 카드는 1080×1350 고정이고 화면에는 축소해서 보여준다.
 * 축소 비율을 상수로 두면 폰에서 카드가 화면 밖으로 나간다 —
 * 실제로 0.46 고정이라 390px 화면에서 497px짜리 미리보기가 나왔다.
 * 그래서 담을 자리의 폭을 재서 비율을 정한다.
 */
function useFitScale(width, height, maxScale = 0.46) {
  const holderRef = useRef(null);
  const [scale, setScale] = useState(maxScale);

  // useEffect가 아니라 useLayoutEffect다. 그려지기 전에 재야 첫 프레임부터
  // 맞는 크기로 나온다. useEffect는 페인트 뒤라 좁은 화면에서 카드가
  // 한 번 삐져나왔다가 줄어든다.
  useLayoutEffect(() => {
    const holder = holderRef.current;
    if (!holder) return undefined;

    const measure = (available) => {
      if (!available) return;
      setScale(Math.min(maxScale, available / width, 640 / height));
    };

    // ResizeObserver가 없는 환경에서도 최소 한 번은 실제 폭에 맞춘다.
    measure(holder.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    observer.observe(holder);
    return () => observer.disconnect();
  }, [height, maxScale, width]);

  return [holderRef, scale];
}

function ModelHtmlCanvas({ card, cardCount, css }) {
  const [holderRef, scale] = useFitScale(1080, 1350);
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
    <div className="html-card-fit" ref={holderRef}>
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
    </div>
  );
}

function HtmlCardCanvas({ card, cardCount, editor }) {
  const cover = card.role === "cover";
  const visualizationMethod =
    card.visualization_method || editor.visualizationMethod || "statement";
  const [holderRef, scale] = useFitScale(editor.width, editor.height);
  const character = editor.characterAssignment;
  const image = editor.imageSrc && (
    <div className="html-card-image-with-character">
      <img
        className="html-card-image"
        src={editor.imageSrc}
        alt=""
        style={{ objectFit: editor.imageFit }}
      />
      {character && (
        <CharacterPose
          pose={character.pose}
          className={`html-card-side-character character-${character.position} character-${character.scale}`}
        />
      )}
    </div>
  );

  return (
    <div className="html-card-fit" ref={holderRef}>
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
          backgroundImage: "none",
          "--card-accent": editor.accentColor,
          transform: `scale(${scale})`,
        }}
      >
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
          {!cover && !editor.imageSrc && character && (
            <div className={`html-card-character-only character-${character.position}`}>
              <CharacterPose
                pose={character.pose}
                className={`html-card-side-character character-${character.scale}`}
              />
            </div>
          )}
        </div>
        <div className="html-card-footer">
          {String(card.position).padStart(2, "0")} /{" "}
          {String(cardCount).padStart(2, "0")}
        </div>
      </article>
      </div>
    </div>
  );
}

export { HtmlCardCanvas, ModelHtmlCanvas };
