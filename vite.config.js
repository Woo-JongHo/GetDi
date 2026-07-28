import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import {
  createAnalysisHandler,
  DRAFT_COPY_LIMITS,
  DRAFT_VISUALIZATION_METHODS,
} from "./server/analysis.mjs";
import { createDetailsHandler } from "./server/details.mjs";
import { createDraftHandler } from "./server/draft.mjs";
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
const { handleDraft, handleGenerationState } = createDraftHandler({
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
const handleDetails = createDetailsHandler({ detailDir, videoDetailDir });
const handleTranslation = createTranslationHandler({
  rootDir,
  imageSources,
  runCodexStructured,
});
const handleUsage = createUsageHandler({ rootDir });
const handlers = [
  handleUsage,
  handleModel,
  handleGenerationState,
  handleDetails,
  handleReferences,
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
