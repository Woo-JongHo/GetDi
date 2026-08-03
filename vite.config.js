import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import {
  createAnalysisHandler,
  DRAFT_COPY_LIMITS,
  DRAFT_VISUALIZATION_METHODS,
} from "./server/analysis.mjs";
import { createCrawlHandler } from "./server/crawl.mjs";
import { createDetailsHandler } from "./server/details.mjs";
import { createDraftHandler } from "./server/draft.mjs";
import { createExportHandler } from "./server/export.mjs";
import { createModelHandler } from "./server/model.mjs";
import { createReferencesHandler } from "./server/references.mjs";
import { annotateSourceBlocks, imageSources } from "./server/source.mjs";
import { createTranslationHandler } from "./server/translation.mjs";
import { createUsageHandler } from "./server/usage.mjs";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const detailDir = path.join(rootDir, "data/private/details/articles");
const videoDetailDir = path.join(rootDir, "data/private/details/videos");

const {
  handleModel,
  normalizeModelUsage,
  runClaudeStructured,
  runCodexStructured,
} = createModelHandler({ rootDir });
const { handleReferences, readReferenceProfile } =
  createReferencesHandler({ rootDir });
const {
  analysisBlockIds,
  ensureArticleAnalysis,
  handleAnalysis,
} = createAnalysisHandler({
  rootDir,
  annotateSourceBlocks,
  imageSources,
  runCodexStructured,
});
const { handleDraft } = createDraftHandler({
  rootDir,
  DRAFT_COPY_LIMITS,
  DRAFT_VISUALIZATION_METHODS,
  analysisBlockIds,
  ensureArticleAnalysis,
  imageSources,
  normalizeModelUsage,
  readReferenceProfile,
  runClaudeStructured,
  runCodexStructured,
});
const handleDetails = createDetailsHandler({ detailDir, videoDetailDir, rootDir });
const handleTranslation = createTranslationHandler({
  rootDir,
  imageSources,
  runCodexStructured,
});
const handleUsage = createUsageHandler({ rootDir });
const handleCrawl = createCrawlHandler({ rootDir });
const handleExport = createExportHandler({ rootDir });
const handlers = [
  handleCrawl,
  handleUsage,
  handleModel,
  handleDetails,
  handleReferences,
  handleExport,
  handleDraft,
  handleAnalysis,
  handleTranslation,
];

function translationApi() {
  return {
    name: "getdi-local-translation-api",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url, "http://127.0.0.1");
        for (const handle of handlers) {
          if (await handle(request, response, url)) return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), translationApi()],
  // data/private에는 수집한 NN/g 원본 HTML이 수백 개 쌓인다. 지정하지 않으면
  // Vite가 그것들까지 앱 진입점 후보로 스캔하다 실패한다. 진입점은 하나뿐이다.
  optimizeDeps: {
    entries: ["index.html"],
  },
  server: {
    host: "localhost",
    port: 5545,
    strictPort: true,
    watch: {
      ignored: [
        "**/data/private/**",
        "**/data/state/**",
      ],
    },
  },
});
