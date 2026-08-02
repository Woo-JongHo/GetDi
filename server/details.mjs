import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { sendJson } from "./http.mjs";
import { sourceId } from "../crawler/source-snapshot.mjs";

export function createDetailsHandler({ detailDir, videoDetailDir, rootDir }) {
  const sourceStoreDir = path.join(rootDir, "data/private/source-snapshots");

  async function readRevisionForDetail(detail) {
    const id = detail.source_id || sourceId(detail.source_url);
    try {
      const pointer = JSON.parse(
        await readFile(path.join(sourceStoreDir, "sources", `${id}.json`), "utf8"),
      );
      const revision = JSON.parse(
        await readFile(
          path.join(sourceStoreDir, "revisions", `${pointer.revision_id}.json`),
          "utf8",
        ),
      );
      return {
        ...revision.metadata,
        ...revision,
        source_url: revision.canonical_url,
        slug: new URL(revision.canonical_url).pathname.split("/").filter(Boolean).at(-1),
      };
    } catch (error) {
      if (error.code === "ENOENT") return detail;
      throw error;
    }
  }

  async function readDetailBySlug(slug, format = null) {
    if (format === "article") {
      const detail = JSON.parse(
        await readFile(path.join(detailDir, `${slug}.json`), "utf8"),
      );
      return readRevisionForDetail(detail);
    }
    if (format === "video") {
      return JSON.parse(
        await readFile(path.join(videoDetailDir, `${slug}.json`), "utf8"),
      );
    }
    try {
      const detail = JSON.parse(
        await readFile(path.join(detailDir, `${slug}.json`), "utf8"),
      );
      return readRevisionForDetail(detail);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return JSON.parse(
        await readFile(path.join(videoDetailDir, `${slug}.json`), "utf8"),
      );
    }
  }

  async function readDetailIndex() {
    const [articles, videos] = await Promise.all([
      readdir(detailDir).catch((error) => {
        if (error.code === "ENOENT") return [];
        throw error;
      }),
      readdir(videoDetailDir).catch((error) => {
        if (error.code === "ENOENT") return [];
        throw error;
      }),
    ]);
    const items = [
      ...articles
        .filter((name) => name.endsWith(".json"))
        .map((name) => ({
          slug: name.slice(0, -".json".length),
          format: "article",
        })),
      ...videos
        .filter((name) => name.endsWith(".json"))
        .map((name) => ({
          slug: name.slice(0, -".json".length),
          format: "video",
        })),
    ];
    return { count: items.length, items };
  }

  return async function handleDetails(request, response, url) {
    const articleAssetMatch = url.pathname.match(
      /^\/api\/article-assets\/([a-z0-9-]+)$/,
    );
    if (articleAssetMatch && request.method === "GET") {
      try {
        const detail = JSON.parse(
          await readFile(
            path.join(detailDir, `${articleAssetMatch[1]}.json`),
            "utf8",
          ),
        );
        const sourceUrl = url.searchParams.get("source");
        const asset = detail.assets?.find(
          (candidate) => candidate.source_url === sourceUrl,
        );
        if (!asset) {
          sendJson(response, 404, { error: "본문 이미지 asset을 찾지 못했습니다." });
          return true;
        }
        const allowedRoot = path.resolve(rootDir, "data/private/assets");
        const localPath = path.resolve(asset.local_path);
        if (!localPath.startsWith(`${allowedRoot}${path.sep}`)) {
          sendJson(response, 403, { error: "허용되지 않은 asset 경로입니다." });
          return true;
        }
        const payload = await readFile(localPath);
        const extension = path.extname(localPath) || ".bin";
        response.statusCode = 200;
        response.setHeader("Content-Type", asset.content_type || "application/octet-stream");
        response.setHeader("Content-Length", payload.length);
        response.setHeader(
          "Content-Disposition",
          `attachment; filename="${articleAssetMatch[1]}-${asset.sha256.slice(0, 10)}${extension}"`,
        );
        response.setHeader("Cache-Control", "private, immutable, max-age=31536000");
        response.end(payload);
      } catch (error) {
        sendJson(
          response,
          error.code === "ENOENT" ? 404 : 500,
          { error: error.code === "ENOENT" ? "본문 이미지 파일을 찾지 못했습니다." : error.message },
        );
      }
      return true;
    }

    if (url.pathname.startsWith("/api/source-assets/") &&
        !/^\/api\/source-assets\/[a-f0-9]{64}$/.test(url.pathname)) {
      sendJson(response, 400, { error: "올바르지 않은 AssetBlob hash입니다." });
      return true;
    }
    const assetMatch = url.pathname.match(/^\/api\/source-assets\/([a-f0-9]{64})$/);
    if (assetMatch && request.method === "GET") {
      try {
        const [payload, metadata] = await Promise.all([
          readFile(path.join(sourceStoreDir, "blobs", assetMatch[1])),
          readFile(path.join(sourceStoreDir, "blobs", `${assetMatch[1]}.json`), "utf8")
            .then(JSON.parse),
        ]);
        response.statusCode = 200;
        response.setHeader("Content-Type", metadata.mime);
        response.setHeader("Content-Length", payload.length);
        response.setHeader("Cache-Control", "private, immutable, max-age=31536000");
        response.end(payload);
      } catch (error) {
        sendJson(
          response,
          error.code === "ENOENT" ? 404 : 500,
          error.code === "ENOENT" ? { error: "AssetBlob을 찾지 못했습니다." } : { error: error.message },
        );
      }
      return true;
    }

    if (url.pathname === "/api/details" && request.method === "GET") {
      try {
        sendJson(response, 200, await readDetailIndex());
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
      return true;
    }

    const detailMatch = url.pathname.match(
      /^\/api\/details\/(?:(article|video)\/)?([a-z0-9-]+)$/,
    );
    if (detailMatch && request.method === "GET") {
      try {
        sendJson(
          response,
          200,
          await readDetailBySlug(detailMatch[2], detailMatch[1] || null),
        );
      } catch (error) {
        sendJson(
          response,
          error.code === "ENOENT" ? 404 : 500,
          error.code === "ENOENT"
            ? { status: "not_collected" }
            : { error: error.message },
        );
      }
      return true;
    }

    return false;
  };
}
