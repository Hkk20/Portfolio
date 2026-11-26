// Local preview only: node serve.mjs  ->  http://localhost:4173
// Serves just the files listed here, so it stays safe behind a tunnel.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const files = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/main.js": ["main.js", "text/javascript; charset=utf-8"],
  "/me.webp": ["me.webp", "image/webp"],
  "/me.avif": ["me.avif", "image/avif"],
};

createServer(async (req, res) => {
  const hit = files[(req.url || "/").split("?")[0]];
  if (!hit || (req.method !== "GET" && req.method !== "HEAD")) {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    return;
  }
  try {
    const body = await readFile(fileURLToPath(new URL(hit[0], import.meta.url)));
    res.writeHead(200, { "content-type": hit[1], "cache-control": "no-cache", "x-content-type-options": "nosniff" });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(500, { "content-type": "text/plain" }).end("Could not read file");
  }
}).listen(4173, "127.0.0.1", () => console.log("http://localhost:4173"));
