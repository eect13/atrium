#!/usr/bin/env node
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = dirname(import.meta.dirname);
const staticDir = join(root, ".vercel", "output", "static");
const indexPath = join(staticDir, "index.html");
const desktopPath = join(staticDir, "desktop.html");
const isTauri = Boolean(process.env.TAURI_ENV_PLATFORM || process.env.TAURI_ENV_FAMILY);

if (!isTauri) process.exit(0);
if (!existsSync(staticDir)) {
  console.error("[tauri-index] no static output — frontend pack did not run");
  process.exit(1);
}

function looksLikeDesktopShell(html) {
  return html.includes("atrium-root") && /assets\/(?:desktop|index)-[^"' ]+\.js/.test(html) && !html.includes("/src/main.tsx");
}

if (existsSync(desktopPath)) {
  const html = readFileSync(desktopPath, "utf8");
  if (looksLikeDesktopShell(html)) {
    copyFileSync(desktopPath, indexPath);
    process.exit(0);
  }
}

const assetsDir = join(staticDir, "assets");
if (!existsSync(assetsDir)) {
  console.error("[tauri-index] no assets/");
  process.exit(1);
}
const files = readdirSync(assetsDir);
const js = files.find((f) => /^desktop-.*\.js$/.test(f)) || files.find((f) => /^index-.*\.js$/.test(f));
const css =
  files.find((f) => /^desktop-.*\.css$/.test(f)) ||
  files.find((f) => /^styles-.*\.css$/.test(f)) ||
  files.find((f) => f.endsWith(".css"));
if (!js) {
  console.error("[tauri-index] no desktop-*.js in assets/");
  process.exit(1);
}

const html = `<!doctype html>
<html lang="en" class="antialiased">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover" />
    <title>Atrium</title>
    <meta name="theme-color" content="#0c0c0d" />
    <link rel="icon" type="image/svg+xml" href="./favicon.svg" />
    ${css ? `<link rel="stylesheet" href="./assets/${css}" />` : ""}
  </head>
  <body class="bg-background text-foreground">
    <div id="atrium-root">Opening the desk…</div>
    <script type="module" src="./assets/${js}"></script>
  </body>
</html>
`;
writeFileSync(indexPath, html);
