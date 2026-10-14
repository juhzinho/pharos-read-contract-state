// Local stand-in for Vercel: serves public/ and routes /api/* to the same handlers.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import read from "../api/read.js";
import ask from "../api/ask.js";
import docs from "../api/docs.js";
import events from "../api/events.js";

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = fileURLToPath(new URL("../public/", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const ROUTES = { "/api/read": read, "/api/ask": ask, "/api/docs": docs, "/api/events": events };

http
  .createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    if (ROUTES[pathname]) return ROUTES[pathname](req, res);
    const file = normalize(pathname === "/" ? "index.html" : pathname.slice(1));
    if (file.startsWith("..")) return res.writeHead(403).end();
    try {
      const body = await readFile(join(ROOT, file));
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  })
  .listen(PORT, () => console.log(`http://localhost:${PORT}`));
