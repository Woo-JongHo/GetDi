/**
 * NN/g 기사 상세 페이지를 메타데이터 + 정제된 본문 HTML로 바꾼다.
 *
 * 본문은 원문 HTML을 그대로 저장하지 않는다. 허용 태그 화이트리스트만
 * 남기고 script·style·form 같은 실행/입력 요소는 통째로 버린다.
 * 문단과 이미지의 "순서"는 그대로 두는 것이 목적이다 — 그 순서가
 * 나중에 카드 초안의 근거를 원문 위치로 되짚는 유일한 좌표다.
 */

import * as cheerio from "cheerio";

const ALLOWED_TAGS = new Set([
  "a", "blockquote", "br", "code", "dd", "div", "dl", "dt", "em",
  "figcaption", "figure", "h2", "h3", "h4", "h5", "hr", "img", "li",
  "ol", "p", "pre", "small", "span", "strong", "sub", "sup", "table",
  "tbody", "td", "th", "thead", "tr", "ul",
]);
const VOID_TAGS = new Set(["br", "hr", "img"]);
const SUPPRESSED_TAGS = new Set([
  "script", "style", "svg", "noscript", "form", "button",
]);
const HEADING_TAGS = new Set(["h2", "h3", "h4", "h5"]);
const IMAGE_ATTRIBUTES = new Set([
  "src", "srcset", "alt", "width", "height", "loading",
]);

function squish(text) {
  return (text || "").split(/\s+/).filter(Boolean).join(" ");
}

function escapeText(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value) {
  return escapeText(value).replace(/"/g, "&quot;");
}

function absolute(url, baseUrl) {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function rewriteSrcset(value, baseUrl) {
  return value
    .split(",")
    .map((candidate) => {
      const pieces = candidate.trim().split(/\s+/).filter(Boolean);
      if (!pieces.length) return null;
      pieces[0] = absolute(pieces[0], baseUrl);
      return pieces.join(" ");
    })
    .filter(Boolean)
    .join(", ");
}

function safeAttributes(node, baseUrl) {
  const tag = node.name;
  const kept = [];
  let localAnchor = false;

  for (const [name, rawValue] of Object.entries(node.attribs || {})) {
    if (rawValue === undefined || rawValue === null) continue;
    let value = rawValue;

    if (name === "id" && HEADING_TAGS.has(tag)) {
      kept.push([name, value]);
    } else if (tag === "a" && (name === "href" || name === "title")) {
      if (name === "href") {
        localAnchor = value.startsWith("#");
        if (!localAnchor) value = absolute(value, baseUrl);
      }
      kept.push([name, value]);
    } else if (tag === "img" && IMAGE_ATTRIBUTES.has(name)) {
      if (name === "src") value = absolute(value, baseUrl);
      else if (name === "srcset") value = rewriteSrcset(value, baseUrl);
      kept.push([name, value]);
    }
  }

  // 외부 링크는 새 탭으로 열되 opener를 넘기지 않는다.
  if (tag === "a" && !localAnchor) {
    kept.push(["target", "_blank"], ["rel", "noopener noreferrer"]);
  }
  return kept;
}

function serializeNode(node, baseUrl) {
  if (node.type === "text") return escapeText(node.data || "");
  if (node.type !== "tag") return "";
  if (SUPPRESSED_TAGS.has(node.name)) return "";

  const inner = (node.children || [])
    .map((child) => serializeNode(child, baseUrl))
    .join("");

  // 화이트리스트 밖의 태그는 껍데기만 버리고 안의 내용은 살린다.
  if (!ALLOWED_TAGS.has(node.name)) return inner;

  const attributes = safeAttributes(node, baseUrl)
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join("");

  if (VOID_TAGS.has(node.name)) return `<${node.name}${attributes}>`;
  return `<${node.name}${attributes}>${inner}</${node.name}>`;
}

export function sanitizeBody(html, baseUrl) {
  const $ = cheerio.load(html);
  const body = $("div.article-body").first();
  if (!body.length) return "";
  return body
    .contents()
    .toArray()
    .map((node) => serializeNode(node, baseUrl))
    .join("")
    .trim();
}

function splitList(value) {
  return (value || "")
    .split(",")
    .map((piece) => piece.trim())
    .filter(Boolean);
}

export function parseDetail(html, pageUrl) {
  const $ = cheerio.load(html);

  const canonicalHref = $('link[rel="canonical"]').first().attr("href");
  const canonicalUrl = canonicalHref
    ? absolute(canonicalHref, pageUrl)
    : pageUrl;

  const meta = (key) =>
    $(`meta[property="${key}"]`).attr("content") ||
    $(`meta[name="${key}"]`).attr("content") ||
    null;

  let title = squish($("h1.article-h1").first().text()) || meta("og:title") || "";
  if (title.endsWith(" (Video)")) title = title.slice(0, -" (Video)".length);

  const gaValue = (id) => squish($(`#${id}`).first().text());
  const duration = gaValue("gaDataLength");

  const embed =
    $("iframe[src*='youtube.com/embed/']").first().attr("src") ||
    $("iframe[data-cookieblock-src*='youtube.com/embed/']")
      .first()
      .attr("data-cookieblock-src") ||
    null;

  return {
    schema_version: 1,
    source: "Nielsen Norman Group",
    source_url: canonicalUrl,
    format: new URL(canonicalUrl).pathname.startsWith("/videos/")
      ? "video"
      : "article",
    title,
    summary: meta("description") || "",
    published_date: gaValue("gaDataPubDate") || null,
    duration_minutes: /^\d+$/.test(duration) ? Number(duration) : null,
    authors: splitList(gaValue("gaDataAuthors")),
    topics: splitList(gaValue("gaDataAllTopics")),
    image_url: meta("og:image"),
    youtube_embed_url: embed,
    content_html: sanitizeBody(html, canonicalUrl),
    retrieved_at: new Date().toISOString(),
    usage: "Local research cache; retain source attribution and original URL.",
  };
}
