import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { sendJson } from "./http.mjs";

export function createDetailsHandler({ detailDir, videoDetailDir }) {
  async function readDetailBySlug(slug, format = null) {
    if (format === "article") {
      return JSON.parse(
        await readFile(path.join(detailDir, `${slug}.json`), "utf8"),
      );
    }
    if (format === "video") {
      return JSON.parse(
        await readFile(path.join(videoDetailDir, `${slug}.json`), "utf8"),
      );
    }
    try {
      return JSON.parse(
        await readFile(path.join(detailDir, `${slug}.json`), "utf8"),
      );
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
