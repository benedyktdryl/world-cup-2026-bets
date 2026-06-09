import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { createRequestHandler } from "react-router";
import { startDailyCrawlScheduler } from "../app/lib/server/crawl/daily-crawl";
import { env } from "../app/lib/server/env";

// Build output is created by `react-router build` before this script runs.
// @ts-expect-error build/server is generated, not source-controlled.
const build = await import("../build/server/index.js");

const mode = env("NODE_ENV", "production");
const handler = createRequestHandler(build, mode);
const clientRoot = normalize(join(import.meta.dir, "..", "build", "client"));
const port = Number(env("PORT", "3000"));
const hostname = env("HOST", "0.0.0.0");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".woff2", "font/woff2"],
  [".ico", "image/x-icon"],
]);

function contentType(pathname: string) {
  const extension = pathname.slice(pathname.lastIndexOf("."));
  return contentTypes.get(extension) ?? "application/octet-stream";
}

async function serveStatic(pathname: string) {
  if (pathname === "/" || pathname.includes("..")) {
    return null;
  }

  const filePath = normalize(join(clientRoot, pathname));
  if (!filePath.startsWith(clientRoot) || !existsSync(filePath)) {
    return null;
  }

  return new Response(Bun.file(filePath), {
    headers: {
      "cache-control": pathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=60",
      "content-type": contentType(pathname),
    },
  });
}

Bun.serve({
  hostname,
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const staticResponse = await serveStatic(decodeURIComponent(url.pathname));
    return staticResponse ?? handler(request);
  },
});

console.log(`World Cup Bets listening on http://${hostname}:${port}`);

if (!env("VERCEL")) {
  startDailyCrawlScheduler();
}
