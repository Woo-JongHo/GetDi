/**
 * 목록의 제목·요약을 한국어로 옮긴다.
 *
 * 카드 리스트에서 59건을 훑을 때 영어 제목만 보이면 무엇을 고를지
 * 판단이 안 된다. 그래서 수집이 끝나면 이어서 돌린다.
 *
 * **직역하지 않는다.** 영어 문장 구조를 그대로 옮기면 "~하는 방법에 대한
 * 5가지 고려사항" 같은 번역투가 나오고, 그건 훑어보기에 가장 나쁜 형태다.
 * 뜻을 지키되 한국어로 다시 쓴다.
 *
 * 번역은 파생물이므로 수집 정본(articles.json)에 섞지 않는다(AD-2).
 * 별도 파일에 두고 어느 수집분을 번역한 것인지 retrieved_at으로 잇는다.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/** 한 번에 보내는 항목 수. 너무 크면 모델이 뒤쪽을 대충 쓴다. */
const BATCH_SIZE = 12;

const TRANSLATION_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          slug: { type: "string" },
          title_ko: { type: "string" },
          summary_ko: { type: "string" },
        },
        required: ["slug", "title_ko", "summary_ko"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

function buildPrompt(batch) {
  const payload = batch
    .map(
      (item) =>
        `- slug: ${item.slug}\n  title: ${item.title}\n  summary: ${item.summary || "(없음)"}`,
    )
    .join("\n");

  return `너는 UX 디자인 매체의 한국어 에디터다.
아래 Nielsen Norman Group 기사 ${batch.length}건의 제목과 요약을 한국어로 옮긴다.

## 어떻게 옮기나

직역하지 않는다. 영어 어순을 그대로 따라가면 훑어보기 가장 나쁜 번역투가 된다.
뜻은 지키되 한국어로 다시 쓴다.

- 제목: 목록에서 훑으며 고를 수 있게 짧고 분명하게. 25자 안쪽을 목표로 한다.
  원문이 질문형이면 질문형을, 단정형이면 단정형을 지킨다.
- 요약: 이 기사를 읽으면 무엇을 알게 되는지 한두 문장으로. 60자 안팎.
- "~에 대한", "~에 관하여", "~하는 것" 같은 번역투를 피한다.
- 원문에 없는 정보를 만들지 않는다. 숫자와 고유명사는 그대로 지킨다.
- UX 전문 용어는 굳이 풀어쓰지 않는다(예: 유저 리서치, 디자인 시스템).

## 입력

${payload}

## 출력

각 항목마다 slug를 그대로 두고 title_ko와 summary_ko를 채운다.
입력에 없는 slug를 만들지 않는다.`;
}

async function writeAtomicJson(target, value) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

export function translationPath(rootDir, year) {
  return path.join(rootDir, "data/private/listing-ko", `${year}.json`);
}

export async function readTranslations(rootDir, year) {
  try {
    return JSON.parse(await readFile(translationPath(rootDir, year), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * 아직 번역되지 않은 항목만 골라 배치로 옮긴다.
 * 한 배치가 실패해도 나머지는 계속한다 — 번역은 수집의 부가 단계이고,
 * 몇 건 빠졌다고 수집 전체를 실패로 되돌릴 이유가 없다.
 */
export async function translateListing({
  rootDir,
  year,
  items,
  collectionRetrievedAt,
  runStructured,
  onProgress = () => {},
}) {
  const existing = (await readTranslations(rootDir, year)) ?? {
    schema_version: 1,
    year,
    items: {},
  };
  const pending = items.filter((item) => !existing.items[item.slug]);

  if (!pending.length) {
    return { translated: 0, failed: 0, total: items.length };
  }

  let translated = 0;
  const failures = [];

  for (let index = 0; index < pending.length; index += BATCH_SIZE) {
    const batch = pending.slice(index, index + BATCH_SIZE);
    onProgress({
      done: index,
      total: pending.length,
      batch: batch.length,
    });

    try {
      // 모델 어댑터는 { output, envelope }를 돌려준다. 결과는 output 안에 있다.
      const { output } = await runStructured({
        prompt: buildPrompt(batch),
        schema: TRANSLATION_SCHEMA,
        timeoutMessage: "목록 번역이 시간 안에 끝나지 않았습니다.",
        runMeta: { stage: "listing-translation", year, count: batch.length },
      });

      const allowed = new Set(batch.map((item) => item.slug));
      for (const entry of output?.items || []) {
        // 모델이 없는 slug를 만들어 오면 버린다.
        if (!allowed.has(entry.slug)) continue;
        existing.items[entry.slug] = {
          title_ko: entry.title_ko,
          summary_ko: entry.summary_ko,
        };
        translated += 1;
      }
    } catch (error) {
      failures.push({ slugs: batch.map((item) => item.slug), error: error.message });
    }

    existing.translated_at = new Date().toISOString();
    existing.source_retrieved_at = collectionRetrievedAt ?? null;
    await writeAtomicJson(translationPath(rootDir, year), existing);
  }

  return {
    translated,
    failed: pending.length - translated,
    total: items.length,
    failures,
  };
}
