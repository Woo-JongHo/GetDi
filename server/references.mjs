import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { readRequestJson, sendJson } from "./http.mjs";
import {
  approvedRuleIds,
  createReviewEvent,
  evidenceCandidates,
} from "./evidence.mjs";

export function createReferencesHandler({ rootDir }) {
  const referenceDir = path.join(rootDir, "data/private/references");
  const referenceAssetDir = path.join(referenceDir, "assets");
  const referenceIndexPath = path.join(referenceDir, "index.json");
  const referenceAnalysisPath = path.join(
    rootDir,
    "data/reference-analysis.json",
  );
  const evidenceReviewPath = path.join(rootDir, "data/state/evidence-reviews.json");
  const instagramReferenceFiles = [
    "KakaoTalk_Photo_2026-07-25-20-55-46 001.png",
    "KakaoTalk_Photo_2026-07-25-20-55-46 002.png",
    "KakaoTalk_Photo_2026-07-25-20-55-47 003.png",
    "KakaoTalk_Photo_2026-07-25-20-55-47 004.png",
    "KakaoTalk_Photo_2026-07-25-20-55-47 005.png",
    "KakaoTalk_Photo_2026-07-25-20-55-47 006.png",
    "KakaoTalk_Photo_2026-07-25-20-55-47 007.png",
    "KakaoTalk_Photo_2026-07-25-20-57-13 001.png",
    "KakaoTalk_Photo_2026-07-25-20-57-14 002.png",
    "KakaoTalk_Photo_2026-07-25-20-57-14 003.png",
    "KakaoTalk_Photo_2026-07-25-20-57-14 004.png",
    "KakaoTalk_Photo_2026-07-25-20-57-14 005.png",
    "KakaoTalk_Photo_2026-07-25-20-57-14 006.png",
    "KakaoTalk_Photo_2026-07-25-20-57-14 007.png",
    "KakaoTalk_Photo_2026-07-25-20-57-14 008.png",
    "KakaoTalk_Photo_2026-07-25-20-57-14 009.png",
    "KakaoTalk_Photo_2026-07-25-20-57-14 010.png",
    "KakaoTalk_Photo_2026-07-25-20-57-15 011.png",
  ].map((name) => path.join("/Users/jonghoPro/Downloads", name));
  let referenceWriteQueue = Promise.resolve();
  let evidenceWriteQueue = Promise.resolve();

  async function readEvidenceReviews() {
    try {
      return JSON.parse(await readFile(evidenceReviewPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return { schema_version: 1, events: [] };
    }
  }

  async function appendEvidenceReview(body) {
    return new Promise((resolve, reject) => {
      evidenceWriteQueue = evidenceWriteQueue.then(async () => {
        const analysis = JSON.parse(await readFile(referenceAnalysisPath, "utf8"));
        const reviews = await readEvidenceReviews();
        const candidates = evidenceCandidates(analysis, reviews.events);
        if (!candidates.some((candidate) => candidate.id === body.candidate_id)) {
          const error = new Error("검토할 근거 후보를 찾지 못했습니다.");
          error.statusCode = 404;
          throw error;
        }
        const event = createReviewEvent({
          candidateId: body.candidate_id,
          status: body.status,
          note: body.note,
          now: new Date().toISOString(),
          eventId: randomUUID(),
        });
        reviews.events.push(event);
        await mkdir(path.dirname(evidenceReviewPath), { recursive: true });
        const temporaryPath = `${evidenceReviewPath}.tmp`;
        await writeFile(temporaryPath, `${JSON.stringify(reviews, null, 2)}\n`, "utf8");
        await rename(temporaryPath, evidenceReviewPath);
        resolve(event);
      }).catch(reject);
    });
  }

  async function writeReferenceIndex(index) {
    await mkdir(referenceDir, { recursive: true });
    const temporaryPath = `${referenceIndexPath}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify(index, null, 2)}\n`,
      "utf8",
    );
    await rename(temporaryPath, referenceIndexPath);
  }

  async function ensureReferenceIndex() {
    try {
      return JSON.parse(await readFile(referenceIndexPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    await mkdir(referenceAssetDir, { recursive: true });
    const items = [];
    for (let index = 0; index < instagramReferenceFiles.length; index += 1) {
      const sourcePath = instagramReferenceFiles[index];
      try {
        const contents = await readFile(sourcePath);
        const id = `seed-${String(index + 1).padStart(2, "0")}`;
        const storedName = `${id}.png`;
        await copyFile(sourcePath, path.join(referenceAssetDir, storedName));
        const now = new Date().toISOString();
        items.push({
          id,
          original_name: path.basename(sourcePath),
          stored_name: storedName,
          mime_type: "image/png",
          bytes: contents.byteLength,
          width: 1080,
          height: 1350,
          sha256: createHash("sha256").update(contents).digest("hex"),
          source_kind: "seed",
          source_url: null,
          account_handle: "@uxdesign_today",
          reference_set: index < 7 ? "set-a" : "set-b",
          post_label:
            index < 7
              ? `Reference A · ${String(index + 1).padStart(2, "0")} / 07`
              : `Reference B · ${String(index - 6).padStart(2, "0")} / 11`,
          tags: ["instagram", "carousel", index < 7 ? "set-a" : "set-b"],
          note: "",
          created_at: now,
          updated_at: now,
          status: "active",
        });
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    const document = {
      schema_version: 1,
      updated_at: new Date().toISOString(),
      items,
    };
    await writeReferenceIndex(document);
    return document;
  }

  function isSupportedReferenceImage(buffer, mimeType) {
    if (mimeType === "image/png") {
      return buffer.subarray(0, 8).equals(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
    }
    if (mimeType === "image/jpeg") {
      return buffer[0] === 0xff && buffer[1] === 0xd8;
    }
    return false;
  }

  async function addReferenceImage(body) {
    if (!["image/png", "image/jpeg"].includes(body.mime_type)) {
      const error = new Error("PNG 또는 JPEG 이미지만 추가할 수 있습니다.");
      error.statusCode = 400;
      throw error;
    }
    const buffer = Buffer.from(body.data_base64 || "", "base64");
    if (!buffer.length || !isSupportedReferenceImage(buffer, body.mime_type)) {
      const error = new Error("이미지 데이터가 올바르지 않습니다.");
      error.statusCode = 400;
      throw error;
    }
    if (buffer.byteLength > 10 * 1024 * 1024) {
      const error = new Error("이미지는 10MB 이하여야 합니다.");
      error.statusCode = 413;
      throw error;
    }
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    return new Promise((resolve, reject) => {
      referenceWriteQueue = referenceWriteQueue
        .then(async () => {
          const document = await ensureReferenceIndex();
          const duplicate = document.items.find((item) => item.sha256 === sha256);
          if (duplicate) {
            resolve({ item: duplicate, duplicate: true });
            return;
          }
          const id = `ref-${randomUUID()}`;
          const extension = body.mime_type === "image/png" ? "png" : "jpg";
          const storedName = `${id}.${extension}`;
          await mkdir(referenceAssetDir, { recursive: true });
          await writeFile(path.join(referenceAssetDir, storedName), buffer);
          const now = new Date().toISOString();
          const item = {
            id,
            original_name: path.basename(body.original_name || storedName),
            stored_name: storedName,
            mime_type: body.mime_type,
            bytes: buffer.byteLength,
            width: Number(body.width) || null,
            height: Number(body.height) || null,
            sha256,
            source_kind: "upload",
            source_url: body.source_url || null,
            account_handle: body.account_handle || null,
            reference_set: body.reference_set || "custom",
            post_label: body.post_label || null,
            tags: Array.isArray(body.tags) ? body.tags.slice(0, 12) : [],
            note: body.note || "",
            created_at: now,
            updated_at: now,
            status: "active",
          };
          document.items.push(item);
          document.updated_at = now;
          await writeReferenceIndex(document);
          resolve({ item, duplicate: false });
        })
        .catch(reject);
    });
  }

  async function readReferenceProfile(profileId = "set-b") {
    const document = JSON.parse(await readFile(referenceAnalysisPath, "utf8"));
    const reviews = await readEvidenceReviews();
    const set = (document.sets || []).find((candidate) => candidate.id === profileId);
    if (!set) {
      throw new Error(`Reference Library 프로필을 찾지 못했습니다: ${profileId}`);
    }
    return {
      analyzed_at: document.analyzed_at,
      profile: {
        id: set.id,
        summary: set.summary,
        rules: set.rules.filter((rule) =>
          approvedRuleIds(set.id, set.rules, reviews.events).includes(rule.id),
        ),
        prompt_profile: set.prompt_profile,
        prohibited_elements: set.prohibited_elements,
      },
    };
  }

  async function handleReferences(request, response, url) {
    if (url.pathname === "/api/evidence/candidates" && request.method === "GET") {
      try {
        const analysis = JSON.parse(await readFile(referenceAnalysisPath, "utf8"));
        const reviews = await readEvidenceReviews();
        sendJson(response, 200, {
          schema_version: 1,
          candidates: evidenceCandidates(analysis, reviews.events),
          events: reviews.events,
        });
      } catch (error) {
        sendJson(response, error.code === "ENOENT" ? 404 : 500, { error: error.message });
      }
      return true;
    }

    if (url.pathname === "/api/evidence/reviews" && request.method === "POST") {
      try {
        sendJson(response, 201, await appendEvidenceReview(await readRequestJson(request)));
      } catch (error) {
        sendJson(response, error.statusCode || 400, { error: error.message });
      }
      return true;
    }

    if (url.pathname === "/api/references") {
      try {
        if (request.method === "GET") {
          sendJson(response, 200, await ensureReferenceIndex());
          return true;
        }
        if (request.method === "POST") {
          const result = await addReferenceImage(
            await readRequestJson(request),
          );
          sendJson(response, result.duplicate ? 200 : 201, result);
          return true;
        }
        sendJson(response, 405, { error: "허용되지 않은 요청 방식입니다." });
      } catch (error) {
        sendJson(response, error.statusCode || 500, {
          error: error.message,
        });
      }
      return true;
    }

    if (
      url.pathname === "/api/reference-analysis" &&
      request.method === "GET"
    ) {
      try {
        sendJson(
          response,
          200,
          JSON.parse(await readFile(referenceAnalysisPath, "utf8")),
        );
      } catch (error) {
        sendJson(response, error.code === "ENOENT" ? 404 : 500, {
          error:
            error.code === "ENOENT"
              ? "레퍼런스 분석을 준비 중입니다."
              : error.message,
        });
      }
      return true;
    }

    const referenceContentMatch = url.pathname.match(
      /^\/api\/references\/([a-z0-9-]+)\/content$/,
    );
    if (referenceContentMatch && request.method === "GET") {
      try {
        const document = await ensureReferenceIndex();
        const item = document.items.find(
          (candidate) => candidate.id === referenceContentMatch[1],
        );
        if (!item) {
          sendJson(response, 404, { error: "레퍼런스를 찾지 못했습니다." });
          return true;
        }
        const image = await readFile(
          path.join(referenceAssetDir, item.stored_name),
        );
        response.statusCode = 200;
        response.setHeader("Content-Type", item.mime_type);
        response.setHeader("Cache-Control", "private, max-age=300");
        response.end(image);
      } catch (error) {
        sendJson(response, 404, { error: error.message });
      }
      return true;
    }

    const referenceMatch = url.pathname.match(
      /^\/api\/instagram\/reference\/(1[0-8]|[1-9])$/,
    );
    if (referenceMatch && request.method === "GET") {
      try {
        const image = await readFile(
          instagramReferenceFiles[Number(referenceMatch[1]) - 1],
        );
        response.statusCode = 200;
        response.setHeader("Content-Type", "image/png");
        response.setHeader("Cache-Control", "private, max-age=300");
        response.end(image);
      } catch (error) {
        sendJson(response, 404, {
          error: "다운로드 폴더에서 인스타 참고 이미지를 찾지 못했습니다.",
        });
      }
      return true;
    }

    return false;
  }

  return { handleReferences, readReferenceProfile };
}
