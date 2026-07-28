import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const chromePath =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const magickPath = process.env.MAGICK_PATH || "/opt/homebrew/bin/magick";
const maxBytes = 1_200_000;
const slugs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "product-sense-definition",
      "design-system-maturity",
      "after-design-critique",
      "design-disposables",
    ];

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cardHtml(card, cardCount) {
  const cover = card.role === "cover";
  const image = card.source_image_src
    ? escapeHtml(card.source_image_src)
    : "";
  const background = cover && image
    ? `background-image:url("${image}");`
    : "";
  const bodyImage =
    !cover && image
      ? `<img class="body-image" src="${image}" alt="" />`
      : `<div class="visual-fallback"><span>${escapeHtml(
          card.visualization_method || "statement",
        )}</span><strong>${String(card.position).padStart(2, "0")}</strong></div>`;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=1080,initial-scale=1" />
<style>
*{box-sizing:border-box}
html,body{width:1080px;height:1350px;margin:0;overflow:hidden}
body{font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}
.card{position:relative;width:1080px;height:1350px;overflow:hidden;color:${cover ? "#fff" : "#17181a"};background:${cover ? "#18191b" : "#f8f8f4"};${background}background-size:cover;background-position:center}
.overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.12),rgba(0,0,0,.82))}
.content{position:absolute;z-index:2;display:flex;flex-direction:column}
.cover .content{right:84px;bottom:96px;left:84px}
.body .content{inset:72px 72px 84px}
.eyebrow,.signature{font-weight:750;letter-spacing:-.035em}
.eyebrow{font-size:66px}.signature{color:#777; font-size:30px}
h1{display:-webkit-box;overflow:hidden;margin:70px 0 0;font-size:${cover ? 133 : 106}px;line-height:.98;letter-spacing:-.065em;word-break:keep-all;-webkit-box-orient:vertical;-webkit-line-clamp:${cover ? 3 : 2}}
.cover h1{margin-top:30px}
p{margin:34px 0 0;font-size:60px;line-height:1.38;letter-spacing:-.04em;white-space:pre-wrap;word-break:keep-all}
.body-image{width:100%;height:38%;min-height:300px;margin-top:auto;border-radius:24px;object-fit:cover;background:#fff}
.visual-fallback{min-height:330px;display:flex;align-items:flex-end;justify-content:space-between;margin-top:auto;padding:32px;border-radius:24px;color:#fff;background:linear-gradient(135deg,#222,#7362c8)}
.visual-fallback span{font-size:24px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
.visual-fallback strong{font-size:120px;line-height:.8;opacity:.32}
.footer{position:absolute;z-index:3;right:32px;bottom:26px;font-size:20px;opacity:.55}
</style>
</head>
<body>
<article class="card ${cover ? "cover" : "body"}">
  ${cover && image ? '<div class="overlay"></div>' : ""}
  <div class="content">
    <div class="${cover ? "eyebrow" : "signature"}">${escapeHtml(
      cover ? card.eyebrow_ko : "네카라쿠배 디자이너, 피그마스터",
    )}</div>
    <h1>${escapeHtml(card.headline_ko)}</h1>
    ${cover ? "" : `<p>${escapeHtml(card.body_ko)}</p>${bodyImage}`}
  </div>
  <div class="footer">${String(card.position).padStart(2, "0")} / ${String(
    cardCount,
  ).padStart(2, "0")}</div>
</article>
</body>
</html>`;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} failed`);
  }
}

const temporaryDir = await mkdtemp(path.join(tmpdir(), "getdi-card-export-"));
const manifest = [];

for (const slug of slugs) {
  const document = JSON.parse(
    await readFile(
      path.join(rootDir, "data/private/drafts", `${slug}.json`),
      "utf8",
    ),
  );
  const variants = [
    {
      id: "sol",
      run: [...(document.model_runs || [])]
        .reverse()
        .find((item) => item.model?.includes("gpt-5.6-sol")),
    },
    {
      id: "fable",
      run: [...(document.model_runs || [])]
        .reverse()
        .find((item) => item.model?.includes("fable")),
    },
  ].filter((variant) => variant.run);

  for (const variant of variants) {
    const revision = document.revisions.find(
      (item) => item.revision === variant.run.revision,
    );
    if (!revision) continue;
    const outputDir = path.join(
      rootDir,
      "data/private/exports",
      slug,
      variant.id,
    );
    await mkdir(outputDir, { recursive: true });

    for (const card of revision.cards) {
    const suffix = String(card.position).padStart(2, "0");
    const htmlPath = path.join(
      temporaryDir,
      `${slug}-${variant.id}-${suffix}.html`,
    );
    const pngPath = path.join(
      temporaryDir,
      `${slug}-${variant.id}-${suffix}.png`,
    );
    const jpgPath = path.join(outputDir, `${suffix}.jpg`);
    await writeFile(htmlPath, cardHtml(card, revision.cards.length), "utf8");

    run(chromePath, [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--window-size=1080,1350",
      "--virtual-time-budget=4000",
      `--screenshot=${pngPath}`,
      `file://${htmlPath}`,
    ]);

    let quality = 88;
    run(magickPath, [
      pngPath,
      "-strip",
      "-interlace",
      "Plane",
      "-sampling-factor",
      "4:2:0",
      "-quality",
      String(quality),
      jpgPath,
    ]);
    let bytes = (await stat(jpgPath)).size;
    while (bytes > maxBytes && quality > 55) {
      quality -= 8;
      run(magickPath, [
        pngPath,
        "-strip",
        "-sampling-factor",
        "4:2:0",
        "-quality",
        String(quality),
        jpgPath,
      ]);
      bytes = (await stat(jpgPath)).size;
    }
    await unlink(pngPath).catch(() => {});
    await unlink(htmlPath).catch(() => {});
    manifest.push({
      slug,
      variant: variant.id,
      provider: variant.run.provider,
      model: variant.run.model,
      revision: revision.revision,
      position: card.position,
      role: card.role,
      visualization_method: card.visualization_method || null,
      path: path.relative(rootDir, jpgPath),
      width: 1080,
      height: 1350,
      bytes,
      quality,
      within_size_target: bytes <= maxBytes,
    });
    process.stderr.write(
      `[exported] ${slug} ${variant.id} ${suffix} · ${bytes} bytes\n`,
    );
    }
  }
}

const manifestPath = path.join(
  rootDir,
  "data/private/exports/manifest.json",
);
await mkdir(path.dirname(manifestPath), { recursive: true });
await writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      schema_version: 1,
      created_at: new Date().toISOString(),
      items: manifest,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
process.stdout.write(
  `${JSON.stringify({
    exported: manifest.length,
    within_size_target: manifest.filter((item) => item.within_size_target)
      .length,
    manifest: path.relative(rootDir, manifestPath),
  })}\n`,
);
