/**
 * NN/g 목록 페이지(/articles/?page=N)를 항목 배열로 바꾼다.
 *
 * 목록 항목 하나는 `li.publication-list-item`이고, class에 `video`가
 * 붙으면 영상이다. 페이지 1에는 최신 목록 뒤에 인기글 섹션이 섞여 있어
 * 오래된 항목이 함께 나온다 — 그래서 이 파일은 걸러내지 않고 전부 반환하고,
 * 연도 필터는 부르는 쪽(run.mjs)이 published_date로 판단한다.
 */

import * as cheerio from "cheerio";

const MONTHS = {
  January: "01",
  February: "02",
  March: "03",
  April: "04",
  May: "05",
  June: "06",
  July: "07",
  August: "08",
  September: "09",
  October: "10",
  November: "11",
  December: "12",
};

const DATE_PATTERN = new RegExp(
  `(${Object.keys(MONTHS).join("|")}) (\\d{1,2}), (\\d{4})`,
);

export const LISTING_URL = "https://www.nngroup.com/articles/";

function squish(text) {
  return (text || "").split(/\s+/).filter(Boolean).join(" ");
}

/** "July 27, 2026" → "2026-07-27". 못 읽으면 null. */
export function parsePublishedDate(timeText) {
  const match = DATE_PATTERN.exec(timeText || "");
  if (!match) return null;
  const [, month, day, year] = match;
  return `${year}-${MONTHS[month]}-${day.padStart(2, "0")}`;
}

/** srcset이 있으면 첫 후보 URL을, 없으면 src를 쓴다. */
function imageUrl($image, pageUrl) {
  const srcset = $image.attr("srcset");
  const candidate = srcset
    ? srcset.split(",")[0].trim().split(/\s+/)[0]
    : $image.attr("src");
  if (!candidate) return null;
  return new URL(candidate, pageUrl).toString();
}

export function parseListing(html, pageUrl = LISTING_URL) {
  const $ = cheerio.load(html);
  const items = [];

  $("li.publication-list-item").each((_, element) => {
    const $item = $(element);
    const href = $item.find("h2.title a").first().attr("href");
    if (!href) return;

    const url = new URL(href, pageUrl).toString();
    const timeText = squish($item.find("time").first().text());

    // 요약은 <p> 안의 텍스트지만 그 안에 썸네일 <span class="media">가 끼어 있다.
    // 복제본에서 미디어를 떼어낸 뒤 텍스트만 남긴다.
    const $summary = $item.find("p").first().clone();
    $summary.find("span.media").remove();

    items.push({
      format: $item.hasClass("video") ? "video" : "article",
      title: squish($item.find("h2.title a").first().text()),
      url,
      slug: new URL(url).pathname.replace(/\/$/, "").split("/").pop(),
      published_date: parsePublishedDate(timeText),
      summary: squish($summary.text()),
      thumbnail_url: imageUrl($item.find("img").first(), pageUrl),
    });
  });

  const pageNumbers = new Set();
  $("li.pagination a[href]").each((_, element) => {
    const page = new URL($(element).attr("href"), pageUrl).searchParams.get(
      "page",
    );
    if (page && /^\d+$/.test(page)) pageNumbers.add(Number(page));
  });

  return { items, pageNumbers: [...pageNumbers].sort((a, b) => a - b) };
}

export function listingPageUrl(page) {
  return page <= 1 ? LISTING_URL : `${LISTING_URL}?page=${page}`;
}
